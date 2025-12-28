import { App, TFile, TFolder } from "obsidian";
import type { ChatMessage } from "../types";

const FRONTMATTER_KEYS = {
	isChat: "cursor_agent_chat",
	sessionId: "cursor_agent_session_id",
	model: "cursor_agent_model",
	createdEpoch: "cursor_agent_created_epoch",
	title: "cursor_agent_title",
} as const;

export interface CursorAgentChatNoteMeta {
	sessionId: string | null;
	model: string | null;
	createdEpoch: number;
	title: string;
}

function normalizeVaultFolderPath(raw: string): string {
	const trimmed = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
	return trimmed;
}

export function getChatHistoryFolderPath(rawSetting: string): string {
	return normalizeVaultFolderPath(rawSetting) || "Cursor Agent Chats";
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalized = normalizeVaultFolderPath(folderPath);
	if (!normalized) return;

	const parts = normalized.split("/").filter(Boolean);
	let acc = "";
	for (const part of parts) {
		acc = acc ? `${acc}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(acc);
		if (!existing) {
			await app.vault.createFolder(acc);
			continue;
		}
		if (!(existing instanceof TFolder)) {
			// If something exists but it's not a folder, bail.
			throw new Error(`Path exists and is not a folder: ${acc}`);
		}
	}
}

function sanitizeForFilename(s: string): string {
	return s
		.trim()
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/\s+/g, " ")
		.slice(0, 120)
		.trim();
}

function getDefaultTitle(messages: ChatMessage[]): string {
	const firstUser = messages.find((m) => m.role === "user")?.content?.trim();
	if (!firstUser) return "Chat";
	const firstLine = firstUser.split("\n")[0]?.trim() ?? "";
	return sanitizeForFilename(firstLine) || "Chat";
}

function escapeYamlDoubleQuoted(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildFrontmatter(meta: CursorAgentChatNoteMeta): string {
	const title = escapeYamlDoubleQuoted(meta.title);
	const sessionId = meta.sessionId
		? escapeYamlDoubleQuoted(meta.sessionId)
		: "";
	const model = meta.model ? escapeYamlDoubleQuoted(meta.model) : "";
	return [
		"---",
		`${FRONTMATTER_KEYS.isChat}: true`,
		`${FRONTMATTER_KEYS.sessionId}: "${sessionId}"`,
		`${FRONTMATTER_KEYS.model}: "${model}"`,
		`${FRONTMATTER_KEYS.createdEpoch}: ${meta.createdEpoch}`,
		`${FRONTMATTER_KEYS.title}: "${title}"`,
		"---",
		"",
	].join("\n");
}

function stripFrontmatter(markdown: string): string {
	const m = markdown.match(/^---\n[\s\S]*?\n---\n?/);
	if (!m) return markdown;
	return markdown.slice(m[0].length);
}

function getFrontmatter(app: App, file: TFile): Record<string, unknown> | null {
	return app.metadataCache.getFileCache(file)?.frontmatter ?? null;
}

export function getChatNoteMeta(
	app: App,
	file: TFile
): CursorAgentChatNoteMeta {
	const fm = getFrontmatter(app, file) ?? {};
	const createdEpoch =
		typeof fm[FRONTMATTER_KEYS.createdEpoch] === "number"
			? (fm[FRONTMATTER_KEYS.createdEpoch] as number)
			: file.stat.ctime;
	const sessionIdRaw = fm[FRONTMATTER_KEYS.sessionId];
	const modelRaw = fm[FRONTMATTER_KEYS.model];
	const titleRaw = fm[FRONTMATTER_KEYS.title];
	return {
		sessionId:
			typeof sessionIdRaw === "string" && sessionIdRaw
				? sessionIdRaw
				: null,
		model: typeof modelRaw === "string" && modelRaw ? modelRaw : null,
		createdEpoch,
		title:
			typeof titleRaw === "string" && titleRaw ? titleRaw : file.basename,
	};
}

export function getChatDisplayText(app: App, file: TFile): string {
	const meta = getChatNoteMeta(app, file);
	const d = new Date(meta.createdEpoch);
	const date = isNaN(d.getTime()) ? "" : d.toLocaleString();
	return date ? `${meta.title} — ${date}` : meta.title;
}

export async function listChatHistoryFiles(
	app: App,
	folderSetting: string
): Promise<TFile[]> {
	const folder = getChatHistoryFolderPath(folderSetting);
	const prefix = folder ? `${folder}/` : "";
	const files = app.vault
		.getMarkdownFiles()
		.filter((f) => (prefix ? f.path.startsWith(prefix) : true));
	return files.sort(
		(a, b) =>
			getChatNoteMeta(app, b).createdEpoch -
			getChatNoteMeta(app, a).createdEpoch
	);
}

export function buildChatNotePath(
	folderSetting: string,
	sessionId: string | null,
	createdEpoch: number
): string {
	const folder = getChatHistoryFolderPath(folderSetting);
	const safeId = sessionId
		? sanitizeForFilename(sessionId).replace(/\s/g, "")
		: "";
	const base = safeId
		? `cursor-agent-${safeId}`
		: `cursor-agent-${createdEpoch}`;
	return folder ? `${folder}/${base}.md` : `${base}.md`;
}

export function buildChatNoteContent(
	meta: CursorAgentChatNoteMeta,
	messages: ChatMessage[]
): string {
	const fm = buildFrontmatter(meta);
	const header = `# ${meta.title}\n`;
	const body = messages
		.map((m) => {
			const role = m.role;
			const ts = Number.isFinite(m.timestamp)
				? Math.floor(m.timestamp)
				: meta.createdEpoch;
			return [
				`<!-- cursor-agent-chat-message role=${role} ts=${ts} -->`,
				`**${role}**:`,
				(m.content ?? "").trimEnd(),
				"",
			].join("\n");
		})
		.join("\n");
	return `${fm}${header}\n${body}`.trimEnd() + "\n";
}

export async function saveChatAsNote(args: {
	app: App;
	folderSetting: string;
	sessionId: string | null;
	model: string | null;
	messages: ChatMessage[];
	title?: string;
	createdEpoch?: number;
}): Promise<{ file: TFile; meta: CursorAgentChatNoteMeta }> {
	const createdEpoch =
		typeof args.createdEpoch === "number"
			? args.createdEpoch
			: args.messages[0]?.timestamp ?? Date.now();
	const meta: CursorAgentChatNoteMeta = {
		sessionId: args.sessionId,
		model: args.model,
		createdEpoch,
		title: sanitizeForFilename(
			args.title ?? getDefaultTitle(args.messages)
		),
	};

	const folder = getChatHistoryFolderPath(args.folderSetting);
	await ensureFolderExists(args.app, folder);

	const path = buildChatNotePath(
		args.folderSetting,
		meta.sessionId,
		meta.createdEpoch
	);
	const content = buildChatNoteContent(meta, args.messages);
	const existing = args.app.vault.getAbstractFileByPath(path);
	if (existing && existing instanceof TFile) {
		const file = existing;
		await args.app.vault.modify(file, content);
		return { file, meta };
	}
	const file = await args.app.vault.create(path, content);
	return { file, meta };
}

export function parseChatNoteContent(markdown: string): ChatMessage[] {
	const body = stripFrontmatter(markdown);
	const re =
		/<!--\s*cursor-agent-chat-message\s+role=(user|assistant|system)\s+ts=(\d+)\s*-->\n([\s\S]*?)(?=\n<!--\s*cursor-agent-chat-message\s+role=|$)/g;
	const messages: ChatMessage[] = [];

	let match: RegExpExecArray | null;
	while ((match = re.exec(body)) !== null) {
		const role = match[1] as ChatMessage["role"];
		const ts = Number(match[2]) || Date.now();
		let content = (match[3] ?? "").trim();
		// Strip the human-visible "**role**:" line if present
		const roleLine = new RegExp(`^\\*\\*${role}\\*\\*:\\s*\\n?`, "i");
		content = content.replace(roleLine, "").trim();
		messages.push({
			id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
			role,
			content,
			timestamp: ts,
		});
	}
	return messages;
}
