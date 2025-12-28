import React from "react";
import {
	$getRoot,
	DOMConversionMap,
	DOMConversionOutput,
	DOMExportOutput,
	EditorConfig,
	LexicalNode,
	NodeKey,
} from "lexical";
import { BasePillNode, SerializedBasePillNode } from "./BasePillNode";
import { PillBadge, TruncatedPillText } from "./PillBadge";

export interface SerializedNotePillNode extends SerializedBasePillNode {
	noteTitle: string;
	notePath: string;
}

export class NotePillNode extends BasePillNode {
	__noteTitle: string;
	__notePath: string;

	static getType(): string {
		return "note-pill";
	}

	static clone(node: NotePillNode): NotePillNode {
		return new NotePillNode(node.__noteTitle, node.__notePath, node.__key);
	}

	constructor(noteTitle: string, notePath: string, key?: NodeKey) {
		super(noteTitle, key);
		this.__noteTitle = noteTitle;
		this.__notePath = notePath;
	}

	getClassName(): string {
		return "note-pill-wrapper";
	}

	getDataAttribute(): string {
		return "data-lexical-note-pill";
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const span = document.createElement("span");
		span.className = "note-pill-wrapper";
		return span;
	}

	static importDOM(): DOMConversionMap | null {
		return {
			span: (node: HTMLElement) => {
				if (node.hasAttribute("data-lexical-note-pill")) {
					return {
						conversion: convertNotePillElement,
						priority: 1,
					};
				}
				return null;
			},
		};
	}

	static importJSON(serializedNode: SerializedNotePillNode): NotePillNode {
		const { noteTitle, notePath } = serializedNode;
		return $createNotePillNode(noteTitle, notePath);
	}

	exportJSON(): SerializedNotePillNode {
		return {
			...super.exportJSON(),
			noteTitle: this.__noteTitle,
			notePath: this.__notePath,
			type: "note-pill",
			version: 1,
		};
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("span");
		element.setAttribute("data-lexical-note-pill", "true");
		element.setAttribute("data-note-title", this.__noteTitle);
		element.setAttribute("data-note-path", this.__notePath);
		element.textContent = `[[${this.__noteTitle}]]`;
		return { element };
	}

	getTextContent(): string {
		return `[[${this.__noteTitle}]]`;
	}

	getNoteTitle(): string {
		return this.__noteTitle;
	}

	getNotePath(): string {
		return this.__notePath;
	}

	decorate(): React.JSX.Element {
		return <NotePillComponent node={this} />;
	}
}

function convertNotePillElement(
	domNode: HTMLElement
): DOMConversionOutput | null {
	const noteTitle = domNode.getAttribute("data-note-title");
	const notePath = domNode.getAttribute("data-note-path");
	if (noteTitle && notePath) {
		const node = $createNotePillNode(noteTitle, notePath);
		return { node };
	}
	return null;
}

function NotePillComponent({ node }: { node: NotePillNode }): React.JSX.Element {
	const noteTitle = node.getNoteTitle();
	const notePath = node.getNotePath();

	return (
		<PillBadge title={notePath}>
			<TruncatedPillText
				content={noteTitle}
				openBracket="[["
				closeBracket="]]"
			/>
		</PillBadge>
	);
}

export function $createNotePillNode(
	noteTitle: string,
	notePath: string
): NotePillNode {
	return new NotePillNode(noteTitle, notePath);
}

export function $isNotePillNode(
	node: LexicalNode | null | undefined
): node is NotePillNode {
	return node instanceof NotePillNode;
}

export function $findNotePills(): NotePillNode[] {
	const root = $getRoot();
	const pills: NotePillNode[] = [];

	function traverse(node: LexicalNode) {
		if (node instanceof NotePillNode) {
			pills.push(node);
		}
		if ("getChildren" in node && typeof node.getChildren === "function") {
			const children = (node as { getChildren: () => LexicalNode[] }).getChildren();
			for (const child of children) {
				traverse(child);
			}
		}
	}

	traverse(root);
	return pills;
}

export function $removePillsByPath(notePath: string): number {
	const pills = $findNotePills();
	let removedCount = 0;
	for (const pill of pills) {
		if (pill.getNotePath() === notePath) {
			pill.remove();
			removedCount++;
		}
	}
	return removedCount;
}

