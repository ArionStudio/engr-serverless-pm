# Conventions

## Architecture Concepts

| Concept     | Suffix       | Purpose                      | State? | Location                             |
| ----------- | ------------ | ---------------------------- | ------ | ------------------------------------ |
| **Type**    | .type.ts     | Data shape and domain models | No     | `core/[domain]/`                     |
| **Port**    | .port.ts     | Interface contract           | No     | `core/[domain]/`                     |
| **Adapter** | .adapter.ts  | Implements port              | No     | `adapters/[domain]/`                 |
| **Store**   | .store.ts    | Global state (Zustand)       | Yes    | `ui/[domain]/` or `ui/lib/stores/`   |
| **Hook**    | .hook.ts     | React hooks                  | Yes    | `ui/[domain]/` or `ui/lib/hooks/`    |
| **Context** | .context.tsx | Dependency injection         | No\*   | `ui/[domain]/` or `ui/lib/contexts/` |
| **View**    | .view.tsx    | Presentational components    | No     | `ui/[domain]/`                       |

\*Context provides values, doesn't hold mutable state (stores do that)

## Other File Types

Files use dot notation: `[name].[type].[ext]`

| Suffix         | Purpose               | Example                     |
| -------------- | --------------------- | --------------------------- |
| `.util.ts`     | Utility functions     | `cn.util.ts`                |
| `.const.ts`    | Constants             | `storage-keys.const.ts`     |
| `.test.ts`     | Unit tests            | `crypto.port.test.ts`       |
| `.stories.tsx` | Storybook stories     | `password-list.stories.tsx` |
| `.schema.ts`   | ZOD schema validation | `password.schema.ts`        |

## Directory Structure

```
src/
├── core/                    # [PURE] Types and Ports only - NO REACT
│   ├── crypto/
│   │   ├── crypto.port.ts
│   │   ├── encrypted-data.type.ts
│   │   └── index.ts
│   ├── passwords/
│   │   ├── password.type.ts
│   │   ├── password-repository.port.ts
│   │   └── index.ts
│   └── sync/
│       ├── sync.port.ts
│       └── index.ts
│
├── adapters/                # Implements core ports
│   ├── crypto/
│   │   ├── web-crypto.adapter.ts
│   │   └── index.ts
│   ├── storage/
│   │   ├── indexeddb.adapter.ts
│   │   └── index.ts
│   └── sync/
│       ├── s3.adapter.ts
│       ├── gcs.adapter.ts
│       └── index.ts
│
├── ui/                      # REACT + Zustand state management
│   ├── components/          # Shared UI primitives
│   │   ├── primitives/
│   ├── passwords/           # Domain feature
│   │   ├── password-list.view.tsx
│   │   ├── password-form.view.tsx
│   │   ├── passwords.hook.ts
│   │   ├── passwords.store.ts
│   │   └── index.ts
│   ├── sync/                # Domain feature
│   │   └── sync-status.view.tsx
│   │   └── sync.store.ts
│   └── lib/                 # Shared across features
│       ├── hooks/
│       ├── contexts/
│       └── stores/
│
└── extension/               # Entry points (bootstrap only)
    ├── popup/               # Imports from ui/ core/ adapters/
    ├── options/             # Imports from ui/ core/ adapters/
    └── background/          # STANDALONE - NO REACT only core/ adapters/
```

## Layers

```
┌─────────────────────────┐      ┌─────────────────────────┐
│       UI Layer          │      │    Background Layer     │
│  React Views + Stores   │      │     (Service Worker)    │
│         src/ui/         │      │   extension/background/ │
└────────────┬────────────┘      └────────────┬────────────┘
             │                                │
             │     ┌────────────────────┐     │
             └────►│   Adapters Layer   │◄────┘
                   │ (Repositories/APIs)│
                   │    src/adapters/   │
                   └─────────┬──────────┘
                             │
                   ┌─────────▼──────────┐
                   │     Core Layer     │
                   │  (Types + Ports)   │
                   │     src/core/      │
                   │   NO DEPENDENCIES  │
                   └────────────────────┘
```

**Dependency rule**: Dependencies point inward. Core has no imports from adapters or ui.

## Ports

Ports are interfaces in `core/` that define what the application needs.

```typescript
// core/crypto/crypto.port.ts
export interface CryptoPort {
  deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey>;
  encrypt(data: Uint8Array, key: CryptoKey): Promise<EncryptedData>;
  decrypt(data: EncryptedData, key: CryptoKey): Promise<Uint8Array>;
}
```

## Adapters

Adapters implement ports using specific technologies.

```typescript
// adapters/crypto/web-crypto.adapter.ts
import type { CryptoPort, EncryptedData } from "@/core/crypto";

export const webCryptoAdapter: CryptoPort = {
  async deriveKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  },

  async encrypt(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data,
    );
    return { iv, ciphertext: new Uint8Array(ciphertext) };
  },

  async decrypt(data, key) {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: data.iv },
      key,
      data.ciphertext,
    );
    return new Uint8Array(plaintext);
  },
};
```

## Dependency Injection

Contexts wire adapters to ports for React components.

```typescript
// ui/contexts/crypto.context.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { CryptoPort } from "@/core/crypto";
import { webCryptoAdapter } from "@/adapters/crypto";

const CryptoContext = createContext<CryptoPort | null>(null);

export function CryptoProvider({ children }: { children: ReactNode }) {
  return (
    <CryptoContext.Provider value={webCryptoAdapter}>
      {children}
    </CryptoContext.Provider>
  );
}

export function useCrypto(): CryptoPort {
  const context = useContext(CryptoContext);
  if (!context) throw new Error("useCrypto must be within CryptoProvider");
  return context;
}
```

## Hooks

Hooks consume ports and contain business logic.

```typescript
// ui/passwords/passwords.hook.ts
import { useState, useCallback } from "react";
import type { CryptoPort } from "@/core/crypto";
import type { Password, EncryptedPassword } from "./password.type";

export function usePasswordEncryption(crypto: CryptoPort) {
  const [isProcessing, setIsProcessing] = useState(false);

  const encryptPassword = useCallback(
    async (password: Password, key: CryptoKey): Promise<EncryptedPassword> => {
      setIsProcessing(true);
      try {
        const data = new TextEncoder().encode(JSON.stringify(password));
        const encrypted = await crypto.encrypt(data, key);
        return { id: password.id, encrypted };
      } finally {
        setIsProcessing(false);
      }
    },
    [crypto],
  );

  return { encryptPassword, isProcessing };
}
```

## Stores

```typescript
// ui/passwords/passwords.store.ts
import { create } from "zustand";
import type { Password } from "@/core/passwords";
import type { PasswordRepository } from "@/core/passwords";

interface PasswordsState {
  passwords: Password[];
  isLoading: boolean;
  error: string | null;
  loadPasswords: () => Promise<void>;
  addPassword: (password: Password) => Promise<void>;
}

export const createPasswordsStore = (repo: PasswordRepository) =>
  create<PasswordsState>((set, get) => ({
    passwords: [],
    isLoading: false,
    error: null,

    loadPasswords: async () => {
      set({ isLoading: true });
      try {
        const passwords = await repo.getAll();
        set({ passwords, isLoading: false });
      } catch (e) {
        set({ error: "Failed to load", isLoading: false });
      }
    },

    addPassword: async (password) => {
      const prev = get().passwords;
      set({ passwords: [...prev, password] });
      try {
        await repo.save(password);
      } catch (e) {
        set({ passwords: prev, error: "Save failed" });
      }
    },
  }));
```

## Views

Views are presentational components with no business logic.

```typescript
// ui/passwords/password-list.view.tsx
import type { Password } from "@/core/passwords";

interface PasswordListProps {
  passwords: Password[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PasswordList({ passwords, onSelect, onDelete }: PasswordListProps) {
  return (
    <ul>
      {passwords.map((p) => (
        <li key={p.id}>
          <button onClick={() => onSelect(p.id)}>{p.title}</button>
          <button onClick={() => onDelete(p.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
```

## Types

Types define domain objects. Use types over classes.

```typescript
// core/passwords/password.type.ts
export interface Password {
  id: string;
  title: string;
  url: string;
  username: string;
  password: string;
  notes?: string;
  folderId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface EncryptedPassword {
  id: string;
  encrypted: EncryptedData;
}

// Companion object for utilities
export const Password = {
  create: (
    partial: Omit<Password, "id" | "createdAt" | "updatedAt">,
  ): Password => ({
    ...partial,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
} as const;
```

## Entry Points

Entry points are bootstrap only. No component definitions.

```typescript
// extension/popup/popup.tsx
import ReactDOM from "react-dom/client";
import { CryptoProvider } from "@/ui/contexts/crypto.context";
import { Popup } from "@/ui/components/popup";
import "@/ui/styles/index.css";

const root = document.getElementById("popup");
if (root) {
  ReactDOM.createRoot(root).render(
    <CryptoProvider>
      <Popup />
    </CryptoProvider>
  );
}
```

## Barrel Exports

Each folder has `index.ts` exposing public API.

```typescript
// core/crypto/index.ts
export type { CryptoPort } from "./crypto.port";
export type { EncryptedData } from "./encrypted-data.type";

// Usage
import type { CryptoPort, EncryptedData } from "@/core/crypto";
```

## Testing

Ports enable testing without real implementations.

```typescript
// core/crypto/crypto.port.test.ts
import { usePasswordEncryption } from "@/ui/passwords";

const mockCrypto: CryptoPort = {
  deriveKey: vi.fn().mockResolvedValue({} as CryptoKey),
  encrypt: vi
    .fn()
    .mockResolvedValue({ iv: new Uint8Array(), ciphertext: new Uint8Array() }),
  decrypt: vi.fn().mockResolvedValue(new Uint8Array()),
};

test("encrypts password", async () => {
  const { encryptPassword } = usePasswordEncryption(mockCrypto);
  await encryptPassword(testPassword, mockKey);
  expect(mockCrypto.encrypt).toHaveBeenCalled();
});
```

## When to Use Full Hexagonal

Use ports/adapters when:

- Feature needs mocking for tests (crypto, storage, sync)
- Multiple implementations exist (S3, GCS, Azure)
- External API interaction (browser APIs, cloud services)

Keep it simple when:

- Pure UI logic (theme toggle, form validation)
- No external dependencies
- Single implementation forever
