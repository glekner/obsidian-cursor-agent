import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from "obsidian";
import type CursorAgentChatPlugin from "../main";
import type {
	AssistantMessageEvent,
	ChatMessage,
	ResultEvent,
	SystemInitEvent,
	ToolCallEvent,
} from "../types";

export const VIEW_TYPE_CURSOR_CHAT = "cursor-agent-chat";

function createId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class CursorChatView extends ItemView {
	private rootEl!: HTMLElement;
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendButtonEl!: HTMLButtonElement;
	private statusEl!: HTMLElement;

	private isRunning = false;
	private pendingMessages: ChatMessage[] = [];

	private readonly onInit = (e: SystemInitEvent) => {
		this.plugin.sessionManager.setCurrentSession(e.session_id, e.model);
		for (const m of this.pendingMessages) {
			this.plugin.sessionManager.addMessage(m);
		}
		this.pendingMessages = [];
		void this.plugin.saveSettings();
		this.setStatus(`Session ${e.session_id.slice(0, 8)}…`);
	};

	private readonly onAssistant = (e: AssistantMessageEvent) => {
		const text = e.message.content.map((c) => c.text).join("");
		const msg: ChatMessage = {
			id: createId(),
			role: "assistant",
			content: text,
			timestamp: Date.now(),
		};
		this.plugin.sessionManager.addMessage(msg);
		void this.appendMessage(msg);
	};

	private readonly onToolCall = (e: ToolCallEvent) => {
		if (!this.plugin.settings.showToolCalls) return;

		const info = this.formatToolCall(e);
		if (!info) return;

		const msg: ChatMessage = {
			id: createId(),
			role: "system",
			content: info,
			timestamp: Date.now(),
		};
		this.plugin.sessionManager.addMessage(msg);
		void this.appendMessage(msg);
	};

	private readonly onResult = (e: ResultEvent) => {
		this.isRunning = false;
		this.updateInputState();
		if (e.is_error) this.setStatus("Error");
		else this.setStatus("Ready");
		void this.plugin.saveSettings();
	};

	private readonly onError = (err: Error) => {
		this.isRunning = false;
		this.updateInputState();
		this.setStatus("Error");
		new Notice(err.message);
		console.error("[cursor-agent]", err);
	};

	private readonly onBridgeClose = (code: number | null) => {
		this.isRunning = false;
		this.updateInputState();
		if (code === 0) return;
		this.setStatus(code === null ? "Stopped" : `Exited (${code})`);
	};

	constructor(leaf: WorkspaceLeaf, private plugin: CursorAgentChatPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CURSOR_CHAT;
	}

	getDisplayText(): string {
		return "Cursor chat";
	}

	getIcon(): string {
		return "message-circle";
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children.item(1);
		if (!root) throw new Error("Unable to mount chat view");
		this.rootEl = root as HTMLElement;
		this.rootEl.empty();
		this.rootEl.addClass("cursor-agent-chat");

		const headerEl = this.rootEl.createDiv({
			cls: "cursor-agent-chat__header",
		});
		headerEl.createDiv({
			cls: "cursor-agent-chat__title",
			text: "Cursor Agent",
		});
		this.statusEl = headerEl.createDiv({
			cls: "cursor-agent-chat__status",
			text: "Ready",
		});

		const actionsEl = headerEl.createDiv({
			cls: "cursor-agent-chat__actions",
		});
		const newBtn = actionsEl.createEl("button", { text: "New" });
		newBtn.addEventListener("click", () => this.newConversation());

		const messagesWrap = this.rootEl.createDiv({
			cls: "cursor-agent-chat__messages-wrap",
		});
		this.messagesEl = messagesWrap.createDiv({
			cls: "cursor-agent-chat__messages",
		});

		const inputWrap = this.rootEl.createDiv({
			cls: "cursor-agent-chat__input-wrap",
		});
		this.inputEl = inputWrap.createEl("textarea", {
			cls: "cursor-agent-chat__input",
		});
		this.inputEl.rows = 3;
		this.inputEl.placeholder = "Type a prompt…";
		this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
				evt.preventDefault();
				void this.sendPrompt(this.inputEl.value);
			}
		});

		this.sendButtonEl = inputWrap.createEl("button", {
			cls: "cursor-agent-chat__send",
			text: "Send",
		});
		this.sendButtonEl.addEventListener("click", () => {
			void this.sendPrompt(this.inputEl.value);
		});

		this.renderHistory();

		this.plugin.bridge.on("init", this.onInit);
		this.plugin.bridge.on("assistant", this.onAssistant);
		this.plugin.bridge.on("toolCall", this.onToolCall);
		this.plugin.bridge.on("result", this.onResult);
		this.plugin.bridge.on("error", this.onError);
		this.plugin.bridge.on("close", this.onBridgeClose);

		this.updateInputState();
	}

	async onClose(): Promise<void> {
		this.plugin.bridge.off("init", this.onInit);
		this.plugin.bridge.off("assistant", this.onAssistant);
		this.plugin.bridge.off("toolCall", this.onToolCall);
		this.plugin.bridge.off("result", this.onResult);
		this.plugin.bridge.off("error", this.onError);
		this.plugin.bridge.off("close", this.onBridgeClose);
	}

	reloadHistory(): void {
		this.messagesEl.empty();
		this.renderHistory();
	}

	newConversation(): void {
		if (this.plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}

		this.plugin.bridge.setSessionId(null);
		this.plugin.sessionManager.clearCurrentSession();
		this.pendingMessages = [];
		this.messagesEl.empty();
		this.setStatus("Ready");
		void this.plugin.saveSettings();
	}

	async sendPrompt(prompt: string): Promise<void> {
		const text = prompt.trim();
		if (!text) return;

		if (this.plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}

		this.isRunning = true;
		this.updateInputState();
		this.setStatus("Running…");

		this.inputEl.value = "";

		const resumeId = this.plugin.bridge.getSessionId();
		if (resumeId && !this.plugin.sessionManager.getCurrentSession()) {
			this.plugin.sessionManager.setCurrentSession(
				resumeId,
				this.plugin.settings.defaultModel || ""
			);
		}

		const msg: ChatMessage = {
			id: createId(),
			role: "user",
			content: text,
			timestamp: Date.now(),
		};
		if (this.plugin.sessionManager.getCurrentSession()) {
			this.plugin.sessionManager.addMessage(msg);
		} else {
			this.pendingMessages.push(msg);
		}
		await this.appendMessage(msg);
		void this.plugin.saveSettings();

		this.plugin.refreshRuntime();
		await this.plugin.bridge.send(text);
	}

	private setStatus(text: string): void {
		this.statusEl.setText(text);
	}

	private updateInputState(): void {
		const disabled = this.isRunning || this.plugin.bridge.isRunning();
		this.inputEl.disabled = disabled;
		this.sendButtonEl.disabled = disabled;
	}

	private renderHistory(): void {
		const current = this.plugin.sessionManager.getCurrentSession();
		const sessionId =
			current?.id ?? this.plugin.bridge.getSessionId() ?? undefined;
		const messages = this.plugin.sessionManager.getMessages(sessionId);
		for (const m of messages) {
			void this.appendMessage(m);
		}
	}

	private async appendMessage(message: ChatMessage): Promise<void> {
		const row = this.messagesEl.createDiv({
			cls: `cursor-agent-chat__message cursor-agent-chat__message--${message.role}`,
		});

		const bubble = row.createDiv({ cls: "cursor-agent-chat__bubble" });

		if (message.role === "assistant") {
			await MarkdownRenderer.render(
				this.app,
				message.content,
				bubble,
				"",
				this
			);
		} else {
			bubble.setText(message.content);
		}

		this.messagesEl.scrollTo({ top: this.messagesEl.scrollHeight });
	}

	private formatToolCall(e: ToolCallEvent): string | null {
		const subtype = e.subtype;
		if (e.tool_call.readToolCall?.args?.path) {
			return subtype === "started"
				? `Reading ${e.tool_call.readToolCall.args.path}…`
				: `Read ${e.tool_call.readToolCall.args.path}`;
		}

		if (e.tool_call.writeToolCall?.args?.path) {
			return subtype === "started"
				? `Writing ${e.tool_call.writeToolCall.args.path}…`
				: `Wrote ${e.tool_call.writeToolCall.args.path}`;
		}

		return `Tool call: ${subtype}`;
	}
}
