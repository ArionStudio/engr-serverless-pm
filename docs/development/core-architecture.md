# Core Architecture Rules

These rules apply to `packages/core`.

## Core Boundary

Core is pure TypeScript application/domain code. It must not depend on adapters,
UI, browser globals, storage implementations, AWS SDKs, or extension runtime
APIs.

The project import direction is:

```text
core -> adapters -> ui
```

Adapters implement core ports. UI consumes application workflows through the
adapter/composition layer. Core does not import back outward.

## Public API

The package public API is the root export from `packages/core/src/index.ts` and
the explicit `./lib` subpath export. Do not add broad package subpath exports
for internal folders.

Public root exports are:

- `domain`
- `errors`
- `ports`
- `use-cases`

The public API is an explicit whitelist, not a mirror of the internal folder
tree.

- Use cases are public entry points for application workflows.
- Ports are public contracts that adapters implement.
- Errors are public when callers need to handle expected failures.
- Domain exports are selective. Stable domain contracts may be public, but
  domain internals, helper utilities, mutation helpers, schemas, and mappers are
  not automatically public just because they live under `domain`.
- Services are internal implementation details used to share domain-specific
  actions inside core. They are not part of the public package API.
- Package subpath exports stay minimal. Add a subpath only when there is a
  concrete external import need; prefer the root package export otherwise.

Domain mutations are internal even when they live under `domain`.

## Use Cases

Use cases are the public workflow boundary. A use case may define exported
command/result types for its `execute` method.

Use cases must not call other use cases. Shared behavior goes into the layer
that owns the action:

- domain type or pure domain operation in `domain`
- external capability in `ports`
- domain-specific action in `services`

## Services

Services are domain-specific actions, not use-case helpers and not public API.

Services must not define exported parameter/result types. Service methods use
inline parameter and return object shapes, or existing domain/port types when
the value is a real domain/port record.

A service must not exist only to wrap a port call. If a port operation requires
the same checks, policy, security protocol, or rollback behavior every time, the
service may own that full action. Otherwise call the port directly from the use
case.

## Ports

Ports define external capabilities required by core. They may define port
interfaces and port-owned records when the record is persisted or exchanged by
the adapter boundary.

Do not create exported `*Params` or `*Result` aliases for port methods. Use
inline method parameter/return object shapes unless the shape is a real domain
or port record.

## Domain Mutations

Domain mutations stay internal. They are pure domain operations and must not be
exported from public package/domain barrels.
