#!/usr/bin/env python3
"""Detects whether a Claude Code session still has background work in flight.

A Stop hook fires at the end of every main-agent turn, including the turn that
merely launches a background Workflow or Agent. Checks that inspect the working
tree (linters, dead-code scans, build gates) see a half-finished state there and
report findings nobody can act on yet. Ask this module first and bail out.

Use as a library from a sibling hook script:

    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
    from background_work import has_running_background_work
    if has_running_background_work(payload.get("transcript_path")):
        exit(0)

Use from a shell hook (exit 0 = busy, 1 = idle, so it reads as an early return):

    cat | python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/lib/background_work.py" && exit 0
"""

import json
import re
import sys
from datetime import datetime, timedelta, timezone

# Tool results that mean "work continues after this turn ends".
BACKGROUND_LAUNCH_MARKERS = (
    "Workflow launched in background",
    "Async agent launched successfully",
)
# A launch older than this with no completion notification is treated as dead
# (killed workflow, crashed agent) so the caller can't be muted for a whole session.
DEFAULT_STALE_AFTER = timedelta(hours=2)

_TOOL_USE_ID_RE = re.compile(r"<tool-use-id>([^<]+)</tool-use-id>")


def _parse_timestamp(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def pending_background_launches(transcript_path, markers=BACKGROUND_LAUNCH_MARKERS,
                                stale_after=DEFAULT_STALE_AFTER):
    """Tool-use ids of background launches with no completion notification yet.

    A background launch writes a tool_result carrying one of `markers`; its
    completion arrives later as a <task-notification> quoting the same tool-use
    id. Anything launched but never notified — and not older than `stale_after`
    — is still running. Returns [] for an unreadable transcript."""
    launched = {}  # tool_use_id -> launch time
    finished = set()

    try:
        with open(transcript_path, encoding="utf-8") as transcript:
            lines = transcript.readlines()
    except (OSError, TypeError):
        return []

    for line in lines:
        # Notifications are plain text in the raw line, whatever block shape they use.
        finished.update(_TOOL_USE_ID_RE.findall(line))

        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        content = (entry.get("message") or {}).get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if block.get("type") != "tool_result":
                continue
            text = json.dumps(block.get("content"))
            if any(marker in text for marker in markers):
                launched[block.get("tool_use_id")] = _parse_timestamp(entry.get("timestamp"))

    now = datetime.now(timezone.utc)
    return [
        tool_use_id
        for tool_use_id, started_at in launched.items()
        if tool_use_id not in finished
        and not (started_at and now - started_at > stale_after)
    ]


def has_running_background_work(transcript_path, **kwargs):
    return bool(pending_background_launches(transcript_path, **kwargs))


def main():
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        payload = {}
    pending = pending_background_launches(payload.get("transcript_path"))
    print("busy" if pending else "idle", len(pending), file=sys.stderr)
    sys.exit(0 if pending else 1)


if __name__ == "__main__":
    main()
