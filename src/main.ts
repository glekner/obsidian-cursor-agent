import {
	Editor,
	FileSystemAdapter,
	MarkdownView,
	Notice,
	Plugin,
} from "obsidian";
import { CursorBridge } from "./cursor/bridge";
import { SessionManager } from "./cursor/session";
import { CursorAgentSettingTab } from "./settings";
import { DEFAULT_SETTINGS, type CursorAgentSettings } from "./types";
import { resolveWorkingDirectory } from "./utils/path-utils";
import { CursorChatView, VIEW_TYPE_CURSOR_CHAT } from "./ui/chat-view";

type SessionExport = ReturnType<SessionManager["exportData"]>;

interface PersistedDataV1 {
	settings?: Partial<CursorAgentSettings>;
	sessions?: SessionExport;
	lastSessionId?: string | null;
}

export default class CursorAgentChatPlugin extends Plugin {
	settings: CursorAgentSettings = { ...DEFAULT_SETTINGS };
	bridge!: CursorBridge;
	sessionManager!: SessionManager;
	private lastSessionId: string | null = null;

	async onload() {
		const raw = (await this.loadData()) as unknown;
		this.loadFromPersistedData(raw);

		this.bridge = new CursorBridge({
			settings: this.settings,
			workingDirectory: this.getWorkingDirectory(),
		});
		this.bridge.setSessionId(this.lastSessionId);

		this.sessionManager = new SessionManager({
			workingDirectory: this.getWorkingDirectory(),
			settings: this.settings,
		});

		const sessions =
			raw && typeof raw === "object"
				? (raw as PersistedDataV1).sessions
				: undefined;
		if (sessions) this.sessionManager.importData(sessions);

		if (
			this.lastSessionId &&
			this.sessionManager.getMessages(this.lastSessionId).length > 0
		) {
			this.sessionManager.setCurrentSession(
				this.lastSessionId,
				this.settings.defaultModel || ""
			);
		}

		this.registerView(
			VIEW_TYPE_CURSOR_CHAT,
			(leaf) => new CursorChatView(leaf, this)
		);

		this.addRibbonIcon("message-circle", "Open cursor chat", () => {
			void this.openChatView();
		});

		this.addCommand({
			id: "cursor-agent-open-chat",
			name: "Cursor agent: open chat",
			callback: async () => {
				await this.openChatView();
			},
		});

		this.addCommand({
			id: "cursor-agent-new-conversation",
			name: "Cursor agent: new conversation",
			callback: async () => {
				const view = await this.openChatView();
				view.newConversation();
			},
		});

		this.addCommand({
			id: "cursor-agent-send-selection",
			name: "Cursor agent: send selection",
			editorCallback: async (editor: Editor, _view: MarkdownView) => {
				const selection = editor.getSelection().trim();
				if (!selection) {
					new Notice("No selection");
					return;
				}
				const chat = await this.openChatView();
				await chat.sendPrompt(selection);
			},
		});

		this.addCommand({
			id: "cursor-agent-resume-last",
			name: "Cursor agent: resume last conversation",
			callback: async () => {
				if (!this.lastSessionId) {
					new Notice("No previous session");
					return;
				}
				if (this.bridge.isRunning()) {
					new Notice("Cursor agent is running");
					return;
				}

				this.bridge.setSessionId(this.lastSessionId);
				if (!this.sessionManager.getCurrentSession()) {
					this.sessionManager.setCurrentSession(
						this.lastSessionId,
						this.settings.defaultModel || ""
					);
				}

				const chat = await this.openChatView();
				chat.reloadHistory();
			},
		});

		this.addSettingTab(new CursorAgentSettingTab(this.app, this));

		const onInit = () => {
			this.lastSessionId = this.bridge.getSessionId();
			void this.saveSettings();
		};
		this.bridge.on("init", onInit);
		this.register(() => this.bridge.off("init", onInit));
	}

	onunload() {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_CURSOR_CHAT
		);
		for (const leaf of leaves) leaf.detach();
	}

	getVaultBasePath(): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
		throw new Error("Vault adapter does not support filesystem access");
	}

	getWorkingDirectory(): string {
		const basePath = this.getVaultBasePath();
		try {
			return resolveWorkingDirectory(
				basePath,
				this.settings.workingDirectory
			);
		} catch (err) {
			console.warn(
				"[cursor-agent] invalid workingDirectory, falling back to vault root",
				err
			);
			return basePath;
		}
	}

	async openChatView(): Promise<CursorChatView> {
		const existing = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_CURSOR_CHAT
		)[0];
		const leaf =
			existing ??
			this.app.workspace.getRightLeaf(false) ??
			this.app.workspace.getLeaf("tab");
		if (!leaf) throw new Error("Unable to create workspace leaf");
		await leaf.setViewState({ type: VIEW_TYPE_CURSOR_CHAT, active: true });
		await this.app.workspace.revealLeaf(leaf);
		return leaf.view as unknown as CursorChatView;
	}

	async saveSettings(): Promise<void> {
		const data: PersistedDataV1 = {
			settings: this.settings,
			sessions: this.sessionManager.exportData(),
			lastSessionId: this.lastSessionId,
		};
		await this.saveData(data);
		this.refreshRuntime();
	}

	refreshRuntime(): void {
		const cwd = this.getWorkingDirectory();
		this.bridge.updateOptions({
			settings: this.settings,
			workingDirectory: cwd,
		});
		this.sessionManager.updateOptions({
			settings: this.settings,
			workingDirectory: cwd,
		});
	}

	private loadFromPersistedData(raw: unknown): void {
		if (!raw || typeof raw !== "object") {
			this.settings = { ...DEFAULT_SETTINGS };
			this.lastSessionId = null;
			return;
		}

		const data = raw as PersistedDataV1 & Partial<CursorAgentSettings>;
		const settings = data.settings ?? data;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, settings);
		this.lastSessionId =
			typeof data.lastSessionId === "string" ? data.lastSessionId : null;
	}
}
