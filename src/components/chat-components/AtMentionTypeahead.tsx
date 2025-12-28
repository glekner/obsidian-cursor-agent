import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TFile, TFolder } from "obsidian";
import { FileClock, FileText, Folder } from "lucide-react";
import { useApp } from "@/context";
import { TypeaheadMenuPopover } from "@/components/chat-components/TypeaheadMenuPopover";
import type {
	TypeaheadCategoryOption,
	TypeaheadItemOption,
	TypeaheadOption,
	TypeaheadMode,
} from "@/components/chat-components/TypeaheadMenuContent";

export type AtMentionCategory = "activeNote" | "notes" | "folders";

interface AtMentionTypeaheadProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (category: AtMentionCategory, data: unknown) => void;
	currentActiveFile?: TFile | null;
}

function toLower(s: string): string {
	return s.toLowerCase();
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

function getAllFoldersFromVault(app: ReturnType<typeof useApp>): TFolder[] {
	const files = app.vault.getAllLoadedFiles();
	const folders = files.filter((f): f is TFolder => f instanceof TFolder);
	folders.sort((a, b) => a.path.localeCompare(b.path));
	return folders;
}

export function AtMentionTypeahead({
	isOpen,
	onClose,
	onSelect,
	currentActiveFile = null,
}: AtMentionTypeaheadProps) {
	const app = useApp();
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [extendedState, setExtendedState] = useState<{
		mode: TypeaheadMode;
		selectedCategory?: AtMentionCategory;
	}>({ mode: "category" });

	const [notes, setNotes] = useState<TFile[]>([]);
	const [folders, setFolders] = useState<TFolder[]>([]);

	useEffect(() => {
		if (!isOpen) return;

		const update = () => {
			setNotes(app.vault.getMarkdownFiles());
			setFolders(getAllFoldersFromVault(app));
		};

		update();
		const refCreate = app.vault.on("create", update);
		const refDelete = app.vault.on("delete", update);
		const refRename = app.vault.on("rename", update);
		return () => {
			app.vault.offref(refCreate);
			app.vault.offref(refDelete);
			app.vault.offref(refRename);
		};
	}, [app, isOpen]);

	const categoryOptions = useMemo<TypeaheadCategoryOption[]>(
		() => [
			{
				kind: "category",
				key: "category-notes",
				title: "Notes",
				category: "notes",
				icon: <FileText className="tw-size-4" />,
			},
			{
				kind: "category",
				key: "category-folders",
				title: "Folders",
				category: "folders",
				icon: <Folder className="tw-size-4" />,
			},
		],
		[]
	);

	const noteItems = useMemo<TypeaheadItemOption<TFile>[]>(
		() =>
			[...notes]
				.sort((a, b) => b.stat.mtime - a.stat.mtime)
				.map((file) => ({
					kind: "item",
					key: `note-${file.path}`,
					title: file.basename,
					subtitle: file.path,
					category: "notes",
					data: file,
					icon: <FileText className="tw-size-4" />,
				})),
		[notes]
	);

	const folderItems = useMemo<TypeaheadItemOption<TFolder>[]>(
		() =>
			folders.map((folder) => ({
				kind: "item",
				key: `folder-${folder.path}`,
				title: folder.name,
				subtitle: folder.path,
				category: "folders",
				data: folder,
				icon: <Folder className="tw-size-4" />,
			})),
		[folders]
	);

	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
	const activeNoteItem = useMemo<TypeaheadItemOption<TFile> | null>(() => {
		if (!currentActiveFile) return null;
		return {
			kind: "item",
			key: `active-note-${currentActiveFile.path}`,
			title: "Active Note",
			subtitle: currentActiveFile.path,
			category: "activeNote",
			data: currentActiveFile,
			icon: <FileClock className="tw-size-4" />,
		};
	}, [currentActiveFile]);

	const searchResults = useMemo<TypeaheadOption[]>(() => {
		if (extendedState.mode === "category") {
			if (!searchQuery) {
				const base = [...categoryOptions];
				return activeNoteItem ? [activeNoteItem, ...base] : base;
			}

			const q = toLower(searchQuery.trim());
			const out: TypeaheadOption[] = [];

			if (activeNoteItem) {
				const hay = toLower(
					`active note ${activeNoteItem.subtitle ?? ""}`
				);
				if (hay.includes(q)) out.push(activeNoteItem);
			}

			const noteMatches = noteItems
				.filter((n) => {
					const title = toLower(n.title);
					const sub = toLower(n.subtitle ?? "");
					return title.includes(q) || sub.includes(q);
				})
				.sort((a, b) => {
					const sa = scoreMatch(
						q,
						toLower(a.title),
						toLower(a.subtitle ?? "")
					);
					const sb = scoreMatch(
						q,
						toLower(b.title),
						toLower(b.subtitle ?? "")
					);
					return sa - sb;
				});

			const folderMatches = folderItems
				.filter((f) => {
					const title = toLower(f.title);
					const sub = toLower(f.subtitle ?? "");
					return title.includes(q) || sub.includes(q);
				})
				.sort((a, b) => {
					const sa = scoreMatch(
						q,
						toLower(a.title),
						toLower(a.subtitle ?? "")
					);
					const sb = scoreMatch(
						q,
						toLower(b.title),
						toLower(b.subtitle ?? "")
					);
					return sa - sb;
				});

			out.push(...noteMatches, ...folderMatches);
			return out.slice(0, 30);
		}

		const selected = extendedState.selectedCategory;
		const q = toLower(searchQuery.trim());
		const items =
			selected === "notes"
				? noteItems
				: selected === "folders"
				? folderItems
				: [];

		if (!q) return items.slice(0, 30);

		return items
			.filter((item) => {
				const title = toLower(item.title);
				const sub = toLower(item.subtitle ?? "");
				return title.includes(q) || sub.includes(q);
			})
			.sort((a, b) => {
				const sa = scoreMatch(
					q,
					toLower(a.title),
					toLower(a.subtitle ?? "")
				);
				const sb = scoreMatch(
					q,
					toLower(b.title),
					toLower(b.subtitle ?? "")
				);
				return sa - sb;
			})
			.slice(0, 30);
	}, [
		activeNoteItem,
		categoryOptions,
		extendedState,
		folderItems,
		noteItems,
		searchQuery,
	]);

	const handleSelect = useCallback(
		(option: TypeaheadOption) => {
			if (
				extendedState.mode === "category" &&
				option.kind === "category" &&
				!searchQuery
			) {
				setExtendedState({
					mode: "search",
					selectedCategory: option.category as AtMentionCategory,
				});
				setSearchQuery("");
				setSelectedIndex(0);
				return;
			}

			if (option.kind === "item") {
				onSelect(option.category as AtMentionCategory, option.data);
				onClose();
			}
		},
		[extendedState.mode, onClose, onSelect, searchQuery]
	);

	const handleHighlight = useCallback((index: number) => {
		setSelectedIndex(index);
	}, []);

	const handleSearchChange = useCallback((query: string) => {
		setSearchQuery(query);
		setSelectedIndex(0);
	}, []);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			switch (event.key) {
				case "ArrowDown": {
					event.preventDefault();
					setSelectedIndex((i) =>
						Math.min(i + 1, Math.max(0, searchResults.length - 1))
					);
					break;
				}
				case "ArrowUp": {
					event.preventDefault();
					setSelectedIndex((i) => Math.max(i - 1, 0));
					break;
				}
				case "Enter":
				case "Tab": {
					event.preventDefault();
					const option = searchResults[selectedIndex];
					if (option) handleSelect(option);
					break;
				}
				case "Escape": {
					event.preventDefault();
					onClose();
					break;
				}
				case "Backspace": {
					if (extendedState.mode === "search" && !searchQuery) {
						event.preventDefault();
						setExtendedState({
							mode: "category",
							selectedCategory: undefined,
						});
						setSelectedIndex(0);
					}
					break;
				}
			}
		},
		[
			extendedState.mode,
			handleSelect,
			onClose,
			searchQuery,
			searchResults,
			selectedIndex,
		]
	);

	useEffect(() => {
		if (!isOpen) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setSearchQuery("");
			setSelectedIndex(0);
			setExtendedState({ mode: "category", selectedCategory: undefined });
		}
	}, [isOpen]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setSelectedIndex(0);
	}, [searchResults.length]);

	if (!isOpen) return null;

	return (
		<TypeaheadMenuPopover
			options={searchResults}
			selectedIndex={selectedIndex}
			onSelect={handleSelect}
			onHighlight={handleHighlight}
			query={searchQuery}
			mode={extendedState.mode}
			searchBarMode={true}
			searchQuery={searchQuery}
			onSearchChange={handleSearchChange}
			onKeyDown={handleKeyDown}
		/>
	);
}
