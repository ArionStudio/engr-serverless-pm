# Problems

## 1. Vault Access Recovery With Sync Enabled

### Current Design

`vault access recovery` allows the user to recover access when the master
password is lost. The recovery backup protects the complete local key payload,
including the current device's private signing and wrapping keys, so recovery
restores the existing surviving device identity rather than enrolling a fresh
identity.

Recovery re-protects that payload with the new master password and a replacement
recovery mnemonic, then atomically replaces the current local access material
and recovery backup. It does not change the signed trust state or start a sync
update.

This replacement does not revoke retained older backup copies or their words.
Those copies remain usable while the restored identity remains trusted; see the
[accepted recovery limitation](../security/security-specification.md#86-device-access-recovery).

## 2. Session Vault Storage Budget

### Current Limits

`storage.session` hard limit is treated as `10 MiB`.

For compatibility calculations we reserve `1 MiB` of headroom, so the working budget for the unlocked vault payload is `9 MiB`.

Current password entry limits:

- `id`: string, `1..128` characters
- `password`: string, `1..512` characters
- `login`: string, `0..128` characters
- `tags`: up to `10` numeric tag ids
- `sanitizedUrl`: string, `1..512` characters

Current tag limits:

- `id`: non-negative integer
- `name`: string, `1..32` characters

Stored entry URLs are sanitized before saving:

- query string is stripped
- hash is stripped
- protocol, host, port, and path are kept

### Compatibility Baseline

For the current data model we calculated that the hard supported password entry baseline is `5000` worst-case entries.

This is not only a one-time measurement. Future application versions should continue to pass this `5000` entry baseline so older vaults that fit the current model remain usable after upgrades.

The compatibility test uses:

- `5000` worst-case password entries
- `250` max-size vault tags
- `20` registered devices
- session vault wrapper data, including vault id, device id, vault master key, and device private signing key placeholders

Current measured result:

- `5000` worst-case entries use about `6.63 MiB`
- this is about `66.30%` of the `10 MiB` hard session limit
- current estimated max within the `9 MiB` working budget is `6778` worst-case entries

This means the current `5000` entry baseline has about `1778` worst-case entries of margin.

## 3. Clipboard History Cannot Always Be Controlled From Browser Extension

### Problem

Copying a password to the system clipboard moves the secret outside the extension trust boundary.

Clipboard auto-clear only targets the active clipboard value.

Clipboard auto-clear does not clean copied values from:

- operating system clipboard history
- cloud clipboard synchronization
- mobile keyboard clipboard history
- desktop environment clipboard history
- third-party clipboard managers

Windows example:

- native formats: `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory`, `CanUploadToCloudClipboard`
- purpose: exclude clipboard content from Windows clipboard history or cloud clipboard
- browser extension limitation: `navigator.clipboard.writeText()` and `document.execCommand("copy")` cannot reliably set this metadata

Other systems can have different clipboard-history exclusion mechanisms or no reliable exclusion mechanism.

The browser extension cannot implement proper clipboard-history cleaning.

### Proposed Handling

Mark this as a known platform limitation.

The UI should inform the user after copying a secret that clipboard clearing is best effort and does not clean clipboard history or clipboard synchronization features outside the extension.

The application must not present clipboard auto-clear as full clipboard-history protection.

## 4. Project name:

eng: Local-First Serverless Password Manager as a WebExtension
polish: Lokalny menedżer haseł w architekturze bezserwerowej jako rozszerzenie przeglądarki
