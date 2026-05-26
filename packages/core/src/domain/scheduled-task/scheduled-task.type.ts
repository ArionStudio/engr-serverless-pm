export type ClearClipboardScheduledTask = {
  name: "clearClipboard";
  actionId: string;
};

export type LockVaultScheduledTask = {
  name: "lockVault";
  actionId: string;
};

export type ScheduledTask =
  | ClearClipboardScheduledTask
  | LockVaultScheduledTask;
