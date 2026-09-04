import type { IdPort } from "@lfspm/core";

export class WebCryptoIdAdapter implements IdPort {
  private readonly cryptoApi: Pick<Crypto, "randomUUID">;

  constructor(cryptoApi: Pick<Crypto, "randomUUID"> = globalThis.crypto) {
    this.cryptoApi = cryptoApi;
  }

  async generateId(): Promise<string> {
    return this.cryptoApi.randomUUID();
  }
}
