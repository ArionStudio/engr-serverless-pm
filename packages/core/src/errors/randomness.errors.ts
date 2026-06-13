export class InvalidRandomIndexUpperBoundError extends Error {
  constructor() {
    super(
      "Random index upper bound must be a positive safe integer within uint32 range.",
    );
    this.name = "InvalidRandomIndexUpperBoundError";
  }
}

export class InvalidRandomBytesLengthError extends Error {
  readonly actualByteLength: number;

  constructor(actualByteLength: number) {
    super(
      `Random byte source returned invalid byte length: ${actualByteLength}.`,
    );
    this.name = "InvalidRandomBytesLengthError";
    this.actualByteLength = actualByteLength;
  }
}
