import { EntryTableExample } from "./entry-table-example.view";
import { demoEntries } from "./fixtures";
import { useId, useState } from "react";
import { Button } from "@/ui/components/primitives/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/ui/components/primitives/pagination";
import { Switch } from "@/ui/components/primitives/switch";
import { FieldLabel } from "@/ui/components/primitives/field";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
} from "@/ui/components/primitives/popover";
import { Toaster, createToastManager } from "@/ui/components/primitives/toast";
import { Progress } from "@/ui/components/primitives/progress";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/ui/components/primitives/toggle-group";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/ui/components/primitives/resizable";
import { Kbd, KbdGroup } from "@/ui/components/primitives/kbd";
import { Avatar, AvatarFallback } from "@/ui/components/primitives/avatar";
import { Specimen, Scenario } from "./specimen.view";
function ToastExample() {
  const [manager] = useState(() => createToastManager());
  return (
    <Toaster toastManager={manager}>
      <div className="flex flex-wrap gap-2">
        {["success", "error", "loading"].map((type) => (
          <Button
            key={type}
            variant="outline"
            onClick={() =>
              manager.add({
                title:
                  type === "success"
                    ? "Example preference saved"
                    : type === "error"
                      ? "Example action failed"
                      : "Example action in progress",
                description: "Check your device settings.",
                type,
                timeout: type === "loading" ? 0 : 5000,
              })
            }
          >
            {type}
          </Button>
        ))}
      </div>
    </Toaster>
  );
}
export function ExpandedExamples() {
  const id = useId();
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState(false);
  const [view, setView] = useState(["list"]);
  const [selectedEntry, setSelectedEntry] = useState(demoEntries[0]);
  return (
    <div className="review-grid grid gap-x-8 gap-y-10">
      <Specimen
        id="B29"
        name="Table"
        owner="Shared table controls + entries-feature widget"
        wide
      >
        <EntryTableExample />
      </Specimen>
      <Specimen
        id="B30"
        name="Pagination"
        owner="Shared control · primitives/pagination"
      >
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
            </PaginationItem>
            {[1, 2, 3].map((n) => (
              <PaginationItem key={n}>
                <Button
                  variant={page === n ? "secondary" : "ghost"}
                  aria-label={`Page ${n}`}
                  aria-current={page === n ? "page" : undefined}
                  onClick={() => setPage(n)}
                >
                  {n}
                </Button>
              </PaginationItem>
            ))}
            <PaginationItem>
              <Button
                variant="outline"
                disabled={page === 3}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        <p role="status" className="mt-3 text-sm">
          Page {page} of 3
        </p>
      </Specimen>
      <Specimen
        id="B31"
        name="Switch"
        owner="Shared control · primitives/switch"
      >
        <Scenario label="Switch" options={["enabled", "disabled"]}>
          {(state) => (
            <FieldLabel id={id}>
              <Switch
                aria-labelledby={id}
                checked={checked}
                onCheckedChange={setChecked}
                disabled={state === "disabled"}
              />
              Show example metadata
            </FieldLabel>
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="B32"
        name="Popover"
        owner="Shared control · primitives/popover"
      >
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>
            Display preferences
          </PopoverTrigger>
          <PopoverContent className="max-w-[calc(100vw-2rem)]">
            <PopoverTitle>Local display preference</PopoverTitle>
            <PopoverDescription>
              This example changes only its switch.
            </PopoverDescription>
            <FieldLabel id={`${id}-popover`} className="mt-3">
              <Switch
                aria-labelledby={`${id}-popover`}
                checked={checked}
                onCheckedChange={setChecked}
              />
              Show metadata
            </FieldLabel>
          </PopoverContent>
        </Popover>
      </Specimen>
      <Specimen id="B33" name="Toast" owner="Shared control · primitives/toast">
        <ToastExample />
      </Specimen>
      <Specimen
        id="B34"
        name="Progress"
        owner="Shared control · primitives/progress"
      >
        <Scenario
          label="Progress"
          options={["determinate", "indeterminate", "complete"]}
        >
          {(state) => (
            <div className="space-y-3">
              <Progress
                aria-label="Example operation progress"
                value={
                  state === "indeterminate"
                    ? null
                    : state === "complete"
                      ? 100
                      : 45
                }
              />
              <p role="status" className="text-sm">
                {state === "indeterminate"
                  ? "Working, total unknown"
                  : state === "complete"
                    ? "Complete"
                    : "45% complete"}
              </p>
            </div>
          )}
        </Scenario>
      </Specimen>
      <Specimen
        id="B35"
        name="Toggle Group"
        owner="Shared control · primitives/toggle-group + toggle"
      >
        <ToggleGroup
          value={view}
          onValueChange={setView}
          aria-label="Entry presentation"
        >
          <ToggleGroupItem value="list">List</ToggleGroupItem>
          <ToggleGroupItem value="table">Table</ToggleGroupItem>
        </ToggleGroup>
        <p className="mt-3 text-sm">Selected: {view[0] ?? "none"}</p>
      </Specimen>
      <Specimen
        id="B36"
        name="Resizable"
        owner="Shared control · primitives/resizable"
      >
        <div className="h-64 min-w-0">
          <ResizablePanelGroup
            orientation="horizontal"
            className="rounded-lg border"
          >
            <ResizablePanel minSize="25%" defaultSize="50%">
              <div className="h-full space-y-3 overflow-auto p-3 text-sm">
                <p className="font-semibold">Entries</p>
                {demoEntries.slice(0, 2).map((entry, i) => (
                  <Button
                    key={entry.id}
                    className="w-full justify-start"
                    variant={
                      entry.id === selectedEntry.id ? "secondary" : "ghost"
                    }
                    aria-pressed={entry.id === selectedEntry.id}
                    onClick={() => setSelectedEntry(entry)}
                  >
                    {i === 0 ? "Mail" : "Travel"}
                  </Button>
                ))}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle aria-label="Resize example panels" />
            <ResizablePanel minSize="25%">
              <div className="h-full space-y-3 overflow-auto p-3 text-sm">
                <p className="font-semibold">Entry details</p>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Login</dt>
                    <dd className="break-all">{selectedEntry.login}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Website</dt>
                    <dd className="break-all">{selectedEntry.sanitizedUrl}</dd>
                  </div>
                </dl>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Focus the separator and use arrow keys.
        </p>
      </Specimen>
      <Specimen id="B37" name="Kbd" owner="Shared control · primitives/kbd">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          Close a dialog{" "}
          <KbdGroup>
            <Kbd>Esc</Kbd>
          </KbdGroup>
        </p>
      </Specimen>
      <Specimen
        id="B38"
        name="Avatar"
        owner="Shared control · primitives/avatar"
      >
        <div className="flex items-center gap-3">
          <Avatar aria-label="Personal vault">
            <AvatarFallback>PV</AvatarFallback>
          </Avatar>
          <Avatar aria-label="Work vault">
            <AvatarFallback>WV</AvatarFallback>
          </Avatar>
          <p className="text-sm text-muted-foreground">
            Local initials. No remote image requests.
          </p>
        </div>
      </Specimen>
    </div>
  );
}
