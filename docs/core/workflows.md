# Core workflows

Status: current implementation

The root `@lfspm/core` entry point exports 33 use-case classes. Each class has
one `execute` method and represents an application workflow. Runtime code
constructs the classes with shared services and port implementations.

## Vault lifecycle

| Use case                      | Behavior                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `InitializeVaultUseCase`      | Creates the first device identity, genesis trust chain, encrypted local access records, recovery backup, initial signed snapshot, and unlocked session |
| `ListLocalVaultsUseCase`      | Lists non-secret local vault descriptors without unlocking a vault                                                                                     |
| `UnlockVaultUseCase`          | Opens local access material, verifies trust and rollback state, then opens the device key envelope, decrypts the vault, and activates a timed session  |
| `LockVaultUseCase`            | Removes the owned session and scheduled lock state and coordinates clipboard cleanup                                                                   |
| `DeleteLocalVaultUseCase`     | Runs lifecycle cleanup and removes the selected vault's local persisted records                                                                        |
| `ChangeMasterPasswordUseCase` | Verifies the active device and current password, then atomically rewraps local device access under the new password while preserving recovery access   |

## Vault entries

| Use case                  | Behavior                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `AddEntryUseCase`         | Validates and sanitizes a new entry, enforces password policy unless explicitly overridden, persists a new snapshot, and attempts sync |
| `UpdateEntryUseCase`      | Replaces an existing entry through the same policy, snapshot, and sync path                                                            |
| `RemoveEntryUseCase`      | Replaces an entry with a versioned tombstone and persists the mutation                                                                 |
| `ReadEntryUseCase`        | Returns visible fields for one entry without its password                                                                              |
| `SearchEntriesUseCase`    | Validates a search query and returns matching visible fields without passwords                                                         |
| `GetEntryPasswordUseCase` | Returns the password for one entry from the active unlocked vault                                                                      |

## Password tools

| Use case                       | Behavior                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `CheckPasswordStrengthUseCase` | Scores a supplied password using the core password-strength policy                                                 |
| `GeneratePasswordUseCase`      | Validates generation settings and creates a password with unbiased runtime randomness                              |
| `GenerateUsernameUseCase`      | Validates generation settings and creates a username from the verified word corpus and unbiased runtime randomness |

## Session and clipboard

| Use case                       | Behavior                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GetVaultSessionStatusUseCase` | Reports `locked` or the ID of the active unlocked vault without decrypting the session payload                            |
| `CopyEntryPasswordUseCase`     | Copies a password, records ownership of the copied value, and schedules an owned clear action                             |
| `ClearClipboardTaskUseCase`    | Clears only the clipboard value still owned by the expected action and reports why a stale or changed value was preserved |

## Sync

| Use case                                      | Behavior                                                                                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SetupSyncUseCase`                            | Validates provider access, stores device-local encrypted credentials, adds the provider-neutral target to the vault, and uploads the resulting snapshot                             |
| `SyncUploadUseCase`                           | Reconciles any tracked upload and conditionally uploads the current signed snapshot                                                                                                 |
| `PrepareSyncReviewUseCase`                    | Downloads and verifies the remote candidate, compares version vectors, and returns safe or actionable differences without mutating the vault                                        |
| `ApplySyncResolutionUseCase`                  | Verifies the reviewed local and remote identities, applies explicit item resolutions, persists the merged snapshot, and uploads it conditionally                                    |
| `DisableSyncUseCase`                          | Removes expected remote and local sync state; when other devices exist, it also revokes them, removes their profiles, rotates the vault key, and rebuilds the surviving device slot |
| `CompleteProviderCredentialRevocationUseCase` | Checks old provider access when credentials remain, leaves state pending unless deletion is proven, and reports revocation plus upload status for retry or reconciliation           |

## Device trust

| Use case                                    | Behavior                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreateDeviceEnrollmentRequestUseCase`      | Creates a target device identity and signed enrollment request and protects the pending private state with the target's master password               |
| `InitializeDeviceEnrollmentUseCase`         | Verifies a request on a trusted device, extends the trust chain, adds a device key envelope, and returns the response artifact                        |
| `PerformDeviceEnrollmentUseCase`            | Opens the target's pending state, verifies the response and trust chain, persists local access and recovery records, and activates the enrolled vault |
| `PrepareDeviceEnrollmentConsumptionUseCase` | Loads and verifies an enrollment transition received through sync and prepares item-level review data                                                 |
| `ConsumeDeviceEnrollmentUseCase`            | Applies the reviewed enrollment transition to local state and continues synchronized operation                                                        |
| `RevokeDeviceUseCase`                       | Removes a device from trust, rotates vault-key state, records provider-credential cleanup, and creates a snapshot for surviving devices               |
| `PrepareDeviceRevocationConsumptionUseCase` | Verifies a remote revocation transition, uses the supplied replacement sync configuration to validate access, and prepares local review data          |
| `ConsumeDeviceRevocationUseCase`            | Applies the reviewed revocation, replaces local provider credentials, and continues with the rotated vault state                                      |
| `RecoverDeviceAccessUseCase`                | Restores access to the same trusted device identity from the current local recovery backup and replaces local password and recovery protection        |

Recovery replaces the current local backup. It cannot invalidate recovery words
for copies of an older backup retained by an attacker or restored through local
storage rollback.

## Diagrams

The [V1 use-case diagrams](../v1/use-case/README.md) provide activity diagrams
for 27 of the 33 workflows, plus sequence and state-machine views. The six use
cases without a dedicated activity diagram are:

- `CompleteProviderCredentialRevocationUseCase`
- `CreateDeviceEnrollmentRequestUseCase`
- `PrepareDeviceEnrollmentConsumptionUseCase`
- `ConsumeDeviceEnrollmentUseCase`
- `PrepareDeviceRevocationConsumptionUseCase`
- `ConsumeDeviceRevocationUseCase`

This is a documentation coverage gap, not an absent core implementation. Use
the TypeScript files and tests when a diagram is missing or disagrees with the
current code.
