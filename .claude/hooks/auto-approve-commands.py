#!/usr/bin/env python3
"""
PreToolUse hook that auto-approves safe Bash commands.
Replaces the need for a massive permissions allowlist in settings.local.json.

Exit 0 with JSON {"hookSpecificOutput": {"permissionDecision": "allow"}} = auto-approve
Exit 0 with no output = no opinion, proceed to normal permission check
Exit 2 = block the command
"""
import json
import re
import sys

try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)

tool_name = input_data.get("tool_name", "")
tool_input = input_data.get("tool_input", {})

if tool_name != "Bash":
    sys.exit(0)

command = tool_input.get("command", "").strip()

# ── Dangerous patterns: DENY ──────────────────────────────────────────
DANGEROUS_PATTERNS = [
    r"rm\s+-rf\s+/",            # rm -rf /
    r"rm\s+-rf\s+~",            # rm -rf ~
    r"mkfs\.",                   # format disk
    r"dd\s+if=",                # dd raw disk write
    r">\s*/dev/sd",             # overwrite disk
    r"chmod\s+-R\s+777\s+/",   # chmod 777 /
    r"curl.*\|\s*sh",          # curl pipe to shell
    r"curl.*\|\s*bash",        # curl pipe to bash
    r"wget.*\|\s*sh",          # wget pipe to shell
    r"eval\s+.*\$\(",          # eval with command substitution
    r"git\s+push.*--force\s+.*main", # force push to main
    r"git\s+push.*--force\s+.*master",
    r"git\s+reset\s+--hard",   # destructive git reset
    r"git\s+clean\s+-fd",      # destructive git clean
]

for pattern in DANGEROUS_PATTERNS:
    if re.search(pattern, command):
        print(
            f"Blocked: command matched dangerous pattern '{pattern}'",
            file=sys.stderr,
        )
        sys.exit(2)

# ── Safe command prefixes: AUTO-APPROVE ───────────────────────────────
SAFE_PREFIXES = [
    # Git (read-only & safe operations)
    "git status",
    "git log",
    "git diff",
    "git branch",
    "git fetch",
    "git worktree",
    "git checkout",
    "git show",
    "git rev-parse",
    "git remote",
    "git stash list",
    "git tag",

    # npm (package management & scripts)
    "npm run",
    "npm test",
    "npm -w",
    "npm install",
    "npm uninstall",
    "npm remove",
    "npm ls",
    "npm list",
    "npm outdated",
    "npm audit",
    "npm run build",

    # npx (common dev tools)
    "npx oxfmt",
    "npx oxlint",
    "npx tsc",
    "npx vue-tsc",
    "npx vitest",

    # Docker (inspection & exec)
    "docker ps",
    "docker logs",
    "docker exec",
    "docker compose exec",
    "docker compose ps",
    "docker compose logs",

    # GitHub CLI
    "gh pr",
    "gh issue",
    "gh release",
    "gh label",
    "gh api",
    "gh run",

    # Read-only filesystem & text tools
    "ls",
    "cat ",
    "head ",
    "tail ",
    "wc ",
    "find ",
    "grep ",
    "xargs grep",
    "xargs ",
    "sort ",
    "du ",
    "pwd",
    "which ",
    "file ",
    "stat ",
    "basename ",
    "dirname ",
    "realpath ",

    # Dev tools
    "ast-grep",
    "node -e",
    "python3",
    "jq ",
    "curl ",
    "sed ",
    "awk ",
    "echo ",
    "printf ",

    # Project-specific
    "touch .claude/i18n-bypass",
    "rm .claude/i18n-bypass",
    "magick",
    "terminal-notifier",
]

for prefix in SAFE_PREFIXES:
    if command.startswith(prefix):
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "allow",
                "permissionDecisionReason": f"Auto-approved: '{prefix}...'",
            }
        }
        json.dump(result, sys.stdout)
        sys.exit(0)

# ── Safe full-command matches ─────────────────────────────────────────
SAFE_EXACT = [
    "pwd",
    "done",
    "npm test",
]

if command in SAFE_EXACT:
    result = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": f"Auto-approved: exact match '{command}'",
        }
    }
    json.dump(result, sys.stdout)
    sys.exit(0)

# ── Everything else: normal permission flow ───────────────────────────
sys.exit(0)
