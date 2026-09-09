import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SecurityCheckIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { Spinner } from "@/ui/components/primitives/spinner";
import type { VaultAvailability } from "../first-launch.type";

export function PopupView({
  availability,
  onOpenOptions,
  onRetry,
  initialOpenFailed = false,
}: {
  availability: VaultAvailability;
  onOpenOptions: () => Promise<void>;
  onRetry: () => void;
  initialOpenFailed?: boolean;
}) {
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(initialOpenFailed);
  async function open() {
    if (opening) return;
    setOpening(true);
    setFailed(false);
    try {
      await onOpenOptions();
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }
  const existing = availability === "existing";
  return (
    <main className="h-[var(--extension-popup-height)] max-h-[100svh] w-[var(--extension-popup-width)] max-w-full overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <HugeiconsIcon
            icon={SecurityCheckIcon}
            size={20}
            className="text-primary"
            aria-hidden="true"
          />{" "}
          LFSPM
        </span>
      </header>
      <div className="space-y-5 p-6">
        {availability === "loading" ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Spinner /> Checking this browser…
          </p>
        ) : availability === "error" ? (
          <>
            <h1 className="text-xl font-semibold">
              Couldn’t check your vaults
            </h1>
            <Button onClick={onRetry}>Try again</Button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">
              {existing ? "Local vault found" : "No local vault"}
            </h1>
            <Button
              size="lg"
              className="h-10 w-full justify-between px-4 text-sm"
              disabled={opening}
              onClick={() => void open()}
            >
              {opening
                ? "Opening Options…"
                : existing
                  ? "Open Options"
                  : "Set up vault"}
              {opening ? (
                <Spinner aria-hidden="true" />
              ) : (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={16}
                  aria-hidden="true"
                />
              )}
            </Button>
            {failed ? (
              <p role="alert" className="text-sm text-destructive">
                Couldn’t open Options. Try again, or open LFSPM’s extension
                settings from your browser.
              </p>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
