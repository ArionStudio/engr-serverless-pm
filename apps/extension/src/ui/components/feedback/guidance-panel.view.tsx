import { useId, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";

const guidanceVariants = cva(
  "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-lg border p-5 text-left",
  {
    variants: {
      variant: {
        info: "border-info-border bg-info text-info-foreground",
        warning: "border-warning-border bg-warning text-warning-foreground",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

/** Persistent guidance is a note. Use ActionFeedback for live operation errors. */
export function GuidancePanel({
  title,
  children,
  variant = "info",
  className,
  links,
  attachments,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  links?: ReactNode;
  attachments?: ReactNode;
} & VariantProps<typeof guidanceVariants>) {
  const titleId = useId();
  return (
    <aside
      role="note"
      aria-labelledby={titleId}
      className={cn(guidanceVariants({ variant }), className)}
    >
      <HugeiconsIcon
        icon={variant === "warning" ? Alert02Icon : InformationCircleIcon}
        strokeWidth={2}
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0"
      />
      <div className="contents">
        <p id={titleId} className="text-base font-semibold leading-6">
          <span className="sr-only">
            {variant === "warning" ? "Warning: " : "Information: "}
          </span>
          {title}
        </p>
        <div className="col-span-2 max-w-[70ch] space-y-3 text-base leading-7 wrap-anywhere [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5 [&_a]:font-medium [&_a]:text-inherit [&_a]:decoration-current [&_a]:underline [&_a]:underline-offset-4">
          {children}
        </div>
        {attachments ? (
          <div className="col-span-2 min-w-0 space-y-4 pt-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_figcaption]:mt-2 [&_figcaption]:text-sm [&_figcaption]:leading-6">
            {attachments}
          </div>
        ) : null}
        {links ? (
          <div className="col-span-2 flex flex-wrap gap-x-5 gap-y-3 pt-2 text-sm font-medium [&_a]:text-inherit [&_a]:underline [&_a]:underline-offset-4">
            {links}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
