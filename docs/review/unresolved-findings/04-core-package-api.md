# Work Packet: Make the Core Composition API Constructible

Finding: 16.

Resolution unit: **work item 16** (Finding 16 only).

Status: open and suitable for a standalone package-surface branch.

## Verified current behavior

[`packages/core/package.json`](../../../packages/core/package.json#L6) exposes
only `.` and `./lib`. The root
[`src/index.ts`](../../../packages/core/src/index.ts#L1) exports domain, errors,
ports, and use cases, but not services. Public use-case constructors require
concrete classes such as `UnlockedVaultSessionService`, `VaultSnapshotService`,
`VaultSyncGuardService`, and `VaultTrustService`. Their private members prevent
safe structural stand-ins, while consumers cannot import the implementations
through a declared package subpath.

## Recommended narrow contract

Expose the existing service barrel as one stable `@lfspm/core/services`
subpath. This reuses the current service organization and avoids adding every
concrete service to the root namespace.

Only choose factories/interfaces instead if the project explicitly wants to
hide concrete orchestration. That would be a broader API redesign and should
be a separate proposal, not an incidental fix for package exports.

## Implementation instructions

1. Confirm every concrete service required by a public use-case constructor is
   exported by `packages/core/src/services/index.ts` and its child barrels.
2. Add one package export for `./services`.
3. Avoid deep-path exports for individual source files.
4. Add a consumer-boundary compile test or extension composition smoke file that
   imports use cases and their required services only from declared subpaths.
5. Do not export fixtures, internal-only helpers, or test utilities.

## Required verification

- A consumer can import and construct representative vault lifecycle, entry,
  clipboard, and sync use cases without a cast or source deep import.
- Existing `@lfspm/core` and `@lfspm/core/lib` imports still compile.
- The package export map contains no accidental wildcard surface.
- Core type-check and extension type-check/build pass.

## Independence

This can be implemented alone. If Finding 28 is already underway, coordinate
only to avoid simultaneously redesigning the same constructors. Do not turn
this packet into dependency injection, service locators, or a composition-root
framework.

## Completion evidence

Run `pnpm core:type-check`, the extension type-check/build command used by the
repository, and the consumer-boundary smoke check. Inspect the published export
map rather than relying only on relative imports inside the monorepo.
