import { cn } from "@/ui/lib/cn.util";
import { useId, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon, Alert02Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/ui/components/primitives/accordion";
import {
  Alert,
  AlertTitle,
  AlertDescription,
} from "@/ui/components/primitives/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/ui/components/primitives/empty";

export function StepNavigation({
  steps,
  currentId,
  onNavigate,
}: {
  steps: readonly {
    id: string;
    label: string;
    state: "complete" | "upcoming" | "error";
    allowed: boolean;
  }[];
  currentId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav aria-label="Setup steps">
      <ol className="flex flex-wrap gap-2">
        {steps.map((step, index) => (
          <li key={step.id}>
            <Button
              type="button"
              variant={step.id === currentId ? "secondary" : "ghost"}
              disabled={!step.allowed}
              aria-current={step.id === currentId ? "step" : undefined}
              onClick={() => onNavigate(step.id)}
            >
              {step.state === "error" ? (
                <HugeiconsIcon
                  icon={Alert02Icon}
                  size={16}
                  aria-hidden="true"
                  className="text-destructive"
                />
              ) : step.state === "complete" ? (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  size={16}
                  aria-hidden="true"
                  className="text-primary"
                />
              ) : null}
              {index + 1}. {step.label}
              <span className="sr-only">
                {step.state === "error"
                  ? "Needs attention"
                  : step.id === currentId
                    ? "Current step"
                    : step.state === "complete"
                      ? "Complete"
                      : "Upcoming"}
              </span>
            </Button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function SetupLayout({
  title,
  steps,
  help,
  actions,
  children,
}: {
  title: string;
  steps?: ReactNode;
  help?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="@container space-y-6">
      {steps}
      <header>
        <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
      </header>
      <div className={cn("grid gap-8", help && "@lg:grid-cols-2")}>
        <div className="min-w-0 space-y-5">
          {children}
          {actions}
        </div>
        {help ? <aside className="min-w-0">{help}</aside> : null}
      </div>
    </section>
  );
}
export function SettingsSection({
  title,
  description,
  children,
  action,
  destructive = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
  destructive?: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-5 border-t py-5">
      <header>
        <h3
          id={id}
          className={`font-semibold ${destructive ? "text-destructive" : ""}`}
        >
          {title}
        </h3>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      </header>
      {children}
      {action}
    </section>
  );
}
export function SafetyHelp({
  title,
  essential,
  details = [],
}: {
  title: string;
  essential: string;
  details?: readonly { title: string; text: string }[];
}) {
  return (
    <div className="space-y-3">
      <Alert role="note">
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="text-sm leading-relaxed">
          {essential}
        </AlertDescription>
      </Alert>
      {details.length ? (
        <Accordion>
          {details.map((detail, index) => (
            <AccordionItem key={detail.title} value={index}>
              <AccordionTrigger>{detail.title}</AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed">
                {detail.text}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : null}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
  onAction,
  secondary,
  onSecondary,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  secondary?: string;
  onSecondary?: () => void;
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {action && onAction ? (
          <Button onClick={onAction}>{action}</Button>
        ) : null}
        {secondary && onSecondary ? (
          <Button variant="ghost" onClick={onSecondary}>
            {secondary}
          </Button>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
export function DetailField({
  label,
  value,
  url,
}: {
  label: string;
  value?: string;
  url?: string;
}) {
  let safe = false;
  try {
    if (url) {
      const parsed = new URL(url);
      safe =
        ["https:", "http:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password;
    }
  } catch {
    safe = false;
  }
  return (
    <dl className="space-y-1 border-b py-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="break-all text-sm">
        {safe ? (
          <a
            className="underline underline-offset-4"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {value || url}
          </a>
        ) : (
          value || "Not provided"
        )}
      </dd>
    </dl>
  );
}
