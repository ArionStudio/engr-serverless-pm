# System design report

### System goal

My system goal is to provide a password manager that:

- operates as a browser extension
- is local-first
- uses only the WebCrypto API for cryptographic operations
- provides an optional sync layer
- allows the same vault to be used across multiple devices through the sync layer
- uses a zero-knowledge approach for persisted and synced vault data
- ensures integrity and authenticity of persisted and synced vault data

### Scope and out-of-scope

#### Scope

- Allow user to create and use a vault locally without creating a cloud account
- Allow user to list local vaults available on the current device
- Allow user to unlock and lock its vault
- Allow user to add, update and remove password entries
- Allow user to organize password entries using tags
- Allow user to search for password entries
- Allow user to reveal password values from an unlocked vault
- Allow user to copy password entries to clipboard
- Allow user to generate strong passwords
- Allow user to autofill password from popup
- Allow user to recover access to vault from device
- Allow user to delete vault from device
- Allow user to optionally enable cloud sync, including:
  - pushing vault data to the cloud and pulling it back
  - registering a new device and enrolling it to an existing vault
  - revoking a device and removing it from the vault
  - deleting all data from the cloud

#### Out-of-scope

- importing and exporting password entries
- admin / team features
- any feature requiring our own custom backend/server logic
- storing other data types than passwords (for example secure notes, files, TOTP / 2FA secrets)
- sharing data between users
- allowing user to autofill password on page from inserted iframe

### External actors

- user
- AWS S3 bucket
- Target web page
- Clipboard

### System parts

- Popup
- Options page
- Extension service workers
- Content scripts

Component security responsibilities:

The extension service worker is the only component allowed to perform sensitive cryptographic operations and directly access persistent vault storage.
Popup and options page interact with vault operations through message passing to the extension service worker.
Content scripts receive only the login and password required for an explicit autofill action.

### System processes

- local key initialization: \
  create device-local cryptographic key material, protect it with the master password,
  and persist it in local storage

- vault initialization: \
  uses: `local key initialization` \
  generates a local vault display name, creates recovery key source material, returns the recovery key as a BIP39 mnemonic for one-time user display, creates the initial vault state, encrypts and signs it as the first `vault snapshot`, persists the local vault descriptor, device access material, and snapshot in local storage, and stores the newly unlocked vault in `storage.session`

- list local vaults: \
  read locally persisted non-secret `local vault descriptors` so the user can select which vault to unlock on a device that contains more than one local vault

- vault unlock: \
  requires: `vault initialization` \
  use the selected vault id and master password to load `device access material`, verify the persisted `vault snapshot`, unwrap local keys, unwrap the `vault master key` through the current device key slot, decrypt the stored vault state, create the unlocked working state, store a pending vault lock task with action id, schedule automatic vault lock at the user-selected lock time, and store the unlocked vault in `storage.session`

- vault lock: \
  requires: `vault unlock` \
  clear any active clipboard password copy, cancel its pending clear task, remove unlocked working state from `storage.session`, and clear temporary runtime state;
  There should be no unpersisted vault changes at this step because each vault change automatically creates a new encrypted `vault snapshot`.

- password entry CRUD: \
  requires: `vault unlock` \
  create, update, and remove password entries in the unlocked vault state stored in
  `storage.session`, then create and persist a new encrypted `vault snapshot` in
  `IndexedDB`

- password search: \
  requires: `vault unlock` \
  access the unlocked vault state from `storage.session` and search for matching password entries using either an `any` matcher across searchable fields or a field matcher where provided fields are combined with `AND` logic

- password generation: \
  generate a secure random password according to selected password rules

- username generation: \
  generate random but accessible username (it's for account anonimization <upgrade desc>)

- clipboard copy: \
  requires: `vault unlock` \
  copy selected password value to the clipboard, clear any previous active copied password if it is still present, store a pending clipboard clear task, and schedule clipboard clear at the user-selected clear time

- clipboard clear: \
  requires: `vault unlock` or pending copied password state \
  run from a scheduled task or vault lock, clear the clipboard only when the active clipboard value still matches the copied password, then remove the pending clipboard clear task

- autofill: \
  requires: `vault unlock` \
  after explicit user action, get only the login and password needed for the selected entry, pass them to the content script, and fill the appropriate fields on the target page

- setup cloud sync: \
  requires: `vault unlock` \
  validate user-provided S3 configuration and AWS access credentials, then store sync configuration and credentials inside the encrypted vault payload

- sync upload: \
  requires: `setup cloud sync` \
  upload the latest persisted encrypted vault snapshot and related metadata to S3 using sync credentials from the unlocked vault \
  note: action should trigger automatically before vault lock clears the unlocked vault state

- sync download: \
  requires: `setup cloud sync` \
  download the latest encrypted vault snapshot and related metadata from S3 using sync credentials from the unlocked vault \
  note: action should trigger automatically after vault unlock

- sync conflict resolution: \
  requires: `vault unlock` \
  uses: `sync download` \
  may trigger: `sync upload` \
  compare decrypted local and remote vault states, resolve conflicts according to sync
  rules, persist the resolved state as a new encrypted `vault snapshot`, and upload it
  if required

- remove files from cloud sync: \
  requires: `setup cloud sync` \
  delete all vault data stored in the cloud while keeping the local vault and local sync
  configuration available

- remove local sync credentials: \
  requires: `setup cloud sync` \
  may trigger: `remove files from cloud sync` \
  remove local sync state and sync credentials from the encrypted vault payload to disable sync while
  keeping the local vault available; if cloud files still exist, remove them first so
  orphaned remote files do not remain in the cloud

- device enrollment initialization: \
  from an already trusted device, create a small encrypted enrollment package with vault id, trusted public device keys, and a digest-bound source descriptor for a separate encrypted vault snapshot; transfer the one-time enrollment secret separately

- device enrollment perform: \
  on the new device, decrypt the enrollment package, obtain the separate encrypted vault snapshot, verify its digest and signature, unlock it with normal vault unlock material, create local device keys, register the device, and sync if configured

- device revocation: \
  requires: `device enrollment perform` \
  may trigger: `sync upload` \
  remove a device from the trusted device set and update vault access state so it can no
  longer participate as an authorized device

- vault access recovery: \
  recover vault access when the master password is forgotten using the recovery mnemonic key and re-protect local access with a new master password

- vault deletion: \
  uses: `vault lock` \
  may trigger: `remove files from cloud sync`, `remove local sync credentials` \
  permanently delete all local vault data from the device, including the local vault descriptor, encrypted vault state, device access material, protected local keys, and session state

### Data stores

- `indexedDB` - long lived local data, including encrypted vault snapshots, device access material, sync state, and non-secret local vault descriptors
- `storage.session` - short lived data containing the fully unlocked vault during the unlocked vault stage
- `S3 bucket` - cloud storage for sync layer
- `runtime memory` - storage used during extension runtime

### Sensitive data / assets

Detailed version of sensitive data / assets is available in [Report_nr_2_Sensitive_Data_Assets.md](./Report_nr_2_Sensitive_Data_Assets.md).

### Main flows

Detailed version of the flows is available in [Report_nr_2_Main_Flows.md](./Report_nr_2_Main_Flows.md).

Notes:

- `uses` implies that if a nested element is used, the outer context is used too, unless stated otherwise
- `[ part ]` means the part is optional in that flow

Definitions:

- `entry details` - password entry data without password value
- `visible entry fields` - password entry fields returned for list and details views without the password value
- `full entry details` - password entry data with password value, used only for create/update input and explicit password access flows
- `entry identifications` - entry name, matched site/domain, and login identifier needed to let the user choose the correct entry
- `password search query` - discriminated query shape; `any` matches login, sanitized url, or tag names with `OR` logic, while field query combines login, url, and tag id filters with `AND` logic; field query tag ids use `all` matching
- `pending clipboard clear task` - short-lived unlocked-session metadata containing action id, copied value hash, and expiry timestamp; it does not store the password value and must be stored only in storage appropriate for sensitive runtime state
- `pending vault lock task` - short-lived task metadata containing action id, vault id, and expiry timestamp; scheduled vault lock uses it to ignore stale alarm executions
- `cloud sync credentials` - user-provided AWS access keys and S3 configuration, such as bucket, region, and object prefix, used to access the configured `S3 bucket`; stored inside the encrypted vault payload and available only after local vault unlock
- `local vault descriptor` - non-secret local metadata for a vault available on the current device, including vault id, generated display name, creation time, and optional last-unlocked time
- `device access material` - local persisted material needed to unlock one vault from the current device; contains salts, public signing key, and protected local keys, but no raw vault master key or raw recovery key
- `vault snapshot` - canonical encrypted and authenticated vault state stored locally and optionally in the sync layer
- `local sync state` - locally stored information needed to compare local and remote vault states
- `trusted device` - device registered in the vault and allowed to decrypt, verify, sign, and extend device trust
- `trusted public device keys` - registered public signing keys of devices trusted by the vault
- `enrollment package` - encrypted bootstrap metadata from an already trusted device; contains vault id, trusted public device keys, and a digest-bound source descriptor for a separate encrypted vault snapshot, but not the full snapshot, plaintext vault data, plaintext sync credentials, or device private keys
- `enrollment secret` - high-entropy one-time secret used to decrypt the enrollment package; transferred separately from the package

### Trust boundaries

#### Trust zones

External actor:

- `User`

Trusted zone:

- `Extension service worker` volatile runtime memory

Less trusted extension zone:

- `Popup`
- `Options page`
- `storage.session`

Untrusted storage and cloud-service zone:

- `IndexedDB`
- `AWS S3`

High-risk interaction zone:

- `Content script`
- `Web page / DOM`
- `Clipboard`

#### Boundary list

1. User -> Popup
2. User -> Options page
3. Popup -> Extension service worker
4. Options page -> Extension service worker
5. Extension service worker -> Popup
6. Extension service worker -> Options page
7. Extension service worker -> storage.session
8. storage.session -> Extension service worker
9. Extension service worker -> IndexedDB
10. IndexedDB -> Extension service worker
11. Extension service worker -> AWS S3
12. AWS S3 -> Extension service worker
13. Extension service worker -> Content script
14. Content script -> Extension service worker
15. Content script -> Web page / DOM
16. Web page / DOM -> Content script
17. Extension service worker -> Clipboard
18. Clipboard -> User

#### Boundary assumptions

- Plaintext vault data and active cryptographic key material may exist in two runtime places. The preferred trusted place is volatile `extension service worker` memory. Because of MV3 lifecycle limits, the unlocked vault is also stored in `storage.session` configured for trusted extension contexts only. `storage.session` is less trusted than service worker memory and must be cleared on vault lock.
- `Popup` and `Options page` are less-trusted extension contexts and must not be treated as long-term storage for plaintext secrets or cryptographic keys.
- `Content script` is outside the main trusted cryptographic boundary.
- The `web page / DOM` is treated as hostile and may observe, modify, or misuse data exposed to it.
- `IndexedDB` is treated as hostile local storage and may be read, modified, deleted, or rolled back by an attacker.
- `AWS S3` is treated as hostile remote storage and may be read, modified, deleted, or rolled back by an attacker.
- `Chrome extension isolation` is assumed to work correctly, so other websites and other extensions cannot directly read the `extension service worker` memory.
- The `browser extension permission model` is assumed to be correctly enforced by Chrome.
- `WebCrypto API` and `crypto.getRandomValues()` are assumed to be correctly implemented by the browser.
- New-device enrollment trust assumptions: an already trusted device authorizes enrollment; the enrollment package is protected by a one-time secret; the encrypted vault snapshot is transferred separately and must match the digest in the package; normal vault unlock material is still required.
- The browser, operating system, and device running the extension are assumed not to be compromised by malware, a malicious browser binary, or memory-extraction attacks.

#### Security consequences of boundary crossings

- Data written from the `extension service worker` to `IndexedDB` or uploaded to `AWS S3` must already be encrypted and authenticated before crossing the boundary.
- Data loaded from `IndexedDB` or `AWS S3` must be treated as untrusted until its structure, authenticity, and freshness are verified.
- The `message-passing boundary` between `popup`, `options page`, `content script`, and `extension service worker` is not trusted by default; privileged operations must depend on explicit validation of the sender and request type.
- Once a secret is copied to the `clipboard`, it is outside the trusted boundary and may be retained by clipboard managers, OS-level clipboard history, or other local applications.
- Once a secret is autofilled into a web page, it is outside the trusted boundary and becomes exposed to the security posture of the target page.
- New-device enrollment boundary consequences: enrollment package, enrollment secret, and encrypted snapshot transfer cross an untrusted user-controlled channel; the package must be encrypted, the snapshot digest must match, and the snapshot signature must verify before trust is extended.

### Assumptions and security-relevant constraints

- The network is not trusted for vault confidentiality or integrity; these properties must be provided by client-side cryptography.
- User-controlled device enrollment assumptions: the user can transfer the enrollment package, one-time secret, and encrypted snapshot file/link through separate channels and can provide the master password plus secret key on the new device.
- `Remote freshness` cannot be assumed from cloud state alone; remote data may be stale, replayed, or rolled back.
- `Deletion` from `IndexedDB` or `AWS S3` is assumed to remove logical access only, not guarantee physical erasure from underlying storage media.
- The user is assumed to choose a strong and unique master password.
- Offline password-guessing attacks are assumed to be possible if an attacker obtains encrypted vault data.

### Open architecture questions

1. Where should unlocked vault state live after unlock in MV3?

- https://bitwarden.com/nl-nl/blog/bitwarden-manifest-v3/
  After research we come to conclusion that unlocked vault should live in `storage.session` with [setAccessLevel()](https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-setAccessLevel) seted to default "TRUSTED_CONTEXTS"

2. How to implement properly copy to clipboard and clear clipboard after timeout?
   Use an extension scheduled task/alarm instead of plain `setTimeout`. The core stores only pending clear metadata and validates the current clipboard value against the unlocked vault entry before clearing it.
3. How should device revocation work exactly: remove only device keys, or rotate VaultKey and secret key too?
   Device revocation should rotate vault key so new items can't be accuired using old keys, secret key also need to be revoked because it slot need to be encrypted again. NOT-SURE: RECRYPT OR ROTATE
4. What exact data should be stored in runtime unlocked state and how should UI read it in MV3?
   In the voliatile memory we only use our state to process current operations because - NEED FOR FINISH
5. Which actions should require re-authentication?
   Its not like we can do re-authentication because it only unlock data and there is no way to check it against sth because we dont save it - NOT-SURE
6. What should be the exact sync trigger policy? ???

### Implementation ideas

- password search uses structured query input:
  - `any`: free-text matcher across searchable entry fields using `OR` logic
  - field query: login, url, and tag id filters combined with `AND` logic
  - tag filtering uses tag ids, not tag names
- conflict resolution should work like git merge on decrypted vault state
- `extension service worker` should compare local and remote decrypted entries and detect added, removed and updated entries
- `popup` should show conflict list with entry diffs
- when one entry was updated differently on two devices `popup` should show field-level diffs and allow `user` to choose, combine or change entry content
- local <u>sync credentials</u> should be encrypted as part of the vault payload, not as a standalone IndexedDB credential blob protected by a separate master-password-derived key

### New device enrollment notes

What the enrollment design should provide:

- an already trusted device must authorize adding a new trusted device
- the new device should generate its own long-term device slot key and signing private key locally
- enrollment should not require using the recovery mnemonic key
- enrollment should support a practical PC1 -> transfer channel or phone -> PC2 path without requiring the user to go back from PC2 to PC1
- enrollment package should stay small enough for QR/manual transfer and must not embed the full encrypted vault snapshot
- encrypted vault snapshot transfer should happen separately, either as a file or through a short-lived presigned link whose bytes are digest-bound by the enrollment package
- S3 and the transfer channel must be treated as untrusted; enrollment material and snapshot transfer must be protected by client-side cryptography
- the registered-device enrollment screen must show handling instructions: use trusted personal devices/channels, keep the enrollment secret separate when possible, avoid public/shared/AI tools, delete temporary copies, and cancel if exposure is suspected

What the enrollment design should avoid:

- do not generate the new device's long-term private keys on another device, because private device identity should originate on the device that owns it
- do not use the recovery mnemonic key for normal enrollment, because it is reserved for access recovery
- do not protect enrollment material directly with the master password, because captured enrollment material would allow offline guessing attacks against the master password
- do not store plaintext vault data, plaintext sync credentials, or plaintext device private keys in S3 or in user-transferable enrollment material
- do not embed the full encrypted vault snapshot in the enrollment package; QR-sized enrollment should carry only a snapshot source descriptor and expected digest

Available enrollment options:

- package-based enrollment: an already trusted device creates an encrypted enrollment package and separately provides the encrypted vault snapshot as a file or short-lived presigned link; this is the most usable option while keeping QR/package size bounded
- device-bound enrollment: the new device creates public keys first and enrollment material is encrypted to those public keys; this reduces transfer-channel risk but requires a more complex pairing flow
- trusted-phone enrollment: a phone that is already a trusted vault device approves PC2 and encrypts bootstrap data to PC2's public key; this is a strong future option, but requires a phone app and phone-as-device support
- asynchronous request/approval through S3: the new device posts a public enrollment request and an existing trusted device approves it later; this is safer than a generic package but less usable for v1
