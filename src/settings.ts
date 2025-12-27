import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type CursorAgentChatPlugin from "./main";
import { DEFAULT_SETTINGS, type CursorAgentSettings } from "./types";
import { execCursorAgent } from "./cursor/cli";
import { isCursorAgentInstalled, openLoginFlow } from "./cursor/auth";

export class CursorAgentSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: CursorAgentChatPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("cursor-agent path")
			.setDesc(
				"Optional absolute path to cursor-agent (recommended if Obsidian doesn’t inherit your PATH)."
			)
			.addText((text) => {
				text.setPlaceholder("/opt/homebrew/bin/cursor-agent")
					.setValue(this.plugin.settings.cursorAgentPath)
					.onChange(async (value) => {
						this.plugin.settings.cursorAgentPath = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("API key")
			.setDesc(
				"Used only if not logged in. Prefer login or CURSOR_API_KEY env var."
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder(DEFAULT_SETTINGS.apiKey)
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("CLI status")
			.setDesc("Verify cursor-agent is installed and authenticated.")
			.addButton((btn) => {
				btn.setButtonText("Check installed").onClick(async () => {
					const cwd = this.plugin.getWorkingDirectory();
					const ok = await isCursorAgentInstalled(
						this.plugin.settings,
						cwd
					);
					new Notice(
						ok
							? "cursor-agent is installed"
							: "cursor-agent not found"
					);
				});
			})
			.addButton((btn) => {
				btn.setButtonText("Status").onClick(async () => {
					const cwd = this.plugin.getWorkingDirectory();
					const res = await execCursorAgent(["status"], {
						cwd,
						settings: this.plugin.settings,
						timeoutMs: 10_000,
					});
					if (res.code === 0) {
						new Notice("cursor-agent status: ok");
					} else {
						new Notice("cursor-agent status failed (see console)");
					}
					console.log("[cursor-agent status]", res);
				});
			})
			.addButton((btn) => {
				btn.setButtonText("Login").onClick(async () => {
					const cwd = this.plugin.getWorkingDirectory();
					const res = await openLoginFlow(this.plugin.settings, cwd);
					if (res.code === 0) new Notice("Login flow complete");
					else new Notice("Login flow exited (see console)");
					console.log("[cursor-agent login]", res);
				});
			});

		new Setting(containerEl)
			.setName("Show tool calls")
			.setDesc("Show file read/write activity in chat.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showToolCalls)
					.onChange(async (value) => {
						this.plugin.settings.showToolCalls = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Permission mode")
			.setDesc(
				"Default asks for confirmation; yolo tries to auto-approve (if supported by your CLI)."
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("default", "Default")
					.addOption("yolo", "Yolo")
					.setValue(this.plugin.settings.permissionMode)
					.onChange(async (value) => {
						this.plugin.settings.permissionMode =
							value as CursorAgentSettings["permissionMode"];
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Custom instructions")
			.setDesc("Prepended to every prompt.")
			.addTextArea((ta) => {
				ta.setPlaceholder(DEFAULT_SETTINGS.customInstructions)
					.setValue(this.plugin.settings.customInstructions)
					.onChange(async (value) => {
						this.plugin.settings.customInstructions = value;
						await this.plugin.saveSettings();
					});
				ta.inputEl.rows = 6;
			});

		new Setting(containerEl)
			.setName("Working directory")
			.setDesc("Relative to vault root. Empty = vault root.")
			.addText((text) => {
				text.setPlaceholder(DEFAULT_SETTINGS.workingDirectory)
					.setValue(this.plugin.settings.workingDirectory)
					.onChange(async (value) => {
						this.plugin.settings.workingDirectory = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Default model")
			.setDesc(
				"Used when starting a new conversation (not when resuming)."
			)
			.addText((text) => {
				text.setPlaceholder("gpt-5")
					.setValue(this.plugin.settings.defaultModel)
					.onChange(async (value) => {
						this.plugin.settings.defaultModel = value.trim();
						await this.plugin.saveSettings();
					});
			});
	}
}
