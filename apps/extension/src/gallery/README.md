# Component gallery

This separate Vite entry reviews the catalog in
[the component specification](../../../../docs/ui-ux/component-specification.md).
It is not an extension route. The extension build has explicit inputs that exclude
`gallery.html`; this build writes only to ignored `dist-gallery/`.

From the repository root:

```sh
pnpm --filter @lfspm/extension run gallery:build
```

For browser review, create the ignored local `.codex/servers.toml` profile:

```toml
[server.gallery]
cwd = "apps/extension"
build = ["pnpm", "run", "gallery:build"]
start = ["pnpm", "run", "gallery:preview", "--host", "0.0.0.0", "--port", "{port}", "--strictPort"]
health_path = "/gallery.html"
```

Run `serverctl start gallery --repo <repository-path>`.
The profile builds first and returns the allocated URL. Open `/gallery.html`.
Run `serverctl stop gallery --repo <repository-path>` after review.

The gallery now exposes **75 catalog IDs** in seven collections: 20 basic controls,
8 containers/selection controls, 10 tables/other controls, 14 shared presentations,
14 feature presentations, 7 forms and 2 current screens. “Find a component or widget” jumps directly
to any entry. The [ownership inventory](../../../../docs/ui-ux/review-inventory.md)
links every ID to its actual public import or shared source.

All entries are implemented for visual review. The collection grouping is for
browsing; it does not change code ownership. For example P25 is shared confirmation
presentation and P08 reuses the existing theme feature. Preview widths shrink to
the available window. System/light/dark appearance applies to portals too.
Changing collection or Reset examples unmounts the previous fixture state.

Examples must use synthetic data and injected callbacks. Do not import extension
composition, adapters, browser APIs or real vault data. Log only action names or
counts. Never record callback payloads. Production components must not import
anything from this directory.

## Maintaining coverage

The gallery is maintained with every UI change under
[UI-006](../../../../docs/standards/react-and-ui.md#ui-006-keep-the-component-gallery-current).
The catalog names 273 exported components and compound parts. ThemeProvider is
explicitly marked as nonvisual; its controlled ThemeToggle consumer is reviewed
without invoking persistence. Family details list source ownership, and the finder
can select an individual compound part. Current screen views use synthetic state.

For each added or changed component, update its actual imported example, catalog
entry or named family membership, usage explanation and variant controls in the
same change. Provide labeled selectors for each supported visual variant, size
and layout; display the selected values. Keep state controls separate from visual
variants. Components with one presentation should say so. Compound parts can
share a specimen but must be named and demonstrated. Future screens can use a
separate review collection with injected synthetic state.

Do not copy production markup into fixtures. Source changes should reach the
gallery through imports; new props/variants still require an explicit fixture
update. Restart the managed production preview after rebuilding to review changes.

`pnpm --filter @lfspm/extension gallery:check` runs before both the gallery and production extension builds.
It derives exported components and 72 visual variant axes from TypeScript, checks
ownership and valid family IDs, compares the generated inventory, and requires preview bindings for
each component with variants. It follows the gallery import graph to check JSX
consumers, with an explicit exception for the nonvisual ThemeProvider.

After changing a public UI API, run `gallery:inventory`, review the generated diff,
and update the actual demo recipe in `variant-demo.view.tsx`. The supported axes
are variant, size, orientation, side, align, collapsible, mode and layout. Behavior
states stay in the existing scenario controls. A new naming convention needs an
explicit checker update. The static check cannot prove runtime reachability,
behavior or visual correctness; the browser verification remains required.

Variant selectors render real imports, display the selected prop values, and reset
the local fixture when a choice changes. Single-presentation families say so.
The screen collection includes PopupView and OptionsView with first-launch,
password, device, connection, loading, existing-vault and error selectors. Four
setup-feature presentations belong to S02. Appearance remains interactive. The
extension does not create a vault. Product UI omits prototype and sample labels;
the device-step cancellation clears the form. Keep this implementation boundary
in development documentation, not decorative UI copy.

## CLI ownership and updates

The user approved installation and requested the shadcn CLI workflow.
The installed CLI is 4.21.0. Run these commands from the repository root:

```sh
pnpm --filter @lfspm/extension exec shadcn preset decode b2CjQp4R0 --json
pnpm --filter @lfspm/extension exec shadcn preset resolve --json
pnpm --filter @lfspm/extension exec shadcn add button --dry-run
pnpm --filter @lfspm/extension exec shadcn add button --diff
```

`shadcn apply b2CjQp4R0 --yes` applied the preset. The resolve command returns
that exact code with no fallbacks. `shadcn add` generated B01–B20 and Label.
The CLI installed Figtree 5.3.0, Hugeicons React 1.1.10, the free icon set 4.3.0
and `cn` 0.2.5. `shadcn migrate cn --yes` migrated the existing helper and removed
its superseded direct dependencies. Base UI stays at the existing 1.0.0.
The CLI also generated the eight review additions and Sidebar’s `use-mobile` hook,
preserving existing files at overwrite prompts.
The next CLI batch generated Table, Pagination, Switch, Popover, Toast, Progress,
Toggle Group, Resizable, Kbd and Avatar, plus the Toggle dependency. Existing Button
was preserved at the overwrite prompt. Resizable added `react-resizable-panels`.
The authorized Table implementation added pinned `@tanstack/react-table@9.2.4`.
TanStack Form, Query, Virtual and tRPC were not added. See the
[artifact verification](../../../../docs/ui-ux/tanstack-verification.md).
The lockfile records resolved versions; CLI-generated manifest ranges are retained.

The root `vite.config.ts` forwards to the real configuration under `config/` so
shadcn can detect this extension as Vite without changing its production inputs.
The corrected utility alias remains in `components.json`.

[shadcn's CLI](https://ui.shadcn.com/docs/cli) owns preset application, generated
base controls, icon selection and their dependencies. Generated source belongs to
this repository; use `add --diff` before updates. It does not create our vault
presentation components or replace application validation.

Manual adjustments after generation:

- The CLI icon migration explicitly skipped ThemeToggle's icon-array references.
  Migrated those to Hugeicons and removed Phosphor once no imports remained.
- Removed the superseded DM Sans CSS import and dependency retained by `apply`.
- Spinner uses `Omit<HugeiconsIconProps, "icon">`; the generated generic SVG props
  allow a string stroke width that the installed Hugeicons renderer rejects.
- Sidebar does not write a preference cookie; its owner controls persistence.
- Combobox icon actions have accessible names, removable chips accept a
  `removeLabel`, and its trailing addon overrides the negative margin that
  overflowed a 320px canvas. Recheck these adjustments when regenerating.
- Removed the unused extra `ui/lib/utils.ts` emitted by `apply`; `cn.util.ts`
  remains the configured helper. Formatting follows repository Prettier rules.

AGENTS.md and UI-003 now reflect the approved Hugeicons convention. Recheck the
Spinner adjustment on future CLI regeneration. Do not overwrite it blindly.

## Validation record

- The extension suite has 469 passing tests in 37 files. Eleven gallery tests
  cover cancellation focus, checkbox/tab semantics, concealed recovery words,
  table input projection/filtering/stable selection, retained-input error and
  reset, missing local recovery data, stable three-word verification retries,
  variant prop binding and vertical Tabs keyboard navigation.
- The initial complete-gallery Chrome pass rendered all 73 IDs with no page errors
  and no document overflow at 1440, 400 or 320 pixels. Real Table filtering was
  exercised. The final browser matrix is recorded in the UI/UX inventory.
- The living-gallery follow-up exercises 263 declared choices in light/dark themes
  at 1440px and 320px, for 1,052 selections. All 75 family layouts pass without
  overflow or browser errors. Compound-part navigation and Reset examples pass.
  The variant audit records 117,364 contrast measurements with zero failures;
  the behavior/hover/focus audit adds 62,462 with zero failures. See the
  [current contrast evidence](../../../../docs/ui-ux/contrast-review.md).
- Build, lint and production-artifact checks are required after source changes.
  These checks do not imply full accessibility conformance or visual approval.

With the installed Base UI version, wrap checkbox/radio controls in their labels
and explicitly associate the label using `aria-labelledby`. The tests protect
both the checkbox's accessible name and activation when its visible label is clicked.

## Explaining use during review

Every catalog ID has visible usage copy in `usage.ts`, rendered by `Usage` above
its example. Keep obvious controls brief; explain the intended vault use and any
important distinction for unfamiliar controls. This copy belongs to the gallery.
The typed catalog mapping prevents new IDs from silently missing an explanation.

B29 and P11 share the same 24-entry table driver. Review search by login/website/tag,
tag filtering, column visibility, sorting, page size, selected-entry review and
row callbacks. Selection clears on filter changes and survives pagination.
The narrow layout turns rows into labeled summaries and exposes a sort selector.
Resizable now demonstrates selecting an entry beside its resizable details pane.

All collections use the shared `Specimen` frame: a full outer border, tinted
header, prominent catalog badge and separate padded demo area. Keep this framing
consistent when adding examples; it marks the review boundary, not a product
component's own styling. The frame must not clip overlays or let demo content
extend into neighboring examples.

## Screen presentations

The managed gallery build serves two review pages:

- `gallery.html`: the component catalog, usage explanations, and variant controls.
- `screens.html`: application screens with a visible navigation list and state
  buttons. It includes setup, recovery, unlocking, completion, and settings.

Use the Components / Screens links in either page header to switch. Screen URLs
support direct links such as `screens.html#password` or `screens.html#settings`.
The screen list remains visible on narrow layouts. Both pages use gallery-only
fixtures and stay excluded from the production extension build.
