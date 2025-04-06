#!/bin/sh

# Check if inside a Git repository
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  git config blame.ignoreRevsFile .git-blame-ignore-revs
else
  echo "Not inside a Git repository. Skipping git config."
fi
