import React, { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { TFile, TFolder } from "obsidian";
import { FileClock, FileText, Folder } from "lucide-react";
import { useApp } from "@/context";
import {
	TypeaheadMenuContent,
	type TypeaheadOption,
	type TypeaheadCategoryOption,
	type TypeaheadItemOption,
	type TypeaheadMode,
} from "@/components/chat-components/TypeaheadMenuContent";

export type AtMentionCategory = "activeNote" | "notes" | "folders";

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

export function useAtMentionState(currentActiveFile: TFile | null) {
	const app = useApp();
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [extendedState, setExtendedState] = useState<{
		mode: TypeaheadMode;
		selectedCategory?: AtMentionCategory;
	}>({ mode: "category" });
	const [notes, setNotes] = useState<TFile[]>([]);
	const [folders, setFolders] = useState<TFolder[]>([]);
	const [isOpen, setIsOpen] = useState(false);

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
					kind: "item" as const,
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
				kind: "item" as const,
				key: `folder-${folder.path}`,
				title: folder.name,
				subtitle: folder.path,
				category: "folders",
				data: folder,
				icon: <Folder className="tw-size-4" />,
			})),
		[folders]
	);

	const activeNoteItem = useMemo(() => {
		if (!currentActiveFile) return null;
		return {
			kind: "item" as const,
			key: `active-note-${currentActiveFile.path}`,
			title: "Active Note",
			subtitle: currentActiveFile.path,
			category: "activeNote" as const,
			data: currentActiveFile,
			icon: <FileClock className="tw-size-4" />,
		};
	}, [currentActiveFile]);

	const getOptions = useCallback((): TypeaheadOption[] => {
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

	const options = getOptions();

	const reset = useCallback(() => {
		setSearchQuery("");
		setSelectedIndex(0);
		setExtendedState({ mode: "category", selectedCategory: undefined });
		setIsOpen(false);
	}, []);

	const open = useCallback(() => {
		setIsOpen(true);
	}, []);

	const handleSelect = useCallback(
		(
			option: TypeaheadOption,
			onSelectCallback: (
				category: AtMentionCategory,
				data: unknown
			) => void,
			onClose: () => void
		) => {
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
				onSelectCallback(
					option.category as AtMentionCategory,
					option.data
				);
				onClose();
			}
		},
		[extendedState.mode, searchQuery]
	);

	const handleBackspace = useCallback(() => {
		if (extendedState.mode === "search" && !searchQuery) {
			setExtendedState({
				mode: "category",
				selectedCategory: undefined,
			});
			setSelectedIndex(0);
			return true;
		}
		return false;
	}, [extendedState.mode, searchQuery]);

	return {
		isOpen,
		searchQuery,
		setSearchQuery,
		selectedIndex,
		setSelectedIndex,
		options,
		extendedState,
		reset,
		open,
		handleSelect,
		handleBackspace,
	};
}

interface PortalProps {
	isOpen: boolean;
	anchorPosition: { left: number; top: number } | null;
	options: TypeaheadOption[];
	selectedIndex: number;
	onHighlight: (index: number) => void;
	onOptionSelect: (option: TypeaheadOption) => void;
	mode: TypeaheadMode;
}

export function AtMentionPortal({
	isOpen,
	anchorPosition,
	options,
	selectedIndex,
	onHighlight,
	onOptionSelect,
	mode,
}: PortalProps) {
	const position = useMemo(() => {
		if (!anchorPosition) return null;

		const MENU_WIDTH = 400;
		const MAX_WIDTH_PERCENTAGE = 0.9;
		const maxAllowedWidth = Math.floor(
			window.innerWidth * MAX_WIDTH_PERCENTAGE
		);
		const containerWidth = Math.min(MENU_WIDTH, maxAllowedWidth);

		const minLeft = 8;
		const maxLeft = window.innerWidth - containerWidth - 8;
		const left = Math.min(Math.max(anchorPosition.left, minLeft), maxLeft);

		return {
			top: anchorPosition.top,
			left,
			width: containerWidth,
		};
	}, [anchorPosition]);

	if (!isOpen || !position || options.length === 0) return null;

	return createPortal(
		<div
			className="tw-absolute tw-z-[9999] tw-flex tw-flex-col"
			style={{
				bottom: `calc(100vh - ${position.top}px + 4px)`,
				left: position.left,
				width: position.width,
			}}
		>
			<TypeaheadMenuContent
				options={options}
				selectedIndex={selectedIndex}
				onSelect={onOptionSelect}
				onHighlight={onHighlight}
				query=""
				mode={mode}
				className="tw-rounded-md tw-border tw-border-border tw-bg-primary tw-shadow-lg"
			/>
		</div>,
		document.body
	);
}
