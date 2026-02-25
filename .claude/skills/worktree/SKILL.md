---
name: worktree
description: Manage git worktrees for parallel Claude Code sessions. Use when user says "worktree", "create worktree", "parallel session", "new tree", or wants to work on multiple branches simultaneously.
allowed-tools: [Bash, Glob, AskUserQuestion]
---

# Git Worktree Manager

Manage git worktrees for running parallel Claude Code sessions.

## Commands

### `/worktree create <branch-name> [from <base-branch>]`

Creates a new git worktree for parallel development.

**Examples:**

- `/worktree create fix-bug` - Creates worktree from origin/main
- `/worktree create fix-bug from main` - Creates worktree from main branch
- `/worktree create feature-x from develop` - Creates from develop

### `/worktree list`

Lists all active worktrees.

### `/worktree remove [<worktree-name>]`

Removes a worktree and its local branch.

---

## Instructions

### For `create` command:

1. Parse arguments:
   - `<branch-name>`: Required, the new branch name
   - `<base-branch>`: Optional, defaults to `origin/main`

2. Determine paths:

   ```bash
   REPO_BASENAME=$(basename "$PWD")
   WORKTREE_PATH="../${REPO_BASENAME}--${BRANCH_NAME}"
   ABSOLUTE_PATH=$(cd .. && pwd)/${REPO_BASENAME}--${BRANCH_NAME}
   ```

3. Fetch latest:

   ```bash
   git fetch origin
   ```

4. Create worktree:

   ```bash
   git worktree add -b <branch-name> <worktree-path> <base-branch>
   ```

5. Install dependencies:

   ```bash
   cd <worktree-path> && npm install
   ```

6. Return to original directory

7. Check if running inside tmux:

   ```bash
   if [ -n "$TMUX" ]; then
     # Inside tmux - open new window with claude
     tmux new-window -c "<absolute-path>" -n "<branch-name>" "claude; bash"
   fi
   ```

8. **CRITICAL - Output this format at the end:**

   If tmux was used:

   ```
   Worktree created successfully!

     Branch: <branch-name>
     Base:   <base-branch>
     Path:   <absolute-path>

   New tmux window "<branch-name>" opened with Claude Code.
   Switch to it with: Ctrl+b n (next) or Ctrl+b w (window list)
   ```

   If NOT in tmux (fallback):

   ```
   Worktree created successfully!

     Branch: <branch-name>
     Base:   <base-branch>
     Path:   <absolute-path>

   To start a parallel Claude Code session, copy and run:
   ┌────────────────────────────────────────────────────────────┐
   │ cd <absolute-path> && claude                               │
   └────────────────────────────────────────────────────────────┘
   ```

---

### For `list` command:

Run and display output:

```bash
git worktree list
```

---

### For `remove` command:

1. If no worktree name provided, show `git worktree list` and ask user to specify

2. Parse worktree name to extract branch:
   - Worktree format: `<repo>--<branch>`
   - Extract branch: everything after `--`

3. **Ask for confirmation** before proceeding

4. Remove worktree:

   ```bash
   git worktree remove <worktree-path> --force
   ```

5. Delete local branch:

   ```bash
   git branch -D <branch-name>
   ```

6. Confirm: "Removed worktree and local branch. Remote branch preserved for PR."

---

## Safety Rules

- Always `git fetch` before creating to have latest refs
- Never remove worktrees with uncommitted changes without explicit confirmation
- Never remove the main worktree (one without `--` in directory name)
- Preserve remote branches when removing (only delete local branch)
- If branch already exists, ask user if they want to use existing or create new name
