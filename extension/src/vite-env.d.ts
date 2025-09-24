/// <reference types="vite/client" />
/// <reference types="chrome" />

// Vite hot reload types
interface ImportMeta {
  readonly hot?: {
    accept: (callback?: () => void) => void;
  };
}
