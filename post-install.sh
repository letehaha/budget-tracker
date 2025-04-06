#!/bin/sh
set -e

# Check if we're in a git repository
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "Running git commands..."
    git config blame.ignoreRevsFile .git-blame-ignore-revs
else
    echo "Not in a git repository, skipping git commands."
fi
