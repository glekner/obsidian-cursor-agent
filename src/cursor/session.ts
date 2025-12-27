import { SessionInfo, ChatMessage, CursorAgentSettings } from "../types";
import { execCursorAgent } from "./cli";

export interface ConversationSummary {
	sessionId: string;
	timestamp: number;
	preview: string;
	messageCount: number;
}

export interface SessionManagerOptions {
	workingDirectory: string;
	settings: CursorAgentSettings;
}

/**
 * Manages cursor-agent sessions and conversation history
 */
export class SessionManager {
	private currentSession: SessionInfo | null = null;
	private conversations: Map<string, ConversationSummary> = new Map();
	private messageHistory: Map<string, ChatMessage[]> = new Map();

	constructor(private options: SessionManagerOptions) {}

	updateOptions(partial: Partial<SessionManagerOptions>): void {
		this.options = { ...this.options, ...partial };
	}

	/**
	 * Set the current active session (called when bridge emits 'init')
	 */
	setCurrentSession(sessionId: string, model: string): void {
		this.currentSession = {
			id: sessionId,
			model,
			startTime: Date.now(),
		};

		if (!this.conversations.has(sessionId)) {
			this.conversations.set(sessionId, {
				sessionId,
				timestamp: Date.now(),
				preview: "",
				messageCount: 0,
			});
		}

		if (!this.messageHistory.has(sessionId)) {
			this.messageHistory.set(sessionId, []);
		}
	}

	/**
	 * Add a message to the current session history
	 */
	addMessage(message: ChatMessage): void {
		if (!this.currentSession) return;

		const sessionId = this.currentSession.id;
		const messages = this.messageHistory.get(sessionId) || [];
		messages.push(message);
		this.messageHistory.set(sessionId, messages);

		// Update conversation summary
		const conv = this.conversations.get(sessionId);
		if (conv) {
			conv.messageCount = messages.length;
			if (message.role === "user") {
				conv.preview = message.content.slice(0, 100);
			}
			conv.timestamp = Date.now();
		}
	}

	/**
	 * Get messages for a session
	 */
	getMessages(sessionId?: string): ChatMessage[] {
		const id = sessionId || this.currentSession?.id;
		if (!id) return [];
		return this.messageHistory.get(id) || [];
	}

	/**
	 * Get current session info
	 */
	getCurrentSession(): SessionInfo | null {
		return this.currentSession;
	}

	/**
	 * Clear current session (for starting fresh)
	 */
	clearCurrentSession(): void {
		this.currentSession = null;
	}

	/**
	 * Get all local conversation summaries
	 */
	getLocalConversations(): ConversationSummary[] {
		return Array.from(this.conversations.values()).sort(
			(a, b) => b.timestamp - a.timestamp
		);
	}

	/**
	 * List conversations from cursor-agent CLI
	 */
	async listCLIConversations(): Promise<string[]> {
		const res = await execCursorAgent(["ls"], {
			cwd: this.options.workingDirectory,
			settings: this.options.settings,
			timeoutMs: 10_000,
		});

		if (res.code !== 0) return [];

		return res.stdout
			.trim()
			.split("\n")
			.map((l) => l.trim())
			.filter(Boolean);
	}

	/**
	 * Export session data for persistence
	 */
	exportData(): {
		conversations: ConversationSummary[];
		messages: Record<string, ChatMessage[]>;
	} {
		const messages: Record<string, ChatMessage[]> = {};
		this.messageHistory.forEach((msgs, id) => {
			messages[id] = msgs;
		});

		return {
			conversations: Array.from(this.conversations.values()),
			messages,
		};
	}

	/**
	 * Import session data (for loading from plugin storage)
	 */
	importData(data: {
		conversations?: ConversationSummary[];
		messages?: Record<string, ChatMessage[]>;
	}): void {
		if (data.conversations) {
			data.conversations.forEach((conv) => {
				this.conversations.set(conv.sessionId, conv);
			});
		}

		if (data.messages) {
			Object.entries(data.messages).forEach(([id, msgs]) => {
				this.messageHistory.set(id, msgs);
			});
		}
	}

	/**
	 * Delete a conversation from local history
	 */
	deleteConversation(sessionId: string): void {
		this.conversations.delete(sessionId);
		this.messageHistory.delete(sessionId);

		if (this.currentSession?.id === sessionId) {
			this.currentSession = null;
		}
	}

	/**
	 * Clear all local history
	 */
	clearAllHistory(): void {
		this.conversations.clear();
		this.messageHistory.clear();
		this.currentSession = null;
	}
}
