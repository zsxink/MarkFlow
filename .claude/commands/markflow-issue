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

```
1 Fetch Issue -> 2 Create Branch -> 3 Propose -> 4 Apply (sub-agent)
  -> 5 Verify (sub-agent) -> [fix loop x3 max] -> 6 Archive -> 7 PR + Merge
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

3. **Await result**. Parse the sub-agent output for:
   - Tasks completed count
   - Blocked flag and reason

4. **If blocked**, show the block reason and STOP (user decides what to do).

5. **If complete**, proceed to Phase 5.

---

## Phase 5: Verify (Sub-Agent)

Dispatch a sub-agent to review and test the changes.

1. **Dispatch an Agent** (type: general-purpose) with this prompt:
   ```
   You are in branch "{branchName}" of the MarkFlow repository at {repoRoot}.

   Review and verify the changes made in this branch.

   1. List changed files:
      git diff origin/main --stat

   2. Check for obvious code issues:
      git diff origin/main -- src/ | head -500
      (Review the diff for bugs, dead code, debug logs, missing edge cases)

   3. Run TypeScript type check:
      npx tsc --noEmit 2>&1

   4. Run build:
      npm run build 2>&1

   5. Run tests:
      npm test 2>&1

   6. Report results in EXACTLY this JSON format and nothing else:

   {
     "passed": true,
     "checks": {
       "code_review": { "status": "pass", "issues": [] },
       "typescript":  { "status": "pass", "output": "" },
       "build":       { "status": "pass", "output": "" },
       "test":        { "status": "pass", "output": "" }
     },
     "summary": "one-line conclusion"
   }
   ```

2. **Parse the JSON result**. Check `passed`.

3. **If passed**:
   Show OK verify passed and proceed to Phase 6.

4. **If failed**:
   Enter the fix loop (Phase 5b).

---

## Phase 5b: Fix Loop

Up to 3 rounds of automatic repair.

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

3. **After the fix agent completes**, re-dispatch the Verify agent (same
   prompt as Phase 5).

4. **If Verify passes**, proceed to Phase 6.

5. **If Verify fails again**, increment round counter:
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
     Wait for user decision.

---

## Phase 6: Archive

Run the OpenSpec archive workflow inline.

**This phase follows the same procedure as opsx:archive.**
Refer to `.claude/commands/opsx/archive.md` for the detailed skill steps.

In summary:

1. **Check change status**
   ```bash
   openspec status --change "{changeName}" --json
   ```
   Check for delta specs in artifactPaths.specs.existingOutputPaths.

2. **If delta specs exist**, sync them:
   ```bash
   openspec sync-specs --change "{changeName}"
   ```
   Or use the openspec-sync-specs skill for agent-driven sync.

3. **Perform archive**
   ```bash
   openspec archive --change "{changeName}"
   ```
   Or follow the manual archive steps from the archive skill.

4. **Confirm**
   Verify the change directory has been moved to
   `openspec/changes/archive/`.

5. **Announce**
   ```
   OK Archive complete: {changeName} archived
   ```

---

## Phase 7: Push + PR + Merge

1. **Push branch to remote**
   ```bash
   git push origin {branchName}
   ```
   If push fails (e.g., permission denied, remote rejects), show the error
   and STOP (user resolves manually).

2. **Create PR**
   ```bash
   gh pr create \
     --title "{title} (#{N})" \
     --body "closes #{N}" \
     --base main
   ```
   If the branch was already merged or the commit already on main, skip PR
   creation and STOP (report the situation).

3. **Wait for PR creation result** -- parse the PR URL from output.

4. **Squash merge**
   ```bash
   gh pr merge {branchName} --squash --delete-branch
   ```
   If merge fails (conflicts, CI not passing), show the error and STOP.
   The user can merge manually from GitHub.

5. **Announce**
   ```
   ## OK Issue #{N} Complete

   Issue:   {title}
   Branch:  {branchName} (merged and deleted)
   PR:      {pr-url}
   Change:  {changeName} (archived)
   ```
