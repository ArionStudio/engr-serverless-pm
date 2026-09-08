# Extension adapters

Status: current implementation

The extension adapters implement the environment capabilities requested by
`@lfspm/core`. Core owns workflow and product policy. Adapters own calls to
browser APIs, IndexedDB, WebCrypto, AWS S3, and the approved BIP39 library.

This documentation describes the current tree. Normative rules live in the
[port and adapter standard](../standards/ports-adapters-and-runtime-validation.md).
The files under [`docs/plans/adapters`](../plans/adapters) are implementation
records, not active standards.

## Documents

- [Architecture and catalog](./architecture.md) maps each core port to its
  current implementation and explains portability, codecs, composition, and
  error ownership.
- [Development guide](./development.md) gives the repository workflow for
  adding or changing an adapter and selecting the required validation.

## Current scope

The concrete adapters live under `apps/extension/src/adapters`. The default
vault display-name implementation lives in core because it is portable product
policy rather than platform integration.

The repository has implementations for every current core port.
[`composeExtensionApplication`](../../apps/extension/src/extension/composition/extension-application.ts)
constructs all current core use cases with production adapters and shared
services. The background alarm root reuses its session and cleanup construction.
The popup and options roots inject capabilities backed by that factory into
their feature views. Setup, recovery, entries, organization, password tools,
devices, sync and vault settings have production UI integration. Website-login
views accept optional capabilities for gallery review; this build does not
activate browser capture or Fill. See the
[application coverage map](../plans/full-application-ui.md).

The concrete implementations follow `BOUNDARY-013`: core contracts use `*Port`
in `.port.ts` files, and extension implementations use `*Adapter` in
`.adapter.ts` files. The [architecture catalog](./architecture.md#current-port-implementations)
lists the complete mapping.
