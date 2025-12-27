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

		if (this.options.settings.permissionMode === "yolo") {
			args.push("--yolo");
		}

		this.process = await spawnCursorAgentPiped(args, {
			cwd: this.options.workingDirectory,
			settings: this.options.settings,
		});

		this.buffer = "";
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
			stderr += data.toString();
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
