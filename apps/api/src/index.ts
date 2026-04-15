import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { startScheduler } from './services/scheduler.js';

const app = createApp();
const port = parseInt(process.env.PORT ?? '8080', 10);

serve(
  { fetch: app.fetch, port },
  (info) => {
    console.log(`[omzig-api] Server started on http://localhost:${info.port}`);
    // Phase 6 Plan 01: Start the in-process scan scheduler.
    startScheduler();
  },
);
