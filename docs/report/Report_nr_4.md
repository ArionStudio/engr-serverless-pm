# Problems

## 1. Vault Access Recovery With Sync Enabled

### Problem

`vault access recovery` allows the user to recover access to the `vault master key` when the user has lost the master password.

The problem is that the master password protects local device access material, not only the `device slot key` but also the `device private signing key`. Those two are needed to use the vault as a trusted device.

So after losing the master password, the recovery key can recover the `vault master key`, but it does not recover the current device as a trusted signing device. Because of that, recovery cannot safely create normal synced vault updates.

### Proposed Solution

Rework recovery as recovery-authorized device enrollment.

In this model, the recovery key is used to recover the `vault master key`, and then the current device is added again as a trusted device with fresh local device access material.

The important flaw is that recovery is not only recovery. It is also an enrollment/trust update operation.

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
