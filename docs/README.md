# Documentation

This page is the entry point for maintained project documentation. The
repository also contains design proposals, review evidence, academic reports,
and older diagrams. Those records can explain how the project evolved, but they
do not automatically describe the current implementation.

## Current technical documentation

- [Core documentation](./core/README.md) describes the implemented core package.
- [Core package guide](../packages/core/README.md) lists supported imports,
  source layout, and commands.
- [AWS S3 setup](./aws/s3/README.md) explains deployment and credential setup for
  the S3 sync adapter.
- [V1 use-case diagrams](./v1/use-case/README.md) visualize selected core
  workflows. The TypeScript implementation remains authoritative when a
  diagram is stale.

## Normative documents

- [Code standards](./standards/README.md) state what implementation and review
  work must or must not do.

Standards are separate from the descriptive documents above. A statement about
what the code currently does belongs in descriptive documentation. A rule for
future changes belongs in `docs/standards`.

## Supporting and historical collections

| Collection          | Status                                         | Use                                                                          |
| ------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `docs/security`     | Legacy v1 security design                      | Historical threat-model and protocol context; not a current normative source |
| `docs/design`       | Mixed proposals and implemented design context | Check live code and current core docs before treating a design as current    |
| `docs/architecture` | Legacy architecture diagrams and comparisons   | Historical context; several diagrams predate the current trust and key model |
| `docs/review`       | Review and implementation evidence             | Audit trail, not current product documentation                               |
| `docs/report`       | Project reports                                | Historical and academic record                                               |
| `docs/research`     | Research material                              | Background sources and drafts                                                |
| `docs/thesis`       | Thesis sources                                 | Academic deliverable with its own structure                                  |

The former core rules at
[`docs/development/core-architecture.md`](./development/core-architecture.md)
are superseded. Current normative rules live in
[`docs/standards/core-architecture.md`](./standards/core-architecture.md), while
the current implementation is described in
[`docs/core/architecture.md`](./core/architecture.md).

## Choosing a source

For current protected-data shapes, public imports, and implemented contracts,
use the package exports, exported TypeScript declarations, extension codecs,
and tests. Use accepted standards for implementation rules. Treat the v1
security specification, older designs, reviews, and diagrams as supporting
evidence only.
