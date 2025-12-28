import { App, FuzzySuggestModal, TFile } from "obsidian";
import { getChatDisplayText, getChatNoteMeta } from "@/history/chat-notes";

export class LoadChatHistoryModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private chatFiles: TFile[],
		private onChooseFile: (file: TFile) => void | Promise<void>
	) {
		super(app);
	}

	getItems(): TFile[] {
		return [...this.chatFiles].sort(
			(a, b) => getChatNoteMeta(this.app, b).createdEpoch - getChatNoteMeta(this.app, a).createdEpoch
		);
	}

	getItemText(file: TFile): string {
		return getChatDisplayText(this.app, file);
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent) {
		void this.onChooseFile(file);
	}
}


