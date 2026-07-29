#!/usr/bin/env python3
"""Stop hook: runs knip to detect unused code after Claude finishes responding.
If unused exports/files are found, blocks Claude from stopping and asks it to clean up.

Skipped while a background Workflow/Agent is running: the tree is mid-edit,
and findings would be noise the agent can't act on yet."""

import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from background_work import has_running_background_work

project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
if not project_dir:
    exit(0)

try:
    payload = json.load(sys.stdin)
except (json.JSONDecodeError, ValueError):
    payload = {}

if has_running_background_work(payload.get("transcript_path")):
    exit(0)

result = subprocess.run(
    ["npm", "run", "knip"],
    cwd=project_dir,
    capture_output=True,
    text=True,
)

if result.returncode != 0:
    output = result.stdout + result.stderr
    print(json.dumps({
        "decision": "block",
        "reason": f"knip found unused code. Please clean it up (remove unused exports, files, dependencies, etc.):\n\n{output}",
    }))
