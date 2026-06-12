export class DuplicateVaultEntryError extends Error {
  public readonly entryId: string;

  constructor(entryId: string) {
    super(`Entry "${entryId}" already exists.`);
    this.name = "DuplicateVaultEntryError";
    this.entryId = entryId;
    Object.setPrototypeOf(this, DuplicateVaultEntryError.prototype);
  }
}
