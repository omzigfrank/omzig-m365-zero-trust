# Phase 7 Deferred Items

Items identified during Phase 7 planning that are deliberately OUT OF SCOPE for
this phase but worth tracking for a follow-up.

## Backfill graceful drain to Phase 6 scheduler

**Origin:** Plan 07-01 checker blocker review (scope creep).

**What:** The Phase 6 `apps/api/src/services/scheduler.ts` does not currently
implement a graceful-drain pattern on `stopScheduler()`. An early draft of
Plan 07-01 Task 3 instructed the executor to add drain logic to scheduler.ts
"as a parallel improvement." That was pulled out because (a) scheduler.ts is
NOT in 07-01's files_modified list, (b) it ships a completed Phase 6
subsystem, and (c) it is not required for the remediation worker to function —
the remediation worker has its own self-contained drain.

**Why deferred:** Modifying a completed-phase file from an active phase is a
boundary violation. If the drain capability is genuinely desired for the
scheduler, it should be scoped as an independent improvement with its own
plan, test plan, and regression surface.

**Pointer for a future plan:**
- File: `apps/api/src/services/scheduler.ts`
- Pattern to copy: graceful-drain logic from
  `apps/api/src/services/remediation-worker.ts` (added in Plan 07-01 Task 3).
- Acceptance: `stopScheduler()` becomes `async`, sets a `shuttingDown` flag,
  clears the interval, awaits in-flight audit-run promises with a 30-second
  cap, then resolves. Update `apps/api/src/index.ts` SIGTERM handler to
  `await stopScheduler()` if it currently calls it synchronously.
