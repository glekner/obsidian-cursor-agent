import {
	Component,
	EventRef,
	ItemView,
	MarkdownRenderer,
	Menu,
	Notice,
	setIcon,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import type CursorAgentChatPlugin from "../main";
import { buildPrompt } from "../utils/prompt-builder";
import type {
	AssistantMessageEvent,
	ChatMessage,
	ResultEvent,
	SystemInitEvent,
	ToolCallEvent,
} from "../types";
import { AVAILABLE_MODELS } from "../cursor/models";

export const VIEW_TYPE_CURSOR_CHAT = "cursor-agent-chat";

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
	private modelPickerEl!: HTMLElement;
	private modelLabelEl!: HTMLElement;
	private inputFooterEl!: HTMLElement;
	private generatingEl!: HTMLElement;
	private contextAreaEl!: HTMLElement;

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

	// Context state
	private includeActiveNote = true;
	private currentActiveFile: TFile | null = null;
	private activeLeafChangeRef: EventRef | null = null;

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
		if (this.streamingText) {
			this.finalizeStreamingMessage();
		}

		this.isRunning = false;
		this.updateInputState();
		this.hideLoading();

		if (code === 0) return;
		this.setStatus(code === null ? "Stopped" : `Exited (${code})`);
	};

	constructor(leaf: WorkspaceLeaf, private plugin: CursorAgentChatPlugin) {
		super(leaf);
		this.selectedModel = plugin.settings.defaultModel || "auto";
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

		// Context area (above input)
		this.contextAreaEl = inputWrap.createDiv({
			cls: "cursor-agent-chat__context-area",
		});
		this.updateContextBadge();

		this.inputEl = inputWrap.createEl("textarea", {
			cls: "cursor-agent-chat__input",
		});
		this.inputEl.rows = 3;
		this.inputEl.placeholder = "Type a message… (Shift+Enter for newline)";
		this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter" && !evt.shiftKey) {
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

		// Track active file changes
		this.currentActiveFile = this.app.workspace.getActiveFile();
		this.updateContextBadge();

		this.activeLeafChangeRef = this.app.workspace.on(
			"active-leaf-change",
			() => {
				const file = this.app.workspace.getActiveFile();
				if (file?.extension === "md") {
					this.currentActiveFile = file;
				} else {
					this.currentActiveFile = null;
				}
				this.updateContextBadge();
			}
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

		if (this.activeLeafChangeRef) {
			this.app.workspace.offref(this.activeLeafChangeRef);
			this.activeLeafChangeRef = null;
		}

		this.hideLoading();
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

		// Build prompt with context
		const noteContent =
			this.includeActiveNote && this.currentActiveFile
				? await this.app.vault.cachedRead(this.currentActiveFile)
				: undefined;
		const fullPrompt = buildPrompt(text, {
			activeFile: this.includeActiveNote ? this.currentActiveFile : null,
			noteContent,
			customInstructions: this.plugin.settings.customInstructions,
		});

		// Update bridge model if changed
		this.plugin.bridge.updateOptions({ model: this.selectedModel });
		this.plugin.refreshRuntime();
		console.log(
			"[cursor-agent] Sending prompt, model:",
			this.selectedModel
		);
		await this.plugin.bridge.send(fullPrompt);
	}

	private stopGeneration(): void {
		this.plugin.bridge.cancel();
		this.setStatus("Stopped");
		new Notice("Generation stopped");
	}

	private setStatus(text: string): void {
		this.statusEl.setText(text);
	}

	private updateInputState(): void {
		this.inputEl.disabled = this.isRunning;

		if (this.isRunning) {
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
		this.modelLabelEl.setText(this.selectedModel || "Select model");
	}

	private updateContextBadge(): void {
		if (!this.contextAreaEl) return;
		this.contextAreaEl.empty();

		// Show "add context" button if no context and there's an active file
		if (!this.includeActiveNote && this.currentActiveFile) {
			const addBtn = this.contextAreaEl.createEl("button", {
				cls: "cursor-agent-chat__add-context-btn",
				attr: { "aria-label": "Add current note as context" },
			});
			setIcon(addBtn, "plus");
			addBtn.createSpan({ text: "Add note" });
			addBtn.addEventListener("click", () => {
				this.includeActiveNote = true;
				this.updateContextBadge();
			});
			return;
		}

		if (!this.includeActiveNote || !this.currentActiveFile) return;

		const badge = this.contextAreaEl.createDiv({
			cls: "cursor-agent-chat__context-badge",
		});

		const icon = badge.createSpan({
			cls: "cursor-agent-chat__context-badge-icon",
		});
		setIcon(icon, "file-text");

		badge.createSpan({
			cls: "cursor-agent-chat__context-badge-name",
			text: this.currentActiveFile.basename,
		});

		badge.createSpan({
			cls: "cursor-agent-chat__context-badge-label",
			text: "Current",
		});

		const removeBtn = badge.createEl("button", {
			cls: "cursor-agent-chat__context-badge-remove",
			attr: { "aria-label": "Remove from context" },
		});
		setIcon(removeBtn, "x");
		removeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.includeActiveNote = false;
			this.updateContextBadge();
		});

		// Click badge to open the file
		badge.addEventListener("click", () => {
			if (this.currentActiveFile) {
				void this.app.workspace.openLinkText(
					this.currentActiveFile.path,
					"",
					false
				);
			}
		});
	}

	private showModelMenu(evt: MouseEvent): void {
		const menu = new Menu();
		const models = this.getDisplayModels();

		for (const model of models) {
			menu.addItem((item) => {
				item.setTitle(model)
					.setChecked(model === this.selectedModel)
					.onClick(() => {
						this.selectedModel = model;
						this.updateModelLabel();
						this.plugin.settings.defaultModel = model;
						void this.plugin.saveSettings();
					});
			});
		}

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle("Edit in settings…").onClick(() => {
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

	private getDisplayModels(): string[] {
		const models = [...AVAILABLE_MODELS];
		const selected = this.selectedModel?.trim();
		const defaultModel = this.plugin.settings.defaultModel?.trim();
		if (selected && !models.includes(selected)) models.unshift(selected);
		if (defaultModel && !models.includes(defaultModel))
			models.unshift(defaultModel);
		return models;
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
