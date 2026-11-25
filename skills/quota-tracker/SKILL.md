---
name: quota-tracker
description: Open the local model usage statistics and quota reset countdown side pane, or update weekly/5-hour reset schedules and manual quota snapshots.
---

# Quota Tracker

Use this skill when the user wants to view local model invocation statistics, track 5-hour or weekly quota reset countdowns in the Antigravity side pane, or adjust their reset schedule / calibration notes.

## Available MCP Tools

- `open_quota_dashboard`: Opens or refreshes the interactive **额度统计与倒计时** side pane (`aux_pane`) with current 5-hour & weekly countdowns, per-model call counts, and 7-day trend chart.
- `update_quota_settings`: Updates plan type (`pro_ultra` or `free_plus`), weekly reset weekday & time or exact next reset timestamp, 5-hour reset countdown target, optional reference limits, or a manual quota percentage note observed from Settings → Models.
- `reset_usage_stats`: Resets the 5-hour anchor (`scope: "5h_anchor"`), restores auto 5-hour detection (`scope: "5h_auto"`), or clears all local usage events (`scope: "all"`).

## Important Transparency Rule

Always be clear that these numbers are **local statistics and user-configured countdowns** collected via lifecycle hooks — they do **not** read Google's official real-time remaining quota percentage directly. For exact official remaining quota, the user can check **Settings → Models** and optionally record a snapshot in the side pane.
