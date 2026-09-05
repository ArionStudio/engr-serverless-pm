import * as Dialog from "@/ui/components/primitives/dialog";
import * as Table from "@/ui/components/primitives/table";
import { useId, useState, type CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";
import type { PreviewProps } from "./variant-preview.view";
import * as B from "@/ui/components/primitives/button";
import * as F from "@/ui/components/primitives/field";
import * as IG from "@/ui/components/primitives/input-group";
import * as N from "@/ui/components/primitives/native-select";
import * as L from "@/ui/components/primitives/slider";
import * as A from "@/ui/components/primitives/alert";
import * as Badge from "@/ui/components/primitives/badge";
import * as Acc from "@/ui/components/primitives/accordion";
import * as Tip from "@/ui/components/primitives/tooltip";
import * as Menu from "@/ui/components/primitives/dropdown-menu";
import * as AD from "@/ui/components/primitives/alert-dialog";
import * as Sep from "@/ui/components/primitives/separator";
import * as Tabs from "@/ui/components/primitives/tabs";
import * as Empty from "@/ui/components/primitives/empty";
import * as Item from "@/ui/components/primitives/item";
import * as Card from "@/ui/components/primitives/card";
import * as Combo from "@/ui/components/primitives/combobox";
import * as BG from "@/ui/components/primitives/button-group";
import * as Attach from "@/ui/components/primitives/attachment";
import * as Side from "@/ui/components/primitives/sidebar";
import * as Sheet from "@/ui/components/primitives/sheet";
import * as Page from "@/ui/components/primitives/pagination";
import * as Switch from "@/ui/components/primitives/switch";
import * as Pop from "@/ui/components/primitives/popover";
import * as Toggle from "@/ui/components/primitives/toggle";
import * as TG from "@/ui/components/primitives/toggle-group";
import * as Resize from "@/ui/components/primitives/resizable";
import * as Avatar from "@/ui/components/primitives/avatar";
import { Input } from "@/ui/components/primitives/input";
import { EntryForm, type EntryDraft } from "@/ui/features/entries";
import { demoTags } from "./fixtures";

const localImage = new URL("./sample-icon.svg", import.meta.url).href;
function Mark() {
  return <HugeiconsIcon icon={StarIcon} size={16} aria-hidden="true" />;
}
export function VariantDemo({
  id,
  propsFor: p,
}: {
  id: string;
  propsFor: PreviewProps;
}) {
  const label = useId();
  const [draft, setDraft] = useState<EntryDraft>({
    login: "demo@example.test",
    url: "https://example.test",
    password: "",
    tagIds: [],
    allowWeakPassword: false,
  });
  const iconButton = (name: string, iconSize?: string) =>
    iconSize?.startsWith("icon") ? <Mark /> : name;
  switch (id) {
    case "B01":
      return (
        <B.Button {...p(B.Button, "Button")} aria-label="Example action">
          {iconButton(
            "Example action",
            p(B.Button, "Button").size ?? undefined,
          )}
        </B.Button>
      );
    case "B02":
      return (
        <F.FieldSet>
          <F.FieldLegend {...p(F.FieldLegend, "FieldLegend")}>
            Example settings
          </F.FieldLegend>
          <F.FieldGroup>
            <F.Field {...p(F.Field, "Field")}>
              <F.FieldLabel htmlFor={label}>Device name</F.FieldLabel>
              <F.FieldContent>
                <Input id={label} defaultValue="Demo browser" />
                <F.FieldDescription>A local label.</F.FieldDescription>
              </F.FieldContent>
            </F.Field>
            <F.FieldSeparator>Additional fields</F.FieldSeparator>
            <F.FieldTitle>Field title</F.FieldTitle>
          </F.FieldGroup>
        </F.FieldSet>
      );
    case "B04":
      return (
        <>
          <IG.InputGroup>
            <IG.InputGroupInput
              aria-label="Example address"
              defaultValue="example.test"
            />
            <IG.InputGroupAddon {...p(IG.InputGroupAddon, "InputGroupAddon")}>
              <IG.InputGroupText>Website</IG.InputGroupText>
              <IG.InputGroupButton
                {...p(IG.InputGroupButton, "InputGroupButton")}
                aria-label="Example input action"
              >
                {iconButton(
                  "Action",
                  p(IG.InputGroupButton, "InputGroupButton").size ?? undefined,
                )}
              </IG.InputGroupButton>
            </IG.InputGroupAddon>
          </IG.InputGroup>
          <IG.InputGroup>
            <IG.InputGroupTextarea
              aria-label="Example multiline transfer"
              defaultValue="Device enrollment request"
            />
          </IG.InputGroup>
        </>
      );
    case "B06":
      return (
        <N.NativeSelect
          {...p(N.NativeSelect, "NativeSelect")}
          aria-label="Example lock setting"
        >
          <N.NativeSelectOptGroup label="Minutes">
            <N.NativeSelectOption>10</N.NativeSelectOption>
            <N.NativeSelectOption>30</N.NativeSelectOption>
          </N.NativeSelectOptGroup>
        </N.NativeSelect>
      );
    case "B09":
      return (
        <div className="h-40 py-4">
          <L.Slider
            {...p(L.Slider, "Slider")}
            aria-label="Variant length"
            defaultValue={[40]}
          />
        </div>
      );
    case "B10":
      return (
        <A.Alert {...p(A.Alert, "Alert")}>
          <A.AlertTitle>Example notice</A.AlertTitle>
          <A.AlertDescription>
            Your example values are available.
          </A.AlertDescription>
          <A.AlertAction>
            <B.Button variant="ghost">Review</B.Button>
          </A.AlertAction>
        </A.Alert>
      );
    case "B11":
      return (
        <Badge.Badge {...p(Badge.Badge, "Badge")}>Example label</Badge.Badge>
      );
    case "B14":
      return (
        <Acc.Accordion {...p(Acc.Accordion, "Accordion")}>
          <Acc.AccordionItem value="one">
            <Acc.AccordionTrigger>Example guidance</Acc.AccordionTrigger>
            <Acc.AccordionContent>
              Choose a duration in device settings.
            </Acc.AccordionContent>
          </Acc.AccordionItem>
          <Acc.AccordionItem value="two">
            <Acc.AccordionTrigger>More guidance</Acc.AccordionTrigger>
            <Acc.AccordionContent>
              Use the keyboard to move between headers.
            </Acc.AccordionContent>
          </Acc.AccordionItem>
        </Acc.Accordion>
      );
    case "B15":
      return (
        <Tip.TooltipProvider>
          <Tip.Tooltip>
            <Tip.TooltipTrigger render={<B.Button variant="outline" />}>
              Help
            </Tip.TooltipTrigger>
            <Tip.TooltipContent {...p(Tip.TooltipContent, "TooltipContent")}>
              Supplementary guidance.
            </Tip.TooltipContent>
          </Tip.Tooltip>
        </Tip.TooltipProvider>
      );
    case "B16":
      return (
        <Menu.DropdownMenu {...p(Menu.DropdownMenu, "DropdownMenu")}>
          <Menu.DropdownMenuTrigger render={<B.Button variant="outline" />}>
            Actions
          </Menu.DropdownMenuTrigger>
          <Menu.DropdownMenuContent
            {...p(Menu.DropdownMenuContent, "DropdownMenuContent")}
          >
            <Menu.DropdownMenuGroup>
              <Menu.DropdownMenuLabel>Example actions</Menu.DropdownMenuLabel>
              <Menu.DropdownMenuItem
                {...p(Menu.DropdownMenuItem, "DropdownMenuItem")}
              >
                Review entry
                <Menu.DropdownMenuShortcut>R</Menu.DropdownMenuShortcut>
              </Menu.DropdownMenuItem>
              <Menu.DropdownMenuCheckboxItem defaultChecked>
                Show details
              </Menu.DropdownMenuCheckboxItem>
              <Menu.DropdownMenuSeparator
                {...p(Menu.DropdownMenuSeparator, "DropdownMenuSeparator")}
              />
              <Menu.DropdownMenuRadioGroup defaultValue="local">
                <Menu.DropdownMenuRadioItem value="local">
                  Local
                </Menu.DropdownMenuRadioItem>
                <Menu.DropdownMenuRadioItem value="remote">
                  Remote
                </Menu.DropdownMenuRadioItem>
              </Menu.DropdownMenuRadioGroup>
              <Menu.DropdownMenuSub
                {...p(Menu.DropdownMenuSub, "DropdownMenuSub")}
              >
                <Menu.DropdownMenuSubTrigger>
                  More actions
                </Menu.DropdownMenuSubTrigger>
                <Menu.DropdownMenuSubContent
                  {...p(Menu.DropdownMenuSubContent, "DropdownMenuSubContent")}
                >
                  <Menu.DropdownMenuItem>Inspect example</Menu.DropdownMenuItem>
                </Menu.DropdownMenuSubContent>
              </Menu.DropdownMenuSub>
            </Menu.DropdownMenuGroup>
          </Menu.DropdownMenuContent>
        </Menu.DropdownMenu>
      );
    case "B17":
      return (
        <AD.AlertDialog>
          <AD.AlertDialogTrigger render={<B.Button variant="outline" />}>
            Confirmation
          </AD.AlertDialogTrigger>
          <AD.AlertDialogContent
            {...p(AD.AlertDialogContent, "AlertDialogContent")}
          >
            <AD.AlertDialogHeader>
              <AD.AlertDialogMedia>
                <Mark />
              </AD.AlertDialogMedia>
              <AD.AlertDialogTitle>Reset the example?</AD.AlertDialogTitle>
              <AD.AlertDialogDescription>
                This clears the current selection.
              </AD.AlertDialogDescription>
            </AD.AlertDialogHeader>
            <AD.AlertDialogFooter>
              <AD.AlertDialogCancel
                {...p(AD.AlertDialogCancel, "AlertDialogCancel")}
                aria-label="Keep example"
              >
                {iconButton(
                  "Keep example",
                  p(AD.AlertDialogCancel, "AlertDialogCancel").size ??
                    undefined,
                )}
              </AD.AlertDialogCancel>
              <AD.AlertDialogAction
                {...p(AD.AlertDialogAction, "AlertDialogAction")}
                aria-label="Reset example"
              >
                {iconButton(
                  "Reset example",
                  p(AD.AlertDialogAction, "AlertDialogAction").size ??
                    undefined,
                )}
              </AD.AlertDialogAction>
            </AD.AlertDialogFooter>
          </AD.AlertDialogContent>
        </AD.AlertDialog>
      );
    case "B18":
      return (
        <div
          className={`flex h-20 gap-3 ${p(Sep.Separator, "Separator").orientation === "vertical" ? "items-center" : "flex-col"}`}
        >
          <span>Before</span>
          <Sep.Separator {...p(Sep.Separator, "Separator")} />
          <span>After</span>
        </div>
      );
    case "B19":
      return (
        <Dialog.Dialog>
          <Dialog.DialogTrigger render={<B.Button variant="outline" />}>
            Open example details
          </Dialog.DialogTrigger>
          <Dialog.DialogContent>
            <Dialog.DialogHeader>
              <Dialog.DialogTitle>Example details</Dialog.DialogTitle>
              <Dialog.DialogDescription>
                Footer actions share the same dialog.
              </Dialog.DialogDescription>
            </Dialog.DialogHeader>
            <Dialog.DialogFooter>
              <Dialog.DialogClose render={<B.Button variant="outline" />}>
                Close example
              </Dialog.DialogClose>
            </Dialog.DialogFooter>
          </Dialog.DialogContent>
        </Dialog.Dialog>
      );
    case "B20":
      return (
        <Tabs.Tabs {...p(Tabs.Tabs, "Tabs")} defaultValue="one">
          <Tabs.TabsList
            {...p(Tabs.TabsList, "TabsList")}
            aria-label="Variant tabs"
          >
            <Tabs.TabsTrigger value="one">First</Tabs.TabsTrigger>
            <Tabs.TabsTrigger value="two">Second</Tabs.TabsTrigger>
          </Tabs.TabsList>
          <Tabs.TabsContent value="one">First panel</Tabs.TabsContent>
          <Tabs.TabsContent value="two">Second panel</Tabs.TabsContent>
        </Tabs.Tabs>
      );
    case "B21":
      return (
        <Empty.Empty>
          <Empty.EmptyHeader>
            <Empty.EmptyMedia {...p(Empty.EmptyMedia, "EmptyMedia")}>
              <Mark />
            </Empty.EmptyMedia>
            <Empty.EmptyTitle>No entries yet</Empty.EmptyTitle>
            <Empty.EmptyDescription>
              Add an example to begin.
            </Empty.EmptyDescription>
          </Empty.EmptyHeader>
        </Empty.Empty>
      );
    case "B22":
      return (
        <Item.ItemGroup>
          <Item.Item {...p(Item.Item, "Item")}>
            <Item.ItemHeader>Example header</Item.ItemHeader>
            <Item.ItemMedia {...p(Item.ItemMedia, "ItemMedia")}>
              {p(Item.ItemMedia, "ItemMedia").variant === "image" ? (
                <img src={localImage} alt="" />
              ) : (
                <Mark />
              )}
            </Item.ItemMedia>
            <Item.ItemContent>
              <Item.ItemTitle>Personal vault</Item.ItemTitle>
              <Item.ItemDescription>Personal vault</Item.ItemDescription>
            </Item.ItemContent>
            <Item.ItemFooter>Example footer</Item.ItemFooter>
          </Item.Item>
          <Item.ItemSeparator {...p(Item.ItemSeparator, "ItemSeparator")} />
        </Item.ItemGroup>
      );
    case "B23":
      return (
        <Card.Card {...p(Card.Card, "Card")}>
          <Card.CardHeader>
            <Card.CardTitle>Example card</Card.CardTitle>
            <Card.CardDescription>
              Local device preferences
            </Card.CardDescription>
            <Card.CardAction>
              <B.Button variant="ghost">Edit</B.Button>
            </Card.CardAction>
          </Card.CardHeader>
          <Card.CardContent>Review spacing and size.</Card.CardContent>
          <Card.CardFooter>Example footer</Card.CardFooter>
        </Card.Card>
      );
    case "B24":
      return (
        <Combo.Combobox items={["Personal", "Work"]}>
          <Combo.ComboboxInput
            aria-label="Variant vault"
            placeholder="Select an example…"
          />
          <Combo.ComboboxContent
            {...p(Combo.ComboboxContent, "ComboboxContent")}
          >
            <Combo.ComboboxEmpty>No results</Combo.ComboboxEmpty>
            <Combo.ComboboxGroup>
              <Combo.ComboboxLabel>Vaults</Combo.ComboboxLabel>
              <Combo.ComboboxList>
                {(item: string) => (
                  <Combo.ComboboxItem key={item} value={item}>
                    {item}
                  </Combo.ComboboxItem>
                )}
              </Combo.ComboboxList>
            </Combo.ComboboxGroup>
            <Combo.ComboboxSeparator
              {...p(Combo.ComboboxSeparator, "ComboboxSeparator")}
            />
          </Combo.ComboboxContent>
        </Combo.Combobox>
      );
    case "B25":
      return (
        <BG.ButtonGroup
          {...p(BG.ButtonGroup, "ButtonGroup")}
          aria-label="Variant actions"
        >
          <BG.ButtonGroupText>Actions</BG.ButtonGroupText>
          <B.Button variant="outline">Copy</B.Button>
          <BG.ButtonGroupSeparator
            {...p(BG.ButtonGroupSeparator, "ButtonGroupSeparator")}
          />
          <B.Button variant="outline">Edit</B.Button>
        </BG.ButtonGroup>
      );
    case "B26":
      return (
        <Attach.AttachmentGroup>
          <Attach.Attachment {...p(Attach.Attachment, "Attachment")}>
            <Attach.AttachmentMedia
              {...p(Attach.AttachmentMedia, "AttachmentMedia")}
            >
              {p(Attach.AttachmentMedia, "AttachmentMedia").variant ===
              "image" ? (
                <img src={localImage} alt="" />
              ) : (
                <Mark />
              )}
            </Attach.AttachmentMedia>
            <Attach.AttachmentContent>
              <Attach.AttachmentTitle>
                Example attachment
              </Attach.AttachmentTitle>
              <Attach.AttachmentDescription>
                Image attachment
              </Attach.AttachmentDescription>
            </Attach.AttachmentContent>
            <Attach.AttachmentTrigger aria-label="Inspect attachment" />
            <Attach.AttachmentActions>
              <Attach.AttachmentAction
                {...p(Attach.AttachmentAction, "AttachmentAction")}
                aria-label="Attachment action"
              >
                {iconButton(
                  "Action",
                  p(Attach.AttachmentAction, "AttachmentAction").size ??
                    "icon-xs",
                )}
              </Attach.AttachmentAction>
            </Attach.AttachmentActions>
          </Attach.Attachment>
        </Attach.AttachmentGroup>
      );
    case "B27":
      return (
        <div className="relative isolate h-80 overflow-auto rounded-md border [&_[data-slot=sidebar-container]]:absolute">
          <Side.SidebarProvider
            className="h-full min-h-0"
            style={{ "--sidebar-width": "12rem" } as CSSProperties}
          >
            <Side.Sidebar {...p(Side.Sidebar, "Sidebar")}>
              <Side.SidebarHeader>
                <Side.SidebarInput
                  aria-label="Sidebar example search"
                  placeholder="Search…"
                />
              </Side.SidebarHeader>
              <Side.SidebarContent>
                <Side.SidebarGroup>
                  <Side.SidebarGroupLabel>
                    Example navigation
                  </Side.SidebarGroupLabel>
                  <Side.SidebarGroupAction aria-label="Add example">
                    <Mark />
                  </Side.SidebarGroupAction>
                  <Side.SidebarGroupContent>
                    <Side.SidebarMenu>
                      <Side.SidebarMenuItem>
                        <Side.SidebarMenuButton
                          {...p(Side.SidebarMenuButton, "SidebarMenuButton")}
                        >
                          Entries
                        </Side.SidebarMenuButton>
                        <Side.SidebarMenuAction aria-label="Entry actions">
                          <Mark />
                        </Side.SidebarMenuAction>
                        <Side.SidebarMenuBadge>2</Side.SidebarMenuBadge>
                        <Side.SidebarMenuSub>
                          <Side.SidebarMenuSubItem>
                            <Side.SidebarMenuSubButton
                              {...p(
                                Side.SidebarMenuSubButton,
                                "SidebarMenuSubButton",
                              )}
                            >
                              Personal
                            </Side.SidebarMenuSubButton>
                          </Side.SidebarMenuSubItem>
                        </Side.SidebarMenuSub>
                      </Side.SidebarMenuItem>
                    </Side.SidebarMenu>
                  </Side.SidebarGroupContent>
                </Side.SidebarGroup>
                <Side.SidebarSeparator
                  {...p(Side.SidebarSeparator, "SidebarSeparator")}
                />
                <Side.SidebarMenuSkeleton showIcon />
              </Side.SidebarContent>
              <Side.SidebarFooter>Local examples</Side.SidebarFooter>
              <Side.SidebarRail />
            </Side.Sidebar>
            <Side.SidebarInset className="min-w-0">
              <Side.SidebarTrigger
                {...p(Side.SidebarTrigger, "SidebarTrigger")}
              />
              <p className="p-3 text-xs">Toggle to review collapse behavior.</p>
            </Side.SidebarInset>
          </Side.SidebarProvider>
        </div>
      );
    case "B28":
      return (
        <Sheet.Sheet>
          <Sheet.SheetTrigger render={<B.Button variant="outline" />}>
            Details
          </Sheet.SheetTrigger>
          <Sheet.SheetContent {...p(Sheet.SheetContent, "SheetContent")}>
            <Sheet.SheetHeader>
              <Sheet.SheetTitle>Example sheet</Sheet.SheetTitle>
              <Sheet.SheetDescription>
                Review placement and dismissal.
              </Sheet.SheetDescription>
            </Sheet.SheetHeader>
          </Sheet.SheetContent>
        </Sheet.Sheet>
      );
    case "B29":
      return (
        <Table.Table>
          <Table.TableCaption>Table footer composition</Table.TableCaption>
          <Table.TableHeader>
            <Table.TableRow>
              <Table.TableHead>Group</Table.TableHead>
              <Table.TableHead>Entries</Table.TableHead>
            </Table.TableRow>
          </Table.TableHeader>
          <Table.TableBody>
            <Table.TableRow>
              <Table.TableCell>Personal</Table.TableCell>
              <Table.TableCell>2</Table.TableCell>
            </Table.TableRow>
          </Table.TableBody>
          <Table.TableFooter>
            <Table.TableRow>
              <Table.TableCell>Total</Table.TableCell>
              <Table.TableCell>2</Table.TableCell>
            </Table.TableRow>
          </Table.TableFooter>
        </Table.Table>
      );
    case "B30":
      return (
        <Page.Pagination>
          <Page.PaginationContent>
            <Page.PaginationItem>
              <Page.PaginationPrevious
                {...p(Page.PaginationPrevious, "PaginationPrevious")}
                href="#B30"
                onClick={(e) => e.preventDefault()}
              />
            </Page.PaginationItem>
            <Page.PaginationItem>
              <Page.PaginationLink
                {...p(Page.PaginationLink, "PaginationLink")}
                href="#B30"
                onClick={(e) => e.preventDefault()}
              >
                1
              </Page.PaginationLink>
            </Page.PaginationItem>
            <Page.PaginationItem>
              <Page.PaginationEllipsis />
            </Page.PaginationItem>
            <Page.PaginationItem>
              <Page.PaginationNext
                {...p(Page.PaginationNext, "PaginationNext")}
                href="#B30"
                onClick={(e) => e.preventDefault()}
              />
            </Page.PaginationItem>
          </Page.PaginationContent>
        </Page.Pagination>
      );
    case "B31":
      return (
        <F.FieldLabel id={label}>
          <Switch.Switch
            {...p(Switch.Switch, "Switch")}
            aria-labelledby={label}
          />
          Show metadata
        </F.FieldLabel>
      );
    case "B32":
      return (
        <Pop.Popover>
          <Pop.PopoverTrigger render={<B.Button variant="outline" />}>
            Preferences
          </Pop.PopoverTrigger>
          <Pop.PopoverContent {...p(Pop.PopoverContent, "PopoverContent")}>
            <Pop.PopoverHeader>
              <Pop.PopoverTitle>Example popover</Pop.PopoverTitle>
              <Pop.PopoverDescription>
                Local display guidance.
              </Pop.PopoverDescription>
            </Pop.PopoverHeader>
          </Pop.PopoverContent>
        </Pop.Popover>
      );
    case "B35":
      return (
        <>
          <Toggle.Toggle
            {...p(Toggle.Toggle, "Toggle")}
            aria-label="Pin example"
          >
            Pin
          </Toggle.Toggle>
          <TG.ToggleGroup
            {...p(TG.ToggleGroup, "ToggleGroup")}
            defaultValue={["one"]}
            aria-label="Variant view"
          >
            <TG.ToggleGroupItem
              {...p(TG.ToggleGroupItem, "ToggleGroupItem")}
              value="one"
            >
              List
            </TG.ToggleGroupItem>
            <TG.ToggleGroupItem value="two">Table</TG.ToggleGroupItem>
          </TG.ToggleGroup>
        </>
      );
    case "B36":
      return (
        <div className="h-48">
          <Resize.ResizablePanelGroup
            {...p(Resize.ResizablePanelGroup, "ResizablePanelGroup")}
          >
            <Resize.ResizablePanel minSize="20%">
              <p className="p-3">First panel</p>
            </Resize.ResizablePanel>
            <Resize.ResizableHandle
              withHandle
              aria-label="Variant panel divider"
            />
            <Resize.ResizablePanel minSize="20%">
              <p className="p-3">Second panel</p>
            </Resize.ResizablePanel>
          </Resize.ResizablePanelGroup>
        </div>
      );
    case "B38":
      return (
        <Avatar.AvatarGroup>
          <Avatar.Avatar {...p(Avatar.Avatar, "Avatar")}>
            <Avatar.AvatarImage
              src={localImage}
              alt="Example vault"
              className="object-contain"
            />
            <Avatar.AvatarFallback>PV</Avatar.AvatarFallback>
            <Avatar.AvatarBadge>
              <Mark />
            </Avatar.AvatarBadge>
          </Avatar.Avatar>
          <Avatar.Avatar>
            <Avatar.AvatarFallback>WV</Avatar.AvatarFallback>
          </Avatar.Avatar>
          <Avatar.AvatarGroupCount>+2</Avatar.AvatarGroupCount>
        </Avatar.AvatarGroup>
      );
    case "F02":
      return (
        <EntryForm
          {...p(EntryForm, "EntryForm")}
          value={draft}
          onChange={setDraft}
          onSubmit={() => {}}
          onCancel={() => {}}
          tags={demoTags}
        />
      );
    default:
      return null;
  }
}
