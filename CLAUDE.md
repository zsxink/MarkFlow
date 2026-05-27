# MarkFlow project guidance

- When debugging bugs, regressions, runtime failures, or user-reported issues in MarkFlow, check the runtime logs first before making code changes.
- The app writes logs under its app config directory in the `logs/` subdirectory.
- On this machine, the current runtime log directory is `C:/Users/xian/AppData/Roaming/MarkFlow/logs`.
- Use the logs to narrow the failing flow, affected module, and recent error context before reproducing or patching.
