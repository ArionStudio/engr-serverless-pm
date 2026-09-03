# Code standards

This directory contains the normative coding standards for this repository.
Descriptive architecture, product behavior, protocols, and historical reviews
belong elsewhere under `docs/`.

## 1. Purpose

Standards state what code must, must not, should, or may do. They are written
for implementation and review, not as a description of the current tree.

The keywords have these meanings:

- **MUST** and **MUST NOT** are mandatory.
- **SHOULD** and **SHOULD NOT** require a documented reason when ignored.
- **MAY** describes an allowed choice.

## 2. Required rule structure

Every rule contains:

1. a stable ID and short title;
2. one normative requirement;
3. its scope;
4. the reason for the rule;
5. a compliant pattern;
6. a noncompliant pattern;
7. the expected enforcement;
8. any explicit exceptions.

Rules without an exception state `None`. Examples illustrate the boundary but
do not narrow the normative requirement.

## 3. Storage and naming

- Store standards only in `docs/standards/`.
- Use one topic per Markdown file and kebab-case filenames.
- Use topic-prefixed IDs such as `CORE-ARCH-001` and `SYNC-003`.
- Keep an ID stable when wording or file placement changes.
- Never reuse an ID that has been removed or deprecated.
- Reference another rule instead of copying its requirement.
- Add every other standards file to the index below.

## 4. Excluded content

Standards must not contain:

- temporary implementation plans or work-item instructions;
- review findings, conversation transcripts, or branch history;
- current file counts or directory inventories;
- speculative technology or features that are only planned;
- tutorials or broad language and framework guidance;
- historical architecture presented as current behavior;
- duplicated algorithm values or protocol definitions owned by a security or
  design specification.

## 5. Change process

1. Identify a recurring coding need, invariant, or verified failure pattern.
2. Check current code, tests, configuration, accepted decisions, and the owning
   product or security specification.
3. Add or update one authoritative rule. Do not create a competing rule in
   another file.
4. Add automated enforcement when it is practical.
5. Change code and descriptive documentation that conflict with the accepted
   rule.
6. Deprecate a replaced rule explicitly. Do not silently give its ID a different
   meaning.

Proposals stay in their issue or pull request until accepted. Files in this
directory contain active standards unless a rule is explicitly marked
deprecated.

## 6. Authority

Active standards are normative for implementation and review. Conflicting code
is noncompliant. Conflicting descriptive documentation is stale.

Security and product specifications own exact protocol behavior, data formats,
and algorithm choices. A coding standard may constrain how code implements
those specifications, but it references the specification instead of copying
it.

When two active standards conflict, stop the affected change and resolve the
standards conflict first.

## Index

- [Repository and TypeScript](./repository-and-typescript.md)
- [Core architecture](./core-architecture.md)
- [Domain modeling](./domain-modeling.md)
- [Use cases and services](./use-cases-and-services.md)
- [Public API and contracts](./public-api-and-contracts.md)
- [Ports, adapters, and runtime validation](./ports-adapters-and-runtime-validation.md)
- [Errors, logging, and sensitive data](./errors-logging-and-sensitive-data.md)
- [Persistence, atomicity, and concurrency](./persistence-atomicity-and-concurrency.md)
- [Cryptography and secret ownership](./cryptography-and-secret-ownership.md)
- [Snapshots, trust, and sync](./snapshots-trust-and-sync.md)
- [Sessions, lifecycle, and scheduled actions](./sessions-lifecycle-and-scheduled-actions.md)
- [Device enrollment, revocation, and recovery](./device-enrollment-revocation-and-recovery.md)
- [Password policy and generated data](./password-policy-and-generated-data.md)
- [Clipboard and extension runtime](./clipboard-and-extension-runtime.md)
- [React and UI](./react-and-ui.md)
- [Testing and validation](./testing-and-validation.md)
- [Documentation and contribution](./documentation-and-contribution.md)
