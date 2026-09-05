import { Button } from "@/ui/components/primitives/button";
export type NavigationItem = {
  id: string;
  label: string;
  available: boolean;
  unavailableReason?: string;
};
export function AppNavigation({
  items,
  current,
  onNavigate,
}: {
  items: readonly NavigationItem[];
  current: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav aria-label="Vault navigation" className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.id}>
          <Button
            variant={item.id === current ? "secondary" : "ghost"}
            aria-current={item.id === current ? "page" : undefined}
            disabled={!item.available}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </Button>
          {!item.available && item.unavailableReason ? (
            <p className="max-w-48 text-xs text-muted-foreground">
              {item.unavailableReason}
            </p>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
export function VaultToolbar({
  name,
  onLock,
  onOpenOptions,
  locked = false,
}: {
  name: string;
  onLock: () => void;
  onOpenOptions: () => void;
  locked?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <p className="min-w-0 break-all font-medium">{name}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onOpenOptions}>
          Open options
        </Button>
        <Button disabled={locked} onClick={onLock}>
          {locked ? "Locked" : "Lock vault"}
        </Button>
      </div>
    </div>
  );
}
