import { Specimen } from "./specimen.view";
import { useId, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  File01Icon,
  Folder01Icon,
  Copy01Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { ButtonGroup } from "@/ui/components/primitives/button-group";
import { Badge } from "@/ui/components/primitives/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/ui/components/primitives/empty";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/ui/components/primitives/card";
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/ui/components/primitives/item";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@/ui/components/primitives/field";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  useComboboxAnchor,
} from "@/ui/components/primitives/combobox";
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
} from "@/ui/components/primitives/attachment";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/ui/components/primitives/sheet";
import { Spinner } from "@/ui/components/primitives/spinner";

const vaults = ["Personal vault", "Work vault", "Shared household vault"];
const tagOptions = ["Personal", "Work", "Finance", "Travel", "Shopping"];

function VaultSelection() {
  const id = useId();
  const anchor = useComboboxAnchor();
  const [vault, setVault] = useState<string | null>(vaults[0]);
  const [tags, setTags] = useState(["Personal"]);
  return (
    <div className="review-fields grid gap-6">
      <Field>
        <FieldLabel htmlFor={`${id}-vault`}>Choose a vault</FieldLabel>
        <Combobox items={vaults} value={vault} onValueChange={setVault}>
          <ComboboxInput id={`${id}-vault`} placeholder="Search vaults…" />
          <ComboboxContent>
            <ComboboxEmpty>No matching vaults.</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          Try typing “work” or a name that does not exist.
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-tags`}>Organize with tags</FieldLabel>
        <Combobox
          multiple
          items={tagOptions}
          value={tags}
          onValueChange={setTags}
        >
          <ComboboxChips ref={anchor}>
            <ComboboxValue>
              {(values: string[]) => (
                <>
                  {values.map((value) => (
                    <ComboboxChip key={value} removeLabel={`Remove ${value}`}>
                      {value}
                    </ComboboxChip>
                  ))}
                  <ComboboxChipsInput
                    id={`${id}-tags`}
                    placeholder="Add a tag…"
                  />
                </>
              )}
            </ComboboxValue>
          </ComboboxChips>
          <ComboboxContent anchor={anchor}>
            <ComboboxEmpty>No matching tags.</ComboboxEmpty>
            <ComboboxList>
              {(item: string) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <FieldDescription>
          Select several tags, then remove one.
        </FieldDescription>
      </Field>
    </div>
  );
}

export function ReviewExamples() {
  const [emptyMode, setEmptyMode] = useState("vault");
  const [cardSize, setCardSize] = useState<"default" | "sm">("default");
  const [fileState, setFileState] = useState<"done" | "processing" | "error">(
    "done",
  );
  const [selectedVault, setSelectedVault] = useState("Personal vault");
  const [action, setAction] = useState("Try an action to see its feedback.");
  const [copyState, setCopyState] = useState("idle");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fileVisible, setFileVisible] = useState(true);
  const id = useId();

  return (
    <div className="review-grid grid gap-x-10 gap-y-10">
      <Specimen
        id="B21"
        name="Empty"
        controls={
          <ButtonGroup aria-label="Empty example state">
            <Button
              variant={emptyMode === "vault" ? "secondary" : "outline"}
              aria-pressed={emptyMode === "vault"}
              onClick={() => setEmptyMode("vault")}
            >
              New vault
            </Button>
            <Button
              variant={emptyMode === "search" ? "secondary" : "outline"}
              aria-pressed={emptyMode === "search"}
              onClick={() => setEmptyMode("search")}
            >
              No results
            </Button>
          </ButtonGroup>
        }
      >
        <div className="flex min-h-64 items-center rounded-xl border border-dashed bg-muted/20">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Folder01Icon} aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                {emptyMode === "vault"
                  ? "A place for your passwords"
                  : "No matching entries"}
              </EmptyTitle>
              <EmptyDescription>
                {emptyMode === "vault"
                  ? "Your vault is ready for its first entry. Start with an account you use every day."
                  : "Try a different search or clear the filters to see all your entries."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="lg"
                onClick={() => {
                  if (emptyMode === "search") setEmptyMode("vault");
                  setAction(
                    emptyMode === "vault"
                      ? "Add entry selected. This review does not create entries."
                      : "Search filters cleared in the example.",
                  );
                }}
              >
                {emptyMode === "vault" ? (
                  <HugeiconsIcon icon={Add01Icon} aria-hidden="true" />
                ) : null}
                {emptyMode === "vault"
                  ? "Add your first entry"
                  : "Clear filters"}
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </Specimen>
      <Specimen
        id="B23"
        name="Card"
        controls={
          <ButtonGroup aria-label="Card size">
            <Button
              variant={cardSize === "default" ? "secondary" : "outline"}
              aria-pressed={cardSize === "default"}
              onClick={() => setCardSize("default")}
            >
              Default
            </Button>
            <Button
              variant={cardSize === "sm" ? "secondary" : "outline"}
              aria-pressed={cardSize === "sm"}
              onClick={() => setCardSize("sm")}
            >
              Small
            </Button>
          </ButtonGroup>
        }
      >
        <Card size={cardSize}>
          <CardHeader>
            <CardTitle>Made for this device</CardTitle>
            <CardDescription>
              Give this browser a recognizable name. These preferences apply
              only here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                <HugeiconsIcon
                  icon={SecurityCheckIcon}
                  size={22}
                  aria-hidden="true"
                />
              </span>
              <div>
                <p className="font-medium">Personal browser</p>
                <p className="text-muted-foreground">Example device</p>
              </div>
              <Badge variant="outline" className="ml-auto">
                Local
              </Badge>
            </div>
            <p className="text-xs/relaxed text-muted-foreground">
              A familiar device name helps you recognize it when you review
              access later.
            </p>
          </CardContent>
          <CardFooter className="border-t">
            <Button variant="outline" onClick={() => setSheetOpen(true)}>
              Inspect example file
            </Button>
          </CardFooter>
        </Card>
      </Specimen>
      <Specimen id="B22" name="Item" className="review-wide">
        <ItemGroup className="rounded-xl border">
          {vaults.slice(0, 2).map((vault, index) => (
            <div key={vault}>
              {index > 0 ? <ItemSeparator /> : null}
              <Item>
                <ItemMedia variant="icon">
                  <HugeiconsIcon icon={Folder01Icon} aria-hidden="true" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{vault}</ItemTitle>
                  <ItemDescription>
                    {index === 0
                      ? "Everyday accounts and personal logins"
                      : "Accounts you use for work"}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant={selectedVault === vault ? "secondary" : "outline"}
                    aria-pressed={selectedVault === vault}
                    onClick={() => {
                      setSelectedVault(vault);
                      setAction(`${vault} selected in the list example.`);
                    }}
                  >
                    {selectedVault === vault ? "Selected" : "Select"}
                  </Button>
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      </Specimen>
      <Specimen id="B24" name="Combobox" className="review-wide">
        <VaultSelection />
      </Specimen>
      <Specimen id="B25" name="Button Group">
        <div className="space-y-5 rounded-xl bg-muted/30 p-5">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Personal vault
            </p>
            <code className="break-all text-sm">DEMO-ONLY-7f3a</code>
          </div>
          <ButtonGroup aria-label="Value actions">
            <Button
              variant="outline"
              onClick={() => {
                setCopyState("copied");
                setAction(
                  "Copy success state shown. Nothing was written to the clipboard.",
                );
              }}
            >
              <HugeiconsIcon icon={Copy01Icon} aria-hidden="true" />
              {copyState === "copied" ? "Copied state" : "Copy"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCopyState("error");
                setAction("Copy failure state shown. Try the action again.");
              }}
            >
              Show error
            </Button>
            <Button variant="outline" disabled>
              Save
            </Button>
          </ButtonGroup>
          {copyState === "error" ? (
            <p role="alert" className="text-sm text-destructive">
              The example could not be copied. Try again.
            </p>
          ) : (
            <p className="text-xs/relaxed text-muted-foreground"></p>
          )}
        </div>
      </Specimen>
      <Specimen
        id="B26"
        name="Attachment"
        controls={
          <label className="sr-only" htmlFor={`${id}-file-state`}>
            Attachment state
          </label>
        }
      >
        <div className="mb-5">
          <NativeSelect
            id={`${id}-file-state`}
            value={fileState}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "done" || next === "processing" || next === "error")
                setFileState(next);
            }}
          >
            <NativeSelectOption value="done">Ready</NativeSelectOption>
            <NativeSelectOption value="processing">
              Processing
            </NativeSelectOption>
            <NativeSelectOption value="error">Error</NativeSelectOption>
          </NativeSelect>
        </div>
        {fileVisible ? (
          <Attachment state={fileState} className="w-full">
            <AttachmentMedia>
              {fileState === "processing" ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={File01Icon} aria-hidden="true" />
              )}
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>device-request.demo.json</AttachmentTitle>
              <AttachmentDescription>
                {fileState === "error"
                  ? "Example file could not be checked"
                  : fileState === "processing"
                    ? "Checking example file…"
                    : "JSON · 2.4 KB"}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction size="sm" onClick={() => setSheetOpen(true)}>
                View
              </AttachmentAction>
              <AttachmentAction size="sm" onClick={() => setFileVisible(false)}>
                Remove
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ) : (
          <Button variant="outline" onClick={() => setFileVisible(true)}>
            Restore example file
          </Button>
        )}
      </Specimen>
      <Specimen id="B27" name="Sidebar">
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Use the menu button in the top bar to collapse it. At narrow browser
          widths, navigation opens in a sheet. Your selection and theme stay in
          this review.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">Expanded</Badge>
          <Badge variant="outline">Icon rail</Badge>
          <Badge variant="outline">Narrow layout</Badge>
        </div>
      </Specimen>
      <Specimen id="B28" name="Sheet">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger render={<Button variant="outline" size="lg" />}>
            Open detail sheet
          </SheetTrigger>
          <SheetContent className="flex flex-col">
            <SheetHeader>
              <SheetTitle>Device request</SheetTitle>
              <SheetDescription>
                Check the requesting device before approving access.
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
              <div className="flex items-center gap-3">
                <HugeiconsIcon icon={File01Icon} size={30} aria-hidden="true" />
                <div>
                  <p className="break-all text-sm font-medium">
                    device-request.demo.json
                  </p>
                  <p className="text-xs text-muted-foreground">JSON · 2.4 KB</p>
                </div>
              </div>
            </div>
            <SheetFooter>
              <SheetClose render={<Button variant="outline" />}>
                Back to review
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Specimen>
      <div className="review-wide flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p role="status" className="text-sm text-muted-foreground">
          {action}
        </p>
      </div>
    </div>
  );
}
