import type { ClipboardPort } from "@lfspm/core";

export const OFFSCREEN_CLIPBOARD_DOCUMENT_PATH = "offscreen.html";
export const OFFSCREEN_CLIPBOARD_MESSAGE_TARGET = "lfspm:offscreen-clipboard";
export const OFFSCREEN_CLIPBOARD_REASON =
  "CLIPBOARD" as chrome.offscreen.Reason;
export const OFFSCREEN_DOCUMENT_CONTEXT =
  "OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType;
export const OFFSCREEN_CLIPBOARD_RESPONSE_TIMEOUT_MS = 5_000;

export type OffscreenClipboardRequest =
  | {
      readonly target: typeof OFFSCREEN_CLIPBOARD_MESSAGE_TARGET;
      readonly operation: "read";
    }
  | {
      readonly target: typeof OFFSCREEN_CLIPBOARD_MESSAGE_TARGET;
      readonly operation: "write";
      readonly value: string;
    };

export type OffscreenClipboardResponse =
  | { readonly ok: true; readonly value?: string }
  | { readonly ok: false; readonly error: string };

export type ChromeOffscreenApi = {
  createDocument: (parameters: {
    readonly url: string;
    readonly reasons: chrome.offscreen.Reason[];
    readonly justification: string;
  }) => Promise<void>;
};

export type ChromeRuntimeMessenger = {
  getContexts: (filter: {
    readonly contextTypes: chrome.runtime.ContextType[];
    readonly documentUrls: string[];
  }) => Promise<readonly unknown[]>;
};

export type OffscreenDocumentClient = {
  readonly url: string;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

export type OffscreenClientDirectory = {
  matchAll(options: {
    readonly includeUncontrolled: true;
    readonly type: "window";
  }): Promise<readonly OffscreenDocumentClient[]>;
};

type MessageChannelFactory = () => MessageChannel;

function getServiceWorkerClients(): OffscreenClientDirectory {
  const serviceWorkerScope = globalThis as typeof globalThis & {
    readonly clients?: OffscreenClientDirectory;
  };

  if (serviceWorkerScope.clients === undefined) {
    throw new Error("Offscreen clipboard requires a service-worker context.");
  }

  return serviceWorkerScope.clients;
}

function isOffscreenClipboardResponse(
  response: unknown,
): response is OffscreenClipboardResponse {
  if (typeof response !== "object" || response === null) {
    return false;
  }

  const record = response as Record<string, unknown>;

  return (
    (record.ok === true &&
      (record.value === undefined || typeof record.value === "string")) ||
    (record.ok === false && typeof record.error === "string")
  );
}

export class OffscreenClipboard implements ClipboardPort {
  private readonly offscreen: ChromeOffscreenApi;
  private readonly runtime: ChromeRuntimeMessenger;
  private readonly documentUrl: string;
  private readonly clients: OffscreenClientDirectory;
  private readonly createMessageChannel: MessageChannelFactory;
  private documentCreation: Promise<void> | undefined;

  constructor(
    offscreen: ChromeOffscreenApi = chrome.offscreen,
    runtime: ChromeRuntimeMessenger = chrome.runtime,
    documentUrl = chrome.runtime.getURL(OFFSCREEN_CLIPBOARD_DOCUMENT_PATH),
    clients: OffscreenClientDirectory = getServiceWorkerClients(),
    createMessageChannel: MessageChannelFactory = () => new MessageChannel(),
  ) {
    this.offscreen = offscreen;
    this.runtime = runtime;
    this.documentUrl = documentUrl;
    this.clients = clients;
    this.createMessageChannel = createMessageChannel;
  }

  async readText(): Promise<string> {
    const response = await this.send({
      target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
      operation: "read",
    });

    if (typeof response.value !== "string") {
      throw new Error("Offscreen clipboard read returned no value.");
    }

    return response.value;
  }

  async writeText(value: string): Promise<void> {
    await this.send({
      target: OFFSCREEN_CLIPBOARD_MESSAGE_TARGET,
      operation: "write",
      value,
    });
  }

  private async send(
    request: OffscreenClipboardRequest,
  ): Promise<{ readonly ok: true; readonly value?: string }> {
    await this.ensureDocument();
    const response = await this.sendToOffscreenDocument(request);

    if (!response.ok) {
      throw new Error(response.error);
    }

    return response;
  }

  private async sendToOffscreenDocument(
    request: OffscreenClipboardRequest,
  ): Promise<OffscreenClipboardResponse> {
    const documentClients = await this.clients.matchAll({
      includeUncontrolled: true,
      type: "window",
    });
    const documentClient = documentClients.find(
      (candidate) => candidate.url === this.documentUrl,
    );

    if (documentClient === undefined) {
      throw new Error("Offscreen clipboard document client is unavailable.");
    }

    return new Promise((resolve, reject) => {
      const channel = this.createMessageChannel();
      const responseTimeout = globalThis.setTimeout(() => {
        channel.port1.close();
        reject(new Error("Offscreen clipboard response timed out."));
      }, OFFSCREEN_CLIPBOARD_RESPONSE_TIMEOUT_MS);

      const closeResponsePort = () => {
        globalThis.clearTimeout(responseTimeout);
        channel.port1.close();
      };

      channel.port1.onmessage = (event) => {
        closeResponsePort();

        if (!isOffscreenClipboardResponse(event.data)) {
          reject(
            new Error("Offscreen clipboard returned an invalid response."),
          );
          return;
        }

        resolve(event.data);
      };
      channel.port1.onmessageerror = () => {
        closeResponsePort();
        reject(new Error("Offscreen clipboard response could not be decoded."));
      };

      try {
        documentClient.postMessage(request, [channel.port2]);
      } catch (error) {
        closeResponsePort();
        reject(error);
      }
    });
  }

  private async ensureDocument(): Promise<void> {
    const existingContexts = await this.runtime.getContexts({
      contextTypes: [OFFSCREEN_DOCUMENT_CONTEXT],
      documentUrls: [this.documentUrl],
    });

    if (existingContexts.length > 0) {
      return;
    }

    this.documentCreation ??= this.offscreen.createDocument({
      url: this.documentUrl,
      reasons: [OFFSCREEN_CLIPBOARD_REASON],
      justification: "Clear password-manager clipboard contents after timeout.",
    });

    try {
      await this.documentCreation;
    } finally {
      this.documentCreation = undefined;
    }
  }
}
