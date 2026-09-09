import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Button } from "@/ui/components/primitives/button";

type SetupStageProps = {
  title: string;
  confirmation?: string;
  canContinue?: boolean;
  children: ReactNode;
};

export function SetupStage({ children }: SetupStageProps) {
  return (
    <div className="space-y-6 text-base leading-7 [&_a]:no-underline [&_dd]:max-w-[70ch] [&_li]:max-w-[70ch] [&_p]:max-w-[70ch]">
      {children}
    </div>
  );
}

/** AWS completion is explicitly reported by the user, never inferred from opening a link. */
export function SetupChecklist({
  children,
  label,
  locationKey,
  locationStep,
  renderConnection,
  busy = false,
}: {
  children: ReactElement<SetupStageProps>[];
  label: string;
  locationKey: string;
  locationStep: number;
  renderConnection?: (onEditLocation: () => void) => ReactNode;
  busy?: boolean;
}) {
  const [progress, setProgress] = useState({
    active: 0,
    completed: 0,
    locationKey,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(0);
  const blocked = children.findIndex(
    (step) => step.props.canContinue === false,
  );
  const limit = Math.min(
    progress.locationKey !== locationKey ? locationStep : children.length - 1,
    blocked < 0 ? children.length - 1 : blocked,
  );
  const active = Math.min(progress.active, limit);
  const completed = Math.min(progress.completed, limit);
  useEffect(() => {
    if (
      previousStep.current !== active &&
      !heading.current?.closest("[hidden]")
    ) {
      heading.current?.focus();
    }
    previousStep.current = active;
  }, [active]);
  const stage = children[active];
  return (
    <div className="grid items-start gap-6 @4xl/s3:grid-cols-[13rem_minmax(0,1fr)] @4xl/s3:gap-10">
      <nav aria-label={label} className="s3-steps min-w-0">
        <ol
          className="grid gap-1 @4xl/s3:flex @4xl/s3:flex-col @4xl/s3:gap-2"
          style={{
            gridTemplateColumns: `repeat(${children.length}, minmax(0, 1fr))`,
          }}
        >
          {children.map((step, index) => (
            <li key={step.props.title} className="min-w-0">
              <Button
                variant={index === active ? "secondary" : "ghost"}
                className="h-auto min-h-11 w-full justify-center gap-3 @4xl/s3:justify-start whitespace-nowrap px-3 py-2 text-left text-sm @4xl/s3:whitespace-normal"
                disabled={busy || index > completed}
                title={step.props.title}
                aria-current={index === active ? "step" : undefined}
                onClick={() =>
                  setProgress({ active: index, completed, locationKey })
                }
              >
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs"
                >
                  {index < completed ? "✓" : index + 1}
                </span>
                <span className="sr-only @4xl/s3:not-sr-only">
                  {step.props.title}
                </span>
                {index < completed ? (
                  <span className="sr-only">, confirmed</span>
                ) : null}
              </Button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="min-w-0 space-y-6 border-t pt-6 @4xl/s3:border-t-0 @4xl/s3:pt-0">
        <h3
          ref={heading}
          tabIndex={-1}
          data-focus-target
          className="text-xl font-semibold"
        >
          {active + 1}. {stage.props.title}
        </h3>
        {stage}
        {!stage.props.confirmation && renderConnection
          ? renderConnection(() =>
              setProgress({
                active: locationStep,
                completed,
                locationKey,
              }),
            )
          : null}
        {stage.props.confirmation ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
            <Button
              variant="outline"
              disabled={busy || active === 0}
              onClick={() =>
                setProgress({
                  active: active - 1,
                  completed,
                  locationKey,
                })
              }
            >
              Previous step
            </Button>
            {stage.props.confirmation ? (
              <Button
                disabled={busy || stage.props.canContinue === false}
                onClick={() =>
                  setProgress({
                    active: active + 1,
                    completed: Math.max(completed, active + 1),
                    locationKey,
                  })
                }
              >
                {stage.props.confirmation}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
