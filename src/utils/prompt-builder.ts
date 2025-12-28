import { TFile } from "obsidian";

export const SYSTEM_INSTRUCTIONS = `You are an AI assistant embedded inside Obsidian, a knowledge management and note-taking app. The user's vault (their collection of markdown notes) is your working directory.

Your capabilities:
- Search and read notes in the vault
- Create, edit, and organize markdown files
- Answer questions about the user's notes and knowledge base
- Help with writing, summarizing, and restructuring content
- Assist with linking notes and building connections between ideas

Guidelines:
- Use markdown formatting in your responses
- When referencing notes, use [[wiki-links]] syntax
- Respect the user's organizational structure
- Be concise and helpful
- If asked to modify notes, confirm the changes before proceeding unless in auto-approve mode`;

export interface PromptContext {
	activeFile?: TFile | null;
	noteContent?: string;
	customInstructions?: string;
	contextPaths?: PromptContextPath[];
}

export type PromptContextPathType = "note" | "folder";

export interface PromptContextPath {
	type: PromptContextPathType;
	path: string;
}

export function buildPrompt(
	userMessage: string,
	context: PromptContext
): string {
	const parts: string[] = [];

	// System instructions
	parts.push(`<system_instructions>\n${SYSTEM_INSTRUCTIONS}`);
	if (context.customInstructions?.trim()) {
		parts.push(`\n\n${context.customInstructions.trim()}`);
	}
	parts.push(`\n</system_instructions>`);

	// Active note context
	if (context.activeFile && context.noteContent !== undefined) {
		parts.push(
			`\n\n<active_note>\n<path>${context.activeFile.path}</path>\n<content>\n${context.noteContent}\n</content>\n</active_note>`
		);
	}

	// Selected context paths (notes/folders) - pass paths only so the agent can decide what to read.
	if (context.contextPaths?.length) {
		const items = context.contextPaths
			.map((c) => `<item type="${c.type}">${c.path}</item>`)
			.join("\n");
		parts.push(`\n\n<context_paths>\n${items}\n</context_paths>`);
	}

	// User message
	parts.push(`\n\n${userMessage}`);

	return parts.join("");
}
