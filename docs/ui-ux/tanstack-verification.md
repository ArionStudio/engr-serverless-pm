# TanStack adoption verification

Checked 2026-09-05. **Do not adopt React Form 1.33.5 unchanged for secret-bearing
forms. Keep Table as a candidate using our existing password-free projection.**
The earlier conditional recommendation for Form needs this correction.

Six focused tests pass. Two reproduce undesirable event retention/delivery;
passing tests here means the behavior was reproduced, not that the library passed
our security requirements. A separate Chrome check reproduced queued delivery.

Gallery follow-up: the authorized library build subsequently installed pinned
Table 9.2.4. P11 now renders it with a fresh allowlisted display projection. The
original artifact verification below did not install packages; that historical
scope remains accurate. Form 1.33.5 remains excluded. See the
[current inventory](./review-inventory.md) for implementation and interaction evidence.

## Scope and exact artifacts

The [artifact manifest](./verification/tanstack-artifacts.json) records registry
versions, dependency declarations, tarball URLs and SHA-512 integrity values.
The inspected React adapters are Form 1.33.5 and Table 9.2.4, both declaring React
19-compatible peer ranges. Peer compatibility is not a runtime integration test.

Artifacts were downloaded for source inspection and focused execution. No packages
were installed into the application and its manifest/lockfile were not changed by
this verification. Tests execute the published event-client module and Table row
constructor, plus the actual repository entry mapper. They do not replace those
implementations with mocks. The row constructor receives minimal table internals;
this is not a complete React Table rendering test.

Full React Form mount/unmount integration, asynchronous validation, application
cross-context locking, release-bundle inspection and a complete transitive advisory
audit were not performed. The adoption gate already fails on the event-retention
behavior below; do not describe the broader integration as verified.

## F01: Secret form state can enter a production-active event client

Priority: blocks adoption for secret-bearing forms. This is an integration risk,
not a claim of remote exploitability or a vulnerability already in our application.

Form 1.33.5 depends on form-core 1.33.5, which declares
`@tanstack/devtools-event-client: ^0.4.1`. Version 0.4.4 satisfies that range.

Published form-core source evidence:

- `src/EventClient.ts:62`: constructs the event client without `enabled: false`.
- `src/FormApi.ts:1658`: mount subscribes to state changes and registers devtools
  commands. It emits state and options on mounting and on state requests.
- `src/utils.ts:681`: the throttled event payload includes `form.store.state`.
- `src/FormApi.ts:1698`: cleanup unsubscribes listeners and emits `form-unmounted`;
  it does not clear an already queued event client's payloads.

Published event-client 0.4.4 evidence:

- `src/plugin.ts:15`: enabled by default.
- `src/plugin.ts:122`: can use the browser window as its event target.
- `src/plugin.ts:201`: emit queues payloads until connected, or delivers them to
  the event target when connected. `src/index.ts` and the published ESM entry
  export this client without a production environment guard.

Reproduction under `NODE_ENV=production`:

1. Emit a form-state payload containing a synthetic password.
2. Emit replacement blank values, then a form-unmounted notification.
3. Signal a connection on the event target.
4. Observe delivery of the earlier password-bearing event, followed by the blank
   state and unmount event.

Chrome 152 reproduced the same three delivered events using the actual published
module and browser-window event target, without a devtools UI or application
server. It was an isolated browser module test, not a built extension test.

This demonstrates an additional data lifetime outside current form state. It does
not demonstrate transmission to the internet or access by an unrelated website.
The tests connect a listener in the same JavaScript context. An attacker who
already executes there may have other ways to read active values; the additional
concern is retention and event distribution after clearing the visible state.
The queued data is not necessarily retained forever: the client also has connection
retry/queue cleanup behavior. The test connects before that timeout.

The standalone client's `enabled: false` suppresses delivery in our control test,
but Form's inspected constructor does not pass that option. Merely omitting a
visual devtools component does not disable this client.

Event-client 0.5.0 source has an environment-based no-op export, but 0.5.0 is outside
Form's declared `^0.4.1` range. It was inspected only as a comparison, not adopted,
overridden, or tested as a compatible replacement. Do not force an override solely
from that observation. A maintained fix or supported opt-out needs validation in
both development and production with synthetic values before adoption.

## F02: Reset and unmount are not secret erasure contracts

Priority: required design constraint for any form library. Source-verified only.

`form-core/src/FormApi.ts:1810` resets to configured defaults when no values are
supplied. An explicit value object updates defaults unless `keepDefaultValues` is
set. Field defaults and `defaultState` are additional state sources to inspect.
`react-form/src/useForm.tsx:278` registers the form's mount cleanup; that cleanup
unsubscribes events but does not itself blank form values/defaults.

Use blank secret defaults and an explicit operation/session lifetime. A promise
already holding a submitted value is outside a reset operation's control. Do not
claim JavaScript string zeroization. Full stale-validation and submission-race
integration tests remain prerequisites for any later Form adoption.

## T01: Table v9 preserves original row data; our mapper excludes passwords

The published `table-core@9.2.4/dist/core/rows/constructRow.js` assigns
`row.original = original`. The runtime test confirms a password property remains
available even without a displayed column. This is expected data-model behavior,
not a Table vulnerability.

The second test calls the actual
[`toVisiblePasswordEntryFields`](../../packages/core/src/domain/entry/password-entry.mapper.ts)
and passes that projection to the published row constructor. Only ID, login,
tags and sanitized URL enter the row. Password and an unexpected additional secret
field are absent; later mutation of the source tag array does not alter the
projected tags.

Decision: use this core projection as Table input. Private display data still needs
session-scoped cleanup. Do not pass decrypted vault objects or treat column
visibility as access control. Sorting, selection, browser accessibility and the
complete Table dependency graph need separate checks during integration.

## Reproduce the six focused tests

Requires Python 3 and Node 24 as used here. From the repository root, choose a fresh
scratch directory; the fetcher verifies the recorded integrity before extracting
source/build files and never invokes package lifecycle scripts.

```sh
python3 docs/ui-ux/verification/fetch-tanstack-artifacts.py /tmp/lfspm-tanstack-verification
NODE_ENV=production \
  LFSPM_EVENT_CLIENT_MODULE=/tmp/lfspm-tanstack-verification/devtools-event-client-0.4.4/plugin.mjs \
  LFSPM_TABLE_ROW_MODULE=/tmp/lfspm-tanstack-verification/table-core-9.2.4/dist/core/rows/constructRow.js \
  node --test docs/ui-ux/verification/tanstack-events.verify.mjs
```

The test also checks SHA-256 hashes for the executed event-client module, Table
row constructor and its utility import. Published code is unmodified except that
the standalone event-client file is named `.mjs` for direct module loading.

Tests:

1. Production event-client delivery of queued synthetic form values.
2. Earlier queued values survive blank replacement and an unmount notification.
3. Explicitly disabled standalone client emits no values.
4. Event-target commands operate until their listener cleanup runs.
5. Table v9 preserves original input properties.
6. The repository's actual display mapper prevents passwords/extra fields reaching rows.

## Remaining decisions

- Keep the shadcn/Base UI component work and Table proposal.
- Do not introduce Form 1.33.5 unchanged into password/recovery/credential forms.
  Existing React state and controlled views remain the current implementation path.
- Query, Router, Virtual and tRPC were not newly installed or runtime-tested here;
  this verification does not change the earlier defer/optional decisions.
- No advisory was listed on the inspected Form/Table/devtools GitHub advisory
  pages. That is not a clean bill of health or a full dependency audit.

Primary sources include the exact published artifacts in the manifest,
[Form's reset API](https://tanstack.com/form/latest/docs/reference/classes/FormApi#reset),
and the maintainers' [Form](https://github.com/TanStack/form/security),
[Table](https://github.com/TanStack/table/security) and
[devtools advisory pages](https://github.com/TanStack/devtools/security/advisories).
