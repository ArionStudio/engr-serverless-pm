export class InvalidVaultTagError extends Error {
  constructor(cause: unknown) {
    super("Vault tag is invalid.", { cause });
    this.name = "InvalidVaultTagError";
  }
}

export class DuplicateVaultTagError extends Error {
  public readonly tagId: string;

  constructor(tagId: string) {
    super(`Tag "${tagId}" already exists.`);
    this.name = "DuplicateVaultTagError";
    this.tagId = tagId;
  }
}

export class DuplicateVaultTagNameError extends Error {
  constructor() {
    super("A tag with this name already exists.");
    this.name = "DuplicateVaultTagNameError";
  }
}

export class VaultTagNotFoundError extends Error {
  public readonly tagId: string;

  constructor(tagId: string) {
    super(`Tag "${tagId}" was not found.`);
    this.name = "VaultTagNotFoundError";
    this.tagId = tagId;
  }
}

export class InvalidExpectedTagVersionError extends Error {
  override readonly name = "InvalidExpectedTagVersionError";

  constructor() {
    super("The expected tag version is invalid.");
  }
}

export class VaultTagChangedError extends Error {
  override readonly name = "VaultTagChangedError";

  constructor() {
    super("The tag changed after it was read.");
  }
}

export class VaultTagInUseError extends Error {
  public readonly tagId: string;
  public readonly entryCount: number;

  constructor(tagId: string, entryCount: number) {
    super(`Tag "${tagId}" is used by ${entryCount} vault entries.`);
    this.name = "VaultTagInUseError";
    this.tagId = tagId;
    this.entryCount = entryCount;
  }
}

export class InvalidVaultTagReferenceError extends Error {
  public readonly entryId: string;
  public readonly tagId: string;

  constructor(entryId: string, tagId: string) {
    super(`Entry "${entryId}" references missing tag "${tagId}".`);
    this.name = "InvalidVaultTagReferenceError";
    this.entryId = entryId;
    this.tagId = tagId;
  }
}
