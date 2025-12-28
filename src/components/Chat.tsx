import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Notice, TFile } from "obsidian";
import type { LexicalEditor } from "lexical";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import ChatMessages from "@/components/chat-components/ChatMessages";
import LexicalChatInput, {
	removePillByPath,
} from "@/components/lexical/LexicalChatInput";
import type CursorAgentChatPlugin from "@/main";
import type {
	AssistantMessageEvent,
	ChatMessage,
	CursorChatApi,
	SystemInitEvent,
	ToolCallEvent,
	ResultEvent,
} from "@/types";
import { buildPrompt, type PromptContextPath } from "@/utils/prompt-builder";
import { AVAILABLE_MODELS } from "@/cursor/models";
import { CursorModelSelector } from "@/components/ui/CursorModelSelector";
import { Download, History, MessageCirclePlus } from "lucide-react";
import { LoadChatHistoryModal } from "@/modals/LoadChatHistoryModal";
import {
	getChatNoteMeta,
	listChatHistoryFiles,
	parseChatNoteContent,
	saveChatAsNote,
} from "@/history/chat-notes";

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

	if (next.startsWith(prev)) return next;
	if (prev.startsWith(next)) return prev;

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
	const [includeActiveNote, setIncludeActiveNote] = useState(false);
	const [contextNotePaths, setContextNotePaths] = useState<string[]>([]);
	const [contextFolderPaths, setContextFolderPaths] = useState<string[]>([]);
	const [activeFile, setActiveFile] = useState<TFile | null>(() => {
		const f = plugin.app.workspace.getActiveFile();
		return isMarkdownFile(f) ? f : null;
	});

	const editorRef = useRef<LexicalEditor | null>(null);
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

	const saveCurrentChatNote = async (opts?: { silent?: boolean }) => {
		const session = plugin.sessionManager.getCurrentSession();
		const sessionId = session?.id ?? plugin.bridge.getSessionId();
		if (!sessionId) {
			if (!opts?.silent) new Notice("No session to save yet");
			return;
		}

		const msgs = plugin.sessionManager.getMessages(sessionId);
		if (msgs.length === 0) {
			if (!opts?.silent) new Notice("No messages to save");
			return;
		}

		const { file } = await saveChatAsNote({
			app: plugin.app,
			folderSetting: plugin.settings.chatHistoryFolder,
			sessionId,
			model: selectedModelRef.current?.trim() || null,
			messages: msgs,
		});
		if (!opts?.silent) new Notice(`Chat saved: ${file.path}`);
	};

	const openChatHistory = async () => {
		if (plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}

		const files = await listChatHistoryFiles(
			plugin.app,
			plugin.settings.chatHistoryFolder
		);
		if (files.length === 0) {
			new Notice("No saved chats found");
			return;
		}

		const modal = new LoadChatHistoryModal(
			plugin.app,
			files,
			async (file) => {
				const meta = getChatNoteMeta(plugin.app, file);
				if (!meta.sessionId) {
					new Notice("Chat note is missing session ID");
					return;
				}
				const content = await plugin.app.vault.read(file);
				const parsed = parseChatNoteContent(content);
				if (parsed.length === 0) {
					new Notice("No messages found in chat note");
					return;
				}

				plugin.setActiveSessionId(meta.sessionId);
				plugin.sessionManager.upsertSession(
					meta.sessionId,
					meta.model ?? selectedModelRef.current ?? "",
					parsed
				);

				pendingMessagesRef.current = [];
				lastFinalizedRef.current = "";
				streamingTextRef.current = "";
				setContextNotePaths([]);
				setContextFolderPaths([]);
				setIncludeActiveNote(false);
				setStreamingText("");
				setIsGenerating(false);

				if (meta.model) setSelectedModel(meta.model);
				reloadHistory();
				await plugin.saveSettings();
			}
		);
		modal.open();
	};

	const requestNewConversation = () => {
		if (plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}
		const hasMessages = plugin.sessionManager.getMessages().length > 0;
		if (!hasMessages) {
			newConversation();
			return;
		}

		newConversation();
	};

	const newConversation = () => {
		if (plugin.bridge.isRunning()) {
			new Notice("Cursor agent is running");
			return;
		}
		const hasMessages = plugin.sessionManager.getMessages().length > 0;
		if (hasMessages && plugin.settings.autosaveChat) {
			void saveCurrentChatNote({ silent: true });
		}
		plugin.setActiveSessionId(null);
		plugin.sessionManager.clearCurrentSession();
		pendingMessagesRef.current = [];
		lastFinalizedRef.current = "";
		streamingTextRef.current = "";
		setContextNotePaths([]);
		setContextFolderPaths([]);
		setIncludeActiveNote(false);
		setMessages([]);
		setStreamingText("");
		void plugin.saveSettings();
	};

	const stop = () => {
		plugin.bridge.cancel();
		setIsGenerating(false);
		new Notice("Generation stopped");
	};

	// Pill sync handlers
	const handleNotesChange = useCallback(
		(notes: { path: string; title: string }[]) => {
			setContextNotePaths(notes.map((n) => n.path));
		},
		[]
	);

	const handleNotesRemoved = useCallback((paths: string[]) => {
		setContextNotePaths((prev) => prev.filter((p) => !paths.includes(p)));
	}, []);

	const handleFoldersChange = useCallback((paths: string[]) => {
		setContextFolderPaths(paths);
	}, []);

	const handleFoldersRemoved = useCallback((paths: string[]) => {
		setContextFolderPaths((prev) => prev.filter((p) => !paths.includes(p)));
	}, []);

	const handleActiveNoteAdded = useCallback(() => {
		setIncludeActiveNote(true);
	}, []);

	const handleActiveNoteRemoved = useCallback(() => {
		setIncludeActiveNote(false);
	}, []);

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
		if (plugin.settings.autosaveChat) {
			void saveCurrentChatNote({ silent: true });
		}
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

		// Clear pills from editor after sending
		if (editorRef.current) {
			for (const path of contextNotePaths) {
				removePillByPath(editorRef.current, path, "note");
			}
			for (const path of contextFolderPaths) {
				removePillByPath(editorRef.current, path, "folder");
			}
			if (includeActiveNote) {
				removePillByPath(editorRef.current, "", "active");
			}
		}

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

		const contextPaths: PromptContextPath[] = [
			...contextNotePaths.map(
				(path): PromptContextPath => ({ type: "note", path })
			),
			...contextFolderPaths.map(
				(path): PromptContextPath => ({ type: "folder", path })
			),
		];

		const fullPrompt = buildPrompt(text, {
			activeFile: includeActiveNote ? activeFile : null,
			noteContent,
			contextPaths,
		});

		// Reset context after building prompt
		setContextNotePaths([]);
		setContextFolderPaths([]);
		setIncludeActiveNote(false);

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
	}, [
		onApi,
		selectedModel,
		includeActiveNote,
		activeFile,
		contextNotePaths,
		contextFolderPaths,
	]);

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
			plugin.app.workspace.offref(ref);
		};
	}, [plugin.app.workspace]);

	return (
		<div className="tw-flex tw-size-full tw-flex-col tw-overflow-hidden tw-p-2">
			<div className="tw-mb-2 tw-flex tw-items-center tw-justify-between">
				<div className="tw-text-sm tw-font-medium">Cursor agent</div>
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
					<div className="tw-flex tw-items-center tw-gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost2"
									size="icon"
									title="New chat"
									onClick={() => requestNewConversation()}
								>
									<MessageCirclePlus className="tw-size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>New chat</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost2"
									size="icon"
									title="Save chat as note"
									disabled={isGenerating}
									onClick={() => void saveCurrentChatNote()}
								>
									<Download className="tw-size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Save chat as note</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost2"
									size="icon"
									title="Chat history"
									disabled={isGenerating}
									onClick={() => void openChatHistory()}
								>
									<History className="tw-size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Chat history</TooltipContent>
						</Tooltip>
					</div>
				</div>

				<LexicalChatInput
					app={plugin.app}
					value={input}
					onChange={setInput}
					onSubmit={() => void sendPrompt(input)}
					disabled={isGenerating}
					activeFile={activeFile}
					onNotesChange={handleNotesChange}
					onNotesRemoved={handleNotesRemoved}
					onFoldersChange={handleFoldersChange}
					onFoldersRemoved={handleFoldersRemoved}
					onActiveNoteAdded={handleActiveNoteAdded}
					onActiveNoteRemoved={handleActiveNoteRemoved}
					onEditorReady={(editor) => {
						editorRef.current = editor;
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
