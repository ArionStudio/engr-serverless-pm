// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { SearchField } from "./search-field.view";
afterEach(cleanup);
it("offers filter kinds after the parent clears the query", async () => {
  const props = { onChange: vi.fn(), onSubmit: vi.fn() };
  const { rerender } = render(<SearchField {...props} value="query" />);
  const input = screen.getByRole("combobox", { name: "Search entries" });
  await userEvent.setup().tab();
  expect(input).toHaveFocus();
  rerender(<SearchField {...props} value="" />);
  expect(input).toHaveFocus();
  expect(await screen.findAllByRole("option")).toHaveLength(4);
});
it("completes a multiword filter with the keyboard and removes it without losing other terms", async () => {
  const submit = vi.fn();
  function Search() {
    const [query, setQuery] = useState("@alex ");
    return (
      <SearchField
        value={query}
        onChange={setQuery}
        onSubmit={submit}
        suggestions={{ tag: ["Shared work", "Personal"] }}
      />
    );
  }
  render(<Search />);
  const user = userEvent.setup();
  const input = screen.getByRole("combobox", { name: "Search entries" });
  await user.click(input);
  await user.type(input, "#Sha");
  expect(
    await screen.findByRole("option", { name: /Shared work/ }),
  ).toBeVisible();
  await user.keyboard("{ArrowDown}{Enter}");
  expect(input).toHaveValue('@alex #"Shared work" ');
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByRole("group", { name: "Search filters" })).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Remove tag filter Shared work" }),
  );
  expect(input).toHaveValue("@alex");
  expect(input).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Clear search" }));
  expect(input).toHaveValue("");
  expect(input).toHaveFocus();
});
