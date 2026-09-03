# Documentation and contribution standards

## DOC-001: Separate standards from descriptive documentation

- **Requirement:** Normative coding rules MUST live in `docs/standards`.
  Architecture, product behavior, protocols, setup, and user guidance MUST live
  in their descriptive documentation areas.
- **Scope:** Repository documentation.
- **Reason:** A description of current behavior and a rule for future code have
  different change and review needs.
- **Compliant:** Put the import prohibition here and the current component diagram
  under architecture docs.
- **Noncompliant:** Use an implementation plan as the architecture reference.
- **Enforcement:** Documentation placement review.
- **Exceptions:** A specification may state protocol requirements that code must
  implement.

## DOC-002: State current and historical status

- **Requirement:** Documentation MUST distinguish current contracts from
  historical reviews, superseded diagrams, and unresolved proposals. Historical
  evidence MUST NOT be silently rewritten as current truth.
- **Scope:** Architecture, design, security, and review documents.
- **Reason:** Review packets remain useful evidence but often describe code that
  has since changed.
- **Compliant:** Mark an old offline-queue diagram as superseded.
- **Noncompliant:** Copy an unresolved finding into a current standard.
- **Enforcement:** Documentation review against live code and accepted decisions.
- **Exceptions:** None.

## DOC-003: Use the strongest available source

- **Requirement:** Documentation updates MUST prefer enforced configuration,
  schemas, exports, and tests, followed by accepted decisions and repeated
  current implementation. Old examples and isolated proposals MUST not override
  stronger evidence.
- **Scope:** Documentation research and updates.
- **Reason:** The repository contains stale documents from earlier architecture
  stages.
- **Compliant:** Document `/services` because the export map and consumer tests
  support it.
- **Noncompliant:** Claim services are private because an older document says so.
- **Enforcement:** Source references in documentation review.
- **Exceptions:** A newly accepted decision may intentionally require code to
  change; mark the temporary mismatch.

## DOC-004: Update docs with public behavior

- **Requirement:** A change to public contracts, architecture, security
  semantics, persisted formats, supported workflows, or required commands MUST
  update its owning descriptive documentation in the same change.
- **Scope:** Repository changes with documentation impact.
- **Reason:** These changes alter how consumers, reviewers, or maintainers use the
  system.
- **Compliant:** Update package API docs with a new supported subpath.
- **Noncompliant:** Change recovery semantics only in tests.
- **Enforcement:** Pull-request and work-item review.
- **Exceptions:** Internal refactors with no documented behavior change.

## CONTRIB-001: Keep changes scoped

- **Requirement:** A change MUST address its accepted work item and verified
  defects in that scope. It MUST NOT absorb adjacent findings or speculative
  redesigns without approval.
- **Scope:** Implementation and review work.
- **Reason:** Security review becomes unreliable when unrelated behavior changes
  at the same time.
- **Compliant:** Report an adjacent issue separately.
- **Noncompliant:** Add a new sync state machine while fixing one upload outcome.
- **Enforcement:** Diff-to-requirement review.
- **Exceptions:** A prerequisite defect that blocks the accepted outcome and is
  documented before expanding the change.

## CONTRIB-002: Review the complete change

- **Requirement:** Review MUST cover the whole issue or pull-request diff, not
  only the latest fix. A finding MUST be re-audited against current code before
  editing and classified as open, partial, resolved, rejected, or blocked.
- **Scope:** Code review and finding resolution.
- **Reason:** Old review wording can be stale, and later fixes can regress earlier
  parts of the same change.
- **Compliant:** Recheck all acceptance criteria after merging current main.
- **Noncompliant:** Fix the quoted line without inspecting its callers or tests.
- **Enforcement:** Review report and final-diff evidence.
- **Exceptions:** None.

## CONTRIB-003: Preserve repository ownership

- **Requirement:** Automated work MUST NOT commit, push, merge, or add commit
  trailers without the user's authorization. Changes MUST use a descriptive
  branch and pull request when the user requests publication. Direct pushes or
  merges to `main` are forbidden.
- **Scope:** Git operations performed on the user's behalf.
- **Reason:** The user retains control over repository history and publication.
- **Compliant:** Prepare a reviewed feature branch and wait for push or PR
  authorization.
- **Noncompliant:** Push a completed fix directly to `main`.
- **Enforcement:** Git status, branch, and remote-operation review.
- **Exceptions:** An explicit user instruction for the exact operation, except
  that direct mutation of `main` remains forbidden by this repository workflow.

## CONTRIB-004: Preserve unrelated work

- **Requirement:** A change MUST preserve unrelated user modifications and MUST
  stage only its intended files. Destructive Git commands require explicit
  authorization.
- **Scope:** Working-tree and staging operations.
- **Reason:** A shared working tree may contain valuable uncommitted work.
- **Compliant:** Leave unrelated modified files untouched and report them.
- **Noncompliant:** Reset the worktree to obtain a clean diff.
- **Enforcement:** Before-and-after status and staged-diff review.
- **Exceptions:** None.
