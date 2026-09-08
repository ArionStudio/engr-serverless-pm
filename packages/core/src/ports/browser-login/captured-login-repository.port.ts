import type {
  CapturedLogin,
  CapturedLoginContext,
} from "../../domain/browser-login/browser-login.type";

export interface CapturedLoginRepositoryPort {
  save: (value: CapturedLogin, context: CapturedLoginContext) => Promise<void>;
  read: (
    tabId: number,
    context: CapturedLoginContext,
  ) => Promise<CapturedLogin | null>;
  remove: (tabId: number, id: string) => Promise<void>;
}
