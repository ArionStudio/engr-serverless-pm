export class InvalidPasswordEntryError extends Error {
  constructor(cause: unknown) {
    super("Password entry is invalid.", { cause });
    this.name = "InvalidPasswordEntryError";
  }
}

export class InvalidSearchEntryQueryError extends Error {
  constructor(cause: unknown) {
    super("Search entry query is invalid.", { cause });
    this.name = "InvalidSearchEntryQueryError";
  }
}

export class UnsupportedEntryUrlProtocolError extends Error {
  constructor(protocol: string) {
    super(`Unsupported entry URL protocol "${protocol}".`);
    this.name = "UnsupportedEntryUrlProtocolError";
  }
}

export class PasswordEntryNotFoundError extends Error {
  constructor(vaultId: string, entryId: string) {
    super(`Password entry "${entryId}" was not found in vault "${vaultId}".`);
    this.name = "PasswordEntryNotFoundError";
  }
}
