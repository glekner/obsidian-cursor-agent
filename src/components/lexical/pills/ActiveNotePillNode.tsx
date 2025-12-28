import React from "react";
import {
	$getRoot,
	DOMConversionMap,
	LexicalNode,
	NodeKey,
} from "lexical";
import { BasePillNode, SerializedBasePillNode } from "./BasePillNode";
import { PillBadge } from "./PillBadge";

export interface SerializedActiveNotePillNode extends SerializedBasePillNode {
	type: "active-note-pill";
}

export class ActiveNotePillNode extends BasePillNode {
	static getType(): string {
		return "active-note-pill";
	}

	static clone(node: ActiveNotePillNode): ActiveNotePillNode {
		return new ActiveNotePillNode(node.__key);
	}

	constructor(key?: NodeKey) {
		super("@active", key);
	}

	getClassName(): string {
		return "active-note-pill-wrapper";
	}

	getDataAttribute(): string {
		return "data-lexical-active-note-pill";
	}

	static importDOM(): DOMConversionMap | null {
		return {
			span: (node: HTMLElement) => {
				if (node.hasAttribute("data-lexical-active-note-pill")) {
					return {
						conversion: () => ({
							node: $createActiveNotePillNode(),
						}),
						priority: 1,
					};
				}
				return null;
			},
		};
	}

	static importJSON(
		_serializedNode: SerializedActiveNotePillNode
	): ActiveNotePillNode {
		return $createActiveNotePillNode();
	}

	exportJSON(): SerializedActiveNotePillNode {
		return {
			...super.exportJSON(),
			type: "active-note-pill",
		};
	}

	getTextContent(): string {
		return "@active";
	}

	decorate(): React.JSX.Element {
		return (
			<PillBadge className="tw-bg-accent/20">
				<span className="tw-text-accent">@active note</span>
			</PillBadge>
		);
	}
}

export function $createActiveNotePillNode(): ActiveNotePillNode {
	return new ActiveNotePillNode();
}

export function $isActiveNotePillNode(
	node: LexicalNode | null | undefined
): node is ActiveNotePillNode {
	return node instanceof ActiveNotePillNode;
}

export function $findActiveNotePills(): ActiveNotePillNode[] {
	const root = $getRoot();
	const pills: ActiveNotePillNode[] = [];

	function traverse(node: LexicalNode) {
		if (node instanceof ActiveNotePillNode) {
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

export function $removeActiveNotePills(): void {
	const pills = $findActiveNotePills();
	for (const pill of pills) {
		pill.remove();
	}
}

