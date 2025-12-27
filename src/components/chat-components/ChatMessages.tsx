import ChatSingleMessage from "@/components/chat-components/ChatSingleMessage";
import type { ChatMessage } from "@/types";
import React, { memo, useEffect, useRef } from "react";

interface ChatMessagesProps {
	messages: ChatMessage[];
	onDelete?: (messageId: string) => void;
}

const ChatMessages = memo(({ messages, onDelete }: ChatMessagesProps) => {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [messages]);

	if (!messages.length) {
		return (
			<div className="tw-flex tw-size-full tw-items-center tw-justify-center tw-text-sm tw-text-muted">
				Start a conversation…
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className="tw-flex tw-h-full tw-flex-1 tw-flex-col tw-overflow-y-auto tw-scroll-smooth"
		>
			{messages.map((message) => (
				<ChatSingleMessage
					key={message.id}
					message={message}
					isStreaming={message.isStreaming}
					onDelete={onDelete ? () => onDelete(message.id) : undefined}
				/>
			))}
		</div>
	);
});

ChatMessages.displayName = "ChatMessages";
export default ChatMessages;
