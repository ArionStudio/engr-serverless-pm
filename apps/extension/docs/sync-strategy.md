# Sync Strategy Design

> **Status**: Design document
> **Date**: 2026-01-17
> **Related**: [architecture-comparison.md](./architecture-comparison.md)

---

## 1. Core Principle

**User-controlled conflict resolution** — no auto-merge for security-critical data.

Why:

- Password managers hold sensitive credentials
- Silent merges can overwrite intentional changes
- Users must see and approve every conflict resolution
- Auditable sync history for security reviews

---

## 2. Sync Flow

### 6-Step Process

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SYNC FLOW                                   │
└─────────────────────────────────────────────────────────────────────┘

Step 1: User initiates sync (manual or scheduled)
         │
         ▼
Step 2: Download remote vault snapshot
         │
         ▼
Step 3: Compare local vs remote
         │
         ├─── No conflicts ──► Step 6: Complete sync silently
         │
         ▼
Step 4: Conflicts detected → Show diff UI
         │
         ▼
Step 5: User resolves each conflict
         │
         ▼
Step 6: Upload merged vault, update local

```

### Detailed Steps

| Step | Action                                                  | User Involvement             |
| ---- | ------------------------------------------------------- | ---------------------------- |
| 1    | Trigger sync                                            | Click button or auto-trigger |
| 2    | Fetch `vault.encrypted` from cloud                      | None (background)            |
| 3    | Decrypt both vaults with master key, run diff algorithm | None (background)            |
| 4    | If conflicts exist, pause and show diff UI              | **Required**                 |
| 5    | User picks local/remote/skip for each conflict          | **Required**                 |
| 6    | Encrypt merged vault, upload to cloud, save locally     | None (background)            |

---

## 3. Conflict Detection Types

| Change Type  | Local     | Remote    | Result                        |
| ------------ | --------- | --------- | ----------------------------- |
| **Added**    | New entry | -         | Auto-add (no conflict)        |
| **Added**    | -         | New entry | Auto-add (no conflict)        |
| **Modified** | Changed   | Unchanged | Auto-use local (no conflict)  |
| **Modified** | Unchanged | Changed   | Auto-use remote (no conflict) |
| **Modified** | Changed   | Changed   | **CONFLICT** - user decides   |
| **Deleted**  | Removed   | Unchanged | Auto-delete (no conflict)     |
| **Deleted**  | Unchanged | Removed   | Auto-delete (no conflict)     |
| **Deleted**  | Removed   | Changed   | **CONFLICT** - user decides   |
| **Deleted**  | Changed   | Removed   | **CONFLICT** - user decides   |

---

## 4. Diff UI Design

### Conflict Resolution Screen

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sync Conflicts (3)                                           [X]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 1/3  GitHub Account                               Work/Dev   │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │   Field        Local (This Device)    Remote (Cloud)         │  │
│  │   ─────────────────────────────────────────────────────────   │  │
│  │   Username     john.doe@company.com   john@company.com       │  │
│  │   Password     ••••••••••             ••••••••               │  │
│  │   Updated      Jan 15, 2:30 PM        Jan 16, 9:15 AM        │  │
│  │                                                               │  │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │  │
│  │   │  ◉ Use Local    │  │  ○ Use Remote   │  │  ○ Skip     │  │  │
│  │   └─────────────────┘  └─────────────────┘  └─────────────┘  │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 2/3  AWS Console                                  Work/Admin │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │   Deleted locally, but modified remotely                     │  │
│  │                                                               │  │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │  │
│  │   │  ○ Keep Deleted │  │  ◉ Restore      │  │  ○ Skip     │  │  │
│  │   └─────────────────┘  └─────────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 3/3  Netflix                                        Personal │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │   Both modified password                                     │  │
│  │                                                               │  │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │  │
│  │   │  ○ Use Local    │  │  ○ Use Remote   │  │  ◉ Skip     │  │  │
│  │   └─────────────────┘  └─────────────────┘  └─────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Skipped items will remain in conflict until next sync.            │
│                                                                     │
│                    ┌────────────────────────────────┐               │
│                    │     Apply Resolutions (2)      │               │
│                    └────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### Key UI Decisions

| Decision            | Choice            | Rationale                                   |
| ------------------- | ----------------- | ------------------------------------------- |
| Per-item resolution | Yes               | User controls each decision                 |
| Skip option         | Yes               | Defer decisions, sync non-conflicting items |
| Show password diff  | Masked by default | Security - option to reveal                 |
| Batch operations    | No                | Forces intentional review of each conflict  |
| Auto-select         | None              | No default selection to prevent accidents   |

---

## 5. Architecture Types

### Sync Diff Types

```typescript
// core/sync/sync-diff.type.ts

export type ChangeType = "added" | "modified" | "deleted";

export interface SyncChange {
  id: string;
  entryId: string;
  changeType: ChangeType;
  localVersion: PasswordMetadata | null; // null if deleted locally
  remoteVersion: PasswordMetadata | null; // null if deleted remotely
  localTimestamp: number;
  remoteTimestamp: number;
}

export interface SyncConflict extends SyncChange {
  // Conflict-specific metadata
  conflictReason:
    | "both_modified"
    | "deleted_but_modified"
    | "modified_but_deleted";
}

export interface SyncDiff {
  autoResolved: SyncChange[]; // No conflicts, will apply automatically
  conflicts: SyncConflict[]; // Requires user decision
  syncTimestamp: number;
}

export type ConflictResolution =
  | { action: "use_local" }
  | { action: "use_remote" }
  | { action: "skip" };

export interface ResolvedConflict {
  conflictId: string;
  resolution: ConflictResolution;
}
```

### Sync Port Interface

```typescript
// core/sync/sync.port.ts

export interface SyncPort {
  // Provider operations
  upload(key: string, data: Uint8Array): Promise<void>;
  download(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;

  // Sync-specific
  getLastSyncTimestamp(): Promise<number | null>;
  setLastSyncTimestamp(timestamp: number): Promise<void>;
}

// Diff logic lives in core domain, not in port
// core/sync/sync.service.ts handles:
// - computeDiff(local, remote): SyncDiff
// - applyResolutions(diff, resolutions): MergedVault
```

---

## 6. Sync States

```typescript
export type SyncStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "downloading" }
  | { state: "comparing" }
  | { state: "conflicts"; diff: SyncDiff }
  | { state: "uploading" }
  | { state: "complete"; summary: SyncSummary }
  | { state: "error"; error: SyncError };

export interface SyncSummary {
  added: number;
  modified: number;
  deleted: number;
  skipped: number;
  timestamp: number;
}
```

---

## 7. Edge Cases

| Scenario                                  | Handling                                |
| ----------------------------------------- | --------------------------------------- |
| Offline during sync                       | Show error, retry when online           |
| Master password changed on another device | Prompt for new password, re-derive keys |
| Vault corrupted in cloud                  | Option to overwrite with local or abort |
| Sync interrupted mid-upload               | Atomic upload - temp file, then rename  |
| Very large vault (1000+ entries)          | Paginated diff UI, progress indicator   |

---

## 8. Multi-Device Setup

### The Challenge

Browser extension context creates unique constraints:

- **No central server** — can't store connection configs server-side
- **Devices at different locations** — home PC, work laptop, not always accessible together
- **No simultaneous access** — can't easily "pair" devices in real-time
- **Security-first** — transferring credentials must be safe

### What Needs to Be Shared

| Data                  | How Shared         | Notes                            |
| --------------------- | ------------------ | -------------------------------- |
| Master password       | **User memorizes** | Never transferred electronically |
| Cloud provider config | Transfer mechanism | S3 bucket, credentials, region   |
| Encryption salt       | Stored in cloud    | Downloaded on first sync         |
| Device ID             | Generated locally  | For sync conflict attribution    |

### Setup Methods

#### Method 1: QR Code Transfer (Recommended for Same Location)

When user has access to both devices simultaneously:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVICE A (Source)                            │
│                                                                 │
│  Settings → Sync → "Add Another Device"                         │
│                                                                 │
│         ┌─────────────────────────┐                             │
│         │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  │                             │
│         │  ██ ▄▄▄▄▄ █ ▄ █ ▄▄▄ ██  │                             │
│         │  ██ █   █ █▄▄▄█▄█   ██  │  <- QR contains:           │
│         │  ██ █▄▄▄█ █ ▄▄ █ ▄▄▄██  │     - Provider type        │
│         │  ██▄▄▄▄▄▄▄█▄█ █▄█▄█▄██  │     - Bucket/container     │
│         │  ██ ▄▄ ▄▄▄ ▄▄▄█▄▄ ▄ ██  │     - Region               │
│         │  ██▄▄▄▄▄▄▄█▄▄▄▄▄▄▄▄▄██  │     - Access credentials   │
│         └─────────────────────────┘                             │
│                                                                 │
│  "Scan this QR code on your other device"                       │
│  Expires in: 5:00                                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    DEVICE B (Target)                            │
│                                                                 │
│  Settings → Sync → "Connect Existing Vault"                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                                                           │  │
│  │              [ Scan QR Code ]                             │  │
│  │                                                           │  │
│  │                     - or -                                │  │
│  │                                                           │  │
│  │              [ Enter Manually ]                           │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Security:**

- QR code expires after 5 minutes
- One-time use (invalidated after scan)
- Contains encrypted payload (additional PIN protection optional)
- Does NOT contain master password

#### Method 2: Configuration Export File

For devices that can't be in same location:

```
Device A: Settings → Sync → Export Config → Downloads "spm-config.encrypted"
          ↓
          (Transfer via secure channel: email to self, USB, cloud drive)
          ↓
Device B: Settings → Sync → Import Config → Select file → Enter master password
```

**File contents (encrypted with master-password-derived key):**

```typescript
interface ExportedConfig {
  version: 1;
  provider: "aws-s3" | "gcs" | "azure-blob";
  config: ProviderConfig; // bucket, region, credentials
  exportedAt: number;
  // Note: vault data NOT included, only connection config
}
```

**Security:**

- File encrypted — useless without master password
- User responsible for secure transfer
- Can set expiration on exported config

#### Method 3: Manual Configuration

For security-conscious users who prefer explicit setup:

```
┌─────────────────────────────────────────────────────────────────┐
│  Connect to Existing Vault                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Provider        [AWS S3 ▼]                                     │
│                                                                 │
│  Bucket Name     [my-password-vault___________________]         │
│                                                                 │
│  Region          [us-east-1 ▼]                                  │
│                                                                 │
│  Access Key ID   [AKIA..._____________________________]         │
│                                                                 │
│  Secret Key      [••••••••••••••••••••________________]         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Master Password [••••••••••••••••••__________________]         │
│  (to decrypt vault)                                             │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Test Connection]                    [Cancel]  [Connect]       │
└─────────────────────────────────────────────────────────────────┘
```

### Device Management

Each device generates a unique ID on first setup:

```typescript
interface DeviceInfo {
  deviceId: string; // UUID, generated once
  deviceName: string; // User-editable ("Work Laptop", "Home PC")
  browserInfo: string; // "Chrome 120 on Windows"
  firstSeen: number;
  lastSync: number;
}
```

**Device List (in Settings):**

```
┌─────────────────────────────────────────────────────────────────┐
│  Connected Devices                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📱 Home PC (this device)                                       │
│     Chrome 120 • Windows 11 • Last sync: 2 min ago              │
│                                                                 │
│  💼 Work Laptop                                                 │
│     Firefox 121 • macOS • Last sync: 3 days ago                 │
│     [Rename] [Remove]                                           │
│                                                                 │
│  📱 Old Phone                                          ⚠️        │
│     Chrome 118 • Android • Last sync: 45 days ago               │
│     [Rename] [Remove]                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Remove Device:**

- Doesn't delete data from that device (can't remotely wipe)
- Removes from "known devices" list
- User should change master password if device is lost/stolen

### Offline-First Considerations

Since devices may not have simultaneous internet access:

```
┌─────────────────────────────────────────────────────────────────┐
│                     TYPICAL USAGE PATTERN                       │
└─────────────────────────────────────────────────────────────────┘

Morning (Home PC):
  1. Unlock vault with master password
  2. Add new password for work tool
  3. Sync → uploads changes to cloud
  4. Close browser, go to work

Day (Work Laptop):
  1. Unlock vault with master password
  2. Sync → downloads changes from cloud (gets new password)
  3. Use passwords throughout day
  4. Add/modify some passwords
  5. Sync before leaving → uploads changes

Evening (Home PC):
  1. Unlock vault
  2. Sync → gets work changes
  3. If conflict (both modified same entry) → resolve manually
```

**Key insight:** Sync is always user-initiated or on-unlock, never real-time. This matches the non-simultaneous access pattern.

### Security Considerations

| Concern             | Mitigation                                                 |
| ------------------- | ---------------------------------------------------------- |
| QR code intercepted | Expires quickly, one-time use, optional PIN                |
| Config file stolen  | Encrypted with master password                             |
| Device lost/stolen  | Change master password, data still encrypted locally       |
| Man-in-the-middle   | Cloud providers use TLS, vault double-encrypted            |
| Credential exposure | Cloud credentials have minimal permissions (single bucket) |

---

## 9. Implementation Priority

1. **Phase 1**: Manual sync button (no auto-sync)
2. **Phase 2**: Basic diff detection (modified only)
3. **Phase 3**: Full diff UI with conflict resolution
4. **Phase 4**: Auto-sync on unlock (optional setting)
5. **Phase 5**: Sync history/audit log
6. **Phase 6**: Multi-device setup (manual config first)
7. **Phase 7**: QR code transfer
8. **Phase 8**: Config export/import
9. **Phase 9**: Device management UI
