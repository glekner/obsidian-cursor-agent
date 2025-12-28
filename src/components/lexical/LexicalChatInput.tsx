import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { $getRoot, EditorState, LexicalEditor } from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { App, TFile, TFolder } from "obsidian";
import { cn } from "@/lib/utils";

import { NotePillNode, $removePillsByPath } from "./pills/NotePillNode";
import { FolderPillNode, $removePillsByFolder } from "./pills/FolderPillNode";
import {
	ActiveNotePillNode,
	$removeActiveNotePills,
} from "./pills/ActiveNotePillNode";

import { KeyboardPlugin } from "./plugins/KeyboardPlugin";
import { PillSyncPlugin } from "./plugins/PillSyncPlugin";
import { PillDeletionPlugin } from "./plugins/PillDeletionPlugin";
import { AtMentionPlugin } from "./plugins/AtMentionPlugin";

interface LexicalChatInputProps {
	app: App;
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
	activeFile: TFile | null;

	onNotesChange?: (notes: { path: string; title: string }[]) => void;
	onNotesRemoved?: (paths: string[]) => void;
	onFoldersChange?: (paths: string[]) => void;
	onFoldersRemoved?: (paths: string[]) => void;
	onActiveNoteAdded?: () => void;
	onActiveNoteRemoved?: () => void;
	onEditorReady?: (editor: LexicalEditor) => void;
}

function FocusPlugin({
	onEditorReady,
}: {
	onEditorReady?: (editor: LexicalEditor) => void;
}) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		onEditorReady?.(editor);
	}, [editor, onEditorReady]);

	return null;
}

function ValueSyncPlugin({ value }: { value: string }) {
	const [editor] = useLexicalComposerContext();
	const prevValueRef = useRef(value);

	useEffect(() => {
		if (value === "" && prevValueRef.current !== "") {
			editor.update(() => {
				const root = $getRoot();
				root.clear();
			});
		}
		prevValueRef.current = value;
	}, [editor, value]);

	return null;
}

export default function LexicalChatInput({
	app,
	value,
	onChange,
	onSubmit,
	placeholder = "Type a message… (@ to mention)",
	disabled = false,
	className = "",
	activeFile,
	onNotesChange,
	onNotesRemoved,
	onFoldersChange,
	onFoldersRemoved,
	onActiveNoteAdded,
	onActiveNoteRemoved,
	onEditorReady,
}: LexicalChatInputProps) {
	const editorRef = useRef<LexicalEditor | null>(null);

	const initialConfig = useMemo(
		() => ({
			namespace: "ChatInput",
			theme: {
				root: "tw-outline-none",
				paragraph: "tw-m-0",
			},
			nodes: [NotePillNode, FolderPillNode, ActiveNotePillNode],
			onError: (error: Error) => {
				console.error("Lexical error:", error);
			},
			editable: !disabled,
		}),
		[disabled]
	);

	const handleEditorChange = useCallback(
		(editorState: EditorState) => {
			editorState.read(() => {
				const root = $getRoot();
				const textContent = root.getTextContent();
				onChange(textContent);
			});
		},
		[onChange]
	);

	const handleEditorReady = useCallback(
		(editor: LexicalEditor) => {
			editorRef.current = editor;
			onEditorReady?.(editor);
		},
		[onEditorReady]
	);

	const handleAddContext = useCallback(
		(category: string, data: unknown) => {
			if (category === "notes" && data instanceof TFile) {
				onNotesChange?.([{ path: data.path, title: data.basename }]);
			} else if (category === "folders" && data instanceof TFolder) {
				onFoldersChange?.([data.path]);
			} else if (category === "activeNote") {
				onActiveNoteAdded?.();
			}
		},
		[onNotesChange, onFoldersChange, onActiveNoteAdded]
	);

	return (
		<LexicalComposer initialConfig={initialConfig}>
			<div className={cn("tw-relative", className)}>
				<PlainTextPlugin
					contentEditable={
						<ContentEditable
							className="tw-max-h-40 tw-min-h-[60px] tw-w-full tw-resize-none tw-overflow-y-auto tw-rounded-md tw-border tw-border-border tw-bg-primary tw-px-2 tw-py-2 tw-text-sm tw-outline-none focus-visible:tw-ring-1 focus-visible:tw-ring-accent"
							aria-label="Chat input"
						/>
					}
					placeholder={
						<div className="tw-pointer-events-none tw-absolute tw-left-2 tw-top-2 tw-select-none tw-text-sm tw-text-muted/60">
							{placeholder}
						</div>
					}
					ErrorBoundary={LexicalErrorBoundary}
				/>
				<OnChangePlugin onChange={handleEditorChange} />
				<HistoryPlugin />
				<KeyboardPlugin onSubmit={onSubmit} />
				<ValueSyncPlugin value={value} />
				<FocusPlugin onEditorReady={handleEditorReady} />
				<PillSyncPlugin
					onNotesChange={onNotesChange}
					onNotesRemoved={onNotesRemoved}
					onFoldersChange={onFoldersChange}
					onFoldersRemoved={onFoldersRemoved}
					onActiveNoteAdded={onActiveNoteAdded}
					onActiveNoteRemoved={onActiveNoteRemoved}
				/>
				<PillDeletionPlugin />
				<AtMentionPlugin
					app={app}
					activeFile={activeFile}
					onAddContext={handleAddContext}
				/>
			</div>
		</LexicalComposer>
	);
}

export function removePillByPath(
	editor: LexicalEditor,
	path: string,
	type: "note" | "folder" | "active"
) {
	editor.update(() => {
		if (type === "note") {
			$removePillsByPath(path);
		} else if (type === "folder") {
			$removePillsByFolder(path);
		} else if (type === "active") {
			$removeActiveNotePills();
		}
	});
}

