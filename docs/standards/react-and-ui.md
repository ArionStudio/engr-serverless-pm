# React and UI standards

## UI-001: Keep workflow policy out of React

- **Requirement:** Components and hooks MUST NOT implement cryptography,
  persistence, sync, trust, or multi-step application policy. When UI code
  initiates application workflow behavior, it MUST invoke composed use cases and
  render explicit results.
- **Scope:** `apps/extension/src/ui`.
- **Reason:** React lifecycle code is not the owner of security workflows.
- **Compliant:** A hook invokes `UnlockVault.execute` and stores visible status.
- **Noncompliant:** A hook derives keys with WebCrypto and writes IndexedDB.
- **Enforcement:** UI import and responsibility review.
- **Exceptions:** UI-only preference persistence with no core security meaning.

## UI-002: Keep render pure

- **Requirement:** Components and hooks MUST be pure during render. Side effects
  belong in event handlers or effects with complete cleanup and dependency lists.
- **Scope:** React components and hooks.
- **Reason:** React may repeat, interrupt, or reorder rendering.
- **Compliant:** Subscribe to `matchMedia` in an effect and remove the listener.
- **Noncompliant:** Start a storage write while rendering a component.
- **Enforcement:** React Hooks linting and component tests.
- **Exceptions:** None.

## UI-003: Use the approved component stack

- **Requirement:** New UI code MUST use Base UI React, Tailwind CSS, and Hugeicons
  icons. It MUST NOT add Radix UI or `react-icons` usage.
- **Scope:** Extension UI.
- **Reason:** One component and icon stack avoids duplicate behavior and bundle
  cost.
- **Compliant:** Render `HugeiconsIcon` from `@hugeicons/react` with an icon from
  `@hugeicons/core-free-icons`.
- **Noncompliant:** Add a new Radix primitive or `react-icons` icon.
- **Enforcement:** Dependency and import review.
- **Exceptions:** Existing migration remnants may remain until their owning work
  item replaces them.

## UI-004: Follow established styling composition

- **Requirement:** Components using `useTheme` MUST render under
  `ThemeProvider`. CVA variant output MUST be merged through the shared `cn`
  utility.
- **Scope:** Extension UI composition and primitives.
- **Reason:** These rules preserve theme context and caller class overrides.
- **Compliant:** `className={cn(buttonVariants({ size }), className)}`.
- **Noncompliant:** Concatenate a CVA result manually and discard caller classes.
- **Enforcement:** Component tests and review.
- **Exceptions:** Components that do not use CVA or theme context.

## UI-005: Do not standardize planned state tools

- **Requirement:** A planned library MUST NOT become a coding requirement until
  the repository adopts it in production and its ownership rules are approved.
- **Scope:** UI state management and future framework choices.
- **Reason:** Planned technology is not an implemented convention.
- **Compliant:** Use the smallest existing state mechanism for current UI work.
- **Noncompliant:** Require Zustand because it appears as planned in project
  documentation.
- **Enforcement:** Standards and dependency review.
- **Exceptions:** An approved implementation task may introduce the library and
  its standards together.

## UI-006: Keep the component gallery current

- **Requirement:** Every application UI component, feature presentation, widget,
  form and screen composition MUST be discoverable in the review gallery. New
  components and changes to existing components MUST update gallery registration,
  examples and usage guidance in the same change. Examples MUST import the actual
  implementation rather than a copied demonstration version.
- **Variants:** Every supported named visual variant, size and layout/orientation
  MUST be listed and individually selectable through labeled gallery controls.
  Show the selected values. Keep behavior states such as disabled, pending, empty,
  invalid and failed separately labeled and reviewable. Side-by-side comparisons
  may supplement the chooser. Do not invent variants a component does not support;
  identify single-variant presentations as such.
- **Scope:** Application UI under `apps/extension/src/ui` and future reusable
  rendered UI elsewhere in the extension. Private visual parts and compound
  subcomponents may be explicitly listed under a discoverable family example;
  they MUST NOT silently disappear from coverage. Nonvisual providers, hooks and
  utilities do not require standalone visual specimens.
- **Reason:** The gallery is the ongoing review entrypoint for the application's
  implemented UI, not a fixed initial catalog or a collection of screenshots.
- **Enforcement:** Review component/export and supported-variant changes against
  gallery coverage in each change. Build and inspect the affected examples in
  both themes and relevant widths; recheck contrast for changed color combinations.
  A matching catalog registration alone does not prove a working example.
- **Safety:** Use synthetic data and injected callbacks. The gallery MUST remain
  outside the shipped extension and MUST NOT connect to real vaults or browser
  permission workflows.
- **Exceptions:** None for rendered application UI. Planned, unimplemented
  components remain visibly pending and do not count as implemented coverage.

## UI-007: No product subtitles or filler copy

- Product headings MUST NOT have subtitles, eyebrow slogans, marketing taglines
  or decorative footer text. This is an explicit user preference.
- Use direct task titles. Do not repeat a heading as a button label in the same
  action block. Explanations must help a concrete decision or prevent a mistake.
- Keep field labels, validation errors, necessary safety guidance and accurate
  availability notices. Put longer guidance behind a relevant disclosure instead
  of filling an adjacent column. Do not repeat the same notice throughout a screen.
- Gallery usage explanations remain required under UI-006; they are review
  documentation, not product heading subtitles.

Do not label product UI as synthetic, sample, temporary, demonstration or preview.
Keep implementation status in developer documentation. Controls must describe
their actual action and must not imply that an unsaved vault was created.

Field copy states the requirement and purpose. Do not narrate internal checks or
UI behavior. Add explanations only for security concerns, safe data handling,
and why a security requirement matters.

Password strength feedback stays hidden while the password is empty, with no
placeholder or reserved layout space. Show it after typing and hide it on clear.
