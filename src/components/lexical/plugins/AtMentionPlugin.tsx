import React, { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	$createTextNode,
	TextNode,
	COMMAND_PRIORITY_HIGH,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_ESCAPE_COMMAND,
	KEY_TAB_COMMAND,
} from "lexical";
import { App, TFile, TFolder } from "obsidian";
import {
	TypeaheadMenuPortal,
	TypeaheadOption,
	tryToPositionRange,
} from "../TypeaheadMenuPortal";
import { $createNotePillNode } from "../pills/NotePillNode";
import { $createFolderPillNode } from "../pills/FolderPillNode";
import { $createActiveNotePillNode } from "../pills/ActiveNotePillNode";

interface AtMentionPluginProps {
	app: App;
	activeFile: TFile | null;
	onAddContext?: (category: string, data: unknown) => void;
}

type Mode = "category" | "search";

interface TypeaheadState {
	isOpen: boolean;
	query: string;
	selectedIndex: number;
	range: Range | null;
	mode: Mode;
	selectedCategory?: "notes" | "folders" | "activeNote";
}

function scoreMatch(
	queryLower: string,
	titleLower: string,
	subtitleLower: string
): number {
	if (!queryLower) return 0;
	if (titleLower.startsWith(queryLower)) return 0;
	if (titleLower.includes(queryLower)) return 1;
	if (subtitleLower.includes(queryLower)) return 2;
	return 999;
}

const CATEGORIES: TypeaheadOption[] = [
	{ id: "cat-active", title: "Active note", category: "activeNote" },
	{ id: "cat-notes", title: "Notes", subtitle: "Search vault notes", category: "notes" },
	{ id: "cat-folders", title: "Folders", subtitle: "Add folder context", category: "folders" },
];

export function AtMentionPlugin({
	app,
	activeFile,
	onAddContext,
}: AtMentionPluginProps) {
	const [editor] = useLexicalComposerContext();
	const [state, setState] = useState<TypeaheadState>({
		isOpen: false,
		query: "",
		selectedIndex: 0,
		range: null,
		mode: "category",
	});

	const closeMenu = useCallback(() => {
		setState({
			isOpen: false,
			query: "",
			selectedIndex: 0,
			range: null,
			mode: "category",
		});
	}, []);

	const searchResults = useMemo((): TypeaheadOption[] => {
		const q = state.query.trim().toLowerCase();

		if (state.mode === "category") {
			if (!q) return CATEGORIES;

			const out: TypeaheadOption[] = [];

			if (activeFile) {
				const titleLower = activeFile.basename.toLowerCase();
				const subtitleLower = activeFile.path.toLowerCase();
				if (titleLower.includes(q) || subtitleLower.includes(q)) {
					out.push({
						id: "active-note",
						title: activeFile.basename,
						subtitle: activeFile.path,
						category: "activeNote",
						data: activeFile,
					});
				}
			}

			const noteMatches = app.vault
				.getMarkdownFiles()
				.filter((f) => {
					const titleLower = f.basename.toLowerCase();
					const subtitleLower = f.path.toLowerCase();
					return titleLower.includes(q) || subtitleLower.includes(q);
				})
				.sort((a, b) => {
					const sa = scoreMatch(q, a.basename.toLowerCase(), a.path.toLowerCase());
					const sb = scoreMatch(q, b.basename.toLowerCase(), b.path.toLowerCase());
					if (sa !== sb) return sa - sb;
					return b.stat.mtime - a.stat.mtime;
				})
				.slice(0, 15)
				.map((f) => ({
					id: `note-${f.path}`,
					title: f.basename,
					subtitle: f.path,
					category: "notes" as const,
					data: f,
				}));

			const folderMatches = app.vault
				.getAllLoadedFiles()
				.filter((f): f is TFolder => f instanceof TFolder)
				.filter((f) => {
					const titleLower = f.name.toLowerCase();
					const subtitleLower = f.path.toLowerCase();
					return titleLower.includes(q) || subtitleLower.includes(q);
				})
				.sort((a, b) => {
					const sa = scoreMatch(q, a.name.toLowerCase(), a.path.toLowerCase());
					const sb = scoreMatch(q, b.name.toLowerCase(), b.path.toLowerCase());
					if (sa !== sb) return sa - sb;
					return a.path.localeCompare(b.path);
				})
				.slice(0, 15)
				.map((f) => ({
					id: `folder-${f.path}`,
					title: f.name,
					subtitle: f.path,
					category: "folders" as const,
					data: f,
				}));

			out.push(...noteMatches, ...folderMatches);
			return out.slice(0, 30);
		}

		if (state.selectedCategory === "notes") {
			const files = app.vault.getMarkdownFiles();
			return files
				.filter((f) => {
					if (!q) return true;
					const titleLower = f.basename.toLowerCase();
					const subtitleLower = f.path.toLowerCase();
					return titleLower.includes(q) || subtitleLower.includes(q);
				})
				.sort((a, b) => {
					if (!q) return b.stat.mtime - a.stat.mtime;
					const sa = scoreMatch(q, a.basename.toLowerCase(), a.path.toLowerCase());
					const sb = scoreMatch(q, b.basename.toLowerCase(), b.path.toLowerCase());
					if (sa !== sb) return sa - sb;
					return b.stat.mtime - a.stat.mtime;
				})
				.slice(0, 15)
				.map((f) => ({
					id: `note-${f.path}`,
					title: f.basename,
					subtitle: f.parent?.path || "",
					category: "notes" as const,
					data: f,
				}));
		}

		if (state.selectedCategory === "folders") {
			const folders = app.vault
				.getAllLoadedFiles()
				.filter((f): f is TFolder => f instanceof TFolder);
			return folders
				.filter((f) => {
					if (!q) return true;
					const titleLower = f.name.toLowerCase();
					const subtitleLower = f.path.toLowerCase();
					return titleLower.includes(q) || subtitleLower.includes(q);
				})
				.sort((a, b) => {
					if (!q) return a.path.localeCompare(b.path);
					const sa = scoreMatch(q, a.name.toLowerCase(), a.path.toLowerCase());
					const sb = scoreMatch(q, b.name.toLowerCase(), b.path.toLowerCase());
					if (sa !== sb) return sa - sb;
					return a.path.localeCompare(b.path);
				})
				.slice(0, 15)
				.map((f) => ({
					id: `folder-${f.path}`,
					title: f.name,
					subtitle: f.path,
					category: "folders" as const,
					data: f,
				}));
		}

		return [];
	}, [activeFile, state.mode, state.query, state.selectedCategory, app.vault]);

	const handleSelect = useCallback(
		(option: TypeaheadOption) => {
			if (state.mode === "category" && !state.query) {
				if (option.category === "activeNote") {
					editor.update(() => {
						replaceTriggeredText(editor, $createActiveNotePillNode());
					});
					onAddContext?.("activeNote", activeFile);
					closeMenu();
					return;
				}
				setState((prev) => ({
					...prev,
					mode: "search",
					selectedCategory: option.category as "notes" | "folders",
					selectedIndex: 0,
				}));
				return;
			}

			editor.update(() => {
				if (option.category === "notes" && option.data instanceof TFile) {
					replaceTriggeredText(
						editor,
						$createNotePillNode(option.data.basename, option.data.path)
					);
					onAddContext?.("notes", option.data);
				} else if (
					option.category === "folders" &&
					option.data instanceof TFolder
				) {
					replaceTriggeredText(
						editor,
						$createFolderPillNode(option.data.path)
					);
					onAddContext?.("folders", option.data);
				} else if (option.category === "activeNote") {
					replaceTriggeredText(editor, $createActiveNotePillNode());
					onAddContext?.("activeNote", activeFile);
				}
			});
			closeMenu();
		},
		[editor, state.mode, state.query, activeFile, onAddContext, closeMenu]
	);

	// Keyboard navigation
	useEffect(() => {
		const handleKey = (event: KeyboardEvent | null): boolean => {
			if (!event || !state.isOpen) return false;

			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					setState((prev) => ({
						...prev,
						selectedIndex: Math.min(
							prev.selectedIndex + 1,
							searchResults.length - 1
						),
					}));
					return true;
				case "ArrowUp":
					event.preventDefault();
					setState((prev) => ({
						...prev,
						selectedIndex: Math.max(prev.selectedIndex - 1, 0),
					}));
					return true;
				case "Enter":
				case "Tab": {
					if (searchResults.length === 0) {
						closeMenu();
						return false;
					}
					event.preventDefault();
					const selected = searchResults[state.selectedIndex];
					if (selected) {
						handleSelect(selected);
					}
					return true;
				}
				case "Escape":
					event.preventDefault();
					closeMenu();
					return true;
				default:
					return false;
			}
		};

		const cmds = [
			editor.registerCommand(KEY_ARROW_DOWN_COMMAND, handleKey, COMMAND_PRIORITY_HIGH),
			editor.registerCommand(KEY_ARROW_UP_COMMAND, handleKey, COMMAND_PRIORITY_HIGH),
			editor.registerCommand(KEY_ENTER_COMMAND, handleKey, COMMAND_PRIORITY_HIGH),
			editor.registerCommand(KEY_TAB_COMMAND, handleKey, COMMAND_PRIORITY_HIGH),
			editor.registerCommand(KEY_ESCAPE_COMMAND, handleKey, COMMAND_PRIORITY_HIGH),
		];

		return () => cmds.forEach((c) => c());
	}, [editor, state.isOpen, state.selectedIndex, searchResults, handleSelect, closeMenu]);

	// Detect @ trigger
	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				const selection = $getSelection();
				if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
					if (state.isOpen) closeMenu();
					return;
				}

				const anchor = selection.anchor;
				const anchorNode = anchor.getNode();
				if (!(anchorNode instanceof TextNode)) {
					if (state.isOpen) closeMenu();
					return;
				}

				const text = anchorNode.getTextContent();
				const cursor = anchor.offset;

				let triggerIdx = -1;
				for (let i = cursor - 1; i >= 0; i--) {
					const char = text.charAt(i);
					if (char === "@") {
						const prevChar = i > 0 ? text.charAt(i - 1) : "";
						if (i === 0 || /\s/.test(prevChar)) {
							triggerIdx = i;
							break;
						}
					} else if (/\s/.test(char)) {
						break;
					}
				}

				if (triggerIdx !== -1) {
					const query = text.slice(triggerIdx + 1, cursor);
					if (query.startsWith(" ")) {
						if (state.isOpen) closeMenu();
						return;
					}

					const range = tryToPositionRange(
						triggerIdx,
						editor._window ?? window
					);

					if (range) {
						setState((prev) => ({
							...prev,
							isOpen: true,
							query,
							selectedIndex: 0,
							range,
						}));
					}
				} else if (state.isOpen) {
					closeMenu();
				}
			});
		});
	}, [editor, state.isOpen, closeMenu]);

	const resetSelectedIndex = useEffectEvent(() => {
		setState((prev) => ({ ...prev, selectedIndex: 0 }));
	});

	// Reset index on results change
	useLayoutEffect(() => {
		resetSelectedIndex();
	}, [searchResults.length]);

	return (
		<>
			{state.isOpen && (
				<TypeaheadMenuPortal
					options={searchResults}
					selectedIndex={state.selectedIndex}
					onSelect={handleSelect}
					onHighlight={(idx) =>
						setState((prev) => ({ ...prev, selectedIndex: idx }))
					}
					range={state.range}
					query={state.query}
					mode={state.mode}
				/>
			)}
		</>
	);
}

function replaceTriggeredText(editor: any, pillNode: any) {
	const selection = $getSelection();
	if (!$isRangeSelection(selection)) return;

	const anchor = selection.anchor;
	const anchorNode = anchor.getNode();
	if (!(anchorNode instanceof TextNode)) return;

	const text = anchorNode.getTextContent();
	const cursor = anchor.offset;

	let triggerIdx = -1;
	for (let i = cursor - 1; i >= 0; i--) {
		const char = text.charAt(i);
		if (char === "@") {
			const prevChar = i > 0 ? text.charAt(i - 1) : "";
			if (i === 0 || /\s/.test(prevChar)) {
				triggerIdx = i;
				break;
			}
		} else if (/\s/.test(char)) {
			break;
		}
	}

	if (triggerIdx === -1) return;

	const beforeText = text.slice(0, triggerIdx);
	const afterText = text.slice(cursor);

	if (beforeText) {
		anchorNode.setTextContent(beforeText);
		anchorNode.insertAfter(pillNode);
	} else {
		anchorNode.replace(pillNode);
	}

	if (afterText) {
		const afterNode = $createTextNode(" " + afterText);
		pillNode.insertAfter(afterNode);
	} else {
		const spaceNode = $createTextNode(" ");
		pillNode.insertAfter(spaceNode);
	}

	pillNode.selectNext();
}

