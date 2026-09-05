import { useState } from "react";
import { EntryTable } from "@/ui/features/entries";
import { demoTableEntries, demoTagLabels } from "./fixtures";
import { Scenario } from "./specimen.view";
export function EntryTableExample() {
  const [notice, setNotice] = useState("");
  return (
    <div className="space-y-4">
      <Scenario
        label="Entry table"
        options={["ready", "loading", "error", "empty"]}
      >
        {(state) => (
          <EntryTable
            entries={state === "empty" ? [] : demoTableEntries}
            tagLabels={demoTagLabels}
            state={state === "empty" ? "ready" : state}
            onOpen={() => setNotice("Open entry requested.")}
            onEdit={() => setNotice("Edit entry requested.")}
            onRemove={() => setNotice("Removal review requested.")}
            onReviewSelection={(ids) =>
              setNotice(`Review requested for ${ids.length} entries.`)
            }
            onRetry={() => setNotice("Reload requested.")}
            onCreate={() => setNotice("Add entry requested.")}
          />
        )}
      </Scenario>
      <p role="status" className="text-xs text-muted-foreground">
        {notice}
      </p>
    </div>
  );
}
