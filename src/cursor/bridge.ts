import type { ChildProcessWithoutNullStreams } from "child_process";
import { EventEmitter } from "events";
import {
	CursorEvent,
	CursorAgentSettings,
	SystemInitEvent,
	AssistantMessageEvent,
	ToolCallEvent,
	ResultEvent,
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
};

export class CursorBridge extends EventEmitter<CursorBridgeEvents> {
	private process: ChildProcessWithoutNullStreams | null = null;
	private buffer = "";
	private sessionId: string | null = null;

	constructor(private options: CursorBridgeOptions) {
		super();
	}

	updateOptions(partial: Partial<CursorBridgeOptions>): void {
		this.options = { ...this.options, ...partial };
	}

	setSessionId(sessionId: string | null): void {
		this.sessionId = sessionId;
	}

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
			"--approve-mcps",
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

		// Signal we're not sending more input - CLI requires stdin EOF
		this.process.stdin?.end();

		this.buffer = "";
		this.setupProcessHandlers();
		this.emit("ready");
	}

	private setupProcessHandlers(): void {
		if (!this.process) return;

		this.process.stdout?.on("data", (data: Buffer) => {
			this.handleData(data.toString());
		});
		this.process.stdout?.resume();

		let stderr = "";
		this.process.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});
		this.process.stderr?.resume();

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
		}
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	isRunning(): boolean {
		return this.process !== null;
	}

	private handleData(chunk: string): void {
		this.buffer += chunk;
		const lines = this.buffer.split("\n");
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
				break;
		}
	}

	private buildPrompt(prompt: string): string {
		const instructions = this.options.settings.customInstructions?.trim();
		if (!instructions) return prompt;
		return `${instructions}\n\n${prompt}`;
	}
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
