#!/usr/bin/env python3
"""
Hook to block reading large i18n locale files to save Claude Code tokens.
Exit code 2 blocks the operation.

Bypass: Create .claude/i18n-bypass file to temporarily allow reads.
This is used by the i18n-editor Haiku subagent.
"""
import json
import os
import sys

try:
    input_data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)

file_path = input_data.get("tool_input", {}).get("file_path", "")

# Check for bypass flag (used by i18n-editor subagent)
project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
bypass_file = os.path.join(project_dir, ".claude", "i18n-bypass")
if os.path.exists(bypass_file):
    sys.exit(0)

# Block i18n locale JSON files
blocked_patterns = [
    "i18n/locales/",
]

for pattern in blocked_patterns:
    if pattern in file_path and file_path.endswith(".json"):
        print(f"Blocked: i18n files are blocked to save tokens. Do NOT edit translations unless user explicitly asks. Note missing translations in your response instead.", file=sys.stderr)
        sys.exit(2)

sys.exit(0)
