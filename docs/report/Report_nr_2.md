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
- Allow user to unlock and lock its vault
- Allow user to add, update and remove password entries
- Allow user to organize password entries using folders and tags
- Allow user to search for password entries
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
  creates recovery secret key, create the initial vault state, encrypt and authenticate it, and persist it in local storage

- vault unlock: \
  requires: `vault initialization` \
  use the master password to unlock locally protected key material, decrypt the stored
  vault state, create the unlocked working state, and store the fully unlocked vault
  in `storage.session`

- vault lock: \
  requires: `vault unlock` \
  remove unlocked working state from `storage.session` and clear temporary runtime state;
  There should be no unpersisted vault changes at this step because each vault change automatically creates a new encrypted `vault snapshot`.

- password entry CRUD: \
  requires: `vault unlock` \
  create, update, and remove password entries in the unlocked vault state stored in
  `storage.session`, then create and persist a new encrypted `vault snapshot` in
  `IndexedDB`

- password search: \
  requires: `vault unlock` \
  access the unlocked vault state from `storage.session` and search for matching
  password entries

- password generation: \
  generate a secure random password according to selected password rules

- username generation: \
  generate random but accessible username (it's for account anonimization <upgrade desc>)

- clipboard copy: \
  requires: `vault unlock` \
  copy selected credential data to the clipboard and attempt to clear it after a timeout

- autofill: \
  requires: `vault unlock` \
  after explicit user action, pass only the required login and password to the content
  script and fill the appropriate fields on the target page

- setup cloud sync: \
  requires: `vault unlock` \
  validate user-provided S3 configuration and AWS access credentials, then store locally protected sync configuration and credentials

- sync upload: \
  requires: `setup cloud sync` \
  upload the latest persisted encrypted vault snapshot and related metadata to S3 using locally
  protected sync configuration \
  note: action should trigger automatically on vault lock

- sync download: \
  requires: `setup cloud sync` \
  download the latest encrypted vault snapshot and related metadata from S3 using locally
  protected sync configuration \
  note: action should trigger automatically on vault unlock

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
  remove local sync state and locally protected sync credentials to disable sync while
  keeping the local vault available; if cloud files still exist, remove them first so
  orphaned remote files do not remain in the cloud

- device enrollment initialization: \
  [ Need further consultation on topic ]

- device enrollment perform: \
  [ Need further consultation on topic ]

- device revocation: \
  requires: `device enrollment perform` \
  may trigger: `sync upload` \
  remove a device from the trusted device set and update vault access state so it can no
  longer participate as an authorized device

- vault access recovery: \
  recover vault access when the master password is forgotten using recovery secret and re-protect local access with a new master password

- vault deletion: \
  uses: `vault lock` \
  may trigger: `remove files from cloud sync`, `remove local sync credentials` \
  permanently delete all local vault data from the device, including encrypted vault
  state, protected local keys, session state

### Data stores

- `indexedDB` - long lived encrypted data
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
- `full entry details` - password entry data with password value
- `entry identifications` - entry name, matched site/domain, and login identifier needed to let the user choose the correct entry
- `cloud sync credentials` - user-provided AWS access keys and S3 configuration, such as bucket, region, and object prefix, used to access the configured `S3 bucket`; stored locally encrypted with a dedicated master-password-derived protection key
- `vault snapshot` - canonical encrypted and authenticated vault state stored locally and optionally in the sync layer
- `local sync state` - locally stored information needed to compare local and remote vault states
- `trusted device` - device registered in the vault and allowed to decrypt, verify, sign, and extend device trust
- `trusted public device keys` - registered public signing keys and public agreement keys of devices trusted by the vault
- `enrollment package` - [ Need further consultation on topic ]
- `enrollment secret` - [ Need further consultation on topic ]

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
- New-device enrollment trust assumptions: [ Need further consultation on topic ]
- The browser, operating system, and device running the extension are assumed not to be compromised by malware, a malicious browser binary, or memory-extraction attacks.

#### Security consequences of boundary crossings

- Data written from the `extension service worker` to `IndexedDB` or uploaded to `AWS S3` must already be encrypted and authenticated before crossing the boundary.
- Data loaded from `IndexedDB` or `AWS S3` must be treated as untrusted until its structure, authenticity, and freshness are verified.
- The `message-passing boundary` between `popup`, `options page`, `content script`, and `extension service worker` is not trusted by default; privileged operations must depend on explicit validation of the sender and request type.
- Once a secret is copied to the `clipboard`, it is outside the trusted boundary and may be retained by clipboard managers, OS-level clipboard history, or other local applications.
- Once a secret is autofilled into a web page, it is outside the trusted boundary and becomes exposed to the security posture of the target page.
- New-device enrollment boundary consequences: [ Need further consultation on topic ]

### Assumptions and security-relevant constraints

- The network is not trusted for vault confidentiality or integrity; these properties must be provided by client-side cryptography.
- User-controlled device enrollment assumptions: [ Need further consultation on topic ]
- `Remote freshness` cannot be assumed from cloud state alone; remote data may be stale, replayed, or rolled back.
- `Deletion` from `IndexedDB` or `AWS S3` is assumed to remove logical access only, not guarantee physical erasure from underlying storage media.
- The user is assumed to choose a strong and unique master password.
- Offline password-guessing attacks are assumed to be possible if an attacker obtains encrypted vault data.

### Open architecture questions

1. Where should unlocked vault state live after unlock in MV3?

- https://bitwarden.com/nl-nl/blog/bitwarden-manifest-v3/
  After research we come to conclusion that unlocked vault should live in `storage.session` with [setAccessLevel()](https://developer.chrome.com/docs/extensions/reference/api/storage/StorageArea#method-StorageArea-setAccessLevel) seted to default "TRUSTED_CONTEXTS"

2. How to implement properly copy to clipboard and clear clipboard after timeout?
3. How should device revocation work exactly: remove only device keys, or rotate VaultKey and secret key too?
   Device revocation should rotate vault key so new items can't be accuired using old keys, secret key also need to be revoked because it slot need to be encrypted again. NOT-SURE: RECRYPT OR ROTATE
4. What exact data should be stored in runtime unlocked state and how should UI read it in MV3?
   In the voliatile memory we only use our state to process current operations because - NEED FOR FINISH
5. Which actions should require re-authentication?
   Its not like we can do re-authentication because it only unlock data and there is no way to check it against sth because we dont save it - NOT-SURE
6. What should be the exact sync trigger policy? ???

### Implementation ideas

- for password search we use:
  - `#` for tags
  - `@` for emails
  - `?` for urls
  - `/` for folders
- conflict resolution should work like git merge on decrypted vault state
- `extension service worker` should compare local and remote decrypted entries and detect added, removed and updated entries
- `popup` should show conflict list with entry diffs
- when one entry was updated differently on two devices `popup` should show field-level diffs and allow `user` to choose, combine or change entry content
- local <u>sync credentials</u> should be encrypted with dedicated master-password-derived config key, not with device keys

### New device enrollment notes

What the enrollment design should provide:

- an already trusted device must authorize adding a new trusted device
- the new device should generate its own long-term device agreement and signing private keys locally
- enrollment should not require using the recovery secret
- enrollment should support a practical PC1 -> transfer channel or phone -> PC2 path without requiring the user to go back from PC2 to PC1
- enrollment may use S3 presigned links as a transport mechanism for protected enrollment material
- S3 and the transfer channel must be treated as untrusted; enrollment material must be protected by client-side cryptography

What the enrollment design should avoid:

- do not generate the new device's long-term private keys on another device, because private device identity should originate on the device that owns it
- do not use the recovery secret for normal enrollment, because it is reserved for access recovery
- do not protect enrollment material directly with the master password, because captured enrollment material would allow offline guessing attacks against the master password
- do not store plaintext vault data, plaintext sync credentials, or plaintext device private keys in S3 or in user-transferable enrollment material
- avoid enrollment material that gives unlimited offline access to a captured vault snapshot where possible; if this tradeoff is accepted for usability, document it explicitly

Available enrollment options:

- package-based enrollment: an already trusted device creates an encrypted enrollment package, optionally transported through a short-lived S3 presigned link; this is the most usable option, but package compromise can have high impact depending on package contents
- device-bound enrollment: the new device creates public keys first and enrollment material is encrypted to those public keys; this reduces transfer-channel risk but requires a more complex pairing flow
- trusted-phone enrollment: a phone that is already a trusted vault device approves PC2 and encrypts bootstrap data to PC2's public key; this is a strong future option, but requires a phone app and phone-as-device support
- asynchronous request/approval through S3: the new device posts a public enrollment request and an existing trusted device approves it later; this is safer than a generic package but less usable for v1
