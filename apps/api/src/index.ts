import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import {
  startRemediationWorker,
  stopRemediationWorker,
} from './services/remediation-worker.js';
import {
  startDriftPoller,
  stopDriftPoller,
} from './services/drift-poller.js';

const app = createApp();
const port = parseInt(process.env.PORT ?? '8080', 10);

serve(
  { fetch: app.fetch, port },
  (info) => {
    console.log(`[omzig-api] Server started on http://localhost:${info.port}`);
    // Phase 6 Plan 01: Start the in-process scan scheduler.
    startScheduler();
    // Phase 7 Plan 01: Start the in-process remediation worker.
    startRemediationWorker();
    // Phase 8 Plan 01: Start the in-process drift poller.
    startDriftPoller();
  },
);

// Phase 7 Plan 01: Graceful shutdown -- drain in-flight remediations.
// NOTE: scheduler.stopScheduler() remains synchronous (unchanged from Phase 6).
// Only the remediation worker supports a drain; a scheduler drain is tracked
// in deferred-items.md as a follow-up and is out of scope here.
async function handleShutdown(signal: string): Promise<void> {
  console.log(`[omzig-api] Received ${signal}, shutting down...`);
  try {
    // Phase 8: Drift poller is less critical, drain first.
    await stopDriftPoller();
  } catch (err) {
    console.error('[omzig-api] stopDriftPoller failed:', err);
  }
  try {
    await stopRemediationWorker();
  } catch (err) {
    console.error('[omzig-api] stopRemediationWorker failed:', err);
  }
  try {
    stopScheduler();
  } catch (err) {
    console.error('[omzig-api] stopScheduler failed:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', () => {
  handleShutdown('SIGTERM').catch(() => process.exit(1));
});
process.on('SIGINT', () => {
  handleShutdown('SIGINT').catch(() => process.exit(1));
});
