import { useEffect, useMemo, useRef, useState } from "react";
import { Notice, TFile } from "obsidian";
import { Button } from "@/components/ui/button";
import ChatMessages from "@/components/chat-components/ChatMessages";
import type CursorAgentChatPlugin from "@/main";
import type {
	AssistantMessageEvent,
	ChatMessage,
	CursorChatApi,
	SystemInitEvent,
	ToolCallEvent,
	ResultEvent,
} from "@/types";
import { buildPrompt } from "@/utils/prompt-builder";
import { AVAILABLE_MODELS } from "@/cursor/models";
import { CursorModelSelector } from "@/components/ui/CursorModelSelector";

export type { CursorChatApi };

interface CursorChatProps {
	plugin: CursorAgentChatPlugin;
	onApi: (api: CursorChatApi) => void;
}

function isMarkdownFile(file: TFile | null): file is TFile {
	return !!file && file.extension === "md";
}

function createId(): string {
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function mergeStreamingText(prev: string, incoming: string): string {
	const next = incoming ?? "";
	if (!next) return prev;
	if (!prev) return next;
	if (next === prev) return prev;

	// Some stream formats send the full message-so-far each time.
	if (next.startsWith(prev)) return next;
	if (prev.startsWith(next)) return prev;

	// Try to merge overlapping suffix/prefix to avoid duplicated spans.
	const maxOverlap = Math.min(prev.length, next.length);
	for (let i = maxOverlap; i > 0; i--) {
		if (prev.endsWith(next.slice(0, i))) return prev + next.slice(i);
	}

	return prev + next;
}

function formatToolCall(e: ToolCallEvent): string | null {
	if (e.subtype === "started") {
		const read = e.tool_call.readToolCall?.args?.path;
		if (typeof read === "string") return `Reading \`${read}\`…`;
		const write = e.tool_call.writeToolCall?.args?.path;
		if (typeof write === "string") return `Writing \`${write}\`…`;
		return "Running tool…";
	}

	const read = e.tool_call.readToolCall?.args?.path;
	if (typeof read === "string") return `Read \`${read}\``;
	const write = e.tool_call.writeToolCall?.args?.path;
	if (typeof write === "string") return `Wrote \`${write}\``;
	return "Tool finished";
}

export default function Chat({ plugin, onApi }: CursorChatProps) {
	const [messages, setMessages] = useState<ChatMessage[]>(() =>
		plugin.sessionManager.getMessages()
	);
	const [input, setInput] = useState("");
	const [isGenerating, setIsGenerating] = useState(plugin.bridge.isRunning());
	const [streamingText, setStreamingText] = useState("");
	const [selectedModel, setSelectedModel] = useState<string>(
		plugin.settings.defaultModel || "auto"
	);
	const [includeActiveNote, setIncludeActiveNote] = useState(true);
	const [activeFile, setActiveFile] = useState<TFile | null>(() => {
		const f = plugin.app.workspace.getActiveFile();
		return isMarkdownFile(f) ? f : null;
	});

	const pendingMessagesRef = useRef<ChatMessage[]>([]);
	const lastFinalizedRef = useRef<string>("");
	const streamingTextRef = useRef<string>("");
	const selectedModelRef = useRef<string>(selectedModel);

	const displayModels = useMemo(() => {
		const models = [...AVAILABLE_MODELS];
		const selected = selectedModel.trim();
		const def = (plugin.settings.defaultModel || "").trim();
		if (selected && !models.includes(selected)) models.unshift(selected);
		if (def && !models.includes(def)) models.unshift(def);
		return models;
	}, [plugin.settings.defaultModel, selectedModel]);

	const reloadHistory = () => {
		setMessages(plugin.sessionManager.getMessages());
	};

	const newConversation = () => {
		if (plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}
		plugin.bridge.setSessionId(null);
		plugin.sessionManager.clearCurrentSession();
		pendingMessagesRef.current = [];
		lastFinalizedRef.current = "";
		streamingTextRef.current = "";
		setMessages([]);
		setStreamingText("");
		void plugin.saveSettings();
	};

	const stop = () => {
		plugin.bridge.cancel();
		setIsGenerating(false);
		new Notice("Generation stopped");
	};

	const finalizeStreamingMessage = () => {
		const content = streamingTextRef.current.trim();
		if (!content || content === lastFinalizedRef.current) return;

		lastFinalizedRef.current = content;

		const msg: ChatMessage = {
			id: createId(),
			role: "assistant",
			content,
			timestamp: Date.now(),
		};

		if (plugin.sessionManager.getCurrentSession())
			plugin.sessionManager.addMessage(msg);
		else pendingMessagesRef.current.push(msg);

		streamingTextRef.current = "";
		setStreamingText("");
		reloadHistory();
	};

	const onInit = (e: SystemInitEvent) => {
		plugin.sessionManager.setCurrentSession(
			e.session_id,
			selectedModelRef.current
		);
		for (const m of pendingMessagesRef.current)
			plugin.sessionManager.addMessage(m);
		pendingMessagesRef.current = [];

		void plugin.saveSettings();
		reloadHistory();
	};

	const onAssistant = (e: AssistantMessageEvent) => {
		const text = e.message.content.map((c) => c.text).join("");
		setStreamingText((prev) => {
			const merged = mergeStreamingText(prev, text);
			streamingTextRef.current = merged;
			return merged;
		});
	};

	const onToolCall = (e: ToolCallEvent) => {
		if (!plugin.settings.showToolCalls) return;
		const info = formatToolCall(e);
		if (!info) return;

		const msg: ChatMessage = {
			id: createId(),
			role: "system",
			content: info,
			timestamp: Date.now(),
		};

		if (plugin.sessionManager.getCurrentSession())
			plugin.sessionManager.addMessage(msg);
		else pendingMessagesRef.current.push(msg);

		reloadHistory();
	};

	const onResult = (_e: ResultEvent) => {
		finalizeStreamingMessage();
		setIsGenerating(false);
		void plugin.saveSettings();
	};

	const onError = (err: Error) => {
		finalizeStreamingMessage();
		setIsGenerating(false);
		new Notice(err.message);
		console.error("[cursor-agent]", err);
	};

	const onClose = (_code: number | null) => {
		finalizeStreamingMessage();
		setIsGenerating(false);
	};

	const sendPrompt = async (prompt: string) => {
		const text = prompt.trim();
		if (!text) return;
		if (plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}

		setIsGenerating(true);
		streamingTextRef.current = "";
		setStreamingText("");
		lastFinalizedRef.current = "";
		setInput("");

		const resumeId = plugin.bridge.getSessionId();
		if (resumeId && !plugin.sessionManager.getCurrentSession()) {
			plugin.sessionManager.setCurrentSession(resumeId, selectedModel);
		}

		const userMsg: ChatMessage = {
			id: createId(),
			role: "user",
			content: text,
			timestamp: Date.now(),
		};

		if (plugin.sessionManager.getCurrentSession())
			plugin.sessionManager.addMessage(userMsg);
		else pendingMessagesRef.current.push(userMsg);

		reloadHistory();
		void plugin.saveSettings();

		const noteContent =
			includeActiveNote && activeFile
				? await plugin.app.vault.cachedRead(activeFile)
				: undefined;

		// NOTE: don't include custom instructions here; CursorBridge already injects them.
		const fullPrompt = buildPrompt(text, {
			activeFile: includeActiveNote ? activeFile : null,
			noteContent,
		});

		plugin.settings.defaultModel = selectedModel;
		plugin.bridge.updateOptions({ model: selectedModel });
		plugin.refreshRuntime();

		try {
			await plugin.bridge.send(fullPrompt);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			onError(new Error(msg));
		}
	};

	useEffect(() => {
		onApi({ sendPrompt, newConversation, reloadHistory, stop });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [onApi, selectedModel, includeActiveNote, activeFile]);

	useEffect(() => {
		selectedModelRef.current = selectedModel;
	}, [selectedModel]);

	useEffect(() => {
		plugin.bridge.on("init", onInit);
		plugin.bridge.on("assistant", onAssistant);
		plugin.bridge.on("toolCall", onToolCall);
		plugin.bridge.on("result", onResult);
		plugin.bridge.on("error", onError);
		plugin.bridge.on("close", onClose);

		return () => {
			plugin.bridge.off("init", onInit);
			plugin.bridge.off("assistant", onAssistant);
			plugin.bridge.off("toolCall", onToolCall);
			plugin.bridge.off("result", onResult);
			plugin.bridge.off("error", onError);
			plugin.bridge.off("close", onClose);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [plugin]);

	useEffect(() => {
		const ref = plugin.app.workspace.on("active-leaf-change", () => {
			const f = plugin.app.workspace.getActiveFile();
			setActiveFile(isMarkdownFile(f) ? f : null);
		});
		return () => {
			// cspell:disable-next-line
			plugin.app.workspace.offref(ref);
		};
	}, [plugin.app.workspace]);

	return (
		<div className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden tw-p-2">
			<div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
				<div className="tw-text-sm tw-font-medium">Cursor agent</div>
				<Button
					variant="ghost2"
					size="fit"
					onClick={() => newConversation()}
				>
					New chat
				</Button>
			</div>

			<div className="tw-flex-1 tw-overflow-hidden tw-rounded-md tw-border tw-border-border">
				<ChatMessages
					chatHistory={messages}
					currentAiMessage={streamingText}
					loading={isGenerating}
				/>
			</div>

			<div className="tw-mt-2 tw-flex tw-flex-col tw-gap-2 tw-rounded-md tw-border tw-border-border tw-p-2">
				<div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
					<CursorModelSelector
						disabled={isGenerating}
						models={displayModels}
						value={selectedModel}
						onChange={setSelectedModel}
					/>

					<label className="tw-flex tw-items-center tw-gap-2 tw-text-xs tw-text-muted">
						<input
							type="checkbox"
							checked={includeActiveNote}
							onChange={(e) =>
								setIncludeActiveNote(e.target.checked)
							}
							disabled={!activeFile}
						/>
						Include note
					</label>
				</div>

				<textarea
					className="tw-min-h-20 tw-w-full tw-resize-y tw-rounded-md tw-border tw-border-border tw-bg-primary tw-p-2 tw-text-sm"
					placeholder="Type a message…"
					value={input}
					disabled={isGenerating}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void sendPrompt(input);
						}
					}}
				/>

				<div className="tw-flex tw-justify-end tw-gap-2">
					{isGenerating ? (
						<Button
							variant="ghost2"
							size="fit"
							onClick={() => stop()}
						>
							Stop
						</Button>
					) : (
						<Button
							variant="ghost2"
							size="fit"
							onClick={() => void sendPrompt(input)}
						>
							Send
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
