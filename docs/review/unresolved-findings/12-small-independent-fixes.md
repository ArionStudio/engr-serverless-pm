# Work Packets: Type-Only Imports and Username Entropy

Findings: 26 and 27.

Resolution units: **work item 26** and **work item 27**. They share this file for
convenience but remain separate single-finding work items.

Status: both open. They are independent of each other and can be separate small
branches.

## Finding 26: type-only imports

### Verified current behavior

Eight modules still use runtime imports only in type positions:

- `domain/entry/password-entry.type.ts`
- `domain/entry/search-entry-query.type.ts`
- `domain/entry/tag.type.ts`
- `domain/scheduled-task/scheduled-task-delay.type.ts`
- `lib/generate-password/generated-password.type.ts` for its schema symbol
- `lib/generate-username/generated-username.type.ts`
- `errors/generate-password.errors.ts`
- `errors/generate-username.errors.ts`

The Zod namespace, schema values used only by `typeof`, and `ZodError` constructor
annotations should be imported with `import type` under
`verbatimModuleSyntax`.

### Instructions and acceptance criteria

1. Convert only symbols used exclusively in type positions.
2. Do not change schemas, errors, or runtime behavior.
3. Run `pnpm core:type-check` and the focused password/username tests.
4. Inspect the diff to ensure it contains import changes only.

This is fully standalone.

## Finding 27: normalized username-word collision

### Verified current behavior

[`generateUsernameValue`](../../../packages/core/src/lib/generate-username/generated-username.utils.ts#L21)
samples the raw list uniformly and normalizes after selection. The list contains
both `yo-yo` and `yoyo`, which both normalize to `yoyo`. That output therefore
has twice the intended probability.

### Recommended implementation

Remove one colliding raw entry from the constant source. Prefer preserving the
canonical source form selected by the project rather than dynamically building
a deduplicated set at every module load. Keep sampling based on the final array
length.

### Required regression tests

- Normalize every source word using the production rule and assert uniqueness.
- Assert generated output remains alphanumeric and within the storage limit.
- Assert the sampler upper bound uses the updated source length.
- Keep deterministic fixture expectations aligned without weakening entropy
  assertions.

This is fully standalone and can run in parallel with Finding 26 because it
touches different responsibilities. Do not combine unrelated word-list cleanup.
