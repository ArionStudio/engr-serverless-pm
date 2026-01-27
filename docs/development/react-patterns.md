# React Patterns

Quick reference for React patterns used in this project.

## Custom Hooks

### Purpose

React's primary abstraction mechanism is **custom hooks**. They share _stateful logic_, not state itself. Hooks abstract external systems and let components express intent rather than implementation:

```typescript
// This hook abstracts the external system (Web Crypto API)
function useCrypto() {
  const encrypt = useCallback(async (data: string, key: CryptoKey) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(data),
    );
    return { ciphertext: new Uint8Array(ciphertext), iv };
  }, []);

  return { encrypt, decrypt, deriveKey };
}

// Components express intent, not implementation
function PasswordForm() {
  const { encrypt } = useCrypto();
  // ...
}
```

### When to Extract

Extract when:

- Multiple components need the same stateful logic
- Logic synchronizes with external systems (crypto, storage, network)
- Complexity benefits from encapsulation

Don't extract for:

- Simple single-line state
- Generic lifecycle wrappers

### Naming

Hook names should reflect their scope and purpose:

**Domain hooks** (`use[Domain]`) expose a full API for a resource or system:

```typescript
// Exposes all password operations
const { passwords, add, update, remove } = usePasswords();

// Exposes all crypto operations
const { encrypt, decrypt, deriveKey } = useCrypto();
```

Use domain hooks when a component needs general access to a resource.

**Action hooks** (`use[Action]`) do one specific task, often combining multiple domains:

```typescript
// Combines crypto + storage for a specific workflow
const { encryptAndSave, isLoading } = usePasswordEncryption();
```

Use action hooks when a component needs a specific operation that spans multiple concerns, or when you want to encapsulate a multi-step workflow.

## Dependency Injection

### Context Pattern

React favors composition over inheritance. Context provides dependency injection without prop drilling:

```typescript
// Context for dependency injection (React-idiomatic)
const CryptoContext = createContext<CryptoPort | null>(null);

function CryptoProvider({ adapter, children }: Props) {
  return (
    <CryptoContext.Provider value={adapter}>
      {children}
    </CryptoContext.Provider>
  );
}

// Hook consumes the injected dependency
function useCrypto(): CryptoPort {
  const crypto = useContext(CryptoContext);
  if (!crypto) throw new Error('useCrypto must be used within CryptoProvider');
  return crypto;
}
```

### When to Use Context vs Direct Import

Context adds indirection. That indirection is useful when you need to swap implementations—for testing, for different environments, or for user configuration. It's overhead when you don't.

**Use Context** when the implementation may vary:

```typescript
// Testing: inject a mock crypto adapter
// Production: inject the real Web Crypto adapter
<CryptoProvider adapter={isTest ? mockCrypto : webCrypto}>
  <App />
</CryptoProvider>
```

Examples: crypto adapters, storage backends, sync services, API clients.

**Use direct imports** when the implementation is fixed:

```typescript
// These never change—no reason to inject them
import { formatDate } from "../utils/date";
import { PASSWORD_MIN_LENGTH } from "../constants";
```

Examples: pure utility functions, constants, type definitions, validation helpers.

## State Management with Zustand

### Why Zustand

Zustand provides global state without the boilerplate of Redux or the re-render issues of Context. It's a simple store that lives outside React's component tree.

```typescript
import { create } from "zustand";

interface PasswordStore {
  passwords: Password[];
  isLoading: boolean;
  add: (password: Password) => void;
  remove: (id: string) => void;
}

export const usePasswordStore = create<PasswordStore>((set) => ({
  passwords: [],
  isLoading: false,
  add: (password) =>
    set((state) => ({
      passwords: [...state.passwords, password],
    })),
  remove: (id) =>
    set((state) => ({
      passwords: state.passwords.filter((p) => p.id !== id),
    })),
}));
```

### Zustand vs Context vs Local State

These serve different purposes:

| Tool            | Purpose                                                | Examples                                       |
| --------------- | ------------------------------------------------------ | ---------------------------------------------- |
| **Zustand**     | Global application state shared across many components | Password list, user session, UI preferences    |
| **Context**     | Dependency injection (swapping implementations)        | Crypto adapter, storage backend, API client    |
| **Local state** | Component-specific state                               | Form inputs, open/closed toggles, hover states |

**Rule of thumb**: If you're putting _data_ in Context that multiple components read/write, use Zustand instead. Reserve Context for _dependencies_ (things you might swap out).

### Connecting Stores to Adapters

Zustand stores can use injected adapters. The store handles state; the adapter handles the external system:

```typescript
// Store actions call the adapter, then update state
export const usePasswordStore = create<PasswordStore>((set, get) => ({
  passwords: [],

  // This will be called with an adapter from Context
  loadPasswords: async (storageAdapter: StoragePort) => {
    set({ isLoading: true });
    const passwords = await storageAdapter.getAll();
    set({ passwords, isLoading: false });
  },
}));

// Component wires them together
function PasswordList() {
  const storage = useStorage(); // from Context
  const { passwords, loadPasswords } = usePasswordStore();

  useEffect(() => {
    loadPasswords(storage);
  }, [storage]);
}
```

Alternatively, initialize the store with adapters at app startup if they don't change.

## Component Patterns

### Purity Rules

From [React Rules](https://react.dev/reference/rules):

- Components and hooks must be **pure** (idempotent, no side effects in render)
- Props and state are **immutable**
- Side effects belong in **useEffect** or event handlers

### Props vs Hooks

- **Props**: data and callbacks from parent
- **Hooks**: external system access (crypto, storage)

## See Also

- [conventions.md](./conventions.md) - File naming and structure
- [architecture-comparison.md](../architecture/architecture-comparison.md) - Why Hexagonal architecture
