import type {
  BrowserLoginPage,
  CaptureBrowserLoginCommand,
  CaptureBrowserLoginResult,
  ClockPort,
  IdPort,
  ReadBrowserLoginsUseCase,
  FillBrowserLoginUseCase,
  DismissCapturedLoginUseCase,
} from "@lfspm/core";
import type { UnlockedVaultSessionService } from "@lfspm/core/services";

export type BrowserLoginResources = {
  readonly unlockedVaultSession: UnlockedVaultSessionService;
  readonly clock: ClockPort;
  readonly ids: IdPort;
};
export type BrowserLoginRuntimeCapabilities = {
  readonly capture: {
    execute: (
      submission: CaptureBrowserLoginCommand,
    ) => Promise<CaptureBrowserLoginResult>;
  };
  readonly pending: { execute: (page: BrowserLoginPage) => Promise<boolean> };
};
export type BrowserLoginApplication = BrowserLoginRuntimeCapabilities & {
  readonly read: ReadBrowserLoginsUseCase;
  readonly fill: FillBrowserLoginUseCase;
  readonly dismiss: DismissCapturedLoginUseCase;
};
