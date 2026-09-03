# React and UI standards

## UI-001: Keep workflow policy out of React

- **Requirement:** Components and hooks MUST NOT implement cryptography,
  persistence, sync, trust, or multi-step application policy. They MUST invoke
  composed use cases and render explicit results.
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

- **Requirement:** New UI code MUST use Base UI React, Tailwind CSS, and Phosphor
  icons. It MUST NOT add Radix UI or `react-icons` usage.
- **Scope:** Extension UI.
- **Reason:** One component and icon stack avoids duplicate behavior and bundle
  cost.
- **Compliant:** Import an icon from `@phosphor-icons/react`.
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
