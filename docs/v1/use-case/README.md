# V1 Use-Case Diagrams

These PlantUML diagrams document the core use-case behavior implemented under
`packages/core/src/use-cases`. Treat the TypeScript implementation as the source
of truth when the diagrams and code disagree.

## Rendering

Use the PlantUML CLI or a PlantUML-capable editor extension.

```bash
find docs/v1/use-case -name '*.puml' -print0 | xargs -0 plantuml
```

For syntax-only validation:

```bash
find docs/v1/use-case -name '*.puml' -print0 | xargs -0 plantuml -checkonly
```

## Diagram Index

- `use-case-map.activity.puml`: cross-domain use-case map.
- `overview.component.puml`: high-level component relationships.
- `clipboard/`: clipboard copy and clear task behavior.
- `device-trust/`: device lifecycle, enrollment, local recovery, and revocation.
- `password-tools/`: generated password and username flows.
- `session/`: vault session status reporting.
- `sync/`: sync setup, upload, review, resolution, and disable flows.
- `vault-entries/`: entry read, search, mutation, and password retrieval flows.
- `vault-lifecycle/`: vault initialize, unlock, lock, delete, list, and password-change flows.
