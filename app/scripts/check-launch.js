// Checks the launch settings and the database without starting the site. Exit code 1 if anything blocks launch.
// Usage (with the production environment variables set): npm run check:launch
import '../server/env-file.js';
import { settingsProblems, dataProblems, formatReport } from '../server/launch-check.js';
import { storeFromEnv } from '../server/store/index.js';

const settings = settingsProblems(process.env);
let data = { errors: [], warnings: [] };
if (process.env.DATABASE_URL) {
  const store = storeFromEnv({ env: process.env, initial: null });
  try {
    await store.init();
    data = await dataProblems(store);
  } catch (e) {
    data.errors.push(`Could not check the database: ${e.message}`);
  } finally {
    await store.close().catch(() => {});
  }
}
const errors = [...settings.errors, ...data.errors];
const warnings = [...settings.warnings, ...data.warnings];
console.log(errors.length ? 'Launch check: NOT ready' : 'Launch check: ready');
if (errors.length || warnings.length) console.log(formatReport({ errors, warnings }));
process.exit(errors.length ? 1 : 0);
