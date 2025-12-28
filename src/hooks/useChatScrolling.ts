import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "@/types";

interface UseChatScrollingOptions {
	chatHistory: ChatMessage[];
	currentAiMessage?: string;
}

interface UseChatScrollingReturn {
	scrollContainerRef: React.RefObject<HTMLDivElement | null>;
	scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export const useChatScrolling = ({
	chatHistory,
	currentAiMessage,
}: UseChatScrollingOptions): UseChatScrollingReturn => {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const wasAtBottomRef = useRef(true);

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		if (scrollContainerRef.current) {
			scrollContainerRef.current.scrollTo({
				top: scrollContainerRef.current.scrollHeight,
				behavior,
			});
		}
	}, []);

	const isAtBottom = useCallback(() => {
		if (!scrollContainerRef.current) return true;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
		return scrollHeight - scrollTop - clientHeight < 50;
	}, []);

	// Track if user was at bottom before updates
	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			wasAtBottomRef.current = isAtBottom();
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, [isAtBottom]);

	// Scroll on initial mount
	useEffect(() => {
		scrollToBottom("instant");
	}, [scrollToBottom]);

	// Scroll when user message added
	useEffect(() => {
		if (chatHistory.length > 0) {
			const last = chatHistory[chatHistory.length - 1];
			if (last?.role === "user") {
				scrollToBottom();
			}
		}
	}, [chatHistory.length, scrollToBottom]);

	// Auto-scroll while streaming if user was at bottom
	useEffect(() => {
		if (currentAiMessage && wasAtBottomRef.current) {
			scrollToBottom("instant");
		}
	}, [currentAiMessage, scrollToBottom]);

	return {
		scrollContainerRef,
		scrollToBottom,
	};
};

