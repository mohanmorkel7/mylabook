import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, X } from "lucide-react";

interface OptionItem {
  label: string;
  value: string;
}

interface MultiSelectProps {
  // Accept either simple string options or { label, value } objects for compatibility
  options: Array<string | OptionItem>;
  value: string[]; // array of option.value strings
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select options...",
  className = "",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  // Normalize options into { label, value } items
  const normalizedOptions: OptionItem[] = options.map((opt) =>
    typeof opt === "string" ? { label: opt, value: opt } : (opt as OptionItem),
  );

  const handleToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleRemove = (optionValue: string) => {
    onChange(value.filter((item) => item !== optionValue));
  };

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between min-h-[40px] h-auto"
          >
            <div className="flex flex-wrap gap-1">
              {value.length === 0 ? (
                <span className="text-gray-500">{placeholder}</span>
              ) : (
                // show labels for selected values
                value.map((val) => {
                  const found = normalizedOptions.find((o) => o.value === val);
                  const label = found ? found.label : val;
                  return (
                    <Badge
                      key={val}
                      variant="secondary"
                      className="text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(val);
                      }}
                    >
                      {label}
                      <X className="ml-1 h-3 w-3 cursor-pointer" />
                    </Badge>
                  );
                })
              )}
            </div>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <div className="p-2 border-b">
            <input
              type="text"
              placeholder="Search..."
              className="w-full px-2 py-1 text-sm border rounded"
              onChange={(e) => {
                const term = e.target.value.toLowerCase();
                const container = e.currentTarget.parentElement
                  ?.nextElementSibling as HTMLElement | null;
                if (!container) return;
                Array.from(container.querySelectorAll("[data-option]")).forEach(
                  (el) => {
                    const text = (
                      el.getAttribute("data-option") || ""
                    ).toLowerCase();
                    (el as HTMLElement).style.display = text.includes(term)
                      ? "flex"
                      : "none";
                  },
                );
              }}
            />
          </div>
          <div className="max-h-60 overflow-auto">
            {normalizedOptions.map((option) => (
              <div
                key={option.value}
                data-option={option.label}
                className="flex items-center space-x-2 p-2 hover:bg-gray-100 cursor-pointer"
                onClick={() => handleToggle(option.value)}
              >
                <Checkbox
                  checked={value.includes(option.value)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleToggle(option.value);
                  }}
                />
                <span className="text-sm">{option.label}</span>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
