import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PillBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	className?: string;
}

export function PillBadge({ children, className, ...props }: PillBadgeProps) {
	return (
		<Badge
			variant="secondary"
			className={cn(
				"tw-mx-0.5 tw-inline-flex tw-cursor-default tw-items-center tw-gap-1 tw-border tw-border-solid tw-border-border tw-px-1.5 tw-py-0 tw-align-middle tw-text-xs tw-font-normal",
				className
			)}
			{...props}
		>
			{children}
		</Badge>
	);
}

interface TruncatedPillTextProps {
	content: string;
	openBracket?: string;
	closeBracket?: string;
	maxLength?: number;
}

export function TruncatedPillText({
	content,
	openBracket = "",
	closeBracket = "",
	maxLength = 24,
}: TruncatedPillTextProps) {
	const displayName =
		content.length > maxLength
			? content.slice(0, maxLength - 1) + "…"
			: content;

	return (
		<span className="tw-max-w-32 tw-truncate" title={content}>
			{openBracket}
			{displayName}
			{closeBracket}
		</span>
	);
}

