import { App, Modal } from "obsidian";

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private onConfirm: () => void,
		private message: string,
		private confirmText: string
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: this.message });

		const buttons = contentEl.createDiv({ cls: "modal-button-container" });
		const cancel = buttons.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());

		const ok = buttons.createEl("button", { text: this.confirmText });
		ok.addClass("mod-cta");
		ok.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}


