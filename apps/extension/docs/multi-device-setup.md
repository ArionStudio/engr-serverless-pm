# Multi-Device Setup

## The Challenge

Browser extension context creates unique constraints:

- **No central server** — can't store connection configs server-side
- **Devices at different locations** — home PC, work laptop, not always accessible together
- **No simultaneous access** — can't easily "pair" devices in real-time
- **Security-first** — transferring credentials must be safe

## What Needs to Be Shared

| Data                  | How Shared         | Notes                            |
| --------------------- | ------------------ | -------------------------------- |
| Master password       | **User memorizes** | Never transferred electronically |
| Cloud provider config | Transfer mechanism | S3 bucket, credentials, region   |
| Encryption salt       | Stored in cloud    | Downloaded on first sync         |
| Device ID             | Generated locally  | For sync conflict attribution    |

## Setup Methods

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
  region: string;
}

interface S3ProviderConfig extends ProviderConfigBase {
  provider: "aws-s3";
  bucket: string;
  identityPoolId: string; // Cognito Identity Pool ID
  prefix: string; // S3 key prefix (e.g., "user/")
}

// Future providers follow the same pattern:
// interface GCSProviderConfig extends ProviderConfigBase { ... }
// interface AzureProviderConfig extends ProviderConfigBase { ... }

type ProviderConfig = S3ProviderConfig; // Union with future providers

interface ExportedConfig {
  version: 1;
  provider: "aws-s3" | "gcs" | "azure-blob";
  config: ProviderConfig;
  exportedAt: number;
  expiresAt: number; // Optional expiration timestamp
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
interface DeviceInfo {
  deviceId: string; // UUID, generated once
  deviceName: string; // User-editable ("Work Laptop", "Home PC")
  browserInfo: string; // "Chrome 120 on Windows"
  firstSeen: number;
  lastSync: number;
}
```

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
- Removes from "known devices" list
- User should change master password if device is lost/stolen

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

## Security Considerations

| Concern             | Mitigation                                                 |
| ------------------- | ---------------------------------------------------------- |
| QR code intercepted | Expires quickly, one-time use, optional PIN                |
| Config file stolen  | Encrypted with master password                             |
| Device lost/stolen  | Change master password, data still encrypted locally       |
| Man-in-the-middle   | Cloud providers use TLS, vault double-encrypted            |
| Credential exposure | Cloud credentials have minimal permissions (single bucket) |
