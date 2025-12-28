import React from "react";
import type { App, TFile } from "obsidian";
import type { LexicalEditor } from "lexical";
import { Download, History, MessageCirclePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChatContextBar } from "@/components/chat-components/ChatContextBar";
import LexicalChatInput from "@/components/lexical/LexicalChatInput";
import { CursorModelSelector } from "@/components/ui/CursorModelSelector";

interface ChatInputContainerProps {
	app: App;
	activeFile: TFile | null;

	isGenerating: boolean;

	currentActiveFile: TFile | null;
	includeActiveNote: boolean;
	onIncludeActiveNoteChange: (value: boolean) => void;
	notePaths: string[];
	folderPaths: string[];
	onAddNotePath: (path: string) => void;
	onAddFolderPath: (path: string) => void;
	onRemoveNotePath: (path: string) => void;
	onRemoveFolderPath: (path: string) => void;

	models: string[];
	model: string;
	onModelChange: (model: string) => void;

	input: string;
	onInputChange: (value: string) => void;
	onSend: () => void;
	onStop: () => void;

	onNewChat: () => void;
	onSaveChat: () => void;
	onOpenHistory: () => void;

	onNotesChange: (notes: { path: string; title: string }[]) => void;
	onNotesRemoved: (paths: string[]) => void;
	onFoldersChange: (paths: string[]) => void;
	onFoldersRemoved: (paths: string[]) => void;
	onActiveNoteAdded: () => void;
	onActiveNoteRemoved: () => void;
	onEditorReady: (editor: LexicalEditor) => void;
}

export function ChatInputContainer({
	app,
	activeFile,
	isGenerating,
	currentActiveFile,
	includeActiveNote,
	onIncludeActiveNoteChange,
	notePaths,
	folderPaths,
	onAddNotePath,
	onAddFolderPath,
	onRemoveNotePath,
	onRemoveFolderPath,
	models,
	model,
	onModelChange,
	input,
	onInputChange,
	onSend,
	onStop,
	onNewChat,
	onSaveChat,
	onOpenHistory,
	onNotesChange,
	onNotesRemoved,
	onFoldersChange,
	onFoldersRemoved,
	onActiveNoteAdded,
	onActiveNoteRemoved,
	onEditorReady,
}: ChatInputContainerProps) {
	return (
		<div className="tw-mt-2 tw-flex tw-flex-col tw-gap-0.5 tw-rounded-md tw-border tw-border-solid tw-border-border tw-px-1 tw-pb-1 tw-pt-2">
			<ChatContextBar
				disabled={isGenerating}
				currentActiveFile={currentActiveFile}
				includeActiveNote={includeActiveNote}
				onIncludeActiveNoteChange={onIncludeActiveNoteChange}
				notePaths={notePaths}
				folderPaths={folderPaths}
				onAddNotePath={onAddNotePath}
				onAddFolderPath={onAddFolderPath}
				onRemoveNotePath={onRemoveNotePath}
				onRemoveFolderPath={onRemoveFolderPath}
			/>

			<LexicalChatInput
				app={app}
				value={input}
				onChange={onInputChange}
				onSubmit={onSend}
				placeholder="Your AI assistant for Obsidian • @ to add context"
				className="tw-mt-1"
				disabled={isGenerating}
				activeFile={activeFile}
				onNotesChange={onNotesChange}
				onNotesRemoved={onNotesRemoved}
				onFoldersChange={onFoldersChange}
				onFoldersRemoved={onFoldersRemoved}
				onActiveNoteAdded={onActiveNoteAdded}
				onActiveNoteRemoved={onActiveNoteRemoved}
				onEditorReady={onEditorReady}
			/>

			<div className="tw-flex tw-h-6 tw-justify-between tw-gap-1 tw-px-1">
				<div className="tw-min-w-0 tw-flex-1">
					<CursorModelSelector
						disabled={isGenerating}
						models={models}
						value={model}
						onChange={onModelChange}
						className="tw-max-w-full tw-truncate"
					/>
				</div>

				<div className="tw-flex tw-items-center tw-gap-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost2"
								size="icon"
								title="New chat"
								onClick={onNewChat}
							>
								<MessageCirclePlus className="tw-size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>New chat</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost2"
								size="icon"
								title="Save chat as note"
								disabled={isGenerating}
								onClick={onSaveChat}
							>
								<Download className="tw-size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Save chat as note</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost2"
								size="icon"
								title="Chat history"
								disabled={isGenerating}
								onClick={onOpenHistory}
							>
								<History className="tw-size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Chat history</TooltipContent>
					</Tooltip>

					{isGenerating ? (
						<Button variant="ghost2" size="fit" onClick={onStop}>
							Stop
						</Button>
					) : (
						<Button variant="ghost2" size="fit" onClick={onSend}>
							Send
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
