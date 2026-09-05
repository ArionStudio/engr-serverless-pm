// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import * as tableLibrary from "@tanstack/react-table";
vi.mock("@tanstack/react-table", { spy: true });
import { EntryTable, TagSelection } from "@/ui/features/entries";
import { SecretField } from "@/ui/components/feedback/action-feedback.view";
import { RecoveryPhraseGrid } from "@/ui/features/recovery";
import { FormExamples } from "./form-examples.view";
import { ScreenExamples } from "./screen-examples.view";
import { SharedExamples, FeatureExamples } from "./product-examples.view";
import { demoTableEntries, demoWords, demoTagLabels } from "./fixtures";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("product presentations", () => {
  it("excludes concealed recovery words from the DOM and removes them on hide", async () => {
    const user = userEvent.setup();
    function Driver() {
      const [shown, setShown] = useState(false);
      return (
        <RecoveryPhraseGrid
          words={shown ? demoWords : undefined}
          onReveal={() => setShown(true)}
          onHide={() => setShown(false)}
        />
      );
    }
    render(<Driver />);
    expect(screen.queryByText("demo-01")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Reveal recovery words" }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(24);
    await user.click(
      screen.getByRole("button", { name: "Hide recovery words" }),
    );
    expect(screen.queryByText("demo-01")).not.toBeInTheDocument();
  });
  it("projects table input, keeps selection by ID across sorting, and filters locally", async () => {
    const user = userEvent.setup();
    const spy = vi.mocked(tableLibrary.useTable);
    const open = vi.fn();
    render(
      <EntryTable
        entries={demoTableEntries.map((entry) => ({
          ...entry,
          password: "FORBIDDEN-row-secret",
          unexpected: "FORBIDDEN-extra",
        }))}
        tagLabels={demoTagLabels}
        onOpen={open}
      />,
    );
    expect(spy.mock.calls[0][0].data).toEqual(demoTableEntries);
    expect(JSON.stringify(spy.mock.calls[0][0].data)).not.toContain(
      "FORBIDDEN",
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Select adrian@example.test" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 selected");
    await user.click(screen.getByRole("button", { name: /Login/ }));
    await user.type(
      screen.getByLabelText("Search entries"),
      "work@example.test",
    );
    expect(screen.getAllByRole("row")).toHaveLength(2);
    await user.click(
      screen.getByRole("button", { name: "Open work@example.test" }),
    );
    expect(open).toHaveBeenCalledWith("demo-3");
    expect(screen.getByRole("status")).toHaveTextContent("0 selected");
    await user.clear(screen.getByLabelText("Search entries"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("status")).toHaveTextContent("Page 2");
  });
  it("reviews selected IDs across pages and clears selection when filters change", async () => {
    const user = userEvent.setup();
    const review = vi.fn();
    render(
      <EntryTable
        entries={demoTableEntries}
        tagLabels={demoTagLabels}
        onOpen={vi.fn()}
        onReviewSelection={review}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Select this page" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("10 selected");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Select this page" }),
    );
    await user.click(screen.getByRole("button", { name: "Review selected" }));
    expect(review).toHaveBeenCalledWith(
      demoTableEntries.slice(0, 20).map((entry) => entry.id),
    );
    await user.type(
      screen.getByLabelText("Search entries"),
      "service-24.example.test",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 entry · 0 selected · Page 1",
    );
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.selectOptions(screen.getByLabelText("Tag"), "3");
    expect(screen.queryByText("adrian@example.test")).not.toBeInTheDocument();
    expect(screen.getByText("travel@example.test")).toBeInTheDocument();
  });
  it("hides optional columns and replaces stale rows with loading/error presentation", async () => {
    const user = userEvent.setup();
    const props = {
      entries: demoTableEntries,
      tagLabels: demoTagLabels,
      onOpen: vi.fn(),
      onRetry: vi.fn(),
    };
    const view = render(<EntryTable {...props} />);
    await user.click(screen.getByRole("button", { name: "Columns" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Website" }),
    );
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("columnheader", { name: "Website" }),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Search entries"),
      "mail.example.test",
    );
    expect(screen.getByText("adrian@example.test")).toBeInTheDocument();
    view.rerender(<EntryTable {...props} state="loading" />);
    expect(screen.queryByText("adrian@example.test")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Columns" })).toBeDisabled();
    view.rerender(<EntryTable {...props} state="error" />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });
  it("retains form drafts after a supplied error and clears value plus reveal on cancel", async () => {
    const user = userEvent.setup();
    render(<FormExamples />);
    const form = within(
      screen
        .getByRole("heading", { name: "PasswordCreationForm" })
        .closest("section")!,
    );
    await user.type(
      form.getByLabelText("New password", { exact: true }),
      "DEMO-only",
    );
    await user.click(form.getByRole("button", { name: "Show new password" }));
    expect(
      form.getByLabelText("New password", { exact: true }),
    ).toHaveAttribute("type", "text");
    await user.selectOptions(
      form.getByLabelText("PasswordCreationForm response"),
      "error",
    );
    expect(form.getByLabelText("New password", { exact: true })).toHaveValue(
      "DEMO-only",
    );
    await user.click(form.getByRole("button", { name: "Back" }));
    expect(form.getByLabelText("New password", { exact: true })).toHaveValue(
      "",
    );
    expect(
      form.getByLabelText("New password", { exact: true }),
    ).toHaveAttribute("type", "password");
  });
  it("disables local recovery submission when local data is missing", async () => {
    const user = userEvent.setup();
    render(<FormExamples />);
    await user.selectOptions(
      screen.getByLabelText("Recovery local data"),
      "missing",
    );
    expect(
      screen.getByRole("button", { name: "Recover local access" }),
    ).toBeDisabled();
  });
  it("keeps challenge positions stable after wrong answers and confirms only corrected positions", async () => {
    const user = userEvent.setup();
    render(<FeatureExamples />);
    const section = within(
      screen
        .getByRole("heading", { name: "RecoveryVerification" })
        .closest("section")!,
    );
    await user.type(section.getByLabelText("Word 3"), "wrong");
    await user.click(section.getByRole("button", { name: "Check words" }));
    expect(section.getByLabelText("Word 3")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(section.getByLabelText("Word 11")).toBeInTheDocument();
    await user.clear(section.getByLabelText("Word 3"));
    for (const p of [3, 11, 20])
      await user.type(section.getByLabelText(`Word ${p}`), demoWords[p - 1]);
    await user.click(section.getByRole("button", { name: "Check words" }));
    await waitFor(() =>
      expect(section.getByRole("status")).toHaveTextContent("confirmed"),
    );
  });
});

describe("setup gallery review states", () => {
  it("distinguishes current, completed, upcoming and failed steps", async () => {
    const user = userEvent.setup();
    render(<SharedExamples />);
    const navigation = within(
      screen
        .getByRole("heading", { name: "StepNavigation" })
        .closest("section")!,
    );
    expect(
      navigation.getByRole("button", { name: /Password.*Current step/ }),
    ).toHaveAttribute("aria-current", "step");
    await user.selectOptions(
      navigation.getByLabelText("Step navigation state"),
      "complete",
    );
    expect(
      navigation.getByRole("button", { name: /Password.*Complete/ }),
    ).not.toHaveAttribute("aria-current");
    await user.selectOptions(
      navigation.getByLabelText("Step navigation state"),
      "upcoming",
    );
    expect(
      navigation.getByRole("button", { name: /Password.*Upcoming/ }),
    ).toBeInTheDocument();
    await user.selectOptions(
      navigation.getByLabelText("Step navigation state"),
      "error",
    );
    expect(
      navigation.getByRole("button", { name: /Password.*Needs attention/ }),
    ).toBeInTheDocument();
  });

  it("exposes pending and retry states in the password form", async () => {
    const user = userEvent.setup();
    render(<FormExamples />);
    const form = within(
      screen
        .getByRole("heading", { name: "PasswordCreationForm" })
        .closest("section")!,
    );
    await user.selectOptions(
      form.getByLabelText("Password creation strength state"),
      "pending",
    );
    expect(form.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.selectOptions(
      form.getByLabelText("Password creation strength state"),
      "unavailable",
    );
    expect(form.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.click(form.getByRole("button", { name: "Try again" }));
    expect(form.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("exposes assessment failure and successful retry in the setup screen", async () => {
    const user = userEvent.setup();
    render(<ScreenExamples />);
    const options = within(
      screen.getByRole("heading", { name: "OptionsView" }).closest("section")!,
    );
    await user.selectOptions(
      options.getByLabelText("First-launch options state"),
      "password-unavailable",
    );
    await user.type(
      options.getByLabelText("New password", { exact: true }),
      "orbit lantern velvet canyon river",
    );
    await user.click(await options.findByRole("button", { name: "Try again" }));
    await options.findByText("Strong", { exact: true });
    expect(options.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("recovery word editing", () => {
  it("normalizes pasted whitespace when switching to numbered fields and preserves blank positions while editing", async () => {
    const user = userEvent.setup();
    render(<FeatureExamples />);
    const input = within(
      screen
        .getByRole("heading", { name: "RecoveryWordInput" })
        .closest("section")!,
    );
    await user.click(input.getByLabelText("Recovery phrase", { exact: true }));
    await user.paste("alpha  beta\r\ngamma\tdelta");
    await user.selectOptions(
      input.getByLabelText("Recovery input state"),
      "numbered",
    );
    expect(input.getByLabelText("Word 2", { exact: true })).toHaveValue("beta");
    expect(input.getByLabelText("Word 3", { exact: true })).toHaveValue(
      "gamma",
    );
    await user.clear(input.getByLabelText("Word 2", { exact: true }));
    await user.type(input.getByLabelText("Word 4", { exact: true }), "x");
    expect(input.getByLabelText("Word 2", { exact: true })).toHaveValue("");
    expect(input.getByLabelText("Word 3", { exact: true })).toHaveValue(
      "gamma",
    );
    await user.selectOptions(
      input.getByLabelText("Recovery input state"),
      "numbered-error",
    );
    expect(input.getByLabelText("Word 3", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(
      input.getByLabelText("Word 3", { exact: true }),
    ).toHaveAccessibleDescription(/The recovery phrase is incomplete/);
  });
});

describe("secret and search review states", () => {
  it.each(["pending", "disabled"] as const)(
    "blocks secret actions while %s",
    async (state) => {
      const user = userEvent.setup();
      const onReveal = vi.fn();
      const onCopy = vi.fn();
      render(
        <SecretField
          label="Password"
          state={state}
          value="concealed-test-value"
          onReveal={onReveal}
          onHide={vi.fn()}
          onCopy={onCopy}
        />,
      );
      const reveal = screen.getByRole("button", { name: "Reveal" });
      const copy = screen.getByRole("button", {
        name: "Copy without revealing",
      });
      expect(reveal).toBeDisabled();
      expect(copy).toBeDisabled();
      await user.click(reveal);
      await user.click(copy);
      expect(onReveal).not.toHaveBeenCalled();
      expect(onCopy).not.toHaveBeenCalled();
      expect(
        screen.queryByText("concealed-test-value"),
      ).not.toBeInTheDocument();
    },
  );
  it("exposes the disabled secret state in its gallery", async () => {
    const user = userEvent.setup();
    render(<SharedExamples />);
    const secret = within(
      screen.getByRole("heading", { name: "SecretField" }).closest("section")!,
    );
    await user.selectOptions(
      secret.getByLabelText("Secret field state"),
      "disabled",
    );
    expect(secret.getByRole("button", { name: "Reveal" })).toBeDisabled();
    expect(
      secret.getByRole("button", { name: "Copy without revealing" }),
    ).toBeDisabled();
  });
  it("reviews empty, filled and searching inputs and retains focus after clearing", async () => {
    const user = userEvent.setup();
    render(<FeatureExamples />);
    const search = within(
      screen.getByRole("heading", { name: "SearchField" }).closest("section")!,
    );
    expect(search.getByLabelText("Search entries")).toHaveValue("");
    expect(search.getByRole("button", { name: "Clear search" })).toBeDisabled();
    await user.selectOptions(
      search.getByLabelText("Search field state"),
      "filled",
    );
    expect(search.getByLabelText("Search entries")).toHaveValue("adrian");
    await user.click(search.getByRole("button", { name: "Clear search" }));
    expect(search.getByLabelText("Search entries")).toHaveValue("");
    expect(search.getByLabelText("Search entries")).toHaveFocus();
    await user.selectOptions(
      search.getByLabelText("Search field state"),
      "searching",
    );
    expect(search.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(search.getByText("Searching entries…")).toBeInTheDocument();
  });
});

describe("pending and unavailable control examples", () => {
  it("shows lock duration disabled and error states", async () => {
    const user = userEvent.setup();
    render(<SharedExamples />);
    const lock = within(
      screen
        .getByRole("heading", { name: "LockDurationField" })
        .closest("section")!,
    );
    const duration = lock.getByLabelText("Lock duration on this device");
    expect(duration).toHaveValue("600000");
    expect(
      Array.from(
        (duration as HTMLSelectElement).options,
        (option) => option.value,
      ),
    ).toEqual(["60000", "300000", "600000", "1800000", "3600000"]);
    await user.selectOptions(duration, "3600000");
    expect(duration).toHaveValue("3600000");
    await user.selectOptions(
      lock.getByLabelText("Lock duration state"),
      "disabled",
    );
    expect(lock.getByLabelText("Lock duration on this device")).toBeDisabled();
    await user.selectOptions(
      lock.getByLabelText("Lock duration state"),
      "error",
    );
    expect(
      lock.getByLabelText("Lock duration on this device"),
    ).toHaveAccessibleDescription(/Choose an available lock duration/);
    expect(lock.getByLabelText("Lock duration on this device")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("exposes pending recovery, device revocation and transfer actions", async () => {
    const user = userEvent.setup();
    render(<FeatureExamples />);
    await user.selectOptions(
      screen.getByLabelText("Recovery verification state"),
      "pending",
    );
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(screen.getByLabelText("Word 3", { exact: true })).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("Device summary state"),
      "pending",
    );
    expect(screen.getByRole("button", { name: "Revoking…" })).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText("Device summary state"),
      "error",
    );
    expect(screen.getByText("Revocation failed. Try again.")).toHaveAttribute(
      "role",
      "alert",
    );
    await user.selectOptions(
      screen.getByLabelText("Transfer output state"),
      "pending",
    );
    expect(
      screen.getByRole("button", { name: "Copy artifact" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download artifact" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove Personal" }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Tag selection state"),
      "none",
    );
    expect(
      screen.queryByRole("button", { name: "Remove Personal" }),
    ).not.toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Tag selection state"),
      "loading",
    );
    expect(
      screen.getByRole("status", { name: "Loading tags" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tags" })).toBeDisabled();
  });
  it("preserves selected tags and suppresses editing while metadata loads", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TagSelection
        options={[{ id: 1, label: "Work" }]}
        value={[1]}
        onChange={onChange}
        loading
      />,
    );
    expect(screen.getByRole("combobox", { name: "Tags" })).toBeDisabled();
    const remove = screen.getByRole("button", { name: "Remove Work" });
    expect(remove).toBeDisabled();
    await user.click(remove);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });
});
