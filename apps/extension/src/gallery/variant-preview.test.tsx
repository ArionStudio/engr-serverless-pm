// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { VariantPreview } from "./variant-preview.view";

afterEach(cleanup);

describe("gallery variant previews", () => {
  it("applies button variant and icon size choices to the actual preview", async () => {
    const user = userEvent.setup();
    render(createElement(VariantPreview, { id: "B01" }));
    await user.selectOptions(
      screen.getByLabelText("Button variant"),
      "destructive",
    );
    await user.selectOptions(screen.getByLabelText("Button size"), "icon-lg");
    const button = screen.getByRole("button", { name: "Example action" });
    expect(button).toHaveClass("text-destructive", "size-8");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(screen.getByText(/variant=destructive/)).toHaveTextContent(
      "size=icon-lg",
    );
  });

  it("supports vertical keyboard navigation and resets choices when selecting a compound part", async () => {
    const user = userEvent.setup();
    render(createElement(VariantPreview, { id: "B20" }));
    await user.selectOptions(
      screen.getByLabelText("Tabs orientation"),
      "vertical",
    );
    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    await user.selectOptions(
      screen.getByLabelText("B20 variant component"),
      "TabsList",
    );
    await user.selectOptions(screen.getByLabelText("TabsList variant"), "line");
    expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "line");
    await user.selectOptions(
      screen.getByLabelText("B20 variant component"),
      "Tabs",
    );
    expect(screen.getByLabelText("Tabs orientation")).toHaveValue("horizontal");
  });
});
