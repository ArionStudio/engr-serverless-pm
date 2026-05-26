export interface ClipboardPort {
  readText: () => Promise<string>;
  writeText: (value: string) => Promise<void>;
}
