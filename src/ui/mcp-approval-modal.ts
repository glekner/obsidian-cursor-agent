import { App, Modal, Setting } from "obsidian";
import type {
	McpServerApprovalChoice,
	McpServerApprovalRequest,
} from "../types";

export class McpApprovalModal extends Modal {
	private handled = false;

	constructor(
		app: App,
		private request: McpServerApprovalRequest,
		private onChoice: (choice: McpServerApprovalChoice) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// eslint-disable-next-line obsidianmd/ui/sentence-case
		contentEl.createEl("h2", { text: "MCP server approval required" });
		contentEl.createEl("p", {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			text: "Cursor agent needs your approval to use configured MCP servers.",
		});

		if (this.request.servers.length > 0) {
			const ul = contentEl.createEl("ul");
			for (const s of this.request.servers) {
				ul.createEl("li", {
					text: s.url ? `${s.name} (${s.url})` : s.name,
				});
			}
		}

		const actions = new Setting(contentEl);
		actions.addButton((btn) =>
			btn
				.setButtonText("Approve all servers")
				.setCta()
				.onClick(() => this.handle("approveAll"))
		);
		actions.addButton((btn) =>
			btn
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setButtonText("Continue without MCP")
				.onClick(() => this.handle("continueWithoutApproval"))
		);
		actions.addButton((btn) =>
			btn.setButtonText("Quit").onClick(() => this.handle("quit"))
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private handle(choice: McpServerApprovalChoice): void {
		if (this.handled) return;
		this.handled = true;
		this.close();
		this.onChoice(choice);
	}
}
