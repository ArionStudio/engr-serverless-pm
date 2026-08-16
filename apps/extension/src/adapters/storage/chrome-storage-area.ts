export type ChromeStorageArea = {
  get: (keys?: unknown) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  setAccessLevel?: (parameters: {
    readonly accessLevel: "TRUSTED_CONTEXTS";
  }) => Promise<void>;
};
