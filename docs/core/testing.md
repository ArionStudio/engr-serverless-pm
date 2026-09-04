# Testing the core package

Status: current implementation

Core uses Vitest for executable contracts and TypeScript strict mode for static
validation. Tests are colocated with the domain operation, utility, service, or
use case they cover. Shared deterministic fixtures live under
`packages/core/src/__tests__/fixtures`.

## Commands

Run these commands from the repository root:

```bash
pnpm core:type-check
pnpm core:test --run
pnpm core:verify-common-passwords
pnpm core:verify-username-words
```

`pnpm core:test` without `--run` starts Vitest in its normal interactive mode.
To run one file once:

```bash
pnpm --filter @lfspm/core exec vitest run \
  src/use-cases/vault-lifecycle/unlock-vault.test.ts
```

Adapter and composition behavior belongs to the extension suite:

```bash
pnpm ext:test --run
pnpm --filter @lfspm/extension run type-check
pnpm ext:lint
pnpm ext:build
```

## Test layout

| Area                          | What the tests establish                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/domain`                  | Schema behavior, sanitization, version vectors, resolution utilities, and pure mutations                                  |
| `src/lib`                     | Encoding, password scoring, and best-effort secret wiping                                                                 |
| `src/services`                | Session consistency, snapshot persistence, trust verification, clipboard ownership, sync guards, and unbiased sampling    |
| `src/use-cases`               | Success, validation failures, dependency failures, rollback, stale ownership, and returned data                           |
| `src/__tests__/fixtures`      | Reusable deterministic ports and representative protected records                                                         |
| `apps/extension/src/adapters` | Runtime validation, codecs, WebCrypto behavior, IndexedDB transactions, Chrome APIs, and AWS S3 compare-and-swap behavior |

## Workflow test pattern

A use-case test constructs the real use case and services with controlled port
implementations. The test then asserts the returned result, persisted state,
and the exact effects that did or did not occur.

Mutation and security-sensitive tests cover more than the successful result.
They inspect cases such as:

- malformed input or an unsupported algorithm suite;
- invalid signatures, key pairs, trust chains, or rollback checkpoints;
- stale session, snapshot, credential, or scheduled-action ownership;
- local persistence failure before and after partial preparation;
- remote changes between review and conditional upload or deletion;
- cleanup and best-effort buffer wiping on failure;
- passwords omitted from read and search results.

## Test organization

Most exported use cases have a same-name test file. Two preparation entry
points are instead instantiated and exercised directly in their corresponding
consumption test files:

- `PrepareDeviceEnrollmentConsumptionUseCase` in
  `consume-device-enrollment.test.ts`;
- `PrepareDeviceRevocationConsumptionUseCase` in
  `consume-device-revocation.test.ts`.

The extension's `core-composition-api.typecheck.ts` is a compile-time consumer
fixture. It proves that representative use cases and shared services can be
constructed through supported package imports. The extension `type-check`
command includes this fixture; the extension build and Vitest suite do not. It
does not exercise a complete production UI workflow.

## Generated corpora

The common-password and username word corpora have deterministic generator
scripts. Verification mode regenerates normalized content from the pinned
source rules and fails when the committed corpus identity changes. Run both
verification commands when modifying password policy, generated data, or the
generator scripts.

## Configuration

`packages/core/tsconfig.json` enables strict type checking, unused-symbol
checks, verbatim module syntax, erasable syntax, fallthrough checks, and
unchecked side-effect import checks. `packages/core/vitest.config.ts` is an
empty package-local configuration, so core uses Vitest's built-in defaults.
