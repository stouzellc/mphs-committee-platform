// Lets the owner's scripts read database addresses (which contain the password) from owner-only files instead of
// the command line or shell history: DATABASE_URL_FILE and DATABASE_OWNER_URL_FILE. An address set directly wins.
// Import this first in a script so the values are in place before anything reads them.
import fs from 'node:fs';

for (const key of ['DATABASE_URL', 'DATABASE_OWNER_URL']) {
  const file = process.env[`${key}_FILE`];
  if (file && !process.env[key]) process.env[key] = fs.readFileSync(file, 'utf8').trim();
}
