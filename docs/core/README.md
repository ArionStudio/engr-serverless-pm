# Core documentation

These documents describe the current `@lfspm/core` implementation. They do not
define coding rules.

## Documents

- [Architecture](./architecture.md) explains the package boundary, internal
  layers, runtime ports, and extension composition status.
- [Domain model](./domain-model.md) describes vault data, snapshots, device
  trust, sessions, sync state, and scheduled tasks.
- [Workflows](./workflows.md) accounts for all 33 exported use cases and links
  the available diagrams.
- [Security model](./security-model.md) explains where secrets live and how core
  applies its trust, rollback, session, and sync rules.
- [Testing](./testing.md) documents test layout, fixtures, test organization,
  and verification commands.

For supported package imports and a quick start, see the
[package guide](../../packages/core/README.md). For rules that future code must
follow, see the [code standards](../standards/README.md).

## Current scope

Core contains the implemented domain and application workflows. The extension
contains concrete browser and AWS adapters, background alarm handling, and a
production composition root for core workflows. Feature capabilities expose vault
setup, entries and sync in Options, with entry quick access in the popup.
Existing-vault enrollment remains deferred in the UI.
