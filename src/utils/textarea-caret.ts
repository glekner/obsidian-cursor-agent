const globalWithActiveDocument = globalThis as unknown as {
	activeDocument?: Document;
};
const activeDocument = globalWithActiveDocument.activeDocument ?? document;

export interface CaretCoords {
	left: number;
	top: number;
	height: number;
}

const CSS_PROPS = [
	"direction",
	"box-sizing",
	"width",
	"height",
	"overflow-x",
	"overflow-y",
	"border-top-width",
	"border-right-width",
	"border-bottom-width",
	"border-left-width",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"font-style",
	"font-variant",
	"font-weight",
	"font-stretch",
	"font-size",
	"line-height",
	"font-family",
	"text-align",
	"text-transform",
	"text-indent",
	"text-decoration",
	"letter-spacing",
	"word-spacing",
	"tab-size",
] as const;

export function getTextareaCaretCoords(
	textarea: HTMLTextAreaElement,
	position: number
): CaretCoords {
	const doc = textarea.ownerDocument ?? activeDocument;
	const win = doc.defaultView ?? window;
	const computed = win.getComputedStyle(textarea);

	const div = doc.createElement("div");
	const divStyle = div.style;
	for (const prop of CSS_PROPS) {
		divStyle.setProperty(prop, computed.getPropertyValue(prop));
	}

	divStyle.position = "absolute";
	divStyle.visibility = "hidden";
	divStyle.top = "0";
	divStyle.left = "-9999px";
	divStyle.whiteSpace = "pre-wrap";
	divStyle.overflowWrap = "break-word";

	// Mirror scrolling to match visible caret position.
	div.scrollTop = textarea.scrollTop;
	div.scrollLeft = textarea.scrollLeft;

	const value = textarea.value ?? "";
	div.textContent = value.substring(0, position);

	const span = doc.createElement("span");
	span.textContent = value.substring(position) || ".";
	div.appendChild(span);

	doc.body.appendChild(div);

	const spanRect = span.getBoundingClientRect();
	const divRect = div.getBoundingClientRect();
	const taRect = textarea.getBoundingClientRect();

	// Relative position of the caret inside the textarea box.
	const left = taRect.left + (spanRect.left - divRect.left);
	const top = taRect.top + (spanRect.top - divRect.top);

	doc.body.removeChild(div);

	return { left, top, height: spanRect.height };
}
