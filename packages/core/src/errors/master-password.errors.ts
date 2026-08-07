export class InvalidNewMasterPasswordError extends Error {
  constructor() {
    super("New master password does not meet the password policy.");
    this.name = "InvalidNewMasterPasswordError";
  }
}
