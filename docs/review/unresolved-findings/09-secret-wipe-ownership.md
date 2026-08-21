# Work Packet: Assign and Implement Best-Effort Secret Wiping

Finding: 23.

Resolution unit: **work item 11**. Finding 23 is the final slice after Findings
21 and 11 establish the cleanup/session owners in the companion
[session-lifecycle packet](01-session-lifecycle.md); do not dispatch it alone.

Status: open and cross-layer. The utility exists, but production ownership does
not.

## Verified current behavior

[`secureWipe`](../../../packages/core/src/lib/secure-wipe.utils.ts#L15) has unit
tests but no production caller. Hot session material contains raw vault, signing,
wrapping, local-protection, and payload keys. Lifecycle use cases also create
derived root/protection/recovery keys that are left to garbage collection.

The extension serializes session buffers to base64 strings for Chrome storage.
Removing the record drops the serialized copy but does not zero immutable
strings, engine copies, WebCrypto-internal material, or attacker snapshots of
storage. This task is therefore best-effort memory hygiene, not guaranteed
erasure.

## Decision gate: buffer ownership

Before adding a wipe call, inventory every secret buffer and answer:

- Which function creates it?
- Is it a unique buffer or a view/shared reference?
- Which layer owns the last legitimate use?
- Is a copy persisted or imported into WebCrypto?
- Which success and failure exits end ownership?
- Can wiping this reference corrupt still-active session state?

At minimum cover vault master keys, signing and wrapping private keys, local
protection keys, session payload keys, derived root/protection keys, recovery
keys, and decoded adapter buffers.

## Recommended phased implementation

### Phase 1: ephemeral use-case buffers

Wrap locally created derived/recovery material in `try/finally` and wipe only
after its final crypto operation. Start with one workflow and prove the pattern
before expanding.

### Phase 2: session material removal

At the established session owner, obtain the owned hot material, attempt both
repository removals, and wipe owned buffers without preventing remaining
cleanup. Preserve the existing first-failure semantics. Do not wipe buffers that
are still referenced by an active session generation.

### Phase 3: adapter copies

Wipe temporary decoded byte arrays where the adapter owns mutable copies. Remove
serialized records, while documenting that JavaScript strings and browser
storage history cannot be reliably zeroed.

## Reuse map

| Responsibility                        | Owner                                        |
| ------------------------------------- | -------------------------------------------- |
| Byte overwrite                        | Existing `secureWipe` utility                |
| Active-session generation and removal | `UnlockedVaultSessionService`                |
| Lifecycle cleanup ordering            | Finding 21's shared cleanup owner            |
| Serialized session copies             | Chrome/IndexedDB session adapters            |
| Ephemeral derivation lifetime         | The use case that receives the crypto result |

## Required regression tests

- Seed every tested buffer with nonzero bytes and assert zeroing after success.
- Assert zeroing after each downstream dependency failure.
- Prove all remaining cleanup attempts run when wiping or repository removal
  encounters an error.
- Prove stale session operations cannot wipe a newer active generation.
- Prove buffers needed by a successful active session remain intact.
- Adapter tests remove persisted records and wipe mutable temporary arrays.

## Dependencies and independence

This is not a safe standalone mechanical replacement. Complete the lifecycle
cleanup ownership from Finding 21 first. Core and adapter phases may be separate
branches only after the ownership inventory defines their non-overlapping
buffers.

## Non-goals and claims to avoid

- Do not claim guaranteed memory erasure in JavaScript.
- Do not attempt to mutate strings such as master passwords or mnemonics.
- Do not wipe shared buffers before the final consumer.
- Do not add comments as a substitute for production calls and tests.

## Completion evidence

Publish the ownership inventory with the implementation. Run session,
lifecycle, crypto-adjacent, and adapter tests plus type-checks and the full core
suite. Closure requires production call sites, not only utility tests.
