import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findNotePills } from "../pills/NotePillNode";
import { $findFolderPills } from "../pills/FolderPillNode";
import { $findActiveNotePills } from "../pills/ActiveNotePillNode";

interface PillSyncPluginProps {
	onNotesChange?: (notes: { path: string; title: string }[]) => void;
	onNotesRemoved?: (paths: string[]) => void;
	onFoldersChange?: (paths: string[]) => void;
	onFoldersRemoved?: (paths: string[]) => void;
	onActiveNoteAdded?: () => void;
	onActiveNoteRemoved?: () => void;
}

export function PillSyncPlugin({
	onNotesChange,
	onNotesRemoved,
	onFoldersChange,
	onFoldersRemoved,
	onActiveNoteAdded,
	onActiveNoteRemoved,
}: PillSyncPluginProps) {
	const [editor] = useLexicalComposerContext();
	const prevNotesRef = useRef<Set<string>>(new Set());
	const prevFoldersRef = useRef<Set<string>>(new Set());
	const prevHadActiveRef = useRef(false);

	useEffect(() => {
		return editor.registerUpdateListener(({ editorState }) => {
			editorState.read(() => {
				const notePills = $findNotePills();
				const folderPills = $findFolderPills();
				const activeNotePills = $findActiveNotePills();

				const currentNotePaths = new Set(
					notePills.map((p) => p.getNotePath())
				);
				const currentFolderPaths = new Set(
					folderPills.map((p) => p.getFolderPath())
				);
				const hasActive = activeNotePills.length > 0;

				// Note changes
				if (onNotesChange || onNotesRemoved) {
					const removed: string[] = [];
					for (const path of prevNotesRef.current) {
						if (!currentNotePaths.has(path)) {
							removed.push(path);
						}
					}
					if (removed.length > 0) {
						onNotesRemoved?.(removed);
					}

					const notes = notePills.map((p) => ({
						path: p.getNotePath(),
						title: p.getNoteTitle(),
					}));
					onNotesChange?.(notes);
				}
				prevNotesRef.current = currentNotePaths;

				// Folder changes
				if (onFoldersChange || onFoldersRemoved) {
					const removed: string[] = [];
					for (const path of prevFoldersRef.current) {
						if (!currentFolderPaths.has(path)) {
							removed.push(path);
						}
					}
					if (removed.length > 0) {
						onFoldersRemoved?.(removed);
					}
					onFoldersChange?.(Array.from(currentFolderPaths));
				}
				prevFoldersRef.current = currentFolderPaths;

				// Active note changes
				if (hasActive && !prevHadActiveRef.current) {
					onActiveNoteAdded?.();
				} else if (!hasActive && prevHadActiveRef.current) {
					onActiveNoteRemoved?.();
				}
				prevHadActiveRef.current = hasActive;
			});
		});
	}, [
		editor,
		onNotesChange,
		onNotesRemoved,
		onFoldersChange,
		onFoldersRemoved,
		onActiveNoteAdded,
		onActiveNoteRemoved,
	]);

	return null;
}

