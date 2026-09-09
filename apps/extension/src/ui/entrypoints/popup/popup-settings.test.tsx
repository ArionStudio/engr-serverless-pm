// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider } from "@/ui/features/theme";
import { PopupSettings } from "./popup-settings.view";

const vault = {
  vaultId: "vault",
  name: "Private vault",
  deviceName: "Laptop",
  duration: 600000,
  complete: true,
  unlocked: true,
};

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  const capabilities = {
    inspectAuthorization: vi.fn(async () => {}),
    saveDevice: vi.fn(async () => {}),
  };
  const onSessionLost = vi.fn();
  render(
    <ThemeProvider>
      <PopupSettings
        vault={vault}
        capabilities={capabilities}
        onSaved={vi.fn()}
        onBusyChange={vi.fn()}
        onOpenOptions={vi.fn()}
        onSessionLost={onSessionLost}
      />
    </ThemeProvider>,
  );
  return { capabilities, onSessionLost };
}

describe("popup settings", () => {
  it("names the wrapping theme control for assistive technology", () => {
    setup();
    expect(screen.getByRole("group", { name: "Color theme" })).toBeVisible();
  });

  it("keeps the device-name draft when a normal save failure remains authorized", async () => {
    const { capabilities, onSessionLost } = setup();
    capabilities.saveDevice.mockRejectedValue(new Error("write failed"));
    fireEvent.change(screen.getByLabelText("Device name"), {
      target: { value: "Private draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Could not save browser settings. Try again.");
    expect(screen.getByLabelText("Device name")).toHaveValue("Private draft");
    expect(capabilities.inspectAuthorization).toHaveBeenCalledWith("vault");
    expect(onSessionLost).not.toHaveBeenCalled();
  });

  it("clears the stale draft after a generic failure confirms authorization loss", async () => {
    const { capabilities, onSessionLost } = setup();
    capabilities.saveDevice.mockRejectedValue(new Error("write failed"));
    capabilities.inspectAuthorization.mockRejectedValue(new Error("locked"));
    fireEvent.change(screen.getByLabelText("Device name"), {
      target: { value: "Private draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
    expect(screen.getByLabelText("Device name")).toHaveValue("Laptop");
    expect(
      screen.queryByText("Could not save browser settings. Try again."),
    ).toBeNull();
  });

  it("clears the stale draft immediately for a known session failure", async () => {
    const { capabilities, onSessionLost } = setup();
    const failure = new Error("expired");
    failure.name = "UnlockedVaultSessionExpiredError";
    capabilities.saveDevice.mockRejectedValue(failure);
    fireEvent.change(screen.getByLabelText("Device name"), {
      target: { value: "Private draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSessionLost).toHaveBeenCalledOnce());
    expect(capabilities.inspectAuthorization).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Device name")).toHaveValue("Laptop");
  });
});
