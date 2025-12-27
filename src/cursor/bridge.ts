import { spawn, ChildProcess } from "child_process";
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
	private process: ChildProcess | null = null;
	private buffer = "";
	private sessionId: string | null = null;
	private isInteractive = false;

	constructor(private options: CursorBridgeOptions) {
		super();
	}

	/**
	 * Start an interactive session (keeps process alive for multi-turn chat)
	 */
	async startSession(): Promise<void> {
		if (this.process) {
			return; // Already running
		}

		const authResult = await getAuthConfig(this.options.settings);

		if (!authResult.isAuthenticated) {
			this.emit(
				"error",
				new Error(
					"Not authenticated. Please set API key in settings or login via cursor-agent."
				)
			);
			return;
		}

		const args = ["--output-format", "stream-json", ...authResult.args];

		const model = this.options.model || this.options.settings.defaultModel;
		if (model) {
			args.push("--model", model);
		}

		if (this.options.settings.permissionMode === "yolo") {
			args.push("--yolo");
		}

		if (this.options.settings.customInstructions) {
			args.push(
				"--instructions",
				this.options.settings.customInstructions
			);
		}

		this.process = spawn("cursor-agent", args, {
			cwd: this.options.workingDirectory,
			shell: true,
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.isInteractive = true;
		this.setupProcessHandlers();
		this.emit("ready");
	}

	/**
	 * Send a message to the running interactive session
	 */
	sendMessage(prompt: string): void {
		if (!this.process || !this.process.stdin) {
			this.emit(
				"error",
				new Error("No active session. Call startSession() first.")
			);
			return;
		}

		// Write message to stdin (cursor-agent reads from stdin in interactive mode)
		this.process.stdin.write(prompt + "\n");
	}

	/**
	 * One-shot message (spawns new process, useful for single queries)
	 */
	async sendOneShot(prompt: string): Promise<void> {
		const authResult = await getAuthConfig(this.options.settings);

		if (!authResult.isAuthenticated) {
			this.emit(
				"error",
				new Error(
					"Not authenticated. Please set API key in settings or login via cursor-agent."
				)
			);
			return;
		}

		const args = [
			"-p",
			prompt,
			"--output-format",
			"stream-json",
			...authResult.args,
		];

		const model = this.options.model || this.options.settings.defaultModel;
		if (model) {
			args.push("--model", model);
		}

		if (this.options.settings.permissionMode === "yolo") {
			args.push("--yolo");
		}

		if (this.options.settings.customInstructions) {
			args.push(
				"--instructions",
				this.options.settings.customInstructions
			);
		}

		this.process = spawn("cursor-agent", args, {
			cwd: this.options.workingDirectory,
			shell: true,
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.isInteractive = false;
		this.setupProcessHandlers();
	}

	/**
	 * Resume a previous conversation
	 */
	async resume(sessionId?: string): Promise<void> {
		const authResult = await getAuthConfig(this.options.settings);

		if (!authResult.isAuthenticated) {
			this.emit("error", new Error("Not authenticated."));
			return;
		}

		const args = sessionId
			? [
					`--resume=${sessionId}`,
					"--output-format",
					"stream-json",
					...authResult.args,
			  ]
			: ["resume", "--output-format", "stream-json", ...authResult.args];

		this.process = spawn("cursor-agent", args, {
			cwd: this.options.workingDirectory,
			shell: true,
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.isInteractive = true;
		this.setupProcessHandlers();
	}

	private setupProcessHandlers(): void {
		if (!this.process) return;

		this.process.stdout?.on("data", (data: Buffer) => {
			this.handleData(data.toString());
		});

		this.process.stderr?.on("data", (data: Buffer) => {
			const errorMsg = data.toString().trim();
			if (errorMsg) {
				this.emit("error", new Error(errorMsg));
			}
		});

		this.process.on("error", (err) => {
			this.emit("error", err);
		});

		this.process.on("close", (code) => {
			this.emit("close", code);
			this.process = null;
			this.isInteractive = false;
		});
	}

	cancel(): void {
		if (this.process) {
			this.process.kill("SIGTERM");
			this.process = null;
			this.isInteractive = false;
		}
	}

	endSession(): void {
		if (this.process?.stdin) {
			this.process.stdin.end();
		}
		this.cancel();
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	isRunning(): boolean {
		return this.process !== null;
	}

	isInteractiveSession(): boolean {
		return this.isInteractive;
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
}

/**
 * List all previous cursor-agent conversations.
 */
export async function listConversations(cwd: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const proc = spawn("cursor-agent", ["ls"], {
			cwd,
			shell: true,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let output = "";
		proc.stdout?.on("data", (data: Buffer) => {
			output += data.toString();
		});

		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) {
				const lines = output.trim().split("\n").filter(Boolean);
				resolve(lines);
			} else {
				resolve([]);
			}
		});
	});
}
