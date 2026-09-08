export type SiteIconPreference = {
  readonly supported: boolean;
  readonly enabled: boolean;
  readonly cleanupRequired: boolean;
};

export type SiteIconCapabilities = {
  read(): Promise<SiteIconPreference>;
  setEnabled(enabled: boolean): Promise<void>;
  subscribe(listener: () => void): () => void;
  source(url: string): string | undefined;
};
