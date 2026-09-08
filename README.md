# LFSPM

LFSPM is a local-first password manager built as a Chrome Manifest V3
extension. Cryptographic and application behavior lives in the TypeScript core
package. Browser storage, WebCrypto, clipboard, scheduling, and AWS S3 support
live in extension adapters.

The core workflows and current extension ports have concrete implementations
and tests. The full production composition root and UI wiring remain
unfinished; the popup and options pages are still a small shell.

## Security model

The project treats local persistence and cloud storage as untrusted. Vault
content is encrypted before persistence, snapshots are signed, and each device
keeps its provider credentials encrypted in local storage. Runtime-owned
plaintext vault content and usable private key material stay in volatile
extension memory: workflows own them transiently, then transfer them to the
unlocked session after successful activation. Explicit password retrieval can
return plaintext to a caller, and clipboard copy exports it to the operating
system clipboard for best-effort scheduled clearing.

Read the [current security model](./docs/core/security-model.md) for the trust
boundary and implemented safeguards. The
[v1 security specification](./docs/security/security-specification.md) is kept
as a non-normative legacy design reference.

## Repository layout

| Path               | Purpose                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `packages/core`    | Domain contracts, use cases, services, and runtime ports           |
| `apps/extension`   | Chrome extension UI, runtime code, and browser/AWS adapters        |
| `docs/core`        | Current core architecture, model, workflows, security, and testing |
| `docs/adapters`    | Current extension adapter architecture and development guide       |
| `docs/standards`   | Normative implementation and contribution rules                    |
| `docs/security`    | Legacy v1 security design reference                                |
| `docs/v1/use-case` | PlantUML workflow diagrams                                         |
| `docs/thesis`      | Engineering thesis sources                                         |

The [documentation portal](./docs/README.md) explains the status and authority
of the other document collections.

## Getting started

Requirements:

- Node.js `^20.19.0` or `>=22.12.0`
- pnpm `10.33.4`
- Google Chrome 120 or newer for loading the built extension

Install dependencies from the repository root:

```bash
pnpm install
```

Run the main verification commands:

```bash
pnpm core:type-check
pnpm core:test --run
pnpm --filter @lfspm/extension run type-check
pnpm ext:lint
pnpm ext:test --run
pnpm ext:build
```

The production extension build is written under `apps/extension/dist`. Load
that directory through `chrome://extensions` with developer mode enabled.

## Documentation

- [Core package guide](./packages/core/README.md)
- [Core documentation](./docs/core/README.md)
- [Extension adapter documentation](./docs/adapters/README.md)
- [Coding standards](./docs/standards/README.md)
- [AWS S3 setup](./docs/aws/s3/README.md)
- [Development references](./docs/development/reference-links.md)

Browser targets and installation limitations: [browser support](docs/browser-support.md).
