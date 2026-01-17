# Conventions

## File Naming

Files use dot notation: `[name].[type].[ext]`

| Suffix         | Purpose                                          | Example                          |
| -------------- | ------------------------------------------------ | -------------------------------- |
| `.type.ts`     | Type definitions, interfaces                     | `theme-preference.type.ts`       |
| `.port.ts`     | Port interfaces (DDD abstractions)               | `theme-repository.port.ts`       |
| `.hook.ts`     | React hooks (reusable stateful logic)            | `theme.hook.ts`                  |
| `.context.tsx` | React context providers                          | `theme.context.tsx`              |
| `.view.tsx`    | Presentational components (props only, no logic) | `theme-toggle.view.tsx`          |
| `.adapter.ts`  | Port implementations                             | `local-storage-theme.adapter.ts` |
| `.util.ts`     | Utility functions                                | `cn.util.ts`                     |
| `.const.ts`    | Constants                                        | `storage-keys.const.ts`          |
| `.test.ts`     | Unit tests                                       | `theme.hook.test.ts`             |
| `.stories.tsx` | Storybook stories                                | `theme-toggle.stories.tsx`       |

## Complexity Levels

Choose the right pattern based on complexity. **Start simple, extract when needed.**

### Simple (Default)

Single component with hooks inside. Use for most features.

```typescript
// ui/components/options.tsx - all in one
export function Options() {
  const { theme, setTheme } = useTheme(); // hook inside component

  return (
    <div>
      <ThemeToggle preference={theme} onThemeChange={setTheme} />
    </div>
  );
}
```

### Reusable UI

Extract `.view.tsx` when the same UI is used in multiple places with different data.

```typescript
// ui/theme/theme-toggle.view.tsx - pure, reusable
interface ThemeToggleProps {
  preference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

export function ThemeToggle({ preference, onThemeChange }: ThemeToggleProps) {
  return /* UI only, no hooks */;
}

// Used by different components that provide their own data
<ThemeToggle preference={theme} onThemeChange={setTheme} />
<ThemeToggle preference={previewTheme} onThemeChange={setPreview} />
```

### Reusable Logic

Extract `.hook.ts` when the same logic is used in multiple components.

```typescript
// core/theme/theme.hook.ts - reusable logic
export function useTheme() {
  const [theme, setTheme] = useState(...);
  // complex logic here
  return { theme, setTheme };
}

// Used by any component that needs theme logic
function Options() {
  const { theme, setTheme } = useTheme();
}
function Popup() {
  const { theme } = useTheme();
}
```

### Complex (DDD)

Use full DDD pattern only when:

- Logic needs to be testable in isolation
- Multiple implementations possible (localStorage vs chrome.storage)
- Feature is core business domain

```
core/[feature]/        → types, ports, hooks
adapters/[feature]/    → implementations
ui/[feature]/          → views, context
```

## Entry Points

Entry points (`src/extension/*/`) are **bootstrap only** - no component definitions.

```typescript
// ✓ Correct - clean bootstrap
import { Options } from "@/ui/components/options";

ReactDOM.createRoot(root).render(
  <ThemeProvider>
    <Options />
  </ThemeProvider>
);

// ✗ Avoid - component in entry point
function OptionsPage() { ... }  // Don't define components here
ReactDOM.createRoot(root).render(<OptionsPage />);
```

## Directory Structure

```
src/
├── core/                    # Domain + Application (complex features)
│   └── [feature]/
│       ├── [name].type.ts
│       ├── [name].port.ts
│       ├── [name].hook.ts
│       └── index.ts
│
├── adapters/                # Infrastructure (external integrations)
│   └── [feature]/
│       ├── [name].adapter.ts
│       └── index.ts
│
├── ui/
│   ├── components/          # Components (simple: hook + UI together)
│   │   ├── primitives/      # Base shadcn components
│   │   ├── options.tsx
│   │   └── popup.tsx
│   ├── [feature]/           # Feature UI (when views need extraction)
│   │   ├── [name].view.tsx
│   │   └── index.ts
│   ├── styles/
│   └── lib/
│
└── extension/               # Entry points (bootstrap only)
    ├── background/
    ├── popup/
    └── options/
```

## Architecture (DDD Layers)

Use when feature complexity justifies it.

```
┌─────────────────────────────────────┐
│           UI Layer                  │  Components, views
│  (src/ui/, src/extension/)          │  Depends on: Core, Adapters
├─────────────────────────────────────┤
│        Adapters Layer               │  localStorage, DOM, APIs
│  (src/adapters/)                    │  Implements: Core ports
├─────────────────────────────────────┤
│          Core Layer                 │  Business logic, types
│  (src/core/)                        │  No dependencies
└─────────────────────────────────────┘
```

## Patterns

### Types over Classes

```typescript
// ✓ Preferred (functional)
export type ThemePreference = "light" | "dark" | "system";

export const ThemePreference = {
  default: (): ThemePreference => "system",
  isValid: (v: string): v is ThemePreference =>
    ["light", "dark", "system"].includes(v),
} as const;

// ✗ Avoid (class-based)
export class ThemePreference {
  constructor(private value: string) {}
}
```

### Ports as Interfaces

```typescript
// core/theme/theme-repository.port.ts
export interface ThemeRepositoryPort {
  save(preference: ThemePreference): void;
  load(): ThemePreference;
}

// adapters/theme/local-storage-theme.adapter.ts
export const localStorageThemeAdapter: ThemeRepositoryPort = {
  save: (pref) => localStorage.setItem(KEY, pref),
  load: () => localStorage.getItem(KEY) ?? "system",
};
```

## Barrel Exports

Each feature folder has an `index.ts` that exports public API:

```typescript
import { useTheme, type ThemePreference } from "@/core/theme";
```

## Storybook

Stories live alongside views:

```
ui/theme/
├── theme-toggle.view.tsx
└── theme-toggle.stories.tsx
```
