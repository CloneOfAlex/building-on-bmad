# Building on BMAD reference package

Version 09 | October 31, 2026

Prepared by Alex Markevich | https://qasolver.io | QASolver LLC

This package accompanies Building on BMAD v09. It supplies two reviewable reference checkers, executable qualification controls, and illustrative inputs. It is an independent publication and is not an official BMAD distribution.

## Run the local qualification

Use Node.js 22.20.0 or later and Git. There are no external npm dependencies.

```bash
npm test
```

Or run the three scripts directly with the same Node executable:

```bash
node tests/qualify.mjs
node tests/execution.mjs
node tests/checkout.mjs
```

The shipped local result is 66 approval controls, 6 row-comparison controls, 26 execution-checker controls, and 1 Git checkout control. Approval HTTP calls are mocked. Execution controls use synthetic reporter objects. The checkout control enables `core.autocrlf=true` on the local host; it is not a native Windows test. These results do not establish live repository enforcement, browser coverage, or application correctness.

## PRD approval checker

`prd-approval.mjs` reads the current PR, all reviews, the complete PR commit list, and the source file at the approved head. Protected policy identifies the PRD digest, allowed requirement scope, qualified human role assignments, and the exact contribution-record digest. The checker compares the local PRD used by a dependent task with the pinned remote bytes. It requires all selected obligations to be approved by eligible independent reviewers.

```bash
# Run from the task workspace. All /trusted inputs are controller-owned.
node /trusted/prd-approval.mjs /trusted/active-prd.json task-request.json
```

`GH_TOKEN` is required only for live read-only API calls. Keep it out of examples and reports. Contents-read and pull-requests-read permissions suffice for these reads. Required-status publication needs separate authority. Never execute candidate code inside this privileged controller.

The files under `examples/` contain invented PR/head/account identifiers. They are not live credentials or a working repository configuration. `active-prd.json` uses the full-team pattern: product 1001, business 1002, engineering 1003, and QA 1004, with four required distinct reviewers. Its contribution example excludes author 2001, committer 2002, and pusher 2003. Qualified small teams may combine roles through protected policy, but contributors cannot satisfy independent role approval.

### Contribution evidence is a protected input

The checker does not receive a reliable last-pusher identity from the PR object. A host controller must maintain `contributions-17.json` outside the candidate branch, from authenticated and reconciled evidence:

#1) Verify webhook signatures, delivery identity, repository, branch, and resulting head. Persist push deliveries in order and process replays idempotently.
#2) Reconcile the exact PR commit set with host-mapped author and committer accounts. Unmapped identities hold automated execution. Git names and email addresses alone are insufficient.
#3) Resolve additional contributors and coauthors, including work carried through service accounts. Have a responsible human attest completeness before the controller records `coverage: complete`.
#4) Freeze the source head and contribution record digest in protected policy. Neither a candidate branch nor an agent may supply or change this policy or record.
#5) Refresh and invalidate on another push, force push, role change, approval dismissal, or baseline deactivation. Cancel or hold affected in-flight tasks and recheck at launch, resume, and merge.

The code validates record binding and structural coverage, excludes recorded contributors and the PR author, and checks that counted approvals target the head and follow the last recorded push. It cannot prove that an upstream controller captured every historical event, resolved every contributor, or protected its own inputs. The collector, webhook signature implementation, status publisher, cancellation mechanism, and host configuration are integration work, not provided components. Missing evidence must cause a hold. API reads remain point-in-time observations, not atomic approval leases.

Enable GitHub approval of the most recent reviewable push and stale-review dismissal as host protections. The native last-push rule supplies at least one different approver; it does not independently establish all four role decisions. Qualify bypass restrictions and actual permissions in a disposable host before calling this integration enforced.

### Input boundaries

The PRD size cap is 1,000,000 bytes; this small-file adapter requires base64 contents and matching decoded length. PRs above 250 commits hold because the selected PR-commits endpoint is capped at 250. Oversize inputs need a separately qualified adapter. Unsupported or incomplete API retrieval holds execution.

Requirement declarations must start in column one as `RPT-01: ...`. This deliberately narrow line parser does not interpret Markdown syntax or decide whether a requirement is well formed. Do not place declarations in bullets, bold spans, headings, or code fences. Human review establishes their meaning and completeness. Qualify another parser for other formats.

For source PRDs, adopt `product/**/PRD.md text eol=lf` in the target repository before approval. Review normalization of existing files and approve the resulting exact bytes. The package uses the corresponding `examples/product/**/PRD.md` attribute for its illustrative source. The checker never normalizes bytes silently. The checkout test verifies LF behavior with autocrlf enabled, and the approval suite rejects CRLF bytes against an LF baseline.

## Execution checker

Install the reviewed `gate-check.mjs` as `tools/qa/gate-check.mjs` in protected CI. It is the existing reference for Playwright 1.64.1 reporter structure. It verifies the original runner exit and expected execution outcomes, discovery/mapping, repetition counts, skip policy, and unsupported shards. It does not authenticate PRD approvals or validate business correctness.

```bash
node tools/qa/gate-check.mjs export-policy.json run.json 0
```

The final argument must be the actual original runner exit, never a hard-coded success in an integration. See the playbook for the shell pattern that preserves it. The example `0` above illustrates the argument shape only. `examples/export-policy.json` is the two-scenario policy from the worked contribution; it is not a feature-release approval.

## Integrity and adoption

`MANIFEST.json` records SHA-256 for each shipped package file except itself. Verify it before installing reviewed copies in a protected repository. A checksum detects byte differences; it is not a publisher signature or approval. Keep the archive version, checker hashes, test results, and the approved toolchain record together. If published in a repository, bind references to the tested immutable commit. Requalify after any material model, agent, parser, permission, runner, or host change.

Official sources used by this reference:

#1) https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
#2) https://docs.github.com/en/rest/pulls/reviews
#3) https://docs.github.com/en/rest/pulls/pulls
#4) https://docs.github.com/en/rest/repos/contents
#5) https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
#6) https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
#7) https://git-scm.com/docs/gitattributes
