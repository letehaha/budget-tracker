#!/usr/bin/env python3
"""Stop hook: runs knip to detect unused code after Claude finishes responding.
If unused exports/files are found, blocks Claude from stopping and asks it to clean up."""

import json
import os
import subprocess

project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
if not project_dir:
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
