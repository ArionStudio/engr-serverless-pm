import { useId } from "react";
import { Button } from "@/ui/components/primitives/button";
import { Switch } from "@/ui/components/primitives/switch";
import { useSiteIcons } from "./site-icons.context";

export function SiteIconSettings() {
  const icons = useSiteIcons();
  const id = useId();
  return (
    <section className="space-y-3" aria-label="Website icons">
      <label className="flex items-center justify-between gap-4">
        <span id={id} className="font-medium">
          Website icons
        </span>
        <Switch
          aria-labelledby={id}
          aria-describedby={`${id}-help`}
          checked={icons.enabled}
          disabled={!icons.supported || icons.pending}
          onCheckedChange={icons.setEnabled}
        />
      </label>
      <p id={`${id}-help`} className="text-sm leading-6 text-muted-foreground">
        {icons.supported
          ? "Use icons already available in this browser. Initials remain available when an icon cannot be loaded. This setting applies only to this browser."
          : "This browser uses initials. Browser icon lookup is available in the Chromium build."}
      </p>
      {icons.error ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {icons.error}
          </p>
          {icons.retryRead || icons.retryCleanup ? (
            <Button
              variant="outline"
              size="sm"
              onClick={icons.retryRead ?? icons.retryCleanup}
              disabled={icons.pending}
            >
              {icons.retryRead ? "Retry settings" : "Retry cleanup"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
