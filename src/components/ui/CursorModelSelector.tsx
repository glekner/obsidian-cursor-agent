import React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface CursorModelSelectorProps {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CursorModelSelector({
  models,
  value,
  onChange,
  disabled = false,
  className,
}: CursorModelSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost2"
          size="fit"
          disabled={disabled}
          className={cn("tw-min-w-0 tw-justify-start tw-text-muted", className)}
        >
          <span className="tw-min-w-0 tw-flex-1 tw-truncate">{value || "Select model"}</span>
          {!disabled && <ChevronDown className="tw-mt-0.5 tw-size-5 tw-shrink-0" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="tw-max-h-64 tw-overflow-y-auto">
        {models.map((m) => (
          <DropdownMenuItem
            key={m}
            onSelect={() => onChange(m)}
            className={cn(m === value && "tw-bg-modifier-hover")}
          >
            {m}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


