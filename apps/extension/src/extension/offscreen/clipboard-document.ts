export interface ClipboardTransferControl {
  value: string;
  focus(): void;
  select(): void;
}

export interface ClipboardCommandExecutor {
  execCommand(command: "copy" | "paste"): boolean;
}

export interface ClipboardCopyEventTarget {
  addEventListener(
    type: "copy",
    listener: (event: ClipboardEvent) => void,
  ): void;
  removeEventListener(
    type: "copy",
    listener: (event: ClipboardEvent) => void,
  ): void;
}

function executeClipboardCommand(
  commandExecutor: ClipboardCommandExecutor,
  transferControl: ClipboardTransferControl,
  command: "copy" | "paste",
): void {
  transferControl.focus();
  transferControl.select();

  if (!commandExecutor.execCommand(command)) {
    throw new Error(`Clipboard ${command} command failed.`);
  }
}

export function readClipboardText(
  commandExecutor: ClipboardCommandExecutor,
  transferControl: ClipboardTransferControl,
): string {
  transferControl.value = "";

  try {
    executeClipboardCommand(commandExecutor, transferControl, "paste");
    return transferControl.value;
  } finally {
    transferControl.value = "";
  }
}

export function writeClipboardText(
  commandExecutor: ClipboardCommandExecutor & ClipboardCopyEventTarget,
  transferControl: ClipboardTransferControl,
  value: string,
): void {
  let copiedExactValue = false;
  const handleCopy = (event: ClipboardEvent) => {
    if (event.clipboardData === null) {
      return;
    }

    event.clipboardData.setData("text/plain", value);
    event.preventDefault();
    copiedExactValue = true;
  };

  commandExecutor.addEventListener("copy", handleCopy);
  transferControl.value = value.length === 0 ? " " : value;

  try {
    executeClipboardCommand(commandExecutor, transferControl, "copy");

    if (!copiedExactValue) {
      throw new Error("Clipboard copy event did not expose writable data.");
    }
  } finally {
    commandExecutor.removeEventListener("copy", handleCopy);
    transferControl.value = "";
  }
}
