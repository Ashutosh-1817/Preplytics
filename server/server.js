

import app from './src/app.js';
import config from './src/config/env.js';
import connectDB from './src/config/db.js';
import { startReminderJob } from './src/jobs/reminder.job.js';


const startServer = async () => {
  await connectDB();

  app.listen(config.port, () => {
    console.log(`[SERVER] Preplytics API running on port ${config.port} [${config.nodeEnv}]`);
  });

  startReminderJob();
};

startServer();

// Process-level safety nets — a rejected promise or thrown error with no
// handler anywhere should never leave the process silently running in a
// broken state
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});