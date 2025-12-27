import Chat from "@/components/Chat";
import type { CursorChatApi } from "@/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppContext, EventTargetContext } from "@/context";
import type CursorAgentChatPlugin from "@/main";
import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";

export const VIEW_TYPE_CURSOR_CHAT = "cursor-agent-chat";

export class CursorChatView extends ItemView {
	private root: Root | null = null;
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	private chatApi: CursorChatApi | null = null;
	private readonly eventTarget = new EventTarget();

	constructor(leaf: WorkspaceLeaf, private plugin: CursorAgentChatPlugin) {
		super(leaf);
		this.app = plugin.app;
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
		const mount = this.containerEl.children.item(1);
		if (!mount) throw new Error("Unable to mount Cursor chat view");
		this.root = createRoot(mount);
		this.renderView();
	}

	private renderView(): void {
		if (!this.root) return;

		this.root.render(
			<AppContext.Provider value={this.app}>
				<EventTargetContext.Provider value={this.eventTarget}>
					<TooltipProvider>
						<Chat
							plugin={this.plugin}
							onApi={(api) => (this.chatApi = api)}
						/>
					</TooltipProvider>
				</EventTargetContext.Provider>
			</AppContext.Provider>
		);
	}

	updateView(): void {
		this.renderView();
	}

	async onClose(): Promise<void> {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.chatApi = null;
	}

	newConversation(): void {
		this.chatApi?.newConversation();
	}

	reloadHistory(): void {
		this.chatApi?.reloadHistory();
	}

	async sendPrompt(prompt: string): Promise<void> {
		await this.chatApi?.sendPrompt(prompt);
	}

	stopGeneration(): void {
		this.chatApi?.stop();
	}
}
