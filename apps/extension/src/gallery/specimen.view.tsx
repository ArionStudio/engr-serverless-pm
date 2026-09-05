import { componentApi } from "./component-api.generated";
import { VariantPreview } from "./variant-preview.view";
import { Usage } from "./usage.view";
import type { CatalogId } from "./usage";
import { useContext, useState, type ReactNode } from "react";
import { GallerySelection } from "./selection";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import { Badge } from "@/ui/components/primitives/badge";
export function Specimen({
  id,
  name,
  owner,
  children,
  wide = false,
  controls,
  className = "",
}: {
  id: CatalogId;
  name: string;
  owner?: string;
  children: ReactNode;
  wide?: boolean;
  controls?: ReactNode;
  className?: string;
}) {
  const [family, component] = useContext(GallerySelection).split(":");
  const selectedComponent = family === id ? component : undefined;
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`review-specimen scroll-mt-40 ${wide ? "review-wide" : ""} ${className}`}
    >
      <header className="review-specimen-header space-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <Badge className="review-specimen-id mt-0.5 shrink-0">{id}</Badge>
          <h2
            id={`${id}-title`}
            className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]"
          >
            {name}
          </h2>
        </div>
        {owner ? (
          <p className="break-all text-xs text-muted-foreground">{owner}</p>
        ) : null}
        <Usage id={id} />
        <details
          open={selectedComponent ? true : undefined}
          className="text-xs text-muted-foreground [overflow-wrap:anywhere]"
        >
          <summary className="cursor-pointer">
            Components in this family (
            {componentApi.filter((c) => c.family === id).length})
          </summary>
          <ul className="mt-2 space-y-1">
            {componentApi
              .filter((c) => c.family === id)
              .map((c) => (
                <li key={c.name}>
                  <code>{c.name}</code> · {c.source}
                  {!c.exported ? " · Internal part" : ""}
                  {c.name === "ThemeProvider"
                    ? " · Nonvisual runtime provider; reviewed through controlled ThemeToggle."
                    : ""}
                </li>
              ))}
          </ul>
        </details>
        {controls ? (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {controls}
          </div>
        ) : null}
      </header>
      <div className="review-specimen-demo min-w-0 space-y-5">
        {children}
        <VariantPreview
          key={selectedComponent ?? id}
          id={id}
          initialComponent={selectedComponent}
        />
      </div>
    </section>
  );
}
export function Scenario<T extends string>({
  label,
  options,
  children,
}: {
  label: string;
  options: readonly T[];
  children: (state: T) => ReactNode;
}) {
  const [state, setState] = useState<T>(options[0]);
  return (
    <div className="space-y-5">
      <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        State
        <NativeSelect
          aria-label={`${label} state`}
          value={state}
          onChange={(e) => {
            const next = options.find((o) => o === e.target.value);
            if (next) setState(next);
          }}
        >
          {options.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {option}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <div key={state}>{children(state)}</div>
    </div>
  );
}
