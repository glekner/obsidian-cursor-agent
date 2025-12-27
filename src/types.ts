// Cursor Agent NDJSON Event Types
// Based on: https://cursor.com/docs/cli/reference/output-format

export type CursorEventType =
	| "system"
	| "user"
	| "assistant"
	| "tool_call"
	| "result";

export interface SystemInitEvent {
	type: "system";
	subtype: "init";
	apiKeySource: "env" | "flag" | "login";
	cwd: string;
	session_id: string;
	model: string;
	permissionMode: string;
}

export interface MessageContent {
	type: "text";
	text: string;
}

export interface UserMessageEvent {
	type: "user";
	message: {
		role: "user";
		content: MessageContent[];
	};
	session_id: string;
}

export interface AssistantMessageEvent {
	type: "assistant";
	message: {
		role: "assistant";
		content: MessageContent[];
	};
	session_id: string;
}

// Tool call types
export interface ReadToolCallArgs {
	path: string;
}

export interface ReadToolCallSuccess {
	content: string;
	isEmpty: boolean;
	exceededLimit: boolean;
	totalLines: number;
	totalChars: number;
}

export interface WriteToolCallArgs {
	path: string;
	fileText: string;
	toolCallId: string;
}

export interface WriteToolCallSuccess {
	path: string;
	linesCreated: number;
	fileSize: number;
}

export interface ToolCallStarted {
	type: "tool_call";
	subtype: "started";
	call_id: string;
	tool_call: {
		readToolCall?: { args: ReadToolCallArgs };
		writeToolCall?: { args: WriteToolCallArgs };
		[key: string]: unknown;
	};
	session_id: string;
}

export interface ToolCallCompleted {
	type: "tool_call";
	subtype: "completed";
	call_id: string;
	tool_call: {
		readToolCall?: {
			args: ReadToolCallArgs;
			result: { success: ReadToolCallSuccess };
		};
		writeToolCall?: {
			args: WriteToolCallArgs;
			result: { success: WriteToolCallSuccess };
		};
		[key: string]: unknown;
	};
	session_id: string;
}

export type ToolCallEvent = ToolCallStarted | ToolCallCompleted;

export interface ResultEvent {
	type: "result";
	subtype: "success";
	duration_ms: number;
	duration_api_ms: number;
	is_error: boolean;
	result: string;
	session_id: string;
	request_id?: string;
}

export type CursorEvent =
	| SystemInitEvent
	| UserMessageEvent
	| AssistantMessageEvent
	| ToolCallEvent
	| ResultEvent;

export interface McpServerInfo {
	name: string;
	url?: string;
}

export interface McpServerApprovalRequest {
	servers: McpServerInfo[];
	rawText: string;
}

export type McpServerApprovalChoice =
	| "approveAll"
	| "continueWithoutApproval"
	| "quit";

// Plugin Settings
export interface CursorAgentSettings {
	apiKey: string;
	/**
	 * Optional absolute path to the `cursor-agent` binary (recommended on macOS when Obsidian doesn't inherit your shell PATH).
	 */
	cursorAgentPath: string;
	showToolCalls: boolean;
	permissionMode: "default" | "force";
	customInstructions: string;
	workingDirectory: string;
	defaultModel: string;
}

export const DEFAULT_SETTINGS: CursorAgentSettings = {
	apiKey: "",
	cursorAgentPath: "",
	showToolCalls: true,
	permissionMode: "default",
	customInstructions: "",
	workingDirectory: "",
	defaultModel: "",
};

// Chat Message for UI
export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	toolCalls?: ToolCallInfo[];
	isStreaming?: boolean;
}

export interface ToolCallInfo {
	id: string;
	type: "read" | "write" | "other";
	path?: string;
	status: "started" | "completed";
	result?: string;
}

// Session info
export interface SessionInfo {
	id: string;
	model: string;
	startTime: number;
}
