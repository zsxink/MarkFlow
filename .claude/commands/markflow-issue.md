---
name: "markflow-issue"
description: "End-to-end issue workflow: branch -> propose -> apply -> verify -> archive -> PR -> merge"
category: Workflow
tags: [workflow, automation, experimental]
---

Automate the full development workflow from a GitHub Issue to a merged PR.

```
/markflow-issue <issue number>
```

## How It Works

This command executes 7 phases sequentially in the current session. Heavy
work (coding, review) is dispatched to sub-agents; light operations run
inline. A fix loop retries failed verification up to 3 times.

## Mandatory Phase Gates

- Treat phase transitions as gated: do not start the next phase until the
  current phase's completion criteria below have been validated.
- Use the available `Agent` tool for every dispatch. A failed dispatch, missing
  result, malformed result, or incomplete result is a stop condition; never
  silently skip an agent phase or substitute the coordinator's own work.
- Apply and Verify MUST use separate `Agent` tool calls and separate agent
  instances. Verify must independently inspect every changed file in the branch
  and run its checks; it must not rely on Apply's self-report as evidence. Every
  fix-loop reverification also uses a fresh Agent instance distinct from its fixer.
- Do not archive, commit, push, create a PR, or merge until Verify has passed.
  The only exception is the explicit, documented force-continue path in Phase 5b
  for pre-archive verification. Post-archive verification is mandatory and cannot
  be overridden; never report an overridden failure as a passing verification.

```
1 Fetch Issue -> 2 Create Branch -> 3 Propose -> 4 Apply (sub-agent)
  -> 5 Sync specs + Verify (fresh sub-agent) -> [fix loop x3 max]
  -> 6 Archive + final Verify -> 7 Commit + Push + PR + Merge
```

---

## Input

```
/markflow-issue <N>
```

- `<N>` -- GitHub Issue number (positive integer)
- Examples: `/markflow-issue 42`, `/markflow-issue 171`

---

## Phase 0: Preflight

Run these checks before any other phase:

1. **Validate argument**
   - `<N>` MUST be a positive integer. If absent or non-numeric, show:
     > /markflow-issue requires a GitHub Issue number, e.g., /markflow-issue 42.
     Then STOP.

2. **Check gh authentication**
   ```bash
   gh auth status 2>&1
   ```
   If not authenticated, show:
   > GitHub CLI gh is not authenticated. Run `gh auth login` first, then retry.
   Then STOP.

3. **Check for clean working directory**
   ```bash
   git status --porcelain
   ```
   If output is non-empty, the working tree has uncommitted changes. Ask the
   user to commit or stash them first, then STOP.

4. **Ensure main is up to date**
   ```bash
   git checkout main && git pull
   ```
   If merge conflicts prevent `git pull`, show the conflict message and STOP.

---

## Phase 1: Fetch Issue

1. **Fetch issue data**
   ```bash
   gh issue view <N> --json title,body,labels
   ```

2. **Parse and derive parameters**

   From the JSON output:

   - **title**: raw title string (e.g., "fix: line number inaccurate")
   - **labels**: array of label names (e.g., ["bug"])
   - **body**: markdown body (used later as proposal context)

   **Derive type:**
   Walk labels in order. First match wins:

   | Label      | type       |
   |------------|------------|
   | bug        | fix        |
   | feat       | feat       |
   | refactor   | refactor   |
   | chore      | chore      |
   | docs       | docs       |
   | perf       | perf       |
   | (no match) | chore      |

   **Derive changeName (kebab-case, max 40 chars):**
   1. Strip leading `<type>:` prefix from title
   2. Extract recognizable English keywords from the remaining text.
      Since titles are often Chinese, derive a short English phrase
      describing the change.
   3. Truncate to 40 characters.
   4. Replace all non-alphanumeric-non-hyphen characters with `-`.
   5. Collapse consecutive `-` -> single `-`.
   6. Strip leading/trailing `-`.

   **Derive branchName:**
   ```
   {type}/issue-{N}-{changeName}
   ```
   Example: `fix/issue-42-line-number`

3. **Verify issue exists**
   If `gh issue view` returns an error (issue not found), show the error and STOP.

4. **Announce plan**
   ```
   ## Processing Issue #{N}: {title}

   Type:      {type}
   Branch:    {branchName}
   Change:    {changeName}

   Press Enter to continue, or send feedback to abort.
   ```
   Wait for user acknowledgement before proceeding.

---

## Phase 2: Create Branch

1. **Ensure on main with latest**
   ```bash
   git checkout main && git pull
   ```

2. **Create branch**
   ```bash
   git checkout -b {branchName} main
   ```

3. **Handle branch-already-exists**
   If step 2 fails because the branch already exists, present options:
   > Branch {branchName} already exists.
   > 1. Switch to and reuse it
   > 2. Create a new branch with -retry suffix
   > 3. Abort

   Act on the user's choice.

4. **Confirm**
   ```bash
   git branch --show-current
   ```
   MUST equal `{branchName}`. If not, STOP with error.

---

## Phase 3: Propose

Run the OpenSpec propose workflow inline (this session).

**This phase follows the same procedure as opsx:propose.**
Refer to `.claude/commands/opsx/propose.md` for the detailed skill steps.

In summary:

1. **Create the change directory**
   ```bash
   openspec new change "{changeName}"
   ```
   If the change already exists, ask the user whether to reuse it or pick a
   different name. STOP if they choose neither.

2. **Generate artifacts in dependency order**

   After `openspec new change`, run:
   ```bash
   openspec status --change "{changeName}" --json
   ```
   Determine the artifact dependency order from the `artifacts` array.

   For each artifact whose status is `ready`:

   a. Get instructions:
      ```bash
      openspec instructions <artifact-id> --change "{changeName}" --json
      ```
   b. Read the instructions for template, instruction, and resolvedOutputPath.
   c. Read any dependency files listed in dependencies for context.
   d. Write the artifact to resolvedOutputPath.

   The artifacts are, in order:
   - **proposal.md** -- motivation, what changes, capabilities, impact
   - **specs/<name>/spec.md** -- detailed requirements with scenarios
   - **design.md** -- technical decisions, risks, trade-offs
   - **tasks.md** -- implementation checklist

3. **Use the issue title + body as context**
   - The Issue title -> proposal's Why section
   - The Issue body (acceptance criteria) -> proposal's What Changes and scenarios
   - Read relevant existing code/specs before writing design.md

4. **Verify completion**
   ```bash
   openspec status --change "{changeName}" --json
   ```
   Confirm ALL artifacts in the artifacts array have status "done".
   If any are not done, fix or re-run until they are.

5. **Announce**
   ```
   OK Propose complete: {N} artifacts created
   ```

---

## Phase 4: Apply (Sub-Agent)

Dispatch a sub-agent to implement the tasks.

1. **Read the tasks file** to understand the checklist.

2. **Dispatch an Agent** (type: general-purpose) with this prompt:
   ```
   You are in branch "{branchName}" of the MarkFlow repository at {repoRoot}.

   Implement the OpenSpec change "{changeName}".

   Step-by-step:

   1. Read the apply instructions:
      openspec instructions apply --change "{changeName}" --json

   2. Read all context files listed under "contextFiles".

   3. Work through each pending task in order. For each task:
      - Read the tasks file to understand what needs to be done
      - Implement the code changes
      - OpenSpec artifact edits (tasks.md) are repo-local at
        openspec/changes/{changeName}/tasks.md

   4. If you hit a question or blocker, make a reasonable decision and
      continue. If truly blocked, report the block reason.

   5. When done, report in EXACTLY this format and nothing else:

      ## Apply Result
      - Tasks completed: N/M
      - Summary:
        - task description: OK result
        - task description: OK result
      - Blocked: yes/no
      - Block reason: <if blocked>
   ```

3. **Await and validate the result**. Do not proceed while the Agent is still
   running. Parse the sub-agent output and require all of the following:
   - `Tasks completed: N/M` with numeric values and `N == M`
   - `Blocked: no`
   - A summary for the completed tasks
   Missing, malformed, contradictory, or incomplete output is a failure: report
   it and STOP rather than inferring success or doing Apply inline.

4. **If blocked or incomplete**, show the block reason or missing criteria and
   STOP (user decides what to do).

5. **If complete**, record that this Apply Agent instance has finished, then
   dispatch a new, separate Agent instance for Phase 5. Do not reuse this agent
   or its conversation as the verifier.

---

## Phase 5: Verify (Sub-Agent)

Before verification, ensure spec changes are part of the branch diff:

1. **Sync delta specs before verification**
   ```bash
   openspec status --change "{changeName}" --json
   ```
   Check `artifactPaths.specs.existingOutputPaths`. If delta specs exist, invoke
   the `openspec-sync-specs` skill through the Skill tool for `{changeName}` and
   confirm the main specs contain the delta. Do not call `openspec sync-specs`;
   it is not an available CLI command. Do not archive here. This must happen
   before Verify so the verifier inspects the complete, final change set.

2. **Dispatch an Agent** (type: general-purpose) with this prompt:
   ```
   You are in branch "{branchName}" of the MarkFlow repository at {repoRoot}.

   Review and verify the changes made in this branch.

   1. List all changed files:
      git diff origin/main --stat
      git diff --name-only origin/main

   2. Review the complete diff for every changed file, including Rust, scripts,
      specs, workflows, configuration, and documentation. Do not limit review to
      `src/` or truncate the diff. If output is too large, inspect each changed
      file or diff in chunks and confirm none were omitted. Check for bugs, dead
      code, debug logs, missing edge cases, and changes inconsistent with the
      OpenSpec requirements.

   3. Run TypeScript type check:
      npx tsc --noEmit 2>&1

   4. Run build:
      npm run build 2>&1

   5. Run tests:
      npm test 2>&1

   6. Run OpenSpec validation:
      npm run validate:openspec 2>&1

   7. If any changed file is under `src-tauri/`, run all Rust quality gates:
      cargo fmt --manifest-path src-tauri/Cargo.toml --check
      cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
      cargo test --manifest-path src-tauri/Cargo.toml
      If no `src-tauri/` file changed, report the Rust check as `skip` with a
      reason; otherwise it must pass.

   8. Report results in EXACTLY this JSON format and nothing else:

   {
     "passed": true,
     "checks": {
       "code_review": { "status": "pass", "issues": [] },
       "typescript":  { "status": "pass", "output": "" },
       "build":       { "status": "pass", "output": "" },
       "test":        { "status": "pass", "output": "" },
       "openspec":    { "status": "pass", "output": "" },
       "rust":        { "status": "pass", "output": "" }
     },
     "summary": "one-line conclusion"
   }
   ```

3. **Await and validate the result**. The verifier must be a fresh Agent
   instance, distinct from Apply (and from any fixer in a later round). Parse
   the complete JSON and require exactly the `passed`, `checks`, and `summary`
   fields; `passed` must be `true`; `checks` must contain `code_review`,
   `typescript`, `build`, `test`, `openspec`, and `rust`. Require
   `code_review.status: "pass"` with an empty `issues` array; require
   `typescript`, `build`, `test`, and `openspec` to have `status: "pass"` and an
   `output` string. Rust must be `pass` when `src-tauri/` changed; it may be
   `skip` with an output reason only when no `src-tauri/` file changed. Missing,
   malformed, or contradictory results fail closed; do not infer a pass from
   partial output.

4. **If every required check passes**:
   Record the verifier instance and its result, show OK verify passed, and
   proceed to Phase 6.

5. **If any check fails or the result is invalid**:
   Enter the fix loop (Phase 5b). Do not archive or push while verification is
   failed, incomplete, or still running.

---

## Phase 5b: Fix Loop

Up to 3 rounds of automatic repair. When this loop is invoked for post-archive
recovery by Phase 6, the stricter Phase 6 rule applies: do not offer or accept
force-continue; exhaustion always stops before commit or push.

1. **Read the verify result** -- collect the failing checks and their output.

2. **Dispatch an Apply agent** with the failure context to fix:
   ```
   You are fixing issues found during verification of change
   "{changeName}" in branch "{branchName}".

   The following checks failed:

   {list each failing check with its output/errors}

   Please fix the code to resolve ALL of these issues. Make minimal,
   focused changes. After fixing, run the relevant check(s) again to
   confirm.

   When done, report:
   ## Apply Result
   - Tasks completed: N/M
   - Summary:
     - fix round {R}: OK <issue resolved>
   - Blocked: yes/no
   - Block reason: <if blocked>
   ```

3. **Await and validate the fix result** using the Apply result criteria from
   Phase 4. If it is blocked, incomplete, missing, or malformed, STOP and report
   the reason; do not launch verification as though the fix succeeded.

4. **Before reverification**, check the OpenSpec status and sync any delta spec
   changes made during the fix round using the Phase 5 procedure. Then dispatch
   verification with a fresh Agent instance, distinct from both the fixer and
   every previous verifier; use the same verification prompt as Phase 5 against
   the updated branch.

5. **Await and validate reverification** using all Phase 5 result criteria.
   Missing, malformed, or incomplete output is not a pass; STOP and report it.

6. **If Verify passes**, proceed to Phase 6.

7. **If Verify fails again**, increment round counter:
   - Round 1-2 -> go back to step 2 (another fix attempt)
   - Round 3 -> STOP and show:
     ```
     ## Fix loop exhausted

     After 3 fix rounds, verification still fails:

     {summary of remaining failures}

     Options:
     1. Manually fix and re-run /opsx:apply to continue
     2. Abort (branch and changes preserved)
     3. Force-continue despite failures

     What would you like to do?
     ```
     Wait for the user's decision. Selecting option 3 is explicit authorization
     to continue despite the recorded pre-archive failures: mark that verification
     as `failed — user-authorized override` and proceed to Phase 6 only to archive
     and run the mandatory post-archive Verify. Commit or push only if that final
     Verify passes. Do not relabel or report the overridden verification as passed;
     include the failed checks and override in the final completion report.
     Options 1 and 2 must not bypass the verification gate.

---

## Phase 6: Archive

Run the OpenSpec archive workflow inline.

**This phase follows the same procedure as opsx:archive.**
Refer to `.claude/commands/opsx/archive.md` for the detailed skill steps.

In summary:

1. **Check change status and task completion**
   ```bash
   openspec status --change "{changeName}" --json
   ```
   Require every planning artifact to have status `done`, and require every task
   in `tasks.md` to be checked. If either condition is false or cannot be
   verified, STOP; do not archive. Check for delta specs in
   `artifactPaths.specs.existingOutputPaths`.

2. **Confirm delta specs were synced before Verify**
   If delta specs exist, compare them with the main specs and confirm they were
   synced in Phase 5. If any delta remains unsynced, STOP and return to Phase 5
   to sync it and run a fresh verification before archiving. Do not make spec
   changes after Verify has passed.

3. **Perform archive**
   ```bash
   openspec archive "{changeName}" --yes
   ```
   The CLI takes the change name as a positional argument (not `--change`).
   Or follow the manual archive steps from the archive skill if the CLI cannot
   perform the archive; do not treat a failed archive command as success.

4. **Confirm**
   Verify the change directory has been moved under the archive directory
   resolved from `planningHome.changesDir`, and record its exact path as
   `{archivePath}` for final verification and recovery.

5. **Verify the final archived diff before committing**
   Archiving changes the branch diff and file paths after Phase 5. Dispatch a
   fresh Verify Agent, distinct from every previous Apply or Verify instance,
   against the final archived branch. It must inspect the complete final diff
   and run the full Phase 5 check list and result validation; skip only the
   Phase 5 delta-sync preflight because the change is already archived. Do not
   commit or push until this post-archive verification passes. If it fails or
   returns an invalid result, block Phase 7 and report the failures. On the first
   such failure, initialize `recoveryAttempts` to 0; retain that count across all
   recovery cycles. Restore the archived change directory to its recorded
   `changeRoot` with `git mv "{archivePath}" "{changeRoot}"`. If the source or
   destination is ambiguous, or the move fails, STOP for manual resolution.
   Allow at most 3 fixer dispatches total across this entire post-archive recovery,
   incrementing
   `recoveryAttempts` for each dispatch; do not reset it after re-archiving. For
   each attempt, dispatch and validate one fixer using Phase 5b steps 2-3, sync
   any updated delta specs, then dispatch a fresh pre-archive Verify and validate
   it using Phase 5 criteria. Do not offer or accept force-continue or use Phase
   5b's separate round counter. If the pre-archive Verify fails and attempts
   remain, dispatch the next fixer. If it passes, re-archive and repeat the
   mandatory post-archive Verify. If that fails, restore the change directory
   again before another fixer dispatch.
   Once `recoveryAttempts` reaches 3, any failed or invalid pre-archive or
   post-archive Verify MUST STOP without committing or pushing.

6. **Announce**
   ```
   OK Archive complete: {changeName} archived
   ```

---

## Phase 7: Commit + Push + PR + Merge

1. **Commit the verified changes**
   ```bash
   git status --short
   git diff --check
   git diff --cached --check
   ```
   Review the complete working diff, stage only the files belonging to this
   issue, inspect the staged diff, then commit using the repository format:
   ```text
   {type}: 简明中文描述

   closes #{N}
   ```
   If the worktree is already clean, confirm the branch has at least one commit
   not present on `origin/main`; otherwise STOP because there is nothing to PR.
   Never push uncommitted changes or silently omit changes from the commit.

2. **Verify branch and commit state, then push**
   Confirm the current branch is `{branchName}`, the worktree is clean, and the
   issue commit(s) are ahead of `origin/main`. Then run:
   ```bash
   git push -u origin {branchName}
   ```
   If push fails (e.g., permission denied, remote rejects), show the error
   and STOP (user resolves manually).

3. **Create PR**
   ```bash
   gh pr create \
     --title "{title} (#{N})" \
     --body "closes #{N}" \
     --base main
   ```
   If the branch was already merged or the commit already on main, skip PR
   creation and STOP (report the situation).

4. **Wait for PR creation result** -- parse the PR URL from output.

5. **Squash merge**
   ```bash
   gh pr merge {branchName} --squash --delete-branch
   ```
   If merge fails (conflicts, CI not passing), show the error and STOP.
   The user can merge manually from GitHub.

6. **Announce**
   ```
   ## OK Issue #{N} Complete

   Issue:   {title}
   Branch:  {branchName} (merged and deleted)
   PR:      {pr-url}
   Change:  {changeName} (archived)
   ```
