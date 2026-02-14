# Multi-Device Setup

> **Local-First:** The vault works fully offline using IndexedDB as primary storage. Multi-device sync is **optional** — you can use the extension on a single device without any cloud configuration.

## The Challenge

Browser extension context creates unique constraints:

- **No central server** — can't store connection configs server-side
- **Devices at different locations** — home PC, work laptop, not always accessible together
- **No simultaneous access** — can't easily "pair" devices in real-time
- **Security-first** — transferring credentials must be safe

## What Needs to Be Shared (for Multi-Device)

| Data                  | How Shared                | Notes                                            |
| --------------------- | ------------------------- | ------------------------------------------------ |
| Master password       | **User memorizes**        | Never transferred electronically                 |
| Secret key            | **User saves offline**    | 256-bit, needed for device enrollment & recovery |
| Cloud provider config | Transfer mechanism        | S3 bucket, credentials, region                   |
| Encryption salt       | In vault envelope (cloud) | Also stored locally in IndexedDB                 |
| Device ID             | Generated locally         | Each device has unique ID                        |

> **Single-device use:** None of the above is required. The vault is stored locally in IndexedDB with no cloud dependency.

## Setup Methods

These methods transfer **cloud provider config only** (S3 bucket, credentials, region). The actual vault unlock uses master password + secret key — no device-to-device key transfer is needed.

New device enrollment: enter cloud config + master password + secret key → download vault → unwrap VaultKey from secret key slot → self-register.

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
│         │  ██ █   █ █▄▄▄█▄█   ██  │  <- QR contains:           │
│         │  ██ █▄▄▄█ █ ▄▄ █ ▄▄▄██  │     - Provider type        │
│         │  ██▄▄▄▄▄▄▄█▄█ █▄█▄█▄██  │     - Bucket/container     │
│         │  ██ ▄▄ ▄▄▄ ▄▄▄█▄▄ ▄ ██  │     - Region               │
│         └─────────────────────────┘     - Access credentials   │
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

### Method 2: Configuration Export File

For devices that can't be in same location:

```text
Device A: Settings → Sync → Export Config → Downloads "spm-config.encrypted"
          ↓
          (Transfer via secure channel: email to self, USB, cloud drive)
          ↓
Device B: Settings → Sync → Import Config → Select file → Enter master password
```

**File contents (encrypted with master-password-derived key):**

```typescript
// core/sync/provider-config.type.ts

interface ProviderConfigBase {
  readonly region: string;
}

interface S3ProviderConfig extends ProviderConfigBase {
  readonly provider: "aws-s3";
  readonly bucket: string;
  readonly identityPoolId: string; // Cognito Identity Pool ID
  readonly prefix: string; // S3 key prefix (e.g., "user/")
}

interface GCSProviderConfig extends ProviderConfigBase {
  readonly provider: "gcs";
  readonly bucket: string;
  readonly credentials: string; // path or inline JSON
  readonly prefix: string;
}

interface AzureBlobProviderConfig extends ProviderConfigBase {
  readonly provider: "azure-blob";
  readonly storageAccount: string;
  readonly container: string;
  readonly credential: string; // SAS token or connection string
  readonly prefix: string;
}

type ProviderConfig =
  | S3ProviderConfig
  | GCSProviderConfig
  | AzureBlobProviderConfig;

interface ExportedConfig {
  readonly version: 1;
  readonly provider: "aws-s3" | "gcs" | "azure-blob";
  readonly config: ProviderConfig;
  readonly exportedAt: number; // Unix ms
  readonly expiresAt: number | null;
  // Note: vault data NOT included, only connection config
}
```

**Security:**

- File encrypted — useless without master password
- User responsible for secure transfer
- Can set expiration on exported config

### Method 3: Manual Configuration

For security-conscious users who prefer explicit setup:

```text
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
| QR code intercepted    | Expires quickly, one-time use, optional PIN                             |
| Config file stolen     | Encrypted with master password                                          |
| Device lost/stolen     | Revoke device key (triggers key rotation), data still encrypted locally |
| Secret key compromised | Rotate VaultKey + generate new secret key from any trusted device       |
| Unknown device added   | Notification shown on sync. User can revoke if unauthorized.            |
| Man-in-the-middle      | Cloud providers use TLS, vault encrypted with device-specific key slots |
| Credential exposure    | Cloud credentials have minimal permissions (single bucket)              |
