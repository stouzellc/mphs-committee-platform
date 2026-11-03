// Database updates, run with the database OWNER's DATABASE_URL.
//   npm run migrate                      apply any pending updates
//   npm run migrate -- --status          list applied and available updates
//   npm run migrate -- --down-to 1 --yes undo updates newer than 1 (take a backup first)
import '../server/env-file.js';
import { createPostgresStore } from '../server/store/postgres.js';
import { connectionFromEnv } from '../server/store/ssl.js';

if (!process.env.DATABASE_OWNER_URL && !process.env.DATABASE_URL) { console.error('Set DATABASE_OWNER_URL (or DATABASE_URL) to the database owner connection.'); process.exit(2); }
const { connectionString, ssl } = connectionFromEnv(process.env, { owner: true });
const store = createPostgresStore({ connectionString, ssl, initial: null, runMigrations: false });
const i = process.argv.indexOf('--down-to');
try {
  if (process.argv.includes('--status')) {
    console.log(JSON.stringify(await store.migrationStatus()));
  } else if (i > 0) {
    const target = Number(process.argv[i + 1]);
    if (!Number.isInteger(target) || target < 0) { console.error('--down-to needs a version number (0 removes everything).'); process.exit(2); }
    if (!process.argv.includes('--yes')) { console.error('Undoing database updates can delete data. Take a backup (npm run backup), then add --yes.'); process.exit(2); }
    const undone = await store.migrateDown(target);
    console.log(undone.length ? `Undid database updates: ${undone.join(', ')}` : 'Nothing to undo.');
  } else {
    await store.migrate();
    console.log(`Database is up to date: ${JSON.stringify((await store.migrationStatus()).applied)}`);
  }
} finally {
  await store.close().catch(() => {});
}
