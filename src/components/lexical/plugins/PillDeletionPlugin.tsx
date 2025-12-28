import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
	$getSelection,
	$isRangeSelection,
	$isNodeSelection,
	COMMAND_PRIORITY_LOW,
	KEY_BACKSPACE_COMMAND,
	KEY_DELETE_COMMAND,
} from "lexical";
import { IPillNode } from "../pills/BasePillNode";

function isPillNode(node: unknown): node is IPillNode {
	return (
		node !== null &&
		typeof node === "object" &&
		"isPill" in node &&
		typeof (node as IPillNode).isPill === "function" &&
		(node as IPillNode).isPill()
	);
}

export function PillDeletionPlugin() {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		const handleDelete = (_event: KeyboardEvent | null): boolean => {
			const selection = $getSelection();

			if ($isNodeSelection(selection)) {
				const nodes = selection.getNodes();
				const hasPill = nodes.some((node) => isPillNode(node));
				if (hasPill) {
					selection.getNodes().forEach((node) => {
						if (isPillNode(node)) {
							(node as { remove(): void }).remove();
						}
					});
					return true;
				}
			}

			if ($isRangeSelection(selection) && selection.isCollapsed()) {
				const anchor = selection.anchor;
				const anchorNode = anchor.getNode();
				if (isPillNode(anchorNode)) {
					(anchorNode as { remove(): void }).remove();
					return true;
				}
			}

			return false;
		};

		const removeBackspace = editor.registerCommand(
			KEY_BACKSPACE_COMMAND,
			handleDelete,
			COMMAND_PRIORITY_LOW
		);

		const removeDelete = editor.registerCommand(
			KEY_DELETE_COMMAND,
			handleDelete,
			COMMAND_PRIORITY_LOW
		);

		return () => {
			removeBackspace();
			removeDelete();
		};
	}, [editor]);

	return null;
}

