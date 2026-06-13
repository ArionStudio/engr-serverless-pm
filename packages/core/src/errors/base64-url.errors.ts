export class InvalidBase64UrlError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Invalid base64/base64url ${reason}`);
    this.name = "InvalidBase64UrlError";
    this.reason = reason;
  }
}
