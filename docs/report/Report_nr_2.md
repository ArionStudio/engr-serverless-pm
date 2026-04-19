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
- AWS Cognito
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
  remove unlocked working state from `storage.session` and persist final encrypted
  vault state if needed

- password entry CRUD: \
  requires: `vault unlock` \
  create, update, and remove password entries in the unlocked vault state stored in
  `storage.session`

- password search: \
  requires: `vault unlock` \
  access the unlocked vault state from `storage.session` and search for matching
  password entries

- password generation: \
  generate a secure random password according to selected password rules

- clipboard copy: \
  requires: `vault unlock` \
  copy selected credential data to the clipboard and attempt to clear it after a timeout

- autofill: \
  requires: `vault unlock` \
  after explicit user action, pass only the required login and password to the content
  script and fill the appropriate fields on the target page

- setup cloud sync: \
  requires: `vault initialization` \
  authenticate to the sync layer, establish access to Cognito and S3, and store locally
  protected sync configuration and credentials

- sync upload: \
  requires: `setup cloud sync` \
  upload the current encrypted vault snapshot and related metadata to S3 using locally
  protected sync configuration

- sync download: \
  requires: `setup cloud sync` \
  download the latest encrypted vault snapshot and related metadata from S3 using locally
  protected sync configuration

- sync conflict resolution: \
  uses: `sync download` \
  may trigger: `sync upload` \
  compare local and remote vault state, resolve conflicts according to sync rules,
  persist the resolved state locally, and upload it if required

- vault cloud backup deletion: \
  requires: `setup cloud sync` \
  delete all vault data stored in the cloud and remove local sync configuration and
  credentials

- device enrollment initialization: \
  requires: `vault initialization` \
  create a protected enrollment package for a new device and provide the enrollment
  secret to the user

- device enrollment perform: \
  requires: `device enrollment initialization` \
  may trigger: `sync download` \
  use the enrollment package and enrollment secret to establish trust, provision local
  device state, and join the existing vault

- device revocation: \
  requires: `device enrollment perform` \
  may trigger: `sync upload` \
  remove a device from the trusted device set and update vault access state so it can no
  longer participate as an authorized device

- vault access recovery: \
  recover vault access when the master password is forgotten using recovery secret and re-protect local access with a new master password

- vault deletion: \
  uses: `vault lock` \
  may trigger: `vault cloud backup deletion` \
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
- `cloud sync credentials` - sync configuration needed to authenticate with `AWS Cognito` and access the correct `S3 bucket`; stored locally encrypted with a dedicated master-password-derived protection key
- `vault snapshot` - canonical encrypted and authenticated vault state stored locally and optionally in the sync layer
- `local sync state` - locally stored information needed to compare local and remote vault states
- `trusted device` - device registered in the vault and allowed to decrypt, verify, sign, and extend device trust
- `trusted public device keys` - registered public signing keys and public agreement keys of devices trusted by the vault
- `enrollment package` - encrypted bootstrap payload transferred by the user and used to register a new device to an existing synced vault
- `enrollment secret` - high-entropy secret used to decrypt and authenticate the `enrollment package`

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
- `AWS Cognito`
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
11. Extension service worker -> AWS Cognito
12. AWS Cognito -> Extension service worker
13. Extension service worker -> AWS S3
14. AWS S3 -> Extension service worker
15. Extension service worker -> Content script
16. Content script -> Extension service worker
17. Content script -> Web page / DOM
18. Web page / DOM -> Content script
19. Extension service worker -> Clipboard
20. Clipboard -> User

#### Boundary assumptions

- Only the volatile memory of the `extension service worker` is trusted to hold plaintext vault data and active cryptographic key material.
- `Popup` and `Options page` are less-trusted extension contexts and must not be treated as long-term storage for plaintext secrets or cryptographic keys.
- `Content script` is outside the main trusted cryptographic boundary.
- The `web page / DOM` is treated as hostile and may observe, modify, or misuse data exposed to it.
- `IndexedDB` is treated as hostile local storage and may be read, modified, deleted, or rolled back by an attacker.
- `AWS S3` is treated as hostile remote storage and may be read, modified, deleted, or rolled back by an attacker.
- `AWS Cognito` is used only to obtain temporary credentials for access to the `AWS S3` bucket, and nothing else.
- `Chrome extension isolation` is assumed to work correctly, so other websites and other extensions cannot directly read the `extension service worker` memory.
- The `browser extension permission model` is assumed to be correctly enforced by Chrome.
- `WebCrypto API` and `crypto.getRandomValues()` are assumed to be correctly implemented by the browser.
- Trusted device public keys are assumed authentic only after explicit enrollment or verification performed by the user or by an already trusted device.
- The browser, operating system, and device running the extension are assumed not to be compromised by malware, a malicious browser binary, or memory-extraction attacks.

#### Security consequences of boundary crossings

- Data written from the `extension service worker` to `IndexedDB` or uploaded to `AWS S3` must already be encrypted and authenticated before crossing the boundary.
- Data loaded from `IndexedDB` or `AWS S3` must be treated as untrusted until its structure, authenticity, and freshness are verified.
- The `message-passing boundary` between `popup`, `options page`, `content script`, and `extension service worker` is not trusted by default; privileged operations must depend on explicit validation of the sender and request type.
- Once a secret is copied to the `clipboard`, it is outside the trusted boundary and may be retained by clipboard managers, OS-level clipboard history, or other local applications.
- Once a secret is autofilled into a web page, it is outside the trusted boundary and becomes exposed to the security posture of the target page.
- Once an `enrollment secret` or `enrollment package` leaves the trusted boundary for transfer to another device, its confidentiality and authenticity depend on the security of the user-controlled transfer channel.

### Assumptions and security-relevant constraints

- The network is not trusted for vault confidentiality or integrity; these properties must be provided by client-side cryptography.
- `User-controlled device enrollment` is assumed to be performed carefully; if the user enrolls a malicious device, that device becomes trusted by the vault.
- `Remote freshness` cannot be assumed from cloud state alone; remote data may be stale, replayed, or rolled back.
- `Deletion` from `IndexedDB` or `AWS S3` is assumed to remove logical access only, not guarantee physical erasure from underlying storage media.
- The user is assumed to choose a strong and unique master password.
- Offline password-guessing attacks are assumed to be possible if an attacker obtains encrypted vault data.

### Open architecture questions

1. Where should unlocked vault state live after unlock in MV3?

- https://bitwarden.com/nl-nl/blog/bitwarden-manifest-v3/

2. How to implement properly copy to clipboard and clear clipboard after timeout?
3. How should local sync credentials be protected and which master-password-derived key should encrypt them?
4. How should changes to unlocked vault state be persisted after add, update, remove and conflict resolution flows?
5. How should device revocation work exactly: remove only device keys, or rotate VaultKey and secret key too?
6. What exact data should be stored in runtime unlocked state and how should UI read it in MV3?
7. Which actions should require re-authentication?
8. What should be the exact sync trigger policy?
9. In what order should delete vault remove remote and local state and what should happen when remote delete fails?
10. What exact fields should be included in enrollment package and how should package expiry and verification work?
11. What exact autofill boundary should exist between `extension service worker` and `content script`?

### Implementation ideas

- for password search we use
  #for searching in tags,
  @for searching in emails,
  ?for searching in urls and
  / for searching in folders
- conflict resolution should work like git merge on decrypted vault state
- `extension service worker` should compare local and remote decrypted entries and detect added, removed and updated entries
- `popup` should show conflict list with entry diffs
- when one entry was updated differently on two devices `popup` should show field-level diffs and allow `user` to choose, combine or change entry content
- new device enrollment should require already trusted device to create enrollment package
- enrollment package should contain only bootstrap data needed to get, verify and decrypt vault from sync
- enrollment package should be encrypted with a high-entropy enrollment secret, not with recovery secret
- enrollment secret can be shown as string, saved, or generated as qr for transfer to new device
- enrollment package should also be passed to user as string, file or qr payload for transfer to new device
- compromise of enrollment package should have smaller blast radius than compromise of vault recovery secrets
- local <u>sync credentials</u> should be encrypted with dedicated master-password-derived config key, not with device keys
- temporary AWS credentials should stay runtime-only and should not be persisted in `indexedDB`
