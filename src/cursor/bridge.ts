import type { ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import {
	CursorEvent,
	CursorAgentSettings,
	SystemInitEvent,
	AssistantMessageEvent,
	ToolCallEvent,
	ResultEvent,
	McpServerApprovalChoice,
	McpServerApprovalRequest,
	McpServerInfo,
} from "../types";
import { getAuthConfig } from "./auth";
import { spawnCursorAgentPiped, execCursorAgent } from "./cli";

export interface CursorBridgeOptions {
	settings: CursorAgentSettings;
	workingDirectory: string;
	model?: string;
}

type CursorBridgeEvents = {
	init: [SystemInitEvent];
	assistant: [AssistantMessageEvent];
	toolCall: [ToolCallEvent];
	result: [ResultEvent];
	error: [Error];
	close: [number | null];
	ready: [];
	mcpApprovalRequired: [McpServerApprovalRequest];
};

export class CursorBridge extends EventEmitter<CursorBridgeEvents> {
	private process: ChildProcessWithoutNullStreams | null = null;
	private buffer = "";
	private sessionId: string | null = null;
	private mcpProbe = "";
	private mcpApprovalPending = false;
	private mcpApprovalEmitted = false;

	constructor(private options: CursorBridgeOptions) {
		super();
	}

	/**
	 * Update settings/cwd/model without recreating the instance.
	 */
	updateOptions(partial: Partial<CursorBridgeOptions>): void {
		this.options = { ...this.options, ...partial };
	}

	/**
	 * Force the next run to resume from a specific session_id (or clear it to start fresh).
	 */
	setSessionId(sessionId: string | null): void {
		this.sessionId = sessionId;
	}

	/**
	 * Run cursor-agent for a single turn. If a session_id is set (or passed in),
	 * attempts to resume that conversation for the next prompt.
	 */
	async send(
		prompt: string,
		options?: { resumeSessionId?: string | null }
	): Promise<void> {
		if (this.process) {
			this.emit("error", new Error("cursor-agent is already running"));
			return;
		}

		const cwd = this.options.workingDirectory;
		const authResult = await getAuthConfig(this.options.settings, cwd);

		if (!authResult.isAuthenticated) {
			this.emit(
				"error",
				new Error(
					"Not authenticated. Please set API key in settings or login via cursor-agent."
				)
			);
			return;
		}

		const resumeSessionId =
			options?.resumeSessionId !== undefined
				? options.resumeSessionId
				: this.sessionId;

		const promptText = this.buildPrompt(prompt);

		const args: string[] = [
			"-p",
			promptText,
			"--output-format",
			"stream-json",
			...authResult.args,
		];

		if (resumeSessionId) {
			args.push(`--resume=${resumeSessionId}`);
		} else {
			const model =
				this.options.model || this.options.settings.defaultModel;
			if (model) args.push("--model", model);
		}

		if (this.options.settings.permissionMode === "force") {
			args.push("--force");
		}

		this.process = await spawnCursorAgentPiped(args, {
			cwd: this.options.workingDirectory,
			settings: this.options.settings,
		});

		this.buffer = "";
		this.mcpProbe = "";
		this.mcpApprovalPending = false;
		this.mcpApprovalEmitted = false;
		this.setupProcessHandlers();
		this.emit("ready");
	}

	private setupProcessHandlers(): void {
		if (!this.process) return;

		this.process.stdout?.on("data", (data: Buffer) => {
			this.handleData(data.toString());
		});

		let stderr = "";
		this.process.stderr?.on("data", (data: Buffer) => {
			const text = data.toString();
			stderr += text;
			this.ingestMcpProbe(text);
		});

		this.process.on("error", (err) => {
			this.emit("error", err);
		});

		this.process.on("close", (code) => {
			const errText = stderr.trim();
			if (code !== 0 && errText) {
				this.emit("error", new Error(errText));
			}
			this.emit("close", code);
			this.process = null;
			this.mcpApprovalPending = false;
		});
	}

	cancel(): void {
		if (this.process) {
			try {
				this.process.kill();
			} catch {
				// ignore
			}
			this.process = null;
			this.mcpApprovalPending = false;
		}
	}

	submitMcpServerApproval(choice: McpServerApprovalChoice): boolean {
		if (!this.process || !this.mcpApprovalPending) return false;
		const key =
			choice === "approveAll"
				? "a"
				: choice === "continueWithoutApproval"
				? "c"
				: "q";
		try {
			this.process.stdin.write(key);
			this.mcpApprovalPending = false;
			return true;
		} catch (err) {
			this.emit(
				"error",
				err instanceof Error ? err : new Error(String(err))
			);
			return false;
		}
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	isRunning(): boolean {
		return this.process !== null;
	}

	private handleData(chunk: string): void {
		this.ingestMcpProbe(chunk);
		this.buffer += chunk;
		const lines = this.buffer.split("\n");

		// Keep incomplete line in buffer
		this.buffer = lines.pop() || "";

		for (const line of lines) {
			if (!line.trim()) continue;

			try {
				const event = JSON.parse(line) as CursorEvent;
				this.handleEvent(event);
			} catch {
				// Non-JSON output, ignore
			}
		}
	}

	private ingestMcpProbe(text: string): void {
		if (this.mcpApprovalEmitted) return;
		this.mcpProbe += text;
		if (this.mcpProbe.length > 50_000) {
			this.mcpProbe = this.mcpProbe.slice(-50_000);
		}

		const req = this.tryParseMcpApprovalPrompt(this.mcpProbe);
		if (!req) return;

		this.mcpApprovalEmitted = true;
		this.mcpApprovalPending = true;
		this.emit("mcpApprovalRequired", req);
	}

	private tryParseMcpApprovalPrompt(
		text: string
	): McpServerApprovalRequest | null {
		const cleaned = stripAnsi(text).replace(/\r/g, "");
		const idx = cleaned.lastIndexOf("MCP Server Approval Required");
		if (idx === -1) return null;
		const tail = cleaned.slice(idx);
		if (!tail.includes("Approve all servers")) return null;
		if (
			!tail.includes("Continue without approval") &&
			!tail.includes("Continue without")
		) {
			return null;
		}

		return {
			servers: parseMcpServerList(tail),
			rawText: tail.trim(),
		};
	}

	private handleEvent(event: CursorEvent): void {
		switch (event.type) {
			case "system":
				if (event.subtype === "init") {
					this.sessionId = event.session_id;
					this.emit("init", event);
				}
				break;

			case "assistant":
				this.emit("assistant", event);
				break;

			case "tool_call":
				this.emit("toolCall", event);
				break;

			case "result":
				this.emit("result", event);
				break;

			case "user":
				// User events are echoed back, we can ignore or use for confirmation
				break;
		}
	}

	private buildPrompt(prompt: string): string {
		const instructions = this.options.settings.customInstructions?.trim();
		if (!instructions) return prompt;
		return `${instructions}\n\n${prompt}`;
	}
}

function stripAnsi(input: string): string {
	// eslint-disable-next-line no-control-regex
	return input.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function parseMcpServerList(text: string): McpServerInfo[] {
	const out: McpServerInfo[] = [];
	const seen = new Set<string>();

	const lines = text.split("\n");
	const startIdx = lines.findIndex((l) =>
		l.toLowerCase().includes("need to be approved")
	);
	if (startIdx === -1) return out;

	for (let i = startIdx + 1; i < lines.length; i++) {
		const rawLine = lines[i];
		if (!rawLine) continue;
		const line = rawLine.trim();
		if (!line) continue;
		if (line.includes("Approve all servers")) break;
		if (line.startsWith("[")) break;

		const m = line.match(
			/^[•*-]\s*([^(]+?)(?:\s*\(url:\s*([^)]+)\))?\s*$/i
		);
		if (!m || !m[1]) continue;
		const name = m[1].trim();
		const url = m[2]?.trim();
		const key = `${name}::${url ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ name, url: url || undefined });
	}

	return out;
}

export async function listConversations(
	cwd: string,
	settings: CursorAgentSettings
): Promise<string[]> {
	const res = await execCursorAgent(["ls"], {
		cwd,
		settings,
		timeoutMs: 10_000,
	});
	if (res.code !== 0) return [];
	return res.stdout
		.trim()
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
}
