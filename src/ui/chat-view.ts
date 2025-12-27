import {
	Component,
	ItemView,
	MarkdownRenderer,
	Menu,
	Notice,
	setIcon,
	WorkspaceLeaf,
} from "obsidian";
import type CursorAgentChatPlugin from "../main";
import type {
	AssistantMessageEvent,
	ChatMessage,
	McpServerApprovalChoice,
	McpServerApprovalRequest,
	ResultEvent,
	SystemInitEvent,
	ToolCallEvent,
} from "../types";
import { McpApprovalModal } from "./mcp-approval-modal";

export const VIEW_TYPE_CURSOR_CHAT = "cursor-agent-chat";

// Common cursor-agent models
const AVAILABLE_MODELS = [
	"claude-sonnet-4-20250514",
	"gpt-4.1",
	"o3",
	"gemini-2.5-pro",
	"composer-1",
];

function createId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(ts: number): string {
	return new Date(ts).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export class CursorChatView extends ItemView {
	private rootEl!: HTMLElement;
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendButtonEl!: HTMLButtonElement;
	private stopButtonEl!: HTMLButtonElement;
	private statusEl!: HTMLElement;
	private loadingEl!: HTMLElement;
	private mcpModal: McpApprovalModal | null = null;
	private modelPickerEl!: HTMLElement;
	private modelLabelEl!: HTMLElement;
	private inputFooterEl!: HTMLElement;
	private generatingEl!: HTMLElement;

	private isRunning = false;
	private pendingMessages: ChatMessage[] = [];
	private selectedModel: string = "";

	// Streaming state
	private streamingText = "";
	private streamingEl: HTMLElement | null = null;
	private streamingBubbleEl: HTMLElement | null = null;
	private loadingDotsInterval: number | null = null;

	// Markdown rendering component
	private markdownComponent: Component | null = null;

	// Tool call collapse state
	private toolCallsCollapsed = false;

	private readonly onInit = (e: SystemInitEvent) => {
		this.plugin.sessionManager.setCurrentSession(e.session_id, e.model);
		for (const m of this.pendingMessages) {
			this.plugin.sessionManager.addMessage(m);
		}
		this.pendingMessages = [];
		void this.plugin.saveSettings();
		this.setStatus(`Session ${e.session_id.slice(0, 8)}…`);
		// Update model from session
		if (e.model) {
			this.selectedModel = e.model;
			this.updateModelLabel();
		}
	};

	private readonly onAssistant = (e: AssistantMessageEvent) => {
		const text = e.message.content.map((c) => c.text).join("");
		this.streamingText += text;
		this.updateStreamingMessage();
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
		if (this.mcpModal) {
			this.mcpModal.close();
			this.mcpModal = null;
		}

		if (this.streamingText) {
			this.finalizeStreamingMessage();
		}

		this.isRunning = false;
		this.updateInputState();
		this.hideLoading();

		if (e.is_error) this.setStatus("Error");
		else this.setStatus("Ready");
		void this.plugin.saveSettings();
	};

	private readonly onError = (err: Error) => {
		if (this.mcpModal) {
			this.mcpModal.close();
			this.mcpModal = null;
		}

		if (this.streamingText) {
			this.finalizeStreamingMessage();
		}

		this.isRunning = false;
		this.updateInputState();
		this.hideLoading();
		this.setStatus("Error");
		new Notice(err.message);
		console.error("[cursor-agent]", err);
	};

	private readonly onBridgeClose = (code: number | null) => {
		if (this.mcpModal) {
			this.mcpModal.close();
			this.mcpModal = null;
		}

		if (this.streamingText) {
			this.finalizeStreamingMessage();
		}

		this.isRunning = false;
		this.updateInputState();
		this.hideLoading();

		if (code === 0) return;
		this.setStatus(code === null ? "Stopped" : `Exited (${code})`);
	};

	private readonly onMcpApprovalRequired = (e: McpServerApprovalRequest) => {
		if (this.mcpModal) return;

		this.hideLoading();
		this.setStatus("MCP approval required");

		this.mcpModal = new McpApprovalModal(
			this.app,
			e,
			(choice: McpServerApprovalChoice) => {
				const ok = this.plugin.bridge.submitMcpServerApproval(choice);
				this.mcpModal = null;

				if (!ok) {
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					new Notice("Unable to submit MCP approval");
					return;
				}

				if (choice === "quit") {
					this.setStatus("Stopping…");
					return;
				}

				this.setStatus("Running…");
				this.showLoading();
			}
		);
		this.mcpModal.open();
	};

	constructor(leaf: WorkspaceLeaf, private plugin: CursorAgentChatPlugin) {
		super(leaf);
		this.selectedModel =
			plugin.settings.defaultModel ||
			AVAILABLE_MODELS[0] ||
			"claude-sonnet-4-20250514";
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

		// Header
		const headerEl = this.rootEl.createDiv({
			cls: "cursor-agent-chat__header",
		});
		headerEl.createDiv({
			cls: "cursor-agent-chat__title",
			text: "Cursor agent",
		});
		this.statusEl = headerEl.createDiv({
			cls: "cursor-agent-chat__status",
			text: "Ready",
		});

		const actionsEl = headerEl.createDiv({
			cls: "cursor-agent-chat__actions",
		});

		// History button
		const historyBtn = actionsEl.createEl("button", {
			cls: "cursor-agent-chat__btn cursor-agent-chat__btn--icon",
			attr: { "aria-label": "Chat history" },
		});
		setIcon(historyBtn, "history");
		historyBtn.addEventListener("click", (evt) =>
			this.showHistoryMenu(evt)
		);

		// New chat button
		const newBtn = actionsEl.createEl("button", {
			cls: "cursor-agent-chat__btn cursor-agent-chat__btn--icon",
			attr: { "aria-label": "New chat" },
		});
		setIcon(newBtn, "message-circle-plus");
		newBtn.addEventListener("click", () => this.newConversation());

		// Messages area
		const messagesWrap = this.rootEl.createDiv({
			cls: "cursor-agent-chat__messages-wrap",
		});
		this.messagesEl = messagesWrap.createDiv({
			cls: "cursor-agent-chat__messages",
		});

		// Loading indicator
		this.loadingEl = this.rootEl.createDiv({
			cls: "cursor-agent-chat__loading is-hidden",
		});
		const loadingContent = this.loadingEl.createDiv({
			cls: "cursor-agent-chat__loading-content",
		});
		loadingContent.createSpan({
			cls: "cursor-agent-chat__loading-dots",
			text: "Thinking",
		});

		// Input area
		const inputWrap = this.rootEl.createDiv({
			cls: "cursor-agent-chat__input-wrap",
		});

		this.inputEl = inputWrap.createEl("textarea", {
			cls: "cursor-agent-chat__input",
		});
		this.inputEl.rows = 3;
		this.inputEl.placeholder = "Type a message… (⌘/Ctrl+Enter to send)";
		this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if ((evt.metaKey || evt.ctrlKey) && evt.key === "Enter") {
				evt.preventDefault();
				void this.sendPrompt(this.inputEl.value);
			}
		});

		// Input footer (model picker left, buttons right)
		this.inputFooterEl = inputWrap.createDiv({
			cls: "cursor-agent-chat__input-footer",
		});

		// Left side: model picker OR generating indicator
		const footerLeft = this.inputFooterEl.createDiv({
			cls: "cursor-agent-chat__footer-left",
		});

		// Model picker
		this.modelPickerEl = footerLeft.createDiv({
			cls: "cursor-agent-chat__model-picker",
		});
		this.modelLabelEl = this.modelPickerEl.createSpan({
			cls: "cursor-agent-chat__model-label",
		});
		const chevron = this.modelPickerEl.createSpan({
			cls: "cursor-agent-chat__model-chevron",
		});
		setIcon(chevron, "chevron-down");
		this.modelPickerEl.addEventListener("click", (evt) =>
			this.showModelMenu(evt)
		);
		this.updateModelLabel();

		// Generating indicator (hidden by default)
		this.generatingEl = footerLeft.createDiv({
			cls: "cursor-agent-chat__generating is-hidden",
		});
		const spinner = this.generatingEl.createSpan({
			cls: "cursor-agent-chat__spinner",
		});
		setIcon(spinner, "loader-2");
		this.generatingEl.createSpan({ text: "Generating…" });

		// Right side: buttons
		const buttonsWrap = this.inputFooterEl.createDiv({
			cls: "cursor-agent-chat__buttons",
		});

		this.stopButtonEl = buttonsWrap.createEl("button", {
			cls: "cursor-agent-chat__btn cursor-agent-chat__btn--stop is-hidden",
			text: "Stop",
		});
		this.stopButtonEl.addEventListener("click", () =>
			this.stopGeneration()
		);

		this.sendButtonEl = buttonsWrap.createEl("button", {
			cls: "cursor-agent-chat__btn cursor-agent-chat__btn--send",
			text: "Send",
		});
		this.sendButtonEl.addEventListener("click", () => {
			void this.sendPrompt(this.inputEl.value);
		});

		this.renderHistory();

		// Register event listeners
		this.plugin.bridge.on("init", this.onInit);
		this.plugin.bridge.on("assistant", this.onAssistant);
		this.plugin.bridge.on("toolCall", this.onToolCall);
		this.plugin.bridge.on("result", this.onResult);
		this.plugin.bridge.on("error", this.onError);
		this.plugin.bridge.on("close", this.onBridgeClose);
		this.plugin.bridge.on(
			"mcpApprovalRequired",
			this.onMcpApprovalRequired
		);

		this.updateInputState();
	}

	async onClose(): Promise<void> {
		this.plugin.bridge.off("init", this.onInit);
		this.plugin.bridge.off("assistant", this.onAssistant);
		this.plugin.bridge.off("toolCall", this.onToolCall);
		this.plugin.bridge.off("result", this.onResult);
		this.plugin.bridge.off("error", this.onError);
		this.plugin.bridge.off("close", this.onBridgeClose);
		this.plugin.bridge.off(
			"mcpApprovalRequired",
			this.onMcpApprovalRequired
		);

		this.hideLoading();
		if (this.mcpModal) {
			this.mcpModal.close();
			this.mcpModal = null;
		}
		if (this.markdownComponent) {
			this.markdownComponent.unload();
			this.markdownComponent = null;
		}
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
		this.streamingText = "";
		this.updateInputState();
		this.setStatus("Running…");
		this.showLoading();

		this.inputEl.value = "";

		const resumeId = this.plugin.bridge.getSessionId();
		if (resumeId && !this.plugin.sessionManager.getCurrentSession()) {
			this.plugin.sessionManager.setCurrentSession(
				resumeId,
				this.selectedModel
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

		// Update bridge model if changed
		this.plugin.bridge.updateOptions({ model: this.selectedModel });
		this.plugin.refreshRuntime();
		await this.plugin.bridge.send(text);
	}

	private stopGeneration(): void {
		if (this.mcpModal) {
			this.mcpModal.close();
			this.mcpModal = null;
		}
		this.plugin.bridge.cancel();
		this.setStatus("Stopped");
		new Notice("Generation stopped");
	}

	private setStatus(text: string): void {
		this.statusEl.setText(text);
	}

	private updateInputState(): void {
		const running = this.isRunning || this.plugin.bridge.isRunning();
		this.inputEl.disabled = running;

		if (running) {
			this.sendButtonEl.addClass("is-hidden");
			this.stopButtonEl.removeClass("is-hidden");
			this.modelPickerEl.addClass("is-hidden");
			this.generatingEl.removeClass("is-hidden");
		} else {
			this.sendButtonEl.removeClass("is-hidden");
			this.stopButtonEl.addClass("is-hidden");
			this.modelPickerEl.removeClass("is-hidden");
			this.generatingEl.addClass("is-hidden");
		}
	}

	private updateModelLabel(): void {
		const short = this.selectedModel.split("-").slice(0, 2).join("-");
		this.modelLabelEl.setText(short || "Select model");
	}

	private showModelMenu(evt: MouseEvent): void {
		const menu = new Menu();

		for (const model of AVAILABLE_MODELS) {
			menu.addItem((item) => {
				item.setTitle(model)
					.setChecked(model === this.selectedModel)
					.onClick(() => {
						this.selectedModel = model;
						this.updateModelLabel();
						// Save as default
						this.plugin.settings.defaultModel = model;
						void this.plugin.saveSettings();
					});
			});
		}

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("Edit in settings…").onClick(() => {
				// Open settings to allow custom model input
				const appAny = this.app as unknown as Record<string, unknown>;
				const setting = appAny.setting as
					| {
							open: () => void;
							openTabById: (id: string) => void;
					  }
					| undefined;
				setting?.open();
				setting?.openTabById("obsidian-cursor-agent");
			});
		});

		menu.showAtMouseEvent(evt);
	}

	private showHistoryMenu(evt: MouseEvent): void {
		const menu = new Menu();
		const conversations =
			this.plugin.sessionManager.getLocalConversations();

		if (conversations.length === 0) {
			menu.addItem((item) => {
				item.setTitle("No conversations yet").setDisabled(true);
			});
		} else {
			for (const conv of conversations.slice(0, 10)) {
				menu.addItem((item) => {
					const preview = conv.preview.slice(0, 40) || "Untitled";
					const date = new Date(conv.timestamp).toLocaleDateString();
					item.setTitle(`${preview}… (${date})`).onClick(() => {
						this.loadConversation(conv.sessionId);
					});
				});
			}
		}

		menu.showAtMouseEvent(evt);
	}

	private loadConversation(sessionId: string): void {
		if (this.plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}

		this.plugin.bridge.setSessionId(sessionId);
		const messages = this.plugin.sessionManager.getMessages(sessionId);
		if (messages.length > 0) {
			this.plugin.sessionManager.setCurrentSession(
				sessionId,
				this.selectedModel
			);
		}
		this.reloadHistory();
		this.setStatus("Ready");
	}

	private showLoading(): void {
		this.loadingEl.removeClass("is-hidden");
		let dots = 0;
		const dotsEl = this.loadingEl.querySelector(
			".cursor-agent-chat__loading-dots"
		);
		if (dotsEl) {
			this.loadingDotsInterval = window.setInterval(() => {
				dots = (dots + 1) % 4;
				dotsEl.textContent = "Thinking" + ".".repeat(dots);
			}, 400);
		}
	}

	private hideLoading(): void {
		this.loadingEl.addClass("is-hidden");
		if (this.loadingDotsInterval !== null) {
			window.clearInterval(this.loadingDotsInterval);
			this.loadingDotsInterval = null;
		}
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
		// Tool calls (system messages) - collapsible
		if (message.role === "system") {
			this.appendToolCallMessage(message);
			return;
		}

		const row = this.messagesEl.createDiv({
			cls: `cursor-agent-chat__message cursor-agent-chat__message--${message.role}`,
		});
		row.dataset.messageId = message.id;

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

		// Timestamp
		const meta = row.createDiv({ cls: "cursor-agent-chat__message-meta" });
		meta.createSpan({
			cls: "cursor-agent-chat__timestamp",
			text: formatTime(message.timestamp),
		});

		// Actions
		const actions = meta.createDiv({
			cls: "cursor-agent-chat__message-actions",
		});

		const copyBtn = actions.createEl("button", {
			cls: "cursor-agent-chat__action-btn",
			attr: { "aria-label": "Copy" },
		});
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", () =>
			this.copyMessage(message.content, copyBtn)
		);

		if (message.role === "user") {
			const deleteBtn = actions.createEl("button", {
				cls: "cursor-agent-chat__action-btn",
				attr: { "aria-label": "Delete" },
			});
			setIcon(deleteBtn, "trash-2");
			deleteBtn.addEventListener("click", () =>
				this.deleteMessage(message.id, row)
			);
		}

		this.scrollToBottom();
	}

	private appendToolCallMessage(message: ChatMessage): void {
		// Find or create tool calls container
		let container = this.messagesEl.querySelector<HTMLElement>(
			".cursor-agent-chat__tool-calls"
		);

		if (!container) {
			container = this.messagesEl.createDiv({
				cls: "cursor-agent-chat__tool-calls",
			});

			const header = container.createDiv({
				cls: "cursor-agent-chat__tool-calls-header",
			});
			const toggle = header.createSpan({
				cls: "cursor-agent-chat__tool-calls-toggle",
			});
			setIcon(toggle, "chevron-down");
			header.createSpan({
				cls: "cursor-agent-chat__tool-calls-title",
				text: "Tool activity",
			});
			header.createSpan({
				cls: "cursor-agent-chat__tool-calls-count",
				text: "0",
			});

			header.addEventListener("click", () => {
				this.toolCallsCollapsed = !this.toolCallsCollapsed;
				container?.toggleClass("is-collapsed", this.toolCallsCollapsed);
				setIcon(
					toggle,
					this.toolCallsCollapsed ? "chevron-right" : "chevron-down"
				);
			});

			container.createDiv({ cls: "cursor-agent-chat__tool-calls-list" });
		}

		const list = container.querySelector(
			".cursor-agent-chat__tool-calls-list"
		);
		const countEl = container.querySelector(
			".cursor-agent-chat__tool-calls-count"
		);

		if (list) {
			const item = list.createDiv({
				cls: "cursor-agent-chat__tool-call-item",
			});
			item.setText(message.content);
		}

		// Update count
		const items = list?.querySelectorAll(
			".cursor-agent-chat__tool-call-item"
		);
		if (countEl && items) {
			countEl.textContent = String(items.length);
		}

		this.scrollToBottom();
	}

	private updateStreamingMessage(): void {
		this.hideLoading();

		if (!this.streamingEl) {
			this.streamingEl = this.messagesEl.createDiv({
				cls: "cursor-agent-chat__message cursor-agent-chat__message--assistant cursor-agent-chat__message--streaming",
			});
			this.streamingBubbleEl = this.streamingEl.createDiv({
				cls: "cursor-agent-chat__bubble",
			});

			this.markdownComponent = new Component();
			this.markdownComponent.load();
		}

		if (this.streamingBubbleEl && this.markdownComponent) {
			this.streamingBubbleEl.empty();
			void MarkdownRenderer.render(
				this.app,
				this.streamingText,
				this.streamingBubbleEl,
				"",
				this.markdownComponent
			);
		}

		this.scrollToBottom();
	}

	private finalizeStreamingMessage(): void {
		if (this.streamingEl) {
			this.streamingEl.remove();
			this.streamingEl = null;
			this.streamingBubbleEl = null;
		}

		if (this.markdownComponent) {
			this.markdownComponent.unload();
			this.markdownComponent = null;
		}

		if (this.streamingText) {
			const msg: ChatMessage = {
				id: createId(),
				role: "assistant",
				content: this.streamingText,
				timestamp: Date.now(),
			};
			this.plugin.sessionManager.addMessage(msg);
			void this.appendMessage(msg);
			this.streamingText = "";
		}

		// Clear tool calls container for next turn
		const toolCalls = this.messagesEl.querySelector(
			".cursor-agent-chat__tool-calls"
		);
		if (toolCalls) toolCalls.remove();
	}

	private copyMessage(content: string, btn: HTMLElement): void {
		void navigator.clipboard.writeText(content).then(() => {
			setIcon(btn, "check");
			setTimeout(() => {
				setIcon(btn, "copy");
			}, 1500);
		});
	}

	private deleteMessage(messageId: string, row: HTMLElement): void {
		this.plugin.sessionManager.deleteMessage(messageId);
		row.remove();
		void this.plugin.saveSettings();
	}

	private scrollToBottom(): void {
		this.messagesEl.scrollTo({
			top: this.messagesEl.scrollHeight,
			behavior: "smooth",
		});
	}

	private formatToolCall(e: ToolCallEvent): string | null {
		const subtype = e.subtype;
		if (e.tool_call.readToolCall?.args?.path) {
			return subtype === "started"
				? `📖 Reading ${e.tool_call.readToolCall.args.path}…`
				: `📖 Read ${e.tool_call.readToolCall.args.path}`;
		}

		if (e.tool_call.writeToolCall?.args?.path) {
			return subtype === "started"
				? `✏️ Writing ${e.tool_call.writeToolCall.args.path}…`
				: `✏️ Wrote ${e.tool_call.writeToolCall.args.path}`;
		}

		return `🔧 Tool call: ${subtype}`;
	}
}
