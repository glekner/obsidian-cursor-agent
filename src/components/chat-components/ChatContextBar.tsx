import React, { useMemo, useState } from "react";
import { TFile, TFolder } from "obsidian";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	AtMentionTypeahead,
	type AtMentionCategory,
} from "./AtMentionTypeahead";

interface ChatContextBarProps {
	disabled?: boolean;
	currentActiveFile: TFile | null;
	includeActiveNote: boolean;
	onIncludeActiveNoteChange: (value: boolean) => void;
	notePaths: string[];
	folderPaths: string[];
	onAddNotePath: (path: string) => void;
	onAddFolderPath: (path: string) => void;
	onRemoveNotePath: (path: string) => void;
	onRemoveFolderPath: (path: string) => void;
}

function basename(p: string): string {
	const last = p.split("/").pop();
	const name = last && last.length ? last : p;
	return name.endsWith(".md") ? name.slice(0, -3) : name;
}

export function ChatContextBar({
	disabled,
	currentActiveFile,
	includeActiveNote,
	onIncludeActiveNoteChange,
	notePaths,
	folderPaths,
	onAddNotePath,
	onAddFolderPath,
	onRemoveNotePath,
	onRemoveFolderPath,
}: ChatContextBarProps) {
	const [open, setOpen] = useState(false);

	const activeNoteVisible = includeActiveNote && Boolean(currentActiveFile);
	const hasContext =
		activeNoteVisible || notePaths.length > 0 || folderPaths.length > 0;

	const uniqueNotePaths = useMemo(
		() => Array.from(new Set(notePaths)),
		[notePaths]
	);
	const uniqueFolderPaths = useMemo(
		() => Array.from(new Set(folderPaths)),
		[folderPaths]
	);

	const handleSelect = (category: AtMentionCategory, data: unknown) => {
		switch (category) {
			case "activeNote":
				onIncludeActiveNoteChange(true);
				return;
			case "notes":
				if (data instanceof TFile) onAddNotePath(data.path);
				return;
			case "folders":
				if (data instanceof TFolder) onAddFolderPath(data.path);
				return;
		}
	};

	return (
		<div className="tw-flex tw-w-full tw-items-start tw-gap-1">
			<div className="tw-flex tw-h-full tw-items-start">
				<DropdownMenu open={open} onOpenChange={setOpen}>
					<DropdownMenuTrigger asChild>
						<Button
							disabled={disabled}
							variant="ghost2"
							size="fit"
							className="tw-ml-1 tw-rounded-sm tw-border tw-border-solid tw-border-border tw-text-muted"
						>
							<span className="tw-text-base tw-font-medium tw-leading-none">
								@
							</span>
							{!hasContext && (
								<span className="tw-pr-1 tw-text-sm tw-leading-4">
									Add context
								</span>
							)}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="tw-w-[400px] tw-p-0"
						align="start"
						side="top"
						sideOffset={4}
					>
						<AtMentionTypeahead
							isOpen={open}
							onClose={() => setOpen(false)}
							onSelect={handleSelect}
							currentActiveFile={currentActiveFile}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div className="tw-flex tw-flex-1 tw-flex-wrap tw-gap-1">
				{activeNoteVisible && currentActiveFile && (
					<Badge
						title={currentActiveFile.path}
						className="tw-items-center tw-gap-1 tw-py-0 tw-pl-2 tw-pr-0.5 tw-text-xs"
					>
						<span className="tw-max-w-40 tw-truncate">
							{currentActiveFile.basename}
						</span>
						<span className="tw-text-xs tw-text-faint">Current</span>
						<Button
							variant="ghost2"
							size="fit"
							onClick={() => onIncludeActiveNoteChange(false)}
							aria-label="Remove active note"
							className="tw-text-muted"
						>
							<X className="tw-size-4" />
						</Button>
					</Badge>
				)}

				{uniqueNotePaths.map((path) => (
					<Badge
						key={path}
						title={path}
						className="tw-items-center tw-gap-1 tw-py-0 tw-pl-2 tw-pr-0.5 tw-text-xs"
					>
						<span className="tw-max-w-40 tw-truncate">
							{basename(path)}
						</span>
						<Button
							variant="ghost2"
							size="fit"
							onClick={() => onRemoveNotePath(path)}
							aria-label="Remove note"
							className="tw-text-muted"
						>
							<X className="tw-size-4" />
						</Button>
					</Badge>
				))}

				{uniqueFolderPaths.map((path) => (
					<Badge
						key={path}
						title={path}
						className="tw-items-center tw-gap-1 tw-py-0 tw-pl-2 tw-pr-0.5 tw-text-xs"
					>
						<span className="tw-max-w-40 tw-truncate">
							{basename(path)}
						</span>
						<Button
							variant="ghost2"
							size="fit"
							onClick={() => onRemoveFolderPath(path)}
							aria-label="Remove folder"
							className="tw-text-muted"
						>
							<X className="tw-size-4" />
						</Button>
					</Badge>
				))}
			</div>
		</div>
	);
}
