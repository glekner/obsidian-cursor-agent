import ChatSingleMessage from "@/components/chat-components/ChatSingleMessage";
import type { ChatMessage } from "@/types";
import React, { memo, useEffect, useRef, useState } from "react";

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
		const containerRef = useRef<HTMLDivElement>(null);
		const [loadingDots, setLoadingDots] = useState("");

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

		// Auto-scroll to bottom on new content
		useEffect(() => {
			if (containerRef.current) {
				containerRef.current.scrollTop =
					containerRef.current.scrollHeight;
			}
		}, [chatHistory, currentAiMessage, dotsToShow]);

		const getLoadingText = () => {
			return loadingMessage
				? `${loadingMessage}${dotsToShow}`
				: `Thinking${dotsToShow}`;
		};

		if (!chatHistory.length && !currentAiMessage && !loading) {
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
		);
	}
);

ChatMessages.displayName = "ChatMessages";
export default ChatMessages;
