# Core security model

Status: current implementation summary

This page explains how core applies the current project security model. It does
not restate cryptographic parameters or serialized formats. Active
algorithm-suite constants, exported contracts, extension codecs, and tests
define those implementation details. The
[v1 security specification](../security/security-specification.md) is retained
as a non-normative legacy design reference.

## Trust boundary

Core assumes that IndexedDB, durable Chrome storage, downloaded files, and
cloud storage can be read, modified, removed, or rolled back by an attacker.
Durably persisted data is therefore encrypted or non-secret, and core verifies
identity, signatures, trust state, algorithm suite, and rollback checkpoints
before accepting protected state.

Runtime-owned plaintext vault data and usable private key material exist only
in trusted, volatile extension memory. Lifecycle and review operations may own
secret buffers transiently; after successful activation, ownership transfers
to the unlocked session. UI-facing read and search results omit entry
passwords. Dedicated retrieval returns a password to its caller, while the
clipboard workflow deliberately exports plaintext to the operating-system
clipboard. Its ownership check and scheduled clearing reduce exposure but
cannot make the clipboard trusted or guarantee erasure.

## Key responsibilities

| Material                    | Responsibility                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Master password             | Derives local protection for this device; it is not stored and is not the vault content key |
| Recovery words              | Open the current local recovery backup for one device identity                              |
| Vault master key            | Encrypts the vault snapshot content                                                         |
| Device signing key pair     | Signs snapshots, trust certificates, enrollment artifacts, and local rollback checkpoints   |
| Device vault key pair       | Opens the vault-key envelope addressed to that device                                       |
| Device-local protection key | Encrypts device-local provider credential state                                             |
| Session payload key         | Encrypts the vault portion of the split unlocked session                                    |

Secret buffers owned by core are wiped on success and failure where the
runtime representation permits it. JavaScript and WebCrypto cannot guarantee
physical memory erasure, so this remains best-effort cleanup.

## Snapshot acceptance

A vault snapshot is accepted only after core verifies its algorithm suite,
schema and vault identity, trust chain, creator authorization, signature, key
generation, and expected rollback state. Core then opens the current device's
vault-key envelope and decrypts the vault content.

The local trust anchor pins the genesis device. Relative to the retained local
checkpoint, core detects snapshot-only rollback, same-vector conflicting
content, and trust forks. An attacker who restores every local record to a
mutually consistent older state can also restore the checkpoint; detecting
that requires an independent trusted freshness source.

## Local access and recovery

The master password protects the current device's private keys, not a copy of
the vault itself. The recovery backup protects the same local key payload with
a recovery-derived key. Access material and recovery backup revisions are
updated together with compare-and-swap expectations.

Changing the master password rewraps local access material. Recovery creates
new local password and recovery protection after verifying that the backup,
snapshot, trust chain, checkpoint, public keys, and private keys describe the
same trusted device.

Replacing the current recovery backup does not revoke older recovery words for
retained backup copies. Without a trusted remote authority, local code cannot
prove that every older copy has been destroyed.

## Unlocked session

The session separates sensitive key material from an encrypted vault payload.
Core checks that both records have the same session and vault IDs. The device
ID belongs to the material record. The encrypted payload's source version may
equal or advance the material's version after payload-first persistence, but
must never be older or divergent.

The extension stores active material in volatile `chrome.storage.session`,
which the runtime threat model treats as trusted session memory rather than
hostile durable storage. Its encoded string copies still inherit JavaScript and
browser limitations on guaranteed erasure.

Mutations and lifecycle operations prove they still own the active session
before persistence and before committing updated session state. Auto-lock and
clipboard timers carry action IDs so delayed callbacks do not clear a newer
session or clipboard value.

## Sync and remote storage

Only signed encrypted snapshots are sent to the sync provider. The synchronized
vault contains a provider-neutral target, while each device stores provider
credentials separately in encrypted local state.

Remote upload and deletion use an expected snapshot identity. Core rejects a
remote descriptor, digest, or trust state that changed since review. A verified
`remote_ahead` snapshot can be prepared for item-level review, and apply
requires the reviewed identities and explicit resolution. Crossed version
vectors fail as unsupported concurrency or an integrity error; core does not
merge concurrent branches.

Device revocation rotates trust and vault-key state. Provider credential
revocation is a separate external process, so core records whether old
credentials are still awaiting deletion and verifies that they no longer have
access before clearing the marker.

## Runtime limitations

- The browser runtime can reduce secret lifetime but cannot guarantee memory
  erasure.
- Local rollback detection is bounded by the checkpoint presented from the
  current installation and cannot detect coordinated restoration of all local
  records.
- Enrollment transfer files are untrusted input and must be verified before
  use.
- Device enrollment expiry is not a core security boundary because core has no
  trusted time authority.
- Losing all current device access material and usable recovery material makes
  encrypted vault content unrecoverable.

## Related sources

- [Legacy v1 security specification](../security/security-specification.md)
- [Multi-device design](../design/multi-device-setup.md)
- [Sync design](../design/sync-strategy.md)
- [Cryptography standard](../standards/cryptography-and-secret-ownership.md)
- [Snapshot and sync standard](../standards/snapshots-trust-and-sync.md)
