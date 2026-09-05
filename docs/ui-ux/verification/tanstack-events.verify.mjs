import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

// Run against the unmodified published plugin module, not a mock EventClient.
// Download/extraction instructions and scope are in ../tanstack-verification.md.
const modulePath = process.env.LFSPM_EVENT_CLIENT_MODULE;
assert.ok(
  modulePath,
  "Set LFSPM_EVENT_CLIENT_MODULE to the extracted plugin.mjs",
);
const source = await readFile(modulePath);
assert.equal(
  createHash("sha256").update(source).digest("hex"),
  "cadb36d4683ef4cbfa2647d0fe84548d703eb4a5432dd0d65ef21687a4eed662",
);
assert.equal(process.env.NODE_ENV, "production");
const { EventClient } = await import(pathToFileURL(modulePath).href);

function setup(options = {}) {
  const target = new EventTarget();
  globalThis.__TANSTACK_EVENT_TARGET__ = target;
  const events = [];
  target.addEventListener("tanstack-dispatch-event", (event) =>
    events.push(event.detail),
  );
  const client = new EventClient({
    pluginId: "form-devtools",
    reconnectEveryMs: 60_000,
    ...options,
  });
  return {
    client,
    events,
    target,
    connect: () =>
      target.dispatchEvent(new CustomEvent("tanstack-connect-success")),
  };
}

test("production event client queues and delivers form values without a devtools UI", () => {
  const ctx = setup();
  try {
    ctx.client.emit("form-state", {
      id: "fixture",
      state: { values: { password: "SYNTHETIC-ONLY" } },
    });
    assert.equal(ctx.events.length, 0);
    ctx.connect();
    assert.equal(ctx.events[0].payload.state.values.password, "SYNTHETIC-ONLY");
  } finally {
    ctx.connect();
  }
});

test("replacement blank state and form-unmounted event do not erase earlier queued values", () => {
  const ctx = setup();
  try {
    ctx.client.emit("form-state", {
      id: "fixture",
      state: { values: { password: "SYNTHETIC-ONLY" } },
    });
    ctx.client.emit("form-state", {
      id: "fixture",
      state: { values: { password: "" } },
    });
    ctx.client.emit("form-unmounted", { id: "fixture" });
    ctx.connect();
    assert.equal(ctx.events[0].payload.state.values.password, "SYNTHETIC-ONLY");
    assert.equal(ctx.events[1].payload.state.values.password, "");
    assert.equal(ctx.events[2].type, "form-devtools:form-unmounted");
  } finally {
    ctx.connect();
  }
});

test("explicitly disabled event client emits no form data", () => {
  const ctx = setup({ enabled: false });
  ctx.client.emit("form-state", {
    id: "fixture",
    state: { values: { password: "SYNTHETIC-ONLY" } },
  });
  ctx.connect();
  assert.equal(ctx.events.length, 0);
});

test("registered form commands accept events on their event target until cleanup", () => {
  const ctx = setup();
  let calls = 0;
  const cleanup = ctx.client.on("request-form-force-submit", () => {
    calls += 1;
  });
  const event = () =>
    new CustomEvent("form-devtools:request-form-force-submit", {
      detail: { payload: { id: "fixture" } },
    });
  ctx.target.dispatchEvent(event());
  assert.equal(calls, 1);
  cleanup();
  ctx.target.dispatchEvent(event());
  assert.equal(calls, 1);
});

const tableModulePath = process.env.LFSPM_TABLE_ROW_MODULE;
assert.ok(
  tableModulePath,
  "Set LFSPM_TABLE_ROW_MODULE to the extracted constructRow.js",
);
assert.equal(
  createHash("sha256")
    .update(await readFile(tableModulePath))
    .digest("hex"),
  "4455be78cd04029e10995911854f216938fc074cefd9e12b8901977fbed04833",
);
assert.equal(
  createHash("sha256")
    .update(
      await readFile(new URL("../../utils.js", pathToFileURL(tableModulePath))),
    )
    .digest("hex"),
  "02b6d6c4c4961d6e5fc909bdafacb3cb502e216f1feb6f31069087e094d5408f",
);
const { constructRow } = await import(pathToFileURL(tableModulePath).href);
const { toVisiblePasswordEntryFields } =
  await import("../../../packages/core/src/domain/entry/password-entry.mapper.ts");
const syntheticEntry = () => ({
  id: "synthetic-entry",
  login: "example-user",
  tags: ["personal"],
  sanitizedUrl: "https://example.invalid",
  password: "SYNTHETIC-ONLY",
  versionVector: {},
});
const tableInternals = () => ({ _features: {}, _rowInstanceInitFns: [] });

test("v9 row constructor retains full input including properties with no displayed column", () => {
  const input = syntheticEntry();
  const row = constructRow(tableInternals(), input.id, input, 0, 0);
  assert.equal(row.original, input);
  assert.equal(row.original.password, "SYNTHETIC-ONLY");
});

test("the actual core display mapper prevents password and extra fields entering row.original", () => {
  const input = { ...syntheticEntry(), unexpectedSecret: "SYNTHETIC-EXTRA" };
  const visible = toVisiblePasswordEntryFields(input);
  const row = constructRow(tableInternals(), visible.id, visible, 0, 0);
  assert.deepEqual(Object.keys(row.original).sort(), [
    "id",
    "login",
    "sanitizedUrl",
    "tags",
  ]);
  assert.equal(Object.hasOwn(row.original, "password"), false);
  assert.equal(Object.hasOwn(row.original, "unexpectedSecret"), false);
  input.tags.push("later-change");
  assert.deepEqual(row.original.tags, ["personal"]);
});
