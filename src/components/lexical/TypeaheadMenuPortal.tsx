import React, {
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { FileText, Folder, StickyNote } from "lucide-react";

export interface TypeaheadOption {
	id: string;
	title: string;
	subtitle?: string;
	category: "activeNote" | "notes" | "folders";
	data?: unknown;
	icon?: React.ReactNode;
}

export function tryToPositionRange(
	leadOffset: number,
	editorWindow: Window
): Range | null {
	const domSelection = editorWindow.getSelection();
	if (!domSelection?.isCollapsed) return null;

	const anchorNode = domSelection.anchorNode;
	const endOffset = domSelection.anchorOffset;
	if (!anchorNode || endOffset == null) return null;

	try {
		const range = editorWindow.document.createRange();
		range.setStart(anchorNode, leadOffset);
		range.setEnd(anchorNode, endOffset);
		return range;
	} catch {
		return null;
	}
}

const MENU_WIDTH = 320;

interface TypeaheadMenuPortalProps {
	options: TypeaheadOption[];
	selectedIndex: number;
	onSelect: (option: TypeaheadOption) => void;
	onHighlight: (index: number) => void;
	range: Range | null;
	query: string;
	mode?: "category" | "search";
}

export function TypeaheadMenuPortal({
	options,
	selectedIndex,
	onSelect,
	onHighlight,
	range,
	query,
	mode = "search",
}: TypeaheadMenuPortalProps) {
	const [position, setPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);

	const updatePosition = useEffectEvent(() => {
		if (!range) return;
		const rect = range.getBoundingClientRect();
		const top = rect.top - 8;
		const maxLeft = window.innerWidth - MENU_WIDTH - 16;
		const left = Math.min(Math.max(rect.left, 8), maxLeft);
		setPosition({ top, left });
	});

	useLayoutEffect(() => {
		updatePosition();
	}, [range]);

	useEffect(() => {
		window.addEventListener("resize", updatePosition);
		document.addEventListener("scroll", updatePosition, { passive: true });
		return () => {
			window.removeEventListener("resize", updatePosition);
			document.removeEventListener("scroll", updatePosition);
		};
	}, []);

	if (!position || options.length === 0) return null;

	const getIcon = (opt: TypeaheadOption) => {
		if (opt.icon) return opt.icon;
		switch (opt.category) {
			case "activeNote":
				return <StickyNote className="tw-size-4 tw-text-accent" />;
			case "notes":
				return <FileText className="tw-size-4 tw-text-muted" />;
			case "folders":
				return <Folder className="tw-size-4 tw-text-muted" />;
			default:
				return null;
		}
	};

	const container = (
		<div
			className="tw-absolute tw-z-[9999] tw-max-h-64 tw-overflow-y-auto tw-rounded-md tw-border tw-border-border tw-bg-primary tw-shadow-lg"
			style={{
				bottom: `calc(100vh - ${position.top}px)`,
				left: position.left,
				width: MENU_WIDTH,
			}}
		>
			{mode === "category" && !query && (
				<div className="tw-border-b tw-border-border tw-px-3 tw-py-1.5 tw-text-xs tw-text-muted">
					Select type
				</div>
			)}
			<div className="tw-py-1">
				{options.map((opt, idx) => (
					<div
						key={opt.id}
						className={cn(
							"tw-flex tw-cursor-pointer tw-items-center tw-gap-2 tw-px-3 tw-py-1.5 tw-text-sm",
							idx === selectedIndex && "tw-bg-secondary"
						)}
						onMouseEnter={() => onHighlight(idx)}
						onClick={() => onSelect(opt)}
					>
						{getIcon(opt)}
						<div className="tw-flex tw-flex-1 tw-flex-col tw-overflow-hidden">
							<span className="tw-truncate">{opt.title}</span>
							{opt.subtitle && (
								<span className="tw-truncate tw-text-xs tw-text-muted">
									{opt.subtitle}
								</span>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);

	return createPortal(container, document.body);
}
