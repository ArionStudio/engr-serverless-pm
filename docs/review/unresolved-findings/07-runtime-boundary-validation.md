# Work Packet: Runtime Validation at Hostile Data Boundaries

Finding: 20.

Resolution unit: **work item 20**, which includes prerequisite Finding 28.
Complete the companion [contract inventory](13-contract-source-of-truth-research.md)
before using this packet to define and implement the artifact slices.

Status: partially addressed. Version checks now exist in several workflows, but
there is no complete runtime decoding strategy for persisted and remote domain
artifacts.

## Verified current behavior

Current code explicitly checks snapshot schema versions in trust, snapshot,
unlock, recovery, and enrollment paths, and trust certificates validate their
version and structural invariants. The extension's unlocked-session adapter also
provides a useful explicit codec precedent in
[`unlocked-vault-session-material.codec.ts`](../../../apps/extension/src/adapters/storage/unlocked-vault-session-material.codec.ts#L91).

However, ports still return TypeScript domain types directly from hostile
IndexedDB, Chrome storage, enrollment transport, and sync-provider boundaries.
Compile-time types do not prove that runtime records contain valid nested arrays,
numbers, branded bytes, discriminants, or only supported future fields.

## Boundary ownership decision

Use adapters/codecs to convert `unknown` serialized data into validated core
types. Core use cases should retain cheap defense-in-depth checks for critical
identity and version invariants, but should not each implement a different
partial decoder.

Before implementation, inventory these artifact families:

1. vault snapshot, descriptor, encrypted content metadata, key slots, and trust
   chain;
2. local vault descriptor, device access material, recovery backup, and signed
   trust checkpoint;
3. enrollment request, response, and protected pending state;
4. encrypted device sync credential state and provider configuration;
5. unlocked-session material and encrypted payload;
6. scheduled task metadata.

For each family record the serialized owner, decoder location, accepted version,
strictness about unknown fields, branded-byte conversion, and public error.

## Required split

Do not implement this as one repository-wide PR. After the inventory, create
thin vertical slices in this order:

1. Remote/local snapshot plus descriptor decoding.
2. Device access, recovery backup, and checkpoint decoding.
3. Enrollment request/response decoding.
4. Sync credentials/configuration decoding.
5. Remaining task/session records not already covered.

Each slice must include the real adapter, the core port boundary it satisfies,
and hostile-record tests. A schema existing only in core without being called by
an adapter does not close the slice.

## Validation rules

- Reject unsupported versions before crypto, decryption, signing, or mutation.
- Reject malformed arrays, duplicate identities, invalid numeric ranges, and
  malformed byte encodings before domain use.
- Wrap decoding failures in static project/adapter errors without retaining
  secret-bearing raw records.
- Do not silently drop future fields and re-sign a downgraded object.
- Preserve the core's provider-agnostic JSON boundary for provider config; do
  not move AWS validation into core.

## Required tests per slice

- Unsupported older/future version.
- Missing and wrong-typed required field.
- Extra field behavior according to the chosen strictness.
- Malformed base64url or branded bytes.
- Duplicate IDs and invalid numeric values where relevant.
- Proof that no crypto or write port is called after decode failure.
- Valid current artifacts round-trip without changing signed/authenticated
  content.

## Dependencies and independence

This is not one standalone implementation. Complete Finding 28's inventory
first, then perform the boundary inventory and deliver each artifact slice as a
separate branch. Coordinate snapshot slices with Finding 17 and identity slices
with Finding 22 to avoid conflicting contract changes.

## Non-goals

- Do not introduce automatic migrations.
- Do not build one universal schema framework.
- Do not validate AWS-specific provider fields in core.

## Completion evidence

For every slice, name the production decoder call site and run its adapter tests,
focused core tests, type-checks, and the full core suite. Finding 20 closes only
when every hostile artifact family has an explicit runtime owner.
