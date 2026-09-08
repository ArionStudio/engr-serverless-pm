# Core documentation

These documents describe the current `@lfspm/core` implementation. They do not
define coding rules.

## Documents

- [Architecture](./architecture.md) explains the package boundary, internal
  layers, runtime ports, and extension composition status.
- [Domain model](./domain-model.md) describes vault data, snapshots, device
  trust, sessions, sync state, and scheduled tasks.
- [Workflows](./workflows.md) accounts for all exported use cases and links
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
constructs them with production browser and AWS adapters in
[`composeExtensionApplication`](../../apps/extension/src/extension/composition/extension-application.ts).
Options and popup receive narrow capabilities for their workflows. The
background root composes scheduled-task cleanup.
See the [application coverage map](../plans/full-application-ui.md) for UI
integration and its limits. Website-login display contracts and gallery examples
are present; browser capture and Fill runtime integration are separate work.
