import { useId, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Field, FieldLabel } from "@/ui/components/primitives/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "@/ui/components/primitives/input-group";
import { Spinner } from "@/ui/components/primitives/spinner";

export function SearchField({
  value,
  onChange,
  onSubmit,
  searching = false,
  disabled = false,
  summary,
  presentation = "default",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  searching?: boolean;
  disabled?: boolean;
  summary?: string;
  presentation?: "default" | "popup";
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field className="min-w-0 gap-2">
      <div
        className={
          presentation === "popup"
            ? "sr-only"
            : "flex items-baseline justify-between gap-3"
        }
      >
        <FieldLabel htmlFor={id}>Search entries</FieldLabel>
        {summary ? (
          <p role="status" className="text-xs text-muted-foreground">
            {summary}
          </p>
        ) : null}
      </div>
      <InputGroup className="h-10">
        <InputGroupInput
          ref={input}
          id={id}
          value={value}
          disabled={disabled}
          placeholder="Login, website, tag or folder…"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <InputGroupAddon align="inline-start">
          <HugeiconsIcon icon={Search01Icon} size={16} aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupAddon align="inline-end">
          {searching ? <Spinner /> : null}
          {value ? (
            <InputGroupButton
              disabled={disabled}
              aria-label="Clear search"
              onClick={() => {
                onChange("");
                input.current?.focus();
              }}
            >
              Clear
            </InputGroupButton>
          ) : null}
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
