# Device Environment Detection

> Design document for device environment info used in user recognition.

## Overview

When users register a device, we capture environment information to help them recognize their devices in the device list. This is **informational only** - not for security purposes.

**Key principle**: User has full control over what environment data to store.

## User Flow

1. **Auto-detect** - System detects OS, device type, browser, location
2. **Preview** - Show detected values in registration form
3. **Opt-in per field** - Checkbox for each field (user can uncheck to not store)
4. **Editable** - User can modify any value (e.g., change "Warsaw, PL" to "Home Office")

## Data Fields

| Field            | Example                          | Source                 |
| ---------------- | -------------------------------- | ---------------------- |
| `os`             | "Windows 11", "macOS", "Android" | User agent parsing     |
| `deviceType`     | "desktop", "tablet", "mobile"    | Screen size heuristics |
| `browser`        | "Chrome"                         | User agent parsing     |
| `browserVersion` | "120"                            | User agent parsing     |
| `location`       | "Warsaw, PL"                     | IP geolocation API     |

## Detection Heuristics

### Device Type from Screen Width

```typescript
import { DEVICE_TYPE_BREAKPOINTS } from "@/core/device/device-environment.const";

function detectDeviceType(): "desktop" | "tablet" | "mobile" {
  const width = window.screen.width;
  if (width < DEVICE_TYPE_BREAKPOINTS.mobile) return "mobile";
  if (width < DEVICE_TYPE_BREAKPOINTS.tablet) return "tablet";
  return "desktop";
}
```

### OS and Browser from User Agent

Use a library like `ua-parser-js` or manual parsing:

```typescript
function detectOSAndBrowser(): {
  os: string;
  browser: string;
  browserVersion: string;
} {
  // Example with ua-parser-js
  const parser = new UAParser(navigator.userAgent);
  const os = parser.getOS();
  const browser = parser.getBrowser();

  return {
    os: `${os.name} ${os.version}`,
    browser: browser.name ?? "Unknown",
    browserVersion: browser.version ?? "Unknown",
  };
}
```

## IP Geolocation

### Service Selection

- **Provider**: ipinfo.io
- **Protocol**: HTTPS only
- **Free tier**: 50,000 requests/month
- **Privacy**: No account required, no tracking

### Implementation

```typescript
import { GEOLOCATION_API_URL } from "@/core/device/device-environment.const";

interface IpInfoResponse {
  city?: string;
  country?: string;
}

async function getLocation(): Promise<string | null> {
  try {
    const res = await fetch(GEOLOCATION_API_URL);
    const data: IpInfoResponse = await res.json();
    return data.city && data.country ? `${data.city}, ${data.country}` : null;
  } catch {
    return null;
  }
}
```

### Timing

- **When**: Only during device registration
- **Not**: On every sync or app open
- **Fallback**: Return `null` if API fails (user can enter manually)

## Registration Form UI

```
+----------------------------------------------+
| Device Environment (optional)                |
|                                              |
| [x] Operating System: [Windows 11    v]      |
| [x] Device Type:      [Desktop       v]      |
| [x] Browser:          [Chrome        v]      |
| [x] Browser Version:  [120           v]      |
| [x] Location:         [Warsaw, PL_______]    |
|                                              |
| This helps you recognize your devices.       |
+----------------------------------------------+
```

### Form Behavior

1. All checkboxes default to checked
2. Unchecking a field excludes it from storage (stored as `null`)
3. Text fields are editable (user can change detected values)
4. Location field may show "Detecting..." then populate, or show empty if failed

## Core Types

See `apps/extension/src/core/device/device-environment.type.ts`:

- `DeviceEnvironment` - Stored with device registry entry
- `DetectedEnvironment` - Auto-detected values before user customization
- `EnvironmentFormState` - Form state with include/value per field

## Adapter Implementation

The adapter layer should implement `DeviceEnvironmentPort`:

```typescript
import type { DeviceEnvironmentPort } from "@/core/device/device-environment.port";
import type { DetectedEnvironment } from "@/core/device/device-environment.type";

export class BrowserDeviceEnvironmentAdapter implements DeviceEnvironmentPort {
  async detect(): Promise<DetectedEnvironment> {
    const [osAndBrowser, location] = await Promise.all([
      this.detectOSAndBrowser(),
      this.getLocation(),
    ]);

    return {
      os: osAndBrowser.os,
      browser: osAndBrowser.browser,
      browserVersion: osAndBrowser.browserVersion,
      deviceType: this.detectDeviceType(),
      location,
    };
  }

  private detectDeviceType(): "desktop" | "tablet" | "mobile" {
    // Implementation
  }

  private detectOSAndBrowser(): {
    os: string;
    browser: string;
    browserVersion: string;
  } {
    // Implementation
  }

  private async getLocation(): Promise<string | null> {
    // Implementation
  }
}
```

## Security Considerations

1. **Not for security** - This data is purely informational for user convenience
2. **User control** - User explicitly chooses what to store
3. **Editable** - User can provide fake/custom values
4. **No fingerprinting** - We don't use this for device verification
5. **Stored encrypted** - Part of the vault, encrypted like everything else
