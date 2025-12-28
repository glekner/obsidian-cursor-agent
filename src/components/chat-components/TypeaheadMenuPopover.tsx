import React from "react";
import {
	TypeaheadMenuContent,
	type TypeaheadMode,
	type TypeaheadOption,
} from "@/components/chat-components/TypeaheadMenuContent";

interface TypeaheadMenuPopoverProps {
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
}

export function TypeaheadMenuPopover({
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
}: TypeaheadMenuPopoverProps) {
	return (
		<TypeaheadMenuContent
			options={options}
			selectedIndex={selectedIndex}
			onSelect={onSelect}
			onHighlight={onHighlight}
			query={query}
			mode={mode}
			searchBarMode={searchBarMode}
			searchQuery={searchQuery}
			onSearchChange={onSearchChange}
			onKeyDown={onKeyDown}
		/>
	);
}
