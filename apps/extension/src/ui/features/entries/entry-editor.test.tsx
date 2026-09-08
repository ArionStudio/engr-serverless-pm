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
import { EntryEditor } from "./entry-editor.view";
import type { EntryTools } from "@/ui/features/password-tools/password-tools.type";
import { SiteIcon } from "./site-icon.view";
import userEvent from "@testing-library/user-event";
afterEach(cleanup);
const tools: EntryTools = {
  assess: async () => ({ score: 1 }),
  generate: async () => ({ password: "generated" }),
  username: async () => ({ username: "generated-user" }),
};
it("prefills a library folder and warns when inline creation is nested beyond two levels", async () => {
  const user = userEvent.setup();
  const create = vi.fn(async () => ({ id: "created-folder" }));
  render(
    <EntryEditor
      initial={emptyEntryDraft}
      mode="add"
      tags={[]}
      tools={tools}
      onSave={() => {}}
      onCancel={() => {}}
      folderSuggestions={[
        {
          id: "finance",
          name: "Finance",
          icon: "banknote",
          parent: null,
          description: "Bank accounts",
        },
      ]}
      folders={[
        {
          id: "work",
          name: "Work",
          icon: "briefcase",
          parentId: null,
          createdAt: 1,
          entryCount: 0,
          childCount: 1,
        },
        {
          id: "child",
          name: "Projects",
          icon: "folder",
          parentId: "work",
          createdAt: 1,
          entryCount: 0,
          childCount: 0,
        },
      ]}
      onCreateFolder={create}
    />,
  );
  await user.click(screen.getByRole("button", { name: "New folder" }));
  await user.type(screen.getByLabelText("Name", { exact: true }), "Fin");
  await user.click(screen.getByRole("button", { name: "Use Finance folder" }));
  expect(
    (screen.getByLabelText("Name", { exact: true }) as HTMLInputElement).value,
  ).toBe("Finance");
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Location" }),
    "child",
  );
  expect(
    screen.getByText(
      "Folders deeper than two levels may be harder to navigate.",
    ),
  ).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Create folder" }));
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith({
      name: "Finance",
      icon: "banknote",
      description: "Bank accounts",
      parentId: "child",
    }),
  );
});
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
  expect(document.activeElement).toBe(
    screen.getByLabelText("Password", { exact: true }),
  );
  screen.getByRole("button", { name: "Add entry" }).focus();
  fireEvent.submit(
    screen.getByRole("button", { name: "Add entry" }).closest("form")!,
  );
  expect(document.activeElement).toBe(
    screen.getByLabelText("Password", { exact: true }),
  );
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

it("saves a reviewed email-link account without password assessment", () => {
  const save = vi.fn();
  const assess = vi.fn();
  render(
    <EntryEditor
      initial={{
        ...emptyEntryDraft,
        login: "email@example.com",
        url: "https://example.com",
        withoutPassword: true,
      }}
      mode="add"
      tags={[]}
      tools={{ ...tools, assess }}
      onSave={save}
      onCancel={() => {}}
    />,
  );
  expect(screen.queryByLabelText("Password")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      password: "",
      withoutPassword: true,
      login: "email@example.com",
    }),
  );
  expect(assess).not.toHaveBeenCalled();
});
