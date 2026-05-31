export class InvalidSyncConfigError extends Error {
  constructor(cause: unknown) {
    super("Sync configuration is invalid.", { cause });
    this.name = "InvalidSyncConfigError";
  }
}
