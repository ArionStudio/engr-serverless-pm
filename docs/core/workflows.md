# Core workflows

Status: current implementation

The root `@lfspm/core` entry point exports use-case classes. Each class has one
`execute` method and represents an application workflow. Runtime code constructs
the classes with shared services and port implementations.

## Vault lifecycle

| Use case                      | Behavior                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `InitializeVaultUseCase`      | Creates the first device identity, genesis trust chain, encrypted local access records, recovery backup, initial signed snapshot, and unlocked session |
| `ListLocalVaultsUseCase`      | Lists non-secret local vault descriptors without unlocking a vault                                                                                     |
| `UnlockVaultUseCase`          | Opens local access material, verifies trust and rollback state, then opens the device key envelope, decrypts the vault, and activates a timed session  |
| `LockVaultUseCase`            | Removes the owned session and scheduled lock state and coordinates clipboard cleanup                                                                   |
| `DeleteLocalVaultUseCase`     | Runs lifecycle cleanup and removes the selected vault's local persisted records                                                                        |
| `ChangeMasterPasswordUseCase` | Verifies the active device and current password, then atomically rewraps local device access under the new password while preserving recovery access   |
| `ReplaceRecoveryWordsUseCase` | Replaces the current local recovery wrapper under the active session, preserving password access and atomically advancing the access-record generation |

## Vault entries

| Use case                     | Behavior                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `AddEntryUseCase`            | Validates and sanitizes a new entry, enforces password policy unless explicitly overridden, persists a new snapshot, and attempts sync |
| `UpdateEntryUseCase`         | Requires the entry version originally read, then replaces it through the policy, snapshot, and sync path                               |
| `RemoveEntryUseCase`         | Requires the entry version originally read, then replaces it with a versioned tombstone                                                |
| `ReadEntryUseCase`           | Returns visible fields without the password and a detached entry version vector                                                        |
| `ReadVaultWorkspaceUseCase`  | Returns the unlocked vault's visible workspace projection without passwords                                                            |
| `ReadEntryForEditingUseCase` | Explicitly returns password, metadata and a detached version vector from one unlocked-session context                                  |
| `SearchEntriesUseCase`       | Validates a search query and returns matching visible fields without passwords                                                         |
| `GetEntryPasswordUseCase`    | Returns the password for one entry from the active unlocked vault                                                                      |

ReadEntry returns `entryVersionVector` alongside `entry`; the editor read returns
it as `entry.versionVector`. Editors and delete confirmations retain the version
of the record explicitly read and displayed for review, and pass it as
`expectedEntryVersionVector` to the mutation. An explicit reveal reads and displays
a fresh complete record; automatic list refreshes do not advance that retained
version. The core captures that vector before asynchronous work and rejects
malformed input with `InvalidExpectedEntryVersionError`. A mismatch with the
current entry raises `PasswordEntryChangedError` before provider or persistence
work. The caller must reload and let the user review newer values; it must not
silently retry with a refreshed vector. Snapshot CAS still protects changes
occurring after the entry comparison. Changes to other entries do not invalidate
the retained entry version.

## Organization

| Use case               | Behavior                                                           |
| ---------------------- | ------------------------------------------------------------------ |
| `ReadTagGroupsUseCase` | Reads the available tag-group definitions                          |
| `ReadTagsUseCase`      | Reads the unlocked vault's tags                                    |
| `AddTagUseCase`        | Validates and creates a tag, persists the change and attempts sync |
| `UpdateTagUseCase`     | Updates the reviewed tag version and attempts sync                 |
| `RemoveTagUseCase`     | Rejects referenced tags; otherwise records a deletion tombstone                |
| `ReadFoldersUseCase`   | Reads the unlocked vault's folder hierarchy                        |
| `AddFolderUseCase`     | Creates a folder within the validated hierarchy                    |
| `UpdateFolderUseCase`  | Renames a reviewed folder                                          |
| `MoveFolderUseCase`    | Moves a reviewed folder while enforcing hierarchy rules            |
| `RemoveFolderUseCase`  | Rejects folders with entries or children; otherwise records a deletion tombstone         |

Successful tag and folder removal leaves entries unchanged.

Entry, tag and folder mutations return `syncConfigured` from the state used for
that mutation alongside upload status, so the UI can report the saved outcome
without relying on an older workspace read.

## Website logins

| Use case | Behavior |
| --- | --- |
| `CaptureBrowserLoginUseCase` | Validates a submitted login and deadline, then stores an encrypted, session-bound proposal for review without creating a vault entry. |
| `ReadBrowserLoginsUseCase` | Inspects the active page, rechecks the authorized session, and returns matching entry summaries and an eligible captured proposal. |
| `HasCapturedLoginUseCase` | Reports whether the current session has an unexpired capture for the tab and matching origin, without returning its credentials. |
| `DismissCapturedLoginUseCase` | Removes the identified proposal under the unlocked-session coordinator, preserving a newer capture. |
| `FillBrowserLoginUseCase` | Authorizes an explicit fill of a saved entry into a supported form at the matching origin; the browser adapter rechecks the target before dispatch. |

Saving a reviewed proposal uses the existing entry add or update workflow.
[Website login contracts](../architecture/website-logins.md) describe detection,
retention, permission checks and supported forms.

## Password tools

| Use case                       | Behavior                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `CheckPasswordStrengthUseCase` | Scores a supplied password using the core password-strength policy                                                 |
| `GeneratePasswordUseCase`      | Validates generation settings and creates a password with unbiased runtime randomness                              |
| `GenerateUsernameUseCase`      | Validates generation settings and creates a username from the verified word corpus and unbiased runtime randomness |

## Session and clipboard

| Use case                       | Behavior                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GetVaultSessionStatusUseCase` | Reports `locked` or the ID of the active unlocked vault without decrypting the session payload                                             |
| `CopyEntryPasswordUseCase`     | Copies a password, records ownership of the copied value, and schedules an owned clear action                                              |
| `CopyRecoveryWordsUseCase`     | Validates words against current paired recovery data and recovered device keys, then uses shared clipboard ownership and scheduled cleanup |
| `ClearClipboardTaskUseCase`    | Clears only the clipboard value still owned by the expected action and reports why a stale or changed value was preserved                  |

`CopyRevealedSecretUseCase` uses the existing owned clipboard cleanup for an
explicitly revealed value after verifying its vault session.

## Sync

| Use case                                      | Behavior                                                                                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetSyncConfigurationUseCase`                 | Returns a detached, non-secret sync target for an unlocked vault without exposing credentials or contacting S3                                                                      |
| `TestSyncAccessUseCase`                       | Validates draft provider settings and probes read access without saving settings or writing remote data                                                                             |
| `SetupSyncUseCase`                            | Validates provider access, stores device-local encrypted credentials, adds the provider-neutral target to the vault, and uploads the resulting snapshot                             |
| `UpdateSyncCredentialsUseCase`                | Probes replacement read access for the same target and atomically replaces device-local credentials while retaining pending upload and revocation state                             |
| `SyncUploadUseCase`                           | Reconciles any tracked upload and conditionally uploads the current signed snapshot                                                                                                 |
| `PrepareSyncReviewUseCase`                    | Downloads and verifies the remote candidate, compares version vectors, and returns safe or actionable differences without mutating the vault                                        |
| `ApplySyncResolutionUseCase`                  | Verifies reviewed identities and choices; adopts the exact remote snapshot for all-remote choices, or persists and conditionally uploads a local/mixed resolution                   |
| `DisableSyncUseCase`                          | Removes expected remote and local sync state; when other devices exist, it also revokes them, removes their profiles, rotates the vault key, and rebuilds the surviving device slot |
| `CompleteProviderCredentialRevocationUseCase` | Checks old provider access when credentials remain, leaves state pending unless deletion is proven, and reports revocation plus upload status for retry or reconciliation           |

Existing-device reconnection is split into `PrepareExistingSyncConnectionUseCase`
and `ConnectExistingSyncUseCase`. The first verifies the S3 candidate for review;
the second checks that the reviewed identities still match before adopting it.
`RevealSyncCredentialsUseCase` requires password confirmation and returns the
current device's access keys for an explicit copy action.

## Device trust

| Use case                                    | Behavior                                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateDeviceEnrollmentRequestUseCase`      | Creates a target device identity and signed enrollment request and protects the pending private state with the target's master password                                                                       |
| `InitializeDeviceEnrollmentUseCase`         | Verifies a request on a trusted device, extends the trust chain, adds a device key envelope, and returns the response artifact                                                                                |
| `PerformDeviceEnrollmentUseCase`            | Opens the target's pending state, verifies the response and trust chain, persists local access and recovery records, activates the enrolled vault, and returns recovery words with the persisted display name |
| `PrepareDeviceEnrollmentConsumptionUseCase` | Loads and verifies an enrollment transition received through sync and prepares item-level review data                                                                                                         |
| `ConsumeDeviceEnrollmentUseCase`            | Applies the reviewed enrollment transition to local state and continues synchronized operation                                                                                                                |
| `RevokeDeviceUseCase`                       | Removes a device from trust, rotates vault-key state, records provider-credential cleanup, and creates a snapshot for surviving devices                                                                       |
| `PrepareDeviceRevocationConsumptionUseCase` | Verifies a remote revocation transition, uses the supplied replacement sync configuration to validate access, and prepares local review data                                                                  |
| `ConsumeDeviceRevocationUseCase`            | Applies the reviewed revocation, replaces local provider credentials, and continues with the rotated vault state                                                                                              |
| `RecoverDeviceAccessUseCase`                | Restores access to the same trusted device identity from the current local recovery backup and replaces local password and recovery protection                                                                |

`ReadDeviceManagementUseCase` returns the unlocked device-management projection.
`ReadDeviceEnrollmentApprovalUseCase` opens the protected approval for the target
device and returns the details needed to complete enrollment.

Recovery replaces the current local backup. It cannot invalidate recovery words
for copies of an older backup retained by an attacker or restored through local
storage rollback.

## Diagrams

The [V1 use-case diagrams](../v1/use-case/README.md) provide activity diagrams
for a subset of these workflows, plus sequence and state-machine views. The
use cases without a dedicated activity diagram are:

- `ReplaceRecoveryWordsUseCase`
- `CopyRecoveryWordsUseCase`
- `ReadVaultWorkspaceUseCase`
- `ReadEntryForEditingUseCase`
- `GetSyncConfigurationUseCase`
- `TestSyncAccessUseCase`
- `UpdateSyncCredentialsUseCase`
- `CompleteProviderCredentialRevocationUseCase`
- `CreateDeviceEnrollmentRequestUseCase`
- `PrepareDeviceEnrollmentConsumptionUseCase`
- `ConsumeDeviceEnrollmentUseCase`
- `PrepareDeviceRevocationConsumptionUseCase`
- `ConsumeDeviceRevocationUseCase`

- `CopyRevealedSecretUseCase`
- `ReadDeviceManagementUseCase`
- `ReadDeviceEnrollmentApprovalUseCase`
- `PrepareExistingSyncConnectionUseCase`
- `ConnectExistingSyncUseCase`
- `RevealSyncCredentialsUseCase`
- `ReadTagGroupsUseCase`
- `ReadFoldersUseCase`
- `AddFolderUseCase`
- `UpdateFolderUseCase`
- `MoveFolderUseCase`
- `RemoveFolderUseCase`
- `ReadTagsUseCase`
- `AddTagUseCase`
- `UpdateTagUseCase`
- `RemoveTagUseCase`

This is a documentation coverage gap, not an absent core implementation. Use
the TypeScript files and tests when a diagram is missing or disagrees with the
current code.
