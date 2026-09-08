import { emptyEntryDraft } from "./entry-draft";
// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { EntryEditor, type EntryTools } from "./entry-editor.view";
import { SiteIcon } from "./site-icon.view";
afterEach(cleanup);
const tools: EntryTools = {
  assess: async () => ({ score: 1 }),
  generate: async () => ({ password: "generated" }),
  username: async () => ({ username: "generated-user" }),
};
it("hides empty strength and requires explicit consent to save a weak password", async () => {
  const save = vi.fn();
  render(
    <EntryEditor
      initial={{
        ...emptyEntryDraft,
        login: "user",
        url: "https://example.test",
      }}
      mode="add"
      tags={[]}
      tools={tools}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  expect(screen.queryByRole("meter")).toBeNull();
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "weak" },
  });
  await screen.findByText("Weak", { exact: true });
  fireEvent.submit(
    screen.getByRole("button", { name: "Add entry" }).closest("form")!,
  );
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByText("Save with this weak password", { exact: true }),
  );
  fireEvent.submit(
    screen.getByRole("button", { name: "Add entry" }).closest("form")!,
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ password: "weak", allowWeakPassword: true }),
  );
  fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
    target: { value: "" },
  });
  await waitFor(() => expect(screen.queryByRole("meter")).toBeNull());
});
it("does not render external image sources, including protocol-relative URLs", () => {
  const { rerender, container } = render(
    <SiteIcon
      url="https://example.test"
      source="https://remote.test/logo.png"
      state="loaded"
    />,
  );
  expect(container.querySelector("img")).toBeNull();
  rerender(
    <SiteIcon
      url="https://example.test"
      source="//remote.test/logo.png"
      state="loaded"
    />,
  );
  expect(container.querySelector("img")).toBeNull();
});
