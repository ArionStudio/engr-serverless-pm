# Sync Strategy Design

> **Status**: Design document
> **Date**: 2026-01-17
> **Related**: [architecture-comparison.md](../architecture/architecture-comparison.md)

---

## 1. Core Principle

**Local-first, user-controlled sync** — vault works fully offline, sync is optional.

**Sync after unlock** — provider configuration and credentials are encrypted vault
contents. The app must unlock the local vault snapshot before it can authenticate
to the sync provider.

**User-controlled conflict resolution** — no auto-merge for security-critical data.

Why:

- Password managers hold sensitive credentials
- Silent merges can overwrite intentional changes
- Users must see and approve every conflict resolution
- Auditable sync history for security reviews

---

## 2. Credential Model

Sync credentials are stored inside the encrypted vault payload, alongside the
password entries and device registry. There is no separate local encrypted
`syncConfig` blob and no master-password-derived purpose key for sync
credentials.

Consequences:

- locked vault means no sync credentials are available
- sync upload/download requires an unlocked local vault session
- enrollment obtains a local encrypted vault snapshot first through a separate
  file or short-lived link; after unlock, the target device reads sync
  credentials from that vault
- rotating cloud credentials is a vault update that must be synced before the
  old cloud key is revoked

---

## 3. Sync Flow

### 6-Step Process

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    SYNC FLOW (Optional)                             │
│              Requires: Sync enabled + Network access                │
└─────────────────────────────────────────────────────────────────────┘

Step 1: User unlocks local vault, then initiates sync (manual or scheduled)
         │
         ▼
Step 2: If sync enabled, read credentials from unlocked vault
         and download remote vault snapshot
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

> **Note:** This flow only applies when sync is enabled. The vault works fully offline using IndexedDB as primary storage.

| Step | Action                                                                 | User Involvement             |
| ---- | ---------------------------------------------------------------------- | ---------------------------- |
| 1    | Trigger sync from an unlocked vault session                            | Click button or auto-trigger |
| 2    | Read sync credentials from decrypted vault and fetch `vault.encrypted` | None (background)            |
| 3    | Decrypt remote snapshot with the Vault Key, run diff algorithm         | None (background)            |
| 4    | If conflicts exist, pause and show diff UI                             | **Required**                 |
| 5    | User picks local/remote/skip for each conflict                         | **Required**                 |
| 6    | Encrypt merged vault, save to IndexedDB, upload to cloud               | None (background)            |

---

## 4. Conflict Detection Types

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

## 5. Diff UI Design

### Conflict Resolution Screen

```text
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

## 6. Architecture Types

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
  // Object operations
  upload(key: string, data: Uint8Array): Promise<void>;
  download(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;

  // Sync metadata
  getLastSyncTimestamp(): Promise<number | null>;
  setLastSyncTimestamp(timestamp: number): Promise<void>;

  // Connection management
  testConnection(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  initialize(): Promise<void>;
  disconnect(): Promise<void>;
}

// Sync adapter credentials are supplied from the unlocked vault session.
// Diff logic lives in core domain, not in port
// core/sync/sync.service.ts handles:
// - computeDiff(local, remote): SyncDiff
// - applyResolutions(diff, resolutions): MergedVault
```

---

## 7. Sync States

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

## 8. Edge Cases

| Scenario                                  | Handling                                   |
| ----------------------------------------- | ------------------------------------------ |
| Vault locked when scheduled sync fires    | Defer sync until next unlock               |
| Offline during sync                       | Show error, retry when online              |
| Master password changed on another device | Prompt for new password, re-derive keys    |
| Vault corrupted in cloud                  | Option to overwrite with local or abort    |
| Sync interrupted mid-upload               | Atomic upload - temp file, then rename     |
| Cloud credentials rotated in vault        | Keep old key active until all devices sync |
| Very large vault (1000+ entries)          | Paginated diff UI, progress indicator      |

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
