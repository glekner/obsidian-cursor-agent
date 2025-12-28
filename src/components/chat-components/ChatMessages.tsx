import ChatSingleMessage from "@/components/chat-components/ChatSingleMessage";
import { useChatScrolling } from "@/hooks/useChatScrolling";
import type { ChatMessage } from "@/types";
import React, { memo, useEffect, useState } from "react";

interface ChatMessagesProps {
	chatHistory: ChatMessage[];
	currentAiMessage: string;
	loading?: boolean;
	loadingMessage?: string;
	onDelete?: (messageId: string) => void;
}

const ChatMessages = memo(
	({
		chatHistory,
		currentAiMessage,
		loading,
		loadingMessage,
		onDelete,
	}: ChatMessagesProps) => {
		const [loadingDots, setLoadingDots] = useState("");

		const { scrollContainerRef } = useChatScrolling({
			chatHistory,
			currentAiMessage,
		});

		// Animated loading dots - only run interval when loading without content
		const shouldAnimate = loading && !currentAiMessage;
		useEffect(() => {
			if (!shouldAnimate) return;
			const intervalId = setInterval(() => {
				setLoadingDots((dots) => (dots.length < 6 ? dots + "." : ""));
			}, 200);
			return () => clearInterval(intervalId);
		}, [shouldAnimate]);

		// Reset dots when animation stops
		const dotsToShow = shouldAnimate ? loadingDots : "";

		const getLoadingText = () => {
			return loadingMessage
				? `${loadingMessage}${dotsToShow}`
				: `Thinking${dotsToShow}`;
		};

		if (!chatHistory.length && !currentAiMessage && !loading) {
			return (
				<div className="tw-flex tw-h-full tw-items-center tw-justify-center tw-text-sm tw-text-muted">
					Start a conversation…
				</div>
			);
		}

		return (
			<div className="tw-flex tw-h-full tw-flex-1 tw-flex-col tw-overflow-hidden">
				<div
					ref={scrollContainerRef}
					className="tw-relative tw-flex tw-h-full tw-w-full tw-flex-1 tw-select-text tw-flex-col tw-items-start tw-justify-start tw-overflow-y-auto tw-scroll-smooth tw-break-words tw-text-[calc(var(--font-text-size)_-_2px)]"
				>
					{chatHistory.map((message) => (
						<ChatSingleMessage
							key={message.id}
							message={message}
							isStreaming={false}
							onDelete={
								onDelete ? () => onDelete(message.id) : undefined
							}
						/>
					))}
					{(currentAiMessage || loading) && (
						<ChatSingleMessage
							key="ai_message_streaming"
							message={{
								id: "streaming",
								role: "assistant",
								content: currentAiMessage || getLoadingText(),
								timestamp: 0,
								isStreaming: true,
							}}
							isStreaming={true}
							onDelete={undefined}
						/>
					)}
				</div>
			</div>
		);
	}
);

ChatMessages.displayName = "ChatMessages";
export default ChatMessages;
