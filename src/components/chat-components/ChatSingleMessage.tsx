import { ChatButtons } from "@/components/chat-components/ChatButtons";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import { Component, MarkdownRenderer, MarkdownView } from "obsidian";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context";

interface ChatSingleMessageProps {
	message: ChatMessage;
	isStreaming?: boolean;
	onDelete?: () => void;
}

function preprocessAssistantMarkdown(markdown: string): string {
	let text = markdown;

	// Prevent execution of dataview/tasks blocks inside rendered markdown.
	text = text.replace(/```dataview(\s*(?:\n|$))/g, "```text$1");
	text = text.replace(/```dataviewjs(\s*(?:\n|$))/g, "```javascript$1");
	text = text.replace(/```tasks(\s*(?:\n|$))/g, "```text$1");

	// Normalize LaTeX delimiters.
	text = text
		.replace(/\\\[\s*/g, "$$")
		.replace(/\s*\\\]/g, "$$")
		.replace(/\\\(\s*/g, "$")
		.replace(/\s*\\\)/g, "$");

	return text;
}

export const ChatSingleMessage: React.FC<ChatSingleMessageProps> = ({
	message,
	isStreaming,
	onDelete,
}) => {
	const app = useApp();
	const [isCopied, setIsCopied] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);
	const componentRef = useRef<Component | null>(null);

	const isUser = message.role === "user";
	const isSystem = message.role === "system";

	const copyToClipboard = useCallback(async () => {
		await navigator.clipboard.writeText(message.content).then(() => {
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		});
	}, [message.content]);

	const insertIntoEditor = useCallback(() => {
		const leaf = app.workspace.getMostRecentLeaf();
		if (!leaf || !(leaf.view instanceof MarkdownView)) return;
		const editor = leaf.view.editor;
		const hasSelection = editor.getSelection().length > 0;
		if (hasSelection) {
			editor.replaceSelection(message.content);
		} else {
			editor.replaceRange(message.content, editor.getCursor());
		}
	}, [app, message.content]);

	useEffect(() => {
		if (isUser || isSystem) return;
		if (!contentRef.current) return;

		if (!componentRef.current) componentRef.current = new Component();

		contentRef.current.innerHTML = "";
		const activeFile = app.workspace.getActiveFile();
		const sourcePath = activeFile?.path ?? "";
		const processed = preprocessAssistantMarkdown(message.content);
		void MarkdownRenderer.render(
			app,
			processed,
			contentRef.current,
			sourcePath,
			componentRef.current
		);
	}, [app, message.content, isUser, isSystem]);

	useEffect(() => {
		return () => {
			if (componentRef.current) {
				componentRef.current.unload();
				componentRef.current = null;
			}
		};
	}, []);

	if (isSystem) {
		return (
			<div className="tw-my-1 tw-px-2 tw-text-xs tw-text-muted tw-italic">
				{message.content}
			</div>
		);
	}

	return (
		<div className="tw-my-1 tw-flex tw-w-full tw-flex-col">
			<div
				className={cn(
					"tw-group tw-mx-2 tw-rounded-md tw-p-2",
					isUser &&
						"tw-border tw-border-solid tw-border-border tw-bg-secondary/30"
				)}
			>
				<div className="tw-flex tw-max-w-full tw-flex-col tw-gap-1 tw-overflow-hidden">
					{isUser ? (
						<div className="tw-whitespace-pre-wrap tw-break-words tw-text-sm">
							{message.content}
						</div>
					) : (
						<div
							ref={contentRef}
							className="tw-prose tw-prose-sm tw-max-w-none tw-text-sm"
						/>
					)}

					{!isStreaming && (
						<div className="tw-flex tw-items-center tw-justify-end">
							<ChatButtons
								message={message}
								onCopy={copyToClipboard}
								isCopied={isCopied}
								onInsertIntoEditor={insertIntoEditor}
								onDelete={onDelete}
							/>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default ChatSingleMessage;
