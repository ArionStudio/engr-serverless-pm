import { ReviewPageNavigation } from "./review-page-navigation.view";
import { ScreenExamples } from "./screen-examples.view";
import { GallerySelection } from "./selection";
import { componentApi } from "./component-api.generated";
import { Specimen } from "./specimen.view";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SecurityCheckIcon,
  Folder01Icon,
  Layers01Icon,
  GridViewIcon,
  File01Icon,
  Search01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/ui/components/primitives/button";
import { Badge } from "@/ui/components/primitives/badge";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/ui/components/primitives/native-select";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  useSidebar,
} from "@/ui/components/primitives/sidebar";
import { TooltipProvider } from "@/ui/components/primitives/tooltip";
import { BaseExamples } from "./base-examples.view";
import { ReviewExamples } from "./review-examples.view";
import { catalog, collectionFor } from "./catalog";
import { ExpandedExamples } from "./expanded-examples.view";
import { SharedExamples, FeatureExamples } from "./product-examples.view";
import { OrganizationFeatureExamples } from "./organization-examples.view";
import { FormExamples } from "./form-examples.view";
import "./review.css";

function subscribeToTheme(onChange: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function systemIsDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
const navigation = [
  { id: "screens", name: "Screen components", icon: File01Icon },
  { id: "expanded", name: "Tables & controls", icon: GridViewIcon },
  { id: "base", name: "Basic controls", icon: Layers01Icon },
  {
    id: "additions",
    name: "Containers & selection",
    icon: Folder01Icon,
  },
  { id: "shared", name: "Shared presentations", icon: File01Icon },
  { id: "features", name: "Feature widgets", icon: Search01Icon },
  { id: "forms", name: "Forms", icon: ArrowRight01Icon },
].map((item) => ({
  ...item,
  count: catalog.filter((c) => collectionFor(c.id) === item.id).length,
}));
const variants = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
] as const;

function ReviewNavigation({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-4 p-4 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HugeiconsIcon
              icon={SecurityCheckIcon}
              size={20}
              aria-hidden="true"
            />
          </span>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold">LFSPM</p>
            <p className="text-xs text-muted-foreground">Design library</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            Library · {catalog.length} families
          </SidebarGroupLabel>
          <nav aria-label="Component review">
            <SidebarMenu>
              {navigation.map(({ id, name, icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={active === id}
                    tooltip={name}
                    render={
                      <a
                        href={`#${id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          onSelect(id);
                          setOpenMobile(false);
                        }}
                      />
                    }
                  >
                    <HugeiconsIcon icon={icon} aria-hidden="true" />
                    <span>{name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-4 group-data-[collapsible=icon]:p-2">
        <div className="group-data-[collapsible=icon]:hidden">
          <p className="text-xs font-medium">Mira / violet / mauve</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Figtree & Hugeicons
            <br />
            Preset b2CjQp4R0
          </p>
        </div>
        <HugeiconsIcon
          icon={SecurityCheckIcon}
          size={20}
          className="hidden group-data-[collapsible=icon]:block"
          aria-hidden="true"
        />
      </SidebarFooter>
    </Sidebar>
  );
}

export function Gallery() {
  const [theme, setTheme] = useState("system");
  const [width, setWidth] = useState("fluid");
  const [tab, setTab] = useState("expanded");
  const [active, setActive] = useState("");
  const [reset, setReset] = useState(0);
  const systemDark = useSyncExternalStore(subscribeToTheme, systemIsDark);
  const dark = theme === "dark" || (theme === "system" && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    return () => document.documentElement.classList.remove("dark");
  }, [dark]);
  useEffect(() => {
    if (active)
      document
        .getElementById(active.split(":")[0])
        ?.scrollIntoView({ block: "start" });
  }, [active, tab]);
  return (
    <TooltipProvider>
      <SidebarProvider style={{ "--sidebar-width": "14rem" } as CSSProperties}>
        <a href="#review-content" className="review-skip">
          Skip to components
        </a>
        <ReviewNavigation
          active={tab}
          onSelect={(id) => {
            setTab(id);
            setActive("");
            document.getElementById("review-content")?.focus();
          }}
        />
        <div className="min-w-0 flex-1 bg-background">
          <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-8">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <ReviewPageNavigation current="components" />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Theme
                <NativeSelect
                  aria-label="Review theme"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  <NativeSelectOption value="system">System</NativeSelectOption>
                  <NativeSelectOption value="light">Light</NativeSelectOption>
                  <NativeSelectOption value="dark">Dark</NativeSelectOption>
                </NativeSelect>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Canvas
                <NativeSelect
                  aria-label="Review canvas width"
                  value={width}
                  onChange={(event) => setWidth(event.target.value)}
                >
                  <NativeSelectOption value="fluid">
                    Fit window
                  </NativeSelectOption>
                  <NativeSelectOption value="480">
                    Popup · 480px
                  </NativeSelectOption>
                  <NativeSelectOption value="768">
                    Options · 768px
                  </NativeSelectOption>
                  <NativeSelectOption value="1280">
                    Options · 1280px
                  </NativeSelectOption>
                  <NativeSelectOption value="320">
                    Reflow · 320px
                  </NativeSelectOption>
                </NativeSelect>
              </label>
            </div>
          </header>
          <main
            id="review-content"
            tabIndex={-1}
            data-focus-target
            className="mx-auto max-w-7xl px-4 py-8 outline-none sm:px-8 lg:px-10 lg:py-10"
          >
            <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="outline">Ready for discussion</Badge>
                  <span className="text-xs text-muted-foreground">
                    Base UI · shadcn
                  </span>
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  Component review
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {catalog.length} families covering {componentApi.length}{" "}
                  components and compound parts. Each example identifies its
                  owning layer. Open Screens to review each application screen
                  directly.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setReset((value) => value + 1);
                  setActive("");
                }}
              >
                Reset examples
              </Button>
            </div>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b">
              <div
                className="flex flex-wrap gap-5"
                role="group"
                aria-label="Review collection"
              >
                {navigation.map(({ id: value, name: label, count }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={tab === value}
                    className={`review-tab ${tab === value ? "is-active" : ""}`}
                    onClick={() => {
                      setTab(value);
                      setActive("");
                    }}
                  >
                    {label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <label className="mb-6 flex flex-wrap items-center gap-3 text-sm">
              Find a component or widget
              <NativeSelect
                aria-label="Find a component or widget"
                className="max-w-full"
                value={active}
                onChange={(e) => {
                  const entry = catalog.find(
                    (item) => item.id === e.target.value.split(":")[0],
                  );
                  if (entry) {
                    setTab(collectionFor(entry.id));
                    setActive(e.target.value);
                  }
                }}
              >
                <NativeSelectOption value="">
                  Choose from {catalog.length} families
                </NativeSelectOption>
                {catalog.map((entry) => (
                  <optgroup
                    key={entry.id}
                    label={`${entry.id} · ${entry.name}`}
                  >
                    <NativeSelectOption value={entry.id}>
                      {entry.id} · {entry.name}
                    </NativeSelectOption>
                    {componentApi
                      .filter(
                        (c) => c.family === entry.id && c.name !== entry.name,
                      )
                      .map((c) => (
                        <NativeSelectOption
                          key={c.name}
                          value={`${entry.id}:${c.name}`}
                        >
                          {c.name}
                        </NativeSelectOption>
                      ))}
                  </optgroup>
                ))}
              </NativeSelect>
            </label>
            <GallerySelection value={active}>
              <div
                className="review-canvas mx-auto max-w-full"
                style={{ width: width === "fluid" ? "100%" : `${width}px` }}
                key={reset}
              >
                {tab === "screens" ? (
                  <ScreenExamples />
                ) : tab === "expanded" ? (
                  <ExpandedExamples />
                ) : tab === "additions" ? (
                  <ReviewExamples />
                ) : tab === "base" ? (
                  <div className="space-y-8">
                    <Specimen
                      id="B01"
                      name="Button"
                      owner="@/ui/components/primitives/button"
                    >
                      <div className="flex flex-wrap gap-3">
                        {variants.map((variant) => (
                          <Button key={variant} variant={variant}>
                            {variant}
                          </Button>
                        ))}
                        <Button variant="secondary" aria-pressed="true">
                          Selected
                        </Button>
                        <Button disabled>Disabled</Button>
                      </div>
                    </Specimen>
                    <BaseExamples />
                  </div>
                ) : tab === "shared" ? (
                  <SharedExamples />
                ) : tab === "features" ? (
                  <div className="space-y-8">
                    <OrganizationFeatureExamples />
                    <FeatureExamples />
                  </div>
                ) : (
                  <FormExamples />
                )}
              </div>
            </GallerySelection>
          </main>
        </div>
      </SidebarProvider>
    </TooltipProvider>
  );
}
