# React Patterns for SPM (Saved for Later)

> **Note**: This content was extracted from `architecture-comparison.md` during restructuring.
> It contains important React-idiomatic patterns that may influence project conventions.
> This topic will be explored further after the architecture decision is finalized.

---

## React-Idiomatic Patterns

Before comparing architectures, we must understand how React is designed to work. These patterns come from [React official documentation](https://react.dev/learn/reusing-logic-with-custom-hooks).

### Custom Hooks as Abstraction Layer

React's primary abstraction mechanism is **custom hooks**. They share _stateful logic_, not state itself:

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

### Composition Over Inheritance

React favors composition patterns:

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

### Purity Rules

From [React Rules](https://react.dev/reference/rules):

- Components and hooks must be **pure** (idempotent, no side effects in render)
- Props and state are **immutable**
- Side effects belong in **useEffect** or event handlers

### When to Extract Hooks

Extract when:

- Multiple components need the same stateful logic
- Logic synchronizes with external systems (crypto, storage, network)
- Complexity benefits from encapsulation

Don't extract for:

- Simple single-line state
- Generic lifecycle wrappers

---

## Relevance to Architecture

These patterns support the Ports/Adapters architecture:

1. **Custom hooks** act as the "driving adapters" - they connect React components to core ports
2. **Context** provides dependency injection without prop drilling
3. **Purity rules** align with keeping core domain logic side-effect-free

## Next Steps

- [ ] Decide if these patterns should be added to `conventions.md`
- [ ] Document hook naming conventions (e.g., `usePassword` vs `usePasswordService`)
- [ ] Define when to use Context vs direct imports for adapters
