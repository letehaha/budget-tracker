#!/bin/bash

# Stop hook: runs knip to detect unused code after Claude finishes responding.
# If unused exports/files are found, blocks Claude from stopping and asks it to clean up.

cd "$CLAUDE_PROJECT_DIR" || exit 0

KNIP_OUTPUT=$(npx -w packages/frontend knip 2>&1)
KNIP_EXIT=$?

# If knip found issues (non-zero exit), block and ask Claude to clean up
if [ $KNIP_EXIT -ne 0 ]; then
  # Escape the output for JSON
  ESCAPED_OUTPUT=$(echo "$KNIP_OUTPUT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

  echo "{\"decision\": \"block\", \"reason\": \"knip found unused code. Please clean it up (remove unused exports, files, dependencies, etc.):\\n\\n${ESCAPED_OUTPUT}\"}"
  exit 0
fi

# No issues — allow Claude to stop normally
exit 0
