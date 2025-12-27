import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import React, { useMemo, useState } from "react";

const SHIMMER_ANIMATION = "shimmer 2s ease-in-out infinite";
const MAX_DISPLAY_CHARS = 5_000;

interface ToolCallBannerProps {
	toolName: string;
	displayName: string;
	emoji: string;
	isExecuting: boolean;
	result?: string | null;
}

const formatToolResult = (result: string | null): string | null => {
	if (!result) return null;
	if (result.length > MAX_DISPLAY_CHARS) {
		return (
			result.slice(0, MAX_DISPLAY_CHARS) +
			`\n\n… (truncated ${(result.length - MAX_DISPLAY_CHARS).toLocaleString()} chars)`
		);
	}
	return result;
};

export const ToolCallBanner: React.FC<ToolCallBannerProps> = ({
	toolName,
	displayName,
	emoji,
	isExecuting,
	result,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const formattedResult = useMemo(() => formatToolResult(result ?? null), [result]);

	const actuallyExecuting = isExecuting && !result;
	const canExpand = !actuallyExecuting && formattedResult !== null;

	return (
		<Collapsible
			open={canExpand ? isOpen : false}
			onOpenChange={setIsOpen}
			disabled={!canExpand}
			aria-disabled={!canExpand}
			className="tw-my-2 tw-w-full"
		>
			<div
				className={cn(
					"tw-rounded-md tw-border tw-border-border tw-bg-secondary/50",
					actuallyExecuting && "tw-relative tw-overflow-hidden"
				)}
			>
				{actuallyExecuting && (
					<div className="tw-absolute tw-inset-0 tw-z-[1] tw-overflow-hidden">
						<div
							className="tw-absolute tw-inset-0 -tw-translate-x-full"
							style={{
								background:
									"linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 50%, transparent 100%)",
								animation: SHIMMER_ANIMATION,
							}}
						/>
					</div>
				)}

				<CollapsibleTrigger
					className={cn(
						"tw-flex tw-w-full tw-items-center tw-justify-between tw-px-3 tw-py-2 tw-text-sm",
						canExpand && "hover:tw-bg-secondary/70",
						!canExpand && "tw-cursor-default"
					)}
				>
					<div className="tw-flex tw-items-center tw-gap-2">
						<span>{emoji}</span>
						<span className="tw-font-medium">
							{actuallyExecuting ? `${toolName}…` : displayName}
						</span>
					</div>

					{canExpand && (
						<ChevronRight
							className={cn(
								"tw-size-4 tw-text-muted tw-transition-transform",
								isOpen && "tw-rotate-90"
							)}
						/>
					)}
				</CollapsibleTrigger>

				<CollapsibleContent>
					<div className="tw-border-t tw-border-border tw-px-3 tw-py-2">
						<pre className="tw-overflow-x-auto tw-whitespace-pre-wrap tw-font-mono tw-text-xs tw-text-muted">
							{formattedResult ?? "No result"}
						</pre>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
};
