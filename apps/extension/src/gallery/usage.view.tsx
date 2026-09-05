import { usage, type CatalogId } from "./usage";
export function Usage({ id }: { id: CatalogId }) {
  return (
    <p
      data-gallery-usage={id}
      className="max-w-prose text-sm leading-relaxed text-muted-foreground"
    >
      {usage[id]}
    </p>
  );
}
