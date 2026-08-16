export interface ClipboardTransferControl {
  value: string;
  focus(): void;
  select(): void;
}

export interface ClipboardCommandExecutor {
  execCommand(command: "copy" | "paste"): boolean;
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
  commandExecutor: ClipboardCommandExecutor,
  transferControl: ClipboardTransferControl,
  value: string,
): void {
  transferControl.value = value;

  try {
    executeClipboardCommand(commandExecutor, transferControl, "copy");
  } finally {
    transferControl.value = "";
  }
}
