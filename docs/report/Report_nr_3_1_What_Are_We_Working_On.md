# Threat Modeling - Part 1

## What are we working on?

This part defines the system model that will be used by the later threat modeling stages. Its goal is to describe the system clearly enough to support DFD preparation, trust-boundary analysis, and later STRIDE-based threat identification.

As a base, this part uses the prepared [System Design Report](./Report_nr_2.md).

## 1. Modeling objective

### 1.1 Purpose of this part

The main purpose of this part is to answer the first question: "What are we working on?" It helps us understand what we are building. Understanding the system is necessary before identifying threats, planning mitigations, and evaluating whether the analysis is complete enough.

### 1.2 Scope of the system

#### In scope

- Allow the user to create and use a vault locally without creating a cloud account.
- Allow the user to unlock and lock the vault.
- Allow the user to add, update, and remove password entries.
- Allow the user to organize password entries using folders and tags.
- Allow the user to search for password entries.
- Allow the user to copy password entries to the clipboard.
- Allow the user to generate strong passwords.
- Allow the user to autofill a password from the extension popup.
- Allow the user to recover access to the vault from a device.
- Allow the user to delete the vault from a device.
- Allow the user to optionally enable cloud sync, including:
  - pushing vault data to the cloud and pulling it back
  - registering a new device and enrolling it into an existing vault
  - revoking a device and removing it from the vault
  - deleting all data from the cloud

#### Out of scope

- Importing and exporting password entries.
- Admin or team features.
- Any feature requiring our own custom backend or server logic.
- Storing other data types than passwords, for example secure notes, files, or TOTP / 2FA secrets.
- Sharing data between users.
- Allowing the user to autofill a password on a page from an inserted iframe.

### 1.3 System goal and business purpose

The system is a local-first browser extension password manager that securely stores, manages, and uses passwords with client-side cryptography based on the WebCrypto API. Its purpose is to provide users with convenient everyday password management while preserving confidentiality, integrity, and authenticity of vault data, including when optional cloud sync is used across multiple devices.

### 1.4 Modeling approach used

This part uses the OWASP Threat Modeling Process as the main methodology for system understanding and DFD preparation. The output of this part is the system model that will later be used in Part 2 for STRIDE-based threat identification.

---

## 2. System overview

### 2.1 High-level description of the system

The system is a password manager implemented as a browser extension. As the standard, we use Manifest V3, and because of that it consists of the following elements:

1. UI - popup and options page
2. background service worker
3. content scripts

Content scripts are used only for autofill interactions with web pages.
The central element of the app is the `background service worker`. It is responsible for handling cryptographic operations, transferring data to persistent storage, and cloud synchronization. Vault data is stored in four places:

1. volatile memory of the `background service worker` - unencrypted - when performing cryptographic operations
2. `storage.session` - unencrypted - when keeping data during the session
3. `IndexedDB` - encrypted - as persistent local storage
4. `AWS S3 bucket` - encrypted - for sync and backup

The sync part is optional and requires full configuration of the AWS S3 provider.

### 2.2 Main security properties expected from the system

1. `Confidentiality` is expected for the password vault, including password entries and their metadata, all generated secret keys, and sync credentials.
2. `Integrity` is expected for the password vault and its stored contents.
3. `Authenticity` is expected for the vault owner, registered trusted devices, and the background service worker.
4. `Availability`: the vault should remain available when the device is offline.

### 2.3 Technology and environment context

| Area                          | Description                                         |
| ----------------------------- | --------------------------------------------------- |
| Application type              | browser extension                                   |
| Main runtime environment      | Manifest V3 browser extension environment           |
| UI / implementation stack     | `React`, `TypeScript`                               |
| Local storage                 | `IndexedDB`, `storage.session`                      |
| Cryptography                  | `WebCrypto API`                                     |
| Cloud dependencies            | `AWS S3 bucket`                                     |
| External interaction surfaces | web pages, clipboard, browser APIs, message passing |

---

## 3. External entities

Describe all entities outside the modeled core that interact with the system.

**User** \
Type: human. \
Why it is external: The user is outside the modeled extension core and initiates security-relevant actions. \
Main interactions with the system: Creates the vault, unlocks it, manages entries, starts sync, and performs recovery or deletion actions.

**AWS S3 bucket** \
Type: service. \
Why it is external: It is external remote storage used by the optional sync layer. \
Main interactions with the system: Stores and returns encrypted vault snapshots and related sync metadata.

**Target web page** \
Type: platform. \
Why it is external: It is outside the extension trust boundary and belongs to the external browsing environment. \
Main interactions with the system: Receives autofilled credentials through the content script during explicit user-initiated autofill.

**Clipboard** \
Type: platform. \
Why it is external: It is controlled by the browser and operating system rather than by the extension core. \
Main interactions with the system: Temporarily receives copied credential data for user use outside the extension.

### 3.1 Notes on external dependencies

`AWS S3`, target web pages, and the clipboard are treated as external dependencies and black boxes from the perspective of the extension. The system uses user-provided AWS access credentials and S3 configuration only to access the configured `AWS S3 bucket`, while the bucket remains outside the trusted cryptographic core. Target web pages and the clipboard are treated as high-risk external environments because once data is exposed to them, the extension can no longer fully control its confidentiality or use.`

---

## 4. Internal system components and processes

The following components execute logic and should appear as processes in DFDs.

**P1 Extension service worker** \
Responsibility: Performs cryptographic operations, coordinates vault logic, and accesses persistent storage and cloud sync services. \
Handles sensitive data: yes. \
Notes: This is the central security-sensitive component of the system.

**P2 Popup UI** \
Responsibility: Provides the main user interface for unlock, search, entry access, generation, copy, and autofill actions. \
Handles sensitive data: limited. \
Notes: Interacts with the extension service worker through message passing.

**P3 Options page** \
Responsibility: Provides the user interface for vault setup, recovery, sync setup, and device management. \
Handles sensitive data: limited. \
Notes: Used for configuration and administrative vault actions.

**P4 Content script** \
Responsibility: Interacts with the currently open web page during explicit autofill actions. \
Handles sensitive data: limited. \
Notes: Receives only the login and password needed for autofill.

### 4.1 Security responsibilities of components

The `extension service worker` is the most trusted component because it is the only component allowed to perform sensitive cryptographic operations and directly access persistent vault storage. The `popup` and `options page` are less-trusted extension contexts that can request operations, but they should not be treated as long-term holders of plaintext secrets or cryptographic keys. The `content script` is outside the main trusted cryptographic boundary because it operates near the target web page and receives only the minimal data needed for explicit autofill. The `storage.session` area is also less trusted than the service worker runtime because it temporarily contains the unlocked vault state during the unlocked stage.

### 4.2 Main system processes

The main system processes are:

**PR1 Local key initialization** \
Trigger: User starts initial vault setup. \
Purpose: Creates device-local cryptographic key material and protects it with keys derived from the master password. \
Data stores touched: `IndexedDB`, runtime memory.

**PR2 Vault initialization** \
Trigger: User creates a new vault. \
Purpose: Creates the initial vault state, generates the recovery secret, encrypts and authenticates the first vault snapshot, and persists it locally. \
Data stores touched: `IndexedDB`, runtime memory.

**PR3 Vault unlock** \
Trigger: User enters the master password and requests unlock. \
Purpose: Loads locally protected device state, derives protection keys, decrypts the stored vault snapshot, and creates the unlocked working state. \
Data stores touched: `IndexedDB`, `storage.session`, runtime memory.

**PR4 Vault lock** \
Trigger: User locks the vault or the extension locks it automatically. \
Purpose: Removes unlocked working state from session and runtime storage. Vault changes should already have created and persisted new encrypted vault snapshots before lock. \
Data stores touched: `storage.session`, runtime memory.

**PR5 Password entry CRUD** \
Trigger: User creates, updates, or removes password entries. \
Purpose: Modifies the unlocked vault state during the active session, then creates and persists a new encrypted vault snapshot. \
Data stores touched: `storage.session`, `IndexedDB`, runtime memory.

**PR6 Password search** \
Trigger: User searches or browses the vault. \
Purpose: Reads the unlocked vault and returns matching entry metadata. \
Data stores touched: `storage.session`, runtime memory.

**PR7 Password generation** \
Trigger: User requests a generated password. \
Purpose: Produces a secure random password according to selected rules. \
Data stores touched: runtime memory.

**PR8 Clipboard copy** \
Trigger: User requests copying a credential value. \
Purpose: Reads the selected secret from the unlocked vault and transfers it to the clipboard for temporary use. \
Data stores touched: `storage.session`, runtime memory, clipboard.

**PR9 Autofill** \
Trigger: User explicitly requests autofill on the current page. \
Purpose: Searches the unlocked vault, selects the correct credentials, and passes only the required login and password to the content script. \
Data stores touched: `storage.session`, runtime memory.

**PR10 Setup cloud sync** \
Trigger: User configures the optional sync layer. \
Purpose: Validates user-provided S3 configuration and AWS access credentials, then stores locally protected sync configuration and credentials. \
Data stores touched: `IndexedDB`, `AWS S3 bucket`, runtime memory.

**PR11 Sync upload** \
Trigger: User or the extension starts a sync upload. \
Purpose: Uploads the latest persisted encrypted vault snapshot and related metadata to cloud storage. \
Data stores touched: `IndexedDB`, `AWS S3 bucket`, runtime memory.

**PR12 Sync download** \
Trigger: User or the extension starts a sync download. \
Purpose: Downloads the latest encrypted vault snapshot and related metadata from cloud storage and integrates it locally. \
Data stores touched: `IndexedDB`, `AWS S3 bucket`, `storage.session`, runtime memory.

**PR13 Sync conflict resolution** \
Trigger: Sync detects conflicting local and remote state. \
Purpose: Compares local and remote vault state, resolves differences, persists the resolved result, and optionally uploads it. \
Data stores touched: `IndexedDB`, `storage.session`, runtime memory.

**PR14 Remove files from cloud sync** \
Trigger: User requests deletion of remote vault files. \
Purpose: Authenticates to the sync layer and deletes remote vault data while keeping the local vault available. \
Data stores touched: `IndexedDB`, `AWS S3 bucket`, runtime memory.

**PR15 Remove local sync credentials** \
Trigger: User disables sync. \
Purpose: Removes local sync state and locally protected cloud sync credentials after remote sync files are removed. \
Data stores touched: `IndexedDB`, `AWS S3 bucket`, runtime memory.

**PR16 Device enrollment initialization** \
Trigger: User registers a new device from an already trusted device. \
Purpose: Requires further consultation; the exact enrollment package and enrollment secret design is not finalized. \
Data stores touched: `IndexedDB`, runtime memory.

**PR17 Device enrollment perform** \
Trigger: User enrolls a new device into an existing synced vault. \
Purpose: Requires further consultation; the exact process for using enrollment material to join an existing vault is not finalized. \
Data stores touched: `IndexedDB`, `AWS S3 bucket`, runtime memory.

**PR18 Device revocation** \
Trigger: User revokes a registered device. \
Purpose: Removes the revoked device from the trusted set, rotates access state, and updates the vault. \
Data stores touched: `IndexedDB`, runtime memory.

**PR19 Vault access recovery** \
Trigger: User provides the recovery secret and a new local master password. \
Purpose: Recovers access to the vault and re-establishes valid local device state. \
Data stores touched: `IndexedDB`, runtime memory.

**PR20 Vault deletion** \
Trigger: User requests deletion of the local vault from the device. \
Purpose: Removes local vault data, local sync state, protected device state, and session state from the current device. \
Data stores touched: `IndexedDB`, `storage.session`, runtime memory.

---

## 5. Data stores

Only places where data is stored or persisted are listed here.

**D1 IndexedDB** \
Type: local persistent storage. \
What is stored there: Encrypted vault snapshot, protected device state, encrypted cloud sync credentials, local sync state, and related vault metadata. \
Trust level: untrusted local storage. \
Persistence: long-lived.

**D2 storage.session** \
Type: session storage. \
What is stored there: Fully unlocked vault state during the unlocked stage. \
Trust level: less trusted. \
Persistence: short-lived.

**D3 AWS S3 bucket** \
Type: remote storage. \
What is stored there: Encrypted vault snapshot and related sync metadata used by the optional sync layer. \
Trust level: untrusted remote storage. \
Persistence: long-lived.

**D4 Runtime memory** \
Type: memory. \
What is stored there: Active cryptographic material, temporary plaintext values, and transient processing state used by the extension service worker. \
Trust level: trusted only inside the service worker volatile runtime. \
Persistence: runtime only.

---

## 6. Sensitive assets and protected data

This section covers what must be protected, not only what appears as separate DFD nodes.

**A1 Master password** \
Security relevance: confidentiality and local access control. \
Where it exists: user memory and temporary input handling during unlock or setup. \
Why it matters: It is the secret used to derive the local password-based root key.

**A2 Vault master key** \
Security relevance: confidentiality and integrity of the vault. \
Where it exists: wrapped in local persisted state and synced vault state. \
Why it matters: It encrypts and decrypts the canonical vault snapshot.

**A3 Vault snapshot** \
Security relevance: confidentiality, integrity, and availability. \
Where it exists: `IndexedDB`, `AWS S3 bucket`. \
Why it matters: It is the canonical persisted encrypted vault state.

**A4 Unlocked vault** \
Security relevance: confidentiality and integrity. \
Where it exists: `storage.session`, runtime memory during active use. \
Why it matters: It contains the plaintext working state used for search, CRUD, reveal, copy, and autofill.

**A5 Device private keys** \
Security relevance: confidentiality, authenticity, and authorization. \
Where it exists: locally protected in `IndexedDB`, active in runtime memory during unlock and trusted-device operations. \
Why it matters: They unlock device access to the vault and authenticate trusted-device actions.

**A6 Cloud sync credentials** \
Security relevance: confidentiality and authorization. \
Where it exists: encrypted in `IndexedDB`, temporarily in runtime memory during sync setup and sync operations. \
Why it matters: They authenticate to the sync layer and bind the device to the correct cloud location.

**A7 Recovery secret** \
Security relevance: confidentiality and recovery control. \
Where it exists: user memory or user-kept backup only. \
Why it matters: It allows recovery of access to the vault when the local master password is forgotten.

**A8 Enrollment package and enrollment secret** \
Security relevance: confidentiality, authenticity, and device trust bootstrap. \
Where it exists: user transfer channel, new-device input, and transient runtime handling. \
Why it matters: They bootstrap a new trusted device into an existing synced vault.

**A9 Vault metadata and registered device public keys** \
Security relevance: integrity and authenticity. \
Where it exists: local persisted metadata and synced metadata. \
Why it matters: They define trusted devices, cryptographic context, versioning, and sync state.

### 6.1 Asset-to-store mapping

Key asset-to-store mappings are:

- `A2 Vault master key`: Stored only in wrapped form inside local and synced vault state. Used by `PR3 Vault unlock`, `PR11 Sync upload`, `PR12 Sync download`, `PR17 Device enrollment perform`, `PR18 Device revocation`, and `PR19 Vault access recovery`. Crosses trust boundaries: yes, because wrapped forms exist in `IndexedDB` and `AWS S3 bucket`.
- `A3 Vault snapshot`: Stored in `D1 IndexedDB` and optionally `D3 AWS S3 bucket`. Used by `PR2 Vault initialization`, `PR3 Vault unlock`, `PR5 Password entry CRUD`, `PR11 Sync upload`, `PR12 Sync download`, and `PR13 Sync conflict resolution`. Crosses trust boundaries: yes.
- `A4 Unlocked vault`: Stored in `D2 storage.session` and active `D4 Runtime memory`. Used by `PR3 Vault unlock`, `PR4 Vault lock`, `PR5 Password entry CRUD`, `PR6 Password search`, `PR8 Clipboard copy`, and `PR9 Autofill`. Crosses trust boundaries: yes, especially when secrets are copied to clipboard or sent to content scripts.
- `A5 Device private keys`: Persisted in protected form in `D1 IndexedDB` and used in `D4 Runtime memory` during `PR3 Vault unlock`, `PR10 Setup cloud sync`, `PR17 Device enrollment perform`, `PR18 Device revocation`, and `PR19 Vault access recovery`. Crosses trust boundaries: no in plaintext, but protected forms are stored across a boundary.
- `A6 Cloud sync credentials`: Stored encrypted in `D1 IndexedDB` and used in `D4 Runtime memory` during `PR10 Setup cloud sync`, `PR11 Sync upload`, `PR12 Sync download`, `PR14 Remove files from cloud sync`, and `PR15 Remove local sync credentials`. Crosses trust boundaries: yes, because they are used to authenticate to external cloud services.
- `A8 Enrollment package and enrollment secret`: Exists outside normal local storage in the user transfer channel and new-device input path. Used by `PR16 Device enrollment initialization` and `PR17 Device enrollment perform`. Crosses trust boundaries: yes, because it moves between devices and the user-controlled transfer channel.

---

## 7. Trust zones and trust boundaries

This section explains where trust changes.

### 7.1 Trust zones

**TZ1 External actor zone** \
Description: Human actor outside the extension core. \
Included elements: `User`.

**TZ2 Trusted cryptographic core** \
Description: The only zone trusted to hold plaintext vault data and active cryptographic key material. \
Included elements: `Extension service worker` volatile runtime memory.

**TZ3 Less-trusted extension zone** \
Description: Extension contexts that can initiate requests and temporarily hold some working data, but are not the main cryptographic trust anchor. \
Included elements: `Popup`, `Options page`, `storage.session`.

**TZ4 Untrusted storage and cloud-service zone** \
Description: Persistent local and remote stores used by local persistence and optional sync. \
Included elements: `IndexedDB`, `AWS S3`.

**TZ5 High-risk interaction zone** \
Description: Contexts where secrets leave the main extension core and become exposed to external behavior. \
Included elements: `Content script`, `Web page / DOM`, `Clipboard`.

### 7.2 Trust boundaries

- `B1 User <-> Popup / Options page`
  Why trust changes here: User input enters the extension through UI contexts.
  Security consequence: Sensitive operations depend on correct handling of user intent, secrets, and confirmation flows.

- `B2 Popup / Options page <-> Extension service worker`
  Why trust changes here: UI contexts communicate with the central privileged component through message passing.
  Security consequence: Requests and senders must be validated before privileged operations are performed.

- `B3 Extension service worker <-> storage.session`
  Why trust changes here: Plaintext working state leaves the most trusted runtime and is placed into a less-trusted session store.
  Security consequence: Unlocked vault data should be short-lived and removed on lock.

- `B4 Extension service worker <-> IndexedDB`
  Why trust changes here: Data moves from trusted runtime into hostile persistent local storage.
  Security consequence: Data must already be encrypted and authenticated before being written, and validated when read back.

- `B5 Extension service worker <-> AWS S3`
  Why trust changes here: Vault snapshots and sync metadata cross into hostile remote storage.
  Security consequence: Remote data must be treated as untrusted until its structure, authenticity, and freshness are verified.

- `B6 Extension service worker <-> Content script <-> Web page / DOM`
  Why trust changes here: Secrets leave the core extension boundary and enter the page interaction path.
  Security consequence: Only the minimum login and password needed for explicit autofill should be exposed.

- `B7 Extension context <-> Clipboard`
  Why trust changes here: Copied secrets leave extension-controlled handling and enter browser or OS clipboard handling.
  Security consequence: The system cannot guarantee confidentiality after the value is copied.

### 7.3 Boundary assumptions

- Only the volatile memory of the `extension service worker` is trusted to hold plaintext vault data and active cryptographic key material.
- `Popup` and `Options page` are less-trusted extension contexts and must not be treated as long-term storage for plaintext secrets or cryptographic keys.
- `Content script` is outside the main trusted cryptographic boundary.
- The `web page / DOM` is treated as hostile and may observe, modify, or misuse data exposed to it.
- `IndexedDB` is treated as hostile local storage and may be read, modified, deleted, or rolled back by an attacker.
- `AWS S3` is treated as hostile remote storage and may be read, modified, deleted, or rolled back by an attacker.
- `Chrome extension isolation` is assumed to work correctly, so other websites and other extensions cannot directly read the `extension service worker` memory.
- The browser extension permission model is assumed to be correctly enforced by Chrome.
- `WebCrypto API` and `crypto.getRandomValues()` are assumed to be correctly implemented by the browser.
- Trusted device public keys are assumed authentic only after explicit enrollment or verification performed by the user or by an already trusted device.
- The browser, operating system, and device running the extension are assumed not to be compromised by malware, a malicious browser binary, or memory-extraction attacks.

---

## 8. Data flows

This section describes security-relevant data movement between external entities, processes, and data stores.

- `F1 User -> Popup / Options page -> Extension service worker`
  Data transferred: Master password, vault creation request, unlock request, recovery input, configuration input.
  Why the flow exists: Starts security-sensitive operations.
  Crosses trust boundary: yes.
  Protected by / validated by: UI confirmation, request validation, and sender validation at the service worker boundary.

- `F2 Extension service worker -> IndexedDB`
  Data transferred: Encrypted vault snapshot, protected device state, encrypted cloud sync credentials, local sync state.
  Why the flow exists: Persists local state.
  Crosses trust boundary: yes.
  Protected by / validated by: Encryption, authentication, and structural validation on later reads.

- `F3 IndexedDB -> Extension service worker`
  Data transferred: Local password-protected device state, encrypted vault snapshot, sync configuration, and metadata.
  Why the flow exists: Supports unlock, sync, recovery, and device-management operations.
  Crosses trust boundary: yes.
  Protected by / validated by: Authenticity checks, structure checks, and freshness checks before use.

- `F4 Extension service worker <-> storage.session`
  Data transferred: Unlocked vault working state and updated session state.
  Why the flow exists: Supports active vault use after unlock.
  Crosses trust boundary: yes.
  Protected by / validated by: Limited lifetime and explicit cleanup on lock.

- `F5 Popup <-> Extension service worker`
  Data transferred: Search queries, entry identifiers, entry details, generation parameters, sync requests, and user-selected operations.
  Why the flow exists: Supports everyday vault usage through the popup UI.
  Crosses trust boundary: yes.
  Protected by / validated by: Message-type validation and minimal-data responses.

- `F6 Extension service worker -> Content script -> Web page / DOM`
  Data transferred: Matching entry identifiers, then only the selected login and password plus fill instructions.
  Why the flow exists: Performs explicit autofill on the active web page.
  Crosses trust boundary: yes.
  Protected by / validated by: Explicit user action and minimal disclosure of credential fields.

- `F7 Extension context -> Clipboard`
  Data transferred: Selected password value or other copied credential data.
  Why the flow exists: Supports temporary use of credentials outside the extension UI.
  Crosses trust boundary: yes.
  Protected by / validated by: User action and optional clipboard clear attempt after timeout.

- `F8 Extension service worker <-> AWS S3 bucket`
  Data transferred: Encrypted vault snapshot and related sync metadata.
  Why the flow exists: Supports optional cloud upload and download of vault state.
  Crosses trust boundary: yes.
  Protected by / validated by: Encryption, authenticity verification, and sync-state comparison.

- `F9 Trusted device -> User transfer channel -> New device`
  Data transferred: Enrollment package and enrollment secret.
  Why the flow exists: Bootstraps a new trusted device into an existing synced vault.
  Crosses trust boundary: yes.
  Protected by / validated by: Requires further consultation because the enrollment design is not finalized.

### 8.1 Notes on data flow granularity

The DFDs derived from this section should show logical security-relevant flows, not every implementation detail. One logical flow may summarize several browser API calls, message-passing steps, or cryptographic sub-operations if they do not change the trust boundary analysis.

---

## 9. Main operational scenarios used to derive DFDs

This section summarizes the most important flows that should be represented by the diagrams.

**S1 Local vault initialization** \
Main components involved: `User`, `Popup`, `Options page`, `Extension service worker`, `IndexedDB`. \
Main data involved: Master password, recovery secret, device-local keys, initial vault snapshot. \
Why it matters for security: Establishes the initial cryptographic trust model and persisted state.

**S2 Vault unlock and lock** \
Main components involved: `User`, `Popup`, `Extension service worker`, `IndexedDB`, `storage.session`. \
Main data involved: Master password, protected device state, vault snapshot, unlocked vault. \
Why it matters for security: This scenario moves the system between encrypted-at-rest and actively unlocked states.

**S3 Local CRUD and search** \
Main components involved: `User`, `Popup`, `Extension service worker`, `storage.session`. \
Main data involved: Entry metadata, full entry details, unlocked vault state. \
Why it matters for security: It is the main everyday use path and depends on correct handling of plaintext vault data.

**S4 Reveal, clipboard copy, and autofill** \
Main components involved: `User`, `Popup`, `Extension service worker`, `Content script`, `Web page / DOM`, `Clipboard`, `storage.session`. \
Main data involved: Password value, login value, selected entry identifiers. \
Why it matters for security: Secrets leave the core extension boundary in this scenario.

**S5 Setup cloud sync** \
Main components involved: `User`, `Options page`, `Extension service worker`, `AWS S3 bucket`, `IndexedDB`. \
Main data involved: Cloud sync credentials, sync configuration, local sync state. \
Why it matters for security: Establishes the optional remote trust relationship.

**S6 Sync upload, sync download, and conflict resolution** \
Main components involved: `Popup`, `Extension service worker`, `AWS S3 bucket`, `IndexedDB`, `storage.session`. \
Main data involved: Encrypted vault snapshot, sync metadata, conflict summary, resolved vault state. \
Why it matters for security: Determines how local and remote vault state are synchronized and verified.

**S7 Device enrollment and device revocation** \
Main components involved: `User`, `Options page`, `Extension service worker`, `AWS S3 bucket`, `IndexedDB`. \
Main data involved: Enrollment package, enrollment secret, trusted device public keys, wrapped access slots. \
Why it matters for security: Controls which devices are allowed to participate in the trusted vault set.

**S8 Access recovery and vault deletion** \
Main components involved: `User`, `Options page`, `Extension service worker`, `IndexedDB`, `storage.session`. \
Main data involved: Recovery secret, new master password, protected device state, local vault state. \
Why it matters for security: Handles loss-of-access and destructive local cleanup operations.

---

## 10. Data Flow Diagrams

This is the main output of Part 1. These diagrams should later be referenced in Part 2 during STRIDE-based threat identification.

### 10.1 DFD-0: System context diagram

#### Purpose

This diagram should show the full password-manager system at the highest level, including the user, the main extension components, local storage, optional cloud services, and the highest-level trust boundaries between them.

#### Elements included

- external entities: `User`, `AWS S3 bucket`, `Target web page`, `Clipboard`
- processes: `Extension service worker`, `Popup`, `Options page`, `Content script`
- data stores: `IndexedDB`, `storage.session`, `AWS S3 bucket`, runtime memory if shown logically
- trust boundaries: user-to-extension, UI-to-service-worker, service-worker-to-persistent-storage, service-worker-to-cloud, service-worker-to-content-script, extension-to-clipboard

#### Key flows shown

- user-driven vault setup and unlock
- local vault persistence and loading
- optional cloud sync interaction
- explicit autofill and clipboard interaction

#### Diagram metadata

- Source model: not prepared yet as a dedicated DFD model file in the repository
- Generated with: planned `pytm` or another DFD tool
- Output file: not prepared yet
- Generation date: not available yet

#### Diagram

Diagram pending.

### 10.2 DFD-1: Local vault operations

#### Purpose

This diagram should detail local vault creation, unlock, lock, local CRUD operations, search, and local reads that happen without cloud interaction.

#### Elements included

- external entities: `User`
- processes: `Popup`, `Options page`, `Extension service worker`
- data stores: `IndexedDB`, `storage.session`, runtime memory
- trust boundaries: user-to-UI, UI-to-service-worker, service-worker-to-session-store, service-worker-to-persistent-local-storage

#### Key flows shown

- vault initialization and recovery-secret display
- vault unlock and lock
- local entry CRUD, search, and reveal operations

#### Diagram metadata

- Source model: not prepared yet as a dedicated DFD model file in the repository
- Generated with: planned `pytm` or another DFD tool
- Output file: not prepared yet
- Generation date: not available yet

#### Diagram

Diagram pending.

### 10.3 DFD-2: Cloud sync

#### Purpose

This diagram should detail the optional sync layer, including user-provided S3 credentials, encrypted vault transfer through `AWS S3`, conflict handling, and device-trust management.

#### Elements included

- external entities: `User`, `AWS S3 bucket`
- processes: `Options page`, `Popup`, `Extension service worker`
- data stores: `IndexedDB`, `AWS S3 bucket`, `storage.session`
- trust boundaries: service-worker-to-cloud-storage, service-worker-to-indexeddb, service-worker-to-session-store

#### Key flows shown

- setup cloud sync
- sync upload and sync download
- conflict resolution, device enrollment, and device revocation

#### Diagram metadata

- Source model: not prepared yet as a dedicated DFD model file in the repository
- Generated with: planned `pytm` or another DFD tool
- Output file: not prepared yet
- Generation date: not available yet

#### Diagram

Diagram pending.

### 10.4 DFD-3: High-risk interaction flows

#### Purpose

This diagram should focus on the flows where secrets leave the main trusted cryptographic core, especially clipboard copy and autofill into web pages.

#### Elements included

- external entities: `User`, `Target web page`, `Clipboard`
- processes: `Popup`, `Extension service worker`, `Content script`
- data stores: `storage.session`, runtime memory
- trust boundaries: service-worker-to-popup, service-worker-to-content-script, content-script-to-web-page, extension-to-clipboard

#### Key flows shown

- reveal and copy password value
- explicit autofill from popup through content script
- credential exposure beyond the core trusted boundary

#### Diagram metadata

- Source model: not prepared yet as a dedicated DFD model file in the repository
- Generated with: planned `pytm` or another DFD tool
- Output file: not prepared yet
- Generation date: not available yet

#### Diagram

Diagram pending.

### 10.5 Diagram preparation notes

- Each DFD should contain only external entities, processes, data stores, data flows, and trust boundaries.
- DFDs should show logical data movement, not every implementation detail.
- Very detailed cryptographic internals should remain in explanatory text unless they materially affect trust boundaries or data movement.
- If one diagram becomes unreadable, split it into multiple focused DFDs.
- The DFD set should be detailed enough to support later STRIDE analysis in Part 2.

---

## 11. Assumptions and external dependencies

This section documents what is assumed about the environment and third-party mechanisms while preparing the system model.

### 11.1 Assumptions

- `Chrome extension isolation` works correctly, so websites and other extensions cannot directly read the `extension service worker` memory.
- The browser extension permission model is correctly enforced by Chrome.
- `WebCrypto API` and `crypto.getRandomValues()` are correctly implemented by the browser.
- Trusted device public keys are accepted only after explicit enrollment or verification.
- The browser, operating system, and device are not compromised by malware, malicious binaries, or memory-extraction attacks.
- Data loaded from `IndexedDB` or `AWS S3` is untrusted until its structure, authenticity, and freshness are verified.
- Data written to `IndexedDB` or uploaded to `AWS S3` is already encrypted and authenticated before crossing the boundary.
- Once a secret is copied to the clipboard or autofilled into a web page, the extension can no longer fully control its confidentiality or use.

### 11.2 External dependencies

**X1 Chrome browser and extension platform** \
Role in system: Hosts the Manifest V3 extension environment, permissions model, service worker lifecycle, and extension isolation mechanisms. \
Treated as trusted: partially. \
Assumption made: Chrome correctly enforces extension isolation, permissions, and runtime behavior needed by the design.

**X2 WebCrypto API** \
Role in system: Provides cryptographic primitives and secure randomness. \
Treated as trusted: partially. \
Assumption made: The browser implementation of `WebCrypto API` and `crypto.getRandomValues()` is correct and secure.

**X3 AWS S3 bucket** \
Role in system: Stores encrypted vault snapshots and sync metadata for optional cloud sync. \
Treated as trusted: no. \
Assumption made: It may be read, modified, deleted, or rolled back by an attacker, so all stored data must remain encrypted and authenticated.

**X4 Target web pages and DOM environment** \
Role in system: Receive autofilled data through the content script during explicit user action. \
Treated as trusted: no. \
Assumption made: Web pages may observe, modify, or misuse any secrets exposed to them.

**X5 Clipboard and operating system clipboard handling** \
Role in system: Temporarily holds copied credential data outside the extension UI. \
Treated as trusted: no. \
Assumption made: Clipboard data may be retained or observed by clipboard managers, OS features, or other local applications.

---
