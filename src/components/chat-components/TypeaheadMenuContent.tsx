import React, { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TypeaheadMode = "category" | "search";

export interface BaseTypeaheadOption {
	key: string;
	title: string;
	subtitle?: string;
	icon?: React.ReactNode;
}

export interface TypeaheadCategoryOption extends BaseTypeaheadOption {
	kind: "category";
	category: string;
}

export interface TypeaheadItemOption<TData = unknown>
	extends BaseTypeaheadOption {
	kind: "item";
	category: string;
	data: TData;
}

export type TypeaheadOption = TypeaheadCategoryOption | TypeaheadItemOption;

interface TypeaheadMenuContentProps {
	options: TypeaheadOption[];
	selectedIndex: number;
	onSelect: (option: TypeaheadOption) => void;
	onHighlight: (index: number) => void;
	query?: string;
	mode?: TypeaheadMode;
	searchBarMode?: boolean;
	searchQuery?: string;
	onSearchChange?: (query: string) => void;
	onKeyDown?: (event: React.KeyboardEvent) => void;
	className?: string;
	width?: number;
}

export function TypeaheadMenuContent({
	options,
	selectedIndex,
	onSelect,
	onHighlight,
	query = "",
	mode = "search",
	searchBarMode = false,
	searchQuery = "",
	onSearchChange,
	onKeyDown,
	className,
	width,
}: TypeaheadMenuContentProps) {
	const selectedItemRef = useRef<HTMLDivElement | null>(null);
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	useEffect(() => {
		if (searchBarMode) searchInputRef.current?.focus();
	}, [searchBarMode]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		setHoveredIndex(null);
	}, [selectedIndex]);

	useEffect(() => {
		if (selectedItemRef.current) {
			selectedItemRef.current.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "nearest",
			});
		}
	}, [selectedIndex]);

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onSearchChange?.(e.target.value);
	};

	const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (
			e.key === "ArrowDown" ||
			e.key === "ArrowUp" ||
			e.key === "Enter" ||
			e.key === "Tab" ||
			e.key === "Escape" ||
			e.key === "Backspace"
		) {
			e.preventDefault();
			onKeyDown?.(e);
		}
	};

	return (
		<div className={cn("tw-flex tw-flex-col", className)}>
			<div
				className="tw-overflow-hidden tw-rounded-lg tw-bg-primary"
				style={width ? { width } : undefined}
			>
				<div
					className="tw-overflow-y-auto"
					style={{
						minHeight: Math.min(options.length * 44 + 16, 100),
						maxHeight: 240,
					}}
				>
					<div className="tw-p-2 tw-text-normal">
						{options.map((option, index) => {
							const isSelected = index === selectedIndex;
							const isHovered = index === hoveredIndex;
							const shouldHighlight = isSelected || isHovered;
							const isCategory =
								mode === "category" &&
								!query &&
								option.kind === "category";

							return (
								<div
									key={option.key}
									ref={
										isSelected ? selectedItemRef : undefined
									}
									className={cn(
										"tw-flex tw-cursor-pointer tw-items-center tw-rounded-md tw-px-3 tw-py-2 tw-text-sm tw-text-normal",
										shouldHighlight &&
											"tw-bg-modifier-hover"
									)}
									onMouseDown={(e) => {
										e.preventDefault();
										onSelect(option);
									}}
									onMouseEnter={() => {
										setHoveredIndex(index);
										onHighlight(index);
									}}
									onMouseLeave={() => setHoveredIndex(null)}
								>
									{isCategory ? (
										<div className="tw-flex tw-w-full tw-items-center tw-justify-between">
											<div className="tw-flex tw-items-center tw-gap-2">
												{option.icon}
												<span className="tw-font-medium">
													{option.title}
												</span>
											</div>
											<ChevronRight className="tw-size-4 tw-text-muted" />
										</div>
									) : (
										<div className="tw-flex tw-min-w-0 tw-flex-1 tw-items-center tw-gap-2">
											{option.icon && (
												<div className="tw-flex tw-h-full tw-shrink-0 tw-items-center">
													{option.icon}
												</div>
											)}
											<div className="tw-flex tw-min-w-0 tw-flex-1 tw-flex-col tw-gap-0.5">
												<div className="tw-truncate tw-font-medium tw-text-normal">
													{option.title}
												</div>
												{option.subtitle && (
													<div className="tw-truncate tw-text-xs tw-text-muted">
														{option.subtitle}
													</div>
												)}
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>

				{searchBarMode && (
					<div className="tw-border-t tw-border-solid tw-border-border tw-p-0.5">
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={handleSearchChange}
							onKeyDown={handleSearchKeyDown}
							placeholder="Search…"
							autoFocus
							className="tw-w-full tw-rounded-md !tw-border-none !tw-bg-transparent tw-px-1 tw-py-0 tw-text-sm tw-text-normal placeholder:tw-text-muted focus:!tw-shadow-none"
						/>
					</div>
				)}
			</div>
		</div>
	);
}
