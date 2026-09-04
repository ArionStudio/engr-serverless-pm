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

The repository has implementations for every current core port. It does not yet
have one production composition root that exposes every workflow to the popup
and options UI. The compile-only composition fixture verifies the public
construction graph until that application work is implemented.

The concrete implementations follow `BOUNDARY-013`: core contracts use `*Port`
in `.port.ts` files, and extension implementations use `*Adapter` in
`.adapter.ts` files. The [architecture catalog](./architecture.md#current-port-implementations)
lists the complete mapping.
