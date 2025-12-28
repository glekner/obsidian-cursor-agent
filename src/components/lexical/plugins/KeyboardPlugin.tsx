import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from "lexical";

interface KeyboardPluginProps {
	onSubmit: () => void;
}

export function KeyboardPlugin({ onSubmit }: KeyboardPluginProps) {
	const [editor] = useLexicalComposerContext();

	useEffect(() => {
		return editor.registerCommand(
			KEY_ENTER_COMMAND,
			(event: KeyboardEvent) => {
				if (event.isComposing) return false;
				if (!event.shiftKey && !event.metaKey && !event.ctrlKey) {
					event.preventDefault();
					onSubmit();
					return true;
				}
				return false;
			},
			COMMAND_PRIORITY_LOW
		);
	}, [editor, onSubmit]);

	return null;
}

