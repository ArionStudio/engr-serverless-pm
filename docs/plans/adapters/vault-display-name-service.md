# Vault display-name implementation plan

Status: approved, implemented, and validated on
`feature/extension/remaining-adapters`.

Baseline: `be85b607` (merged core documentation, 2026-09-04).

This document is an implementation plan, not a normative standard. The rules
that constrain the work remain under [`docs/standards`](../../standards/README.md).

## Definition

[`VaultDisplayNamePort`](../../../packages/core/src/ports/vault/vault-display-name.port.ts)
defines one asynchronous capability:

```ts
export interface VaultDisplayNamePort {
  generateVaultDisplayName: () => Promise<string>;
}
```

The result is device-local, non-secret selection metadata stored in
[`LocalVaultDescriptor`](../../../packages/core/src/domain/vault/local-vault-descriptor.ts).
`InitializeVaultUseCase` generates and returns a name for a new vault.
`PerformDeviceEnrollmentUseCase` generates a new local name for the enrolled
copy instead of inheriting another device's label. Vault identity and
authorization continue to use `vaultId`; display names are not identifiers.

The port and persisted descriptor currently require only a string. The
IndexedDB codec rejects blank values but defines no maximum length, naming
grammar, localization, or uniqueness guarantee.

## Portability and current ownership

`VaultDisplayNamePort` is general, and the default behavior has no
browser dependency. The name format, vocabulary, and randomness policy are
product logic that every LFSPM client should share.

Implement the default generator as a core service. Keep the port so a client
can supply a different policy when the product explicitly allows one. The
extension composition root will construct the core service with its shared
`RandomSamplerService`; it does not need a browser adapter for this port.

## Pre-implementation gap

There was no production implementation. The fixture value
`blue-river-4821` is the only concrete format evidence. The repository already
contains two suitable building blocks:

- [`GENERATED_USERNAME_WORDS`](../../../packages/core/src/lib/generate-username/generated-username.const.ts),
  a pinned, verified lowercase ASCII word corpus with a shared alphanumeric
  normalization policy;
- [`RandomSamplerService`](../../../packages/core/src/services/randomness/random-sampler.service.ts),
  which performs unbiased bounded sampling from `CryptoPort` randomness.

The fixture alone does not establish a production grammar, approved vocabulary,
brand tone, or sensitive-word policy. Reusing the username corpus is economical,
but it is still a user-facing product choice rather than an implementation
detail.

## Approved naming policy

The approved policy is:

- format: `<word>-<word>-<four-digit-number>`;
- vocabulary: two independent selections from `GENERATED_USERNAME_WORDS`, each
  processed by the existing alphanumeric username-word normalization;
- suffix: one uniform integer in `[0, 10000)`, padded to four digits;
- semantics: a readable local label, with no adjective-noun grammar,
  localization, sensitive-word guarantee, or uniqueness guarantee.

This policy preserves the long-standing fixture shape, adds no
dependency or corpus, and produces names no longer than 24 characters under the
current corpus. If grammatical pairs, curated tone, sensitive-word filtering,
or localization matter, the implementation instead needs a product-approved
corpus and policy.

## Requirements

- Add the default implementation under `packages/core/src/services/vault`.
- Use relative imports inside core. Do not make core import its own package name
  or any extension module.
- Use `RandomSamplerService.pickIndex` for all three selections. Do not use
  `Math.random`, modulo sampling, network data, or duplicate random logic.
- Reuse the existing generated-username word normalization. Do not duplicate or
  change the pinned corpus to handle its hyphenated entries.
- Implement the approved format and vocabulary. Under the recommended policy,
  generate exactly two normalized corpus words and one zero-padded four-digit
  suffix, separated by hyphens.
- Do not query storage or claim uniqueness. Duplicate labels are acceptable
  because `vaultId` owns identity.
- Let sampler errors propagate and stop requesting later values after failure.
- Keep the service stateless and construction inert.
- Use a named export and expose it through `@lfspm/core/services`.
- Do not tighten the broader persisted descriptor schema as part of this work.

## Implemented changes

1. Record approval of the name format, vocabulary, and stated non-guarantees.
2. Add
   `packages/core/src/services/vault/random-vault-display-name.service.ts` with
   a named `RandomVaultDisplayNameService` class implementing
   `VaultDisplayNamePort`.
3. Inject `Pick<RandomSamplerService, "pickIndex">` so the service is easy to
   test and production composition can reuse the established sampler.
4. Request two indexes with `GENERATED_USERNAME_WORDS.length`, normalize those
   selections through the shared username-word policy, then request one index
   with `10_000`. Format the result without modifying the source corpus.
5. Export the class from `packages/core/src/services/index.ts`.
6. Extend the extension's compile-only composition fixture to import the
   service through `@lfspm/core/services` and construct it from the graph's
   existing `CryptoPort` and `RandomSamplerService`. Keep the use cases
   dependent on `VaultDisplayNamePort`.
7. In the later production composition root, construct one
   `RandomSamplerService` from the graph's shared `WebCryptoAdapter`, construct
   one display-name service from that sampler, and supply it to initialization
   and enrollment.

## Test plan

Add
`packages/core/src/services/vault/random-vault-display-name.service.test.ts`
and prove that:

- controlled indexes and suffix `4821` produce the expected format;
- suffixes `0` and `9999` render as `0000` and `9999`;
- calls use the exact upper bounds and order: corpus length, corpus length,
  `10_000`;
- a corpus-wide invariant proves that every normalized word is lowercase
  alphanumeric and that the maximum two-word formatted result is no longer than
  24 characters;
- punctuation in a selected corpus entry is normalized by the shared policy;
- repeated word indexes are accepted without retry;
- a sampler error propagates and prevents subsequent sample requests.

Do not add statistical randomness tests. `RandomSamplerService` already owns
the rejection-sampling proof.

Run from the repository root:

```bash
pnpm --filter @lfspm/core exec vitest run \
  src/services/vault/random-vault-display-name.service.test.ts
pnpm core:type-check
pnpm core:test --run
pnpm core:verify-username-words
pnpm --filter @lfspm/extension run type-check
pnpm ext:lint
pnpm ext:build
pnpm --dir apps/extension exec prettier --check \
  ../../packages/core/src/services/vault
git diff --check
```

## Acceptance criteria

- The default core service implements `VaultDisplayNamePort` and returns a
  `Promise<string>`.
- Under the recommended policy, every result matches
  `^[a-z0-9]+-[a-z0-9]+-[0-9]{4}$`, contains the normalized forms of two
  existing corpus entries, and is no longer than 24 characters.
- All selections use the existing unbiased sampler; no dependency, network
  request, or generated dataset is added.
- The service neither claims nor checks uniqueness and does not access
  persistence.
- The class is available through `@lfspm/core/services` as a named export, and
  the extension compile fixture resolves and constructs it through that public
  path.
- Focused tests, affected core and extension gates, formatting check, the
  username-corpus verifier, and `git diff --check` pass.
- No core port, descriptor schema, IndexedDB schema version, migration, or
  compatibility branch changes.

## Product decisions outside the approved policy

User editing and unique display names are not part of the recommended policy.
Adding either later would require a changed workflow or port contract and must
not be inferred during service implementation.

## Evidence

- Port:
  [`vault-display-name.port.ts`](../../../packages/core/src/ports/vault/vault-display-name.port.ts)
- Persisted type and decoder:
  [`local-vault-descriptor.ts`](../../../packages/core/src/domain/vault/local-vault-descriptor.ts)
  and
  [`local-vault-security.codec.ts`](../../../apps/extension/src/adapters/codecs/local-vault-security.codec.ts)
- Callers:
  [`initialize-vault.ts`](../../../packages/core/src/use-cases/vault-lifecycle/initialize-vault.ts),
  [`perform-device-enrollment.ts`](../../../packages/core/src/use-cases/device-trust/perform-device-enrollment.ts),
  and
  [`list-local-vaults.ts`](../../../packages/core/src/use-cases/vault-lifecycle/list-local-vaults.ts)
- Reusable randomness:
  [`random-sampler.service.ts`](../../../packages/core/src/services/randomness/random-sampler.service.ts)
- Public consumer smoke:
  [`core-composition-api.typecheck.ts`](../../../apps/extension/src/core-composition-api.typecheck.ts)
- Applicable standards:
  [`password-policy-and-generated-data.md`](../../standards/password-policy-and-generated-data.md),
  [`public-api-and-contracts.md`](../../standards/public-api-and-contracts.md),
  and
  [`testing-and-validation.md`](../../standards/testing-and-validation.md)
