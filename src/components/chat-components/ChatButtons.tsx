import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import { Check, Copy, TextCursorInput, Trash2 } from "lucide-react";
import { Platform } from "obsidian";
import React from "react";

interface ChatButtonsProps {
	message: ChatMessage;
	onCopy: () => void;
	isCopied: boolean;
	onInsertIntoEditor?: () => void;
	onDelete?: () => void;
}

export const ChatButtons: React.FC<ChatButtonsProps> = ({
	message,
	onCopy,
	isCopied,
	onInsertIntoEditor,
	onDelete,
}) => {
	const isUser = message.role === "user";

	return (
		<div
			className={cn("tw-flex tw-gap-1", {
				"group-hover:tw-opacity-100 tw-opacity-0": !Platform.isMobile,
			})}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost2"
						size="fit"
						onClick={onCopy}
						title="Copy"
					>
						{isCopied ? (
							<Check className="tw-size-4" />
						) : (
							<Copy className="tw-size-4" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent>Copy</TooltipContent>
			</Tooltip>

			{!isUser && onInsertIntoEditor && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							onClick={onInsertIntoEditor}
							variant="ghost2"
							size="fit"
							title="Insert at cursor"
						>
							<TextCursorInput className="tw-size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Insert at cursor</TooltipContent>
				</Tooltip>
			)}

			{onDelete && (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							onClick={onDelete}
							variant="ghost2"
							size="fit"
							title="Delete"
						>
							<Trash2 className="tw-size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Delete</TooltipContent>
				</Tooltip>
			)}
		</div>
	);
};
