import type { TagColor, TagGroupId, TagShade } from "@lfspm/core";
import { HugeiconsIcon } from "@hugeicons/react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { useId } from "react";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/ui/components/primitives/radio-group";
import {
  getTagGroupIcon,
  getTagGroupPresentation,
  tagColors,
  tagGroupPresentations,
  tagShades,
  type TagGroupPresentation,
} from "./tag-presentation";

export function TagMarker({
  color,
  shade,
  className,
}: {
  color: TagColor;
  shade: TagShade;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tag-marker size-3 shrink-0 rounded-full border",
        className,
      )}
      data-tag-color={color}
      data-tag-shade={shade}
      aria-hidden="true"
    />
  );
}

const tagPillVariants = cva(
  "inline-flex min-w-0 items-center rounded-md border border-border bg-muted/45 text-foreground",
  {
    variants: {
      size: {
        sm: "gap-1.5 px-2 py-0.5 text-xs",
        default: "gap-2 px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export function TagPill({
  name,
  color,
  shade,
  group,
  size,
  className,
}: {
  name: string;
  color: TagColor;
  shade: TagShade;
  group: TagGroupPresentation;
  className?: string;
} & VariantProps<typeof tagPillVariants>) {
  return (
    <span className={cn(tagPillVariants({ size }), className)}>
      <HugeiconsIcon
        icon={getTagGroupIcon(group)}
        size={size === "sm" ? 13 : 15}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground"
      />
      <TagMarker color={color} shade={shade} className="size-2.5" />
      <span className="min-w-0 truncate">{name}</span>
      <span className="sr-only">, {group.name} tag</span>
    </span>
  );
}

export function TagGroupHeading({
  id,
  group,
  count,
}: {
  id: string;
  group: TagGroupPresentation;
  count: number;
}) {
  return (
    <div className="mb-3 flex min-w-0 items-center gap-2 border-b pb-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <HugeiconsIcon
          icon={getTagGroupIcon(group)}
          size={17}
          aria-hidden="true"
        />
      </span>
      <TagMarker color={group.baseColor} shade={500} />
      <h2 id={id} className="min-w-0 flex-1 text-sm font-semibold">
        {group.name}
      </h2>
      <span className="text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

function colorLabel(color: TagColor) {
  return color[0].toUpperCase() + color.slice(1);
}

export function TagVisualPicker({
  groupId,
  color,
  shade,
  groups = tagGroupPresentations,
  disabled = false,
  onChange,
}: {
  groupId: TagGroupId;
  color: TagColor;
  shade: TagShade;
  groups?: readonly TagGroupPresentation[];
  disabled?: boolean;
  onChange: (value: {
    groupId: TagGroupId;
    color: TagColor;
    shade: TagShade;
  }) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-6">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-medium">Group</legend>
        <RadioGroup
          value={groupId}
          disabled={disabled}
          className="grid gap-2 sm:grid-cols-2"
          onValueChange={(nextGroupId) => {
            const group = getTagGroupPresentation(
              nextGroupId as TagGroupId,
              groups,
            );
            onChange({ groupId: group.id, color: group.baseColor, shade });
          }}
        >
          {groups.map((group) => {
            const labelId = `${id}-group-${group.id}`;
            return (
              <label
                key={group.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border bg-background p-3 has-data-checked:border-primary has-data-checked:bg-accent",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                )}
              >
                <RadioGroupItem
                  value={group.id}
                  disabled={disabled}
                  aria-labelledby={labelId}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span
                    id={labelId}
                    className="flex items-center gap-2 text-sm font-medium"
                  >
                    <HugeiconsIcon
                      icon={getTagGroupIcon(group)}
                      size={16}
                      aria-hidden="true"
                    />
                    {group.name}
                    <TagMarker color={group.baseColor} shade={500} />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {group.description}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>

      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-medium">Color</legend>
        <RadioGroup
          value={color}
          disabled={disabled}
          className="flex flex-wrap gap-2"
          onValueChange={(nextColor) =>
            onChange({ groupId, color: nextColor as TagColor, shade })
          }
        >
          {tagColors.map((tagColor) => {
            const labelId = `${id}-color-${tagColor}`;
            return (
              <label
                key={tagColor}
                className={cn(
                  "flex min-w-32 flex-1 items-center gap-2 rounded-md border bg-background px-3 py-2 has-data-checked:border-primary has-data-checked:bg-accent",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                )}
              >
                <RadioGroupItem
                  value={tagColor}
                  disabled={disabled}
                  aria-labelledby={labelId}
                />
                <TagMarker color={tagColor} shade={shade} />
                <span id={labelId} className="text-sm">
                  {colorLabel(tagColor)}
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>

      <fieldset disabled={disabled} className="space-y-3">
        <legend className="text-sm font-medium">Shade</legend>
        <RadioGroup
          value={String(shade)}
          disabled={disabled}
          className="flex flex-wrap gap-2"
          onValueChange={(nextShade) =>
            onChange({
              groupId,
              color,
              shade: Number(nextShade) as TagShade,
            })
          }
        >
          {tagShades.map((tagShade) => {
            const labelId = `${id}-shade-${tagShade.value}`;
            return (
              <label
                key={tagShade.value}
                className={cn(
                  "flex min-w-32 flex-1 items-center gap-2 rounded-md border bg-background px-3 py-2 has-data-checked:border-primary has-data-checked:bg-accent",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                )}
              >
                <RadioGroupItem
                  value={String(tagShade.value)}
                  disabled={disabled}
                  aria-labelledby={labelId}
                />
                <TagMarker color={color} shade={tagShade.value} />
                <span id={labelId} className="text-sm">
                  {tagShade.label}
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </fieldset>
    </div>
  );
}
