# Multi-Device Setup

> **Local-First:** The vault works fully offline using IndexedDB as primary storage. Multi-device sync is **optional** — you can use the extension on a single device without any cloud configuration.

## The Challenge

Browser extension context creates unique constraints:

- **No central server** — can't store connection configs server-side
- **Devices at different locations** — home PC, work laptop, not always accessible together
- **No simultaneous access** — can't easily "pair" devices in real-time
- **Security-first** — transferring credentials must be safe

## What Needs to Be Shared (for Multi-Device)

| Data                       | How Shared                | Notes                                             |
| -------------------------- | ------------------------- | ------------------------------------------------- |
| Master password            | **User memorizes**        | Never transferred electronically                  |
| Secret key                 | **User saves offline**    | 256-bit, needed for vault recovery on new device  |
| Enrollment package         | Transfer mechanism        | Encrypted bootstrap payload from trusted device   |
| One-time enrollment secret | Transfer mechanism        | High-entropy secret used only for package decrypt |
| Encrypted vault snapshot   | Separate file/link        | Local-first starting copy for the new device      |
| Encryption salt            | In vault envelope (cloud) | Also stored locally in IndexedDB                  |
| Device ID                  | Generated locally         | Each device has unique ID                         |

> **Single-device use:** None of the above is required. The vault is stored locally in IndexedDB with no cloud dependency.

## Setup Methods

These methods transfer **enrollment bootstrap data** from an already trusted device. The actual vault unlock still uses master password + secret key on the new device.

New device enrollment: import enrollment package + obtain the encrypted vault snapshot from a separate file or short-lived link + enter one-time enrollment secret + enter master password + secret key → verify snapshot digest/signature against trusted data from package → unwrap VaultKey from secret key slot → decrypt local vault → read sync credentials from the vault if configured → self-register and sync.

### Method 1: QR Code Transfer (Recommended for Same Location)

When user has access to both devices simultaneously:

```text
┌─────────────────────────────────────────────────────────────────┐
│                    DEVICE A (Source)                            │
│                                                                 │
│  Settings → Sync → "Add Another Device"                         │
│                                                                 │
│         ┌─────────────────────────┐                             │
│         │  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  │                             │
│         │  ██ ▄▄▄▄▄ █ ▄ █ ▄▄▄ ██  │                             │
│         │  ██ █   █ █▄▄▄█▄█   ██  │  <- QR contains encrypted │
│         │  ██ █▄▄▄█ █ ▄▄ █ ▄▄▄██  │     enrollment package:   │
│         │  ██▄▄▄▄▄▄▄█▄█ █▄█▄█▄██  │     - snapshot reference  │
│         │  ██ ▄▄ ▄▄▄ ▄▄▄█▄▄ ▄ ██  │     - vault id            │
│         └─────────────────────────┘     - trusted device keys │
│                                                                 │
│  "Transfer this QR and one-time secret to your other device"    │
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
│  │              [ Import File ]                              │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Security:**

- QR code expires after 5 minutes
- Contains encrypted enrollment package, not the full vault snapshot
- One-time enrollment secret is transferred separately
- Does NOT contain master password
- Snapshot is transferred separately or fetched through a short-lived link, and
  the package contains the expected snapshot digest

**User instructions shown on registered device:**

The "Add Another Device" screen must show handling guidance beside the QR/export
controls:

- scan the QR or copy the enrollment text only on a device you control
- do not paste the enrollment text, AWS keys, or enrollment secret into public
  websites, chat rooms, shared documents, issue trackers, or AI tools
- do not screenshot or save the enrollment secret unless the user intentionally
  accepts the risk
- transfer the enrollment secret separately from the enrollment package when
  possible
- delete temporary messages/files after the new device is enrolled
- cancel enrollment if the QR, package, or secret may have been seen by someone
  else

### Method 2: Enrollment Export File

For devices that can't be in same location:

```text
Device A: Settings → Sync → Export Enrollment Package
          → Downloads "spm-enrollment.encrypted"
          → Downloads "spm-vault-snapshot.enc" or creates short-lived snapshot link
	      ↓
	      (Transfer via secure channel: email to self, USB, cloud drive)
	      ↓
Device B: Settings → Sync → Connect Existing Vault
          → Select enrollment package and snapshot file/link
          → Enter one-time enrollment secret
```

**File contents (encrypted with one-time enrollment secret):**

```typescript
// enrollment package shape

type SnapshotTransport =
  | {
      readonly type: "external-file";
      readonly sha256: string;
      readonly sizeBytes: number;
    }
  | {
      readonly type: "presigned-url";
      readonly url: string;
      readonly sha256: string;
      readonly sizeBytes: number;
      readonly expiresAt: number;
    };

interface EnrollmentPackage {
  readonly version: 1;
  readonly vaultId: string;
  readonly snapshot: SnapshotTransport;
  readonly trustedSigningKeys: readonly string[];
  readonly trustedAgreementKeys: readonly string[];
  readonly createdAt: number; // Unix ms
  readonly expiresAt: number | null;
  // Note: vault snapshot bytes, plaintext vault data, and plaintext sync credentials are NOT included
}
```

The S3 credentials are user-provided storage credentials, not service-issued
application credentials. In the local-first design there is no project backend
that can issue temporary credentials or recover from provider misconfiguration.
They are stored inside the encrypted vault payload together with the rest of the
vault data. Unlocking the local vault snapshot makes the sync configuration
available to the current trusted device.

Enrollment packages therefore do not need to expose plaintext S3 configuration
or carry the full encrypted vault snapshot. The package only describes how the
new device obtains the encrypted snapshot and what digest it must match. After
the new device stores that snapshot locally and unlocks it with the user's normal
vault unlock material, it can use the sync credentials already stored in the
vault. Temporary S3 credentials would still need to live beside the unlocked
vault state while the vault is in use. Without a separate trusted backend to
refresh them, they do not materially improve the extension's local storage trust
boundary.

**Security:**

- Enrollment package encrypted — useless without one-time enrollment secret
- Separate vault snapshot remains encrypted with the VaultKey
- Snapshot digest from package must match before trusting the snapshot
- User responsible for secure transfer
- Can set expiration on exported package
- S3 access keys should be rotated in AWS if the unlocked vault or sync
  credentials are exposed

### Method 3: Manual Configuration

For security-conscious users who prefer explicit setup:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Connect to Existing Vault                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Enrollment Data [paste armored payload____________________]    │
│                                                                 │
│  One-Time Secret [••••••••••••••••••••________________]         │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Master Password [••••••••••••••••••__________________]         │
│  Secret Key      [••••••••••••••••••••________________]         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Verify Package]                    [Cancel]  [Connect]        │
└─────────────────────────────────────────────────────────────────┘
```

## Device Management

Each device generates a unique ID on first setup:

```typescript
// core/device/device.type.ts

interface DeviceIdentity {
  readonly deviceId: string; // UUID, generated once
  deviceName: string; // User-editable ("Work Laptop", "Home PC")
}

interface DeviceDisplayInfo extends DeviceIdentity {
  readonly browserInfo: string; // "Chrome 120 on Windows"
  readonly firstSeen: number; // Unix ms
  readonly lastSync: number | null;
  readonly isCurrentDevice: boolean;
}
```

See also `DeviceEnvironment` in `core/device/device-environment.type.ts` for
optional environment info (OS, device type, browser, location) captured at
registration to help users recognize their devices.

**Device List (in Settings):**

```text
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
- Triggers key rotation: new VaultKey + new secret key (old secret key invalidated)
- Re-creates key slots for remaining trusted devices only
- User must save the new secret key (displayed once after rotation)

## Offline-First Considerations

Since devices may not have simultaneous internet access:

```text
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

## Device Location History

Each device records its location on every unlock/sync, appending to its `locationHistory` in the device registry (stored encrypted inside the vault).

- **Detection:** Browser Geolocation API (with user consent) → IP geolocation fallback (`ipinfo.io/json`)
- **Storage:** Unlimited entries (encrypted inside vault, no pruning)
- **Purpose:** User recognition — verify "was this access from me?"
- **New device detection:** On sync, diff local vs remote device registry. If new `deviceId`s appear → show notification with device name, environment info, and registration location.

Users can view location history per device in the device list UI.

## Security Considerations

| Concern                | Mitigation                                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| QR code intercepted    | Expires quickly, protected by one-time enrollment secret                |
| Enrollment file stolen | Encrypted with one-time enrollment secret                               |
| Device lost/stolen     | Revoke device key (triggers key rotation), data still encrypted locally |
| Secret key compromised | Rotate VaultKey + generate new secret key from any trusted device       |
| Unknown device added   | Notification shown on sync. User can revoke if unauthorized.            |
| Man-in-the-middle      | Cloud providers use TLS, vault encrypted with device-specific key slots |
| Credential exposure    | Cloud credentials are vault-encrypted and have minimal permissions      |
