import React from "react";
import {
	DecoratorNode,
	DOMExportOutput,
	EditorConfig,
	NodeKey,
	SerializedLexicalNode,
} from "lexical";

export interface SerializedBasePillNode extends SerializedLexicalNode {
	value: string;
}

export interface IPillNode {
	isPill(): boolean;
}

export abstract class BasePillNode
	extends DecoratorNode<React.JSX.Element>
	implements IPillNode
{
	__value: string;

	constructor(value: string, key?: NodeKey) {
		super(key);
		this.__value = value;
	}

	updateDOM(): false {
		return false;
	}

	isInline(): boolean {
		return true;
	}

	canInsertTextBefore(): boolean {
		return true;
	}

	canInsertTextAfter(): boolean {
		return true;
	}

	canBeEmpty(): boolean {
		return false;
	}

	isKeyboardSelectable(): boolean {
		return true;
	}

	isIsolated(): boolean {
		return true;
	}

	isPill(): boolean {
		return true;
	}

	getValue(): string {
		return this.__value;
	}

	setValue(value: string): void {
		const writable = this.getWritable();
		writable.__value = value;
	}

	getTextContent(): string {
		return this.__value;
	}

	createDOM(_config: EditorConfig): HTMLElement {
		const span = document.createElement("span");
		span.className = this.getClassName();
		return span;
	}

	exportDOM(): DOMExportOutput {
		const element = document.createElement("span");
		element.setAttribute(this.getDataAttribute(), "");
		element.setAttribute("data-pill-value", this.__value);
		element.textContent = this.__value;
		return { element };
	}

	exportJSON(): SerializedBasePillNode {
		return {
			...super.exportJSON(),
			value: this.__value,
			type: this.getType(),
			version: 1,
		};
	}

	abstract getClassName(): string;
	abstract getDataAttribute(): string;
}

