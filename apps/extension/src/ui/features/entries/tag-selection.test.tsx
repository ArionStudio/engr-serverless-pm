// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { PASSWORD_ENTRY_TAG_LIMIT } from "@lfspm/core";
import { getTagGroupPresentation } from "@/ui/features/tags";
import { TagSelection, type TagOption } from "./tag-selection.view";

afterEach(cleanup);

it("limits existing and inline-created tag selection while allowing replacement", async () => {
  const user = userEvent.setup();
  const create = vi.fn(async () => ({ id: "created" }));
  const options: TagOption[] = Array.from(
    { length: PASSWORD_ENTRY_TAG_LIMIT + 1 },
    (_, index) => ({
      id: `tag-${index}`,
      label: `Tag ${index + 1}`,
      group: getTagGroupPresentation("other"),
      color: "gray",
      shade: 500,
    }),
  );
  function Selection() {
    const [value, setValue] = useState(
      options.slice(0, PASSWORD_ENTRY_TAG_LIMIT).map(({ id }) => id),
    );
    return (
      <TagSelection
        options={options}
        value={value}
        onChange={setValue}
        onCreate={create}
      />
    );
  }
  render(<Selection />);
  await user.click(screen.getByRole("combobox", { name: "Tags" }));
  const next = await screen.findByRole("option", { name: "Tag 11, Other tag" });
  expect(next).toHaveAttribute("aria-disabled", "true");
  await user.click(next);
  expect(
    screen.queryByRole("button", { name: "Remove Tag 11" }),
  ).not.toBeInTheDocument();
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "Custom");
  expect(
    screen.queryByRole("button", { name: /Create/ }),
  ).not.toBeInTheDocument();
  expect(create).not.toHaveBeenCalled();
  await user.clear(screen.getByRole("combobox", { name: "Tags" }));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Remove Tag 1" }));
  await user.click(screen.getByRole("combobox", { name: "Tags" }));
  await user.click(
    await screen.findByRole("option", { name: "Tag 11, Other tag" }),
  );
  expect(
    screen.getByRole("button", { name: "Remove Tag 11" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Remove Tag 1" }),
  ).not.toBeInTheDocument();
});
