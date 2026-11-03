// Fictional practice rosters for rehearsing the classmate import. Every name is invented (surnames are built from
// made-up syllables) and every ID starts with FX-. Never mix these with the real roster.
//   node scripts/fictional-roster.js   writes samples/fictional-roster-318.csv and samples/fictional-roster-with-problems.csv
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIRST = ['Avery', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Quinn', 'Rowan', 'Skyler', 'Emerson', 'Finley', 'Harper', 'Reese', 'Sage', 'Dakota', 'Kendall', 'Logan', 'Marlowe', 'Parker', 'Remy', 'Tatum', 'Zoë', 'Inès', 'José', 'Siobhán'];
const START = ['Bram', 'Cinder', 'Dove', 'Fen', 'Gale', 'Holl', 'Ivy', 'Jas', 'Kest', 'Lark', 'Mire', 'Nettle', 'Oak'];
const END = ['wick', 'vale', 'ford', 'mere', 'thorne', 'brook', 'stead', 'holt', 'well', 'croft', 'by', 'ridge', 'ton', 'more'];
const MIDDLE = ['', '', '', 'A.', 'Lee', 'Marie', 'J.'];

export function fictionalRoster(count = 318) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const last = START[i % START.length] + END[Math.floor(i / START.length) % END.length] + (i >= START.length * END.length ? 'e' : '');
    rows.push({ id: `FX-${String(i + 1).padStart(4, '0')}`, first: FIRST[(i * 7) % FIRST.length], middle: MIDDLE[i % MIDDLE.length], last, year: 2008, homeroom: `Room ${100 + (i % 24)}`, permission: 'Unknown' });
  }
  return rows;
}

const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export function toRosterCsv(rows) {
  const head = ['Alumni ID', 'First Name', 'Middle Name', 'Last Name', 'Graduation Year', 'Homeroom', 'Contact Permission'];
  return [head.join(','), ...rows.map((r) => [r.id, r.first, r.middle, r.last, r.year, r.homeroom, r.permission].map(q).join(','))].join('\r\n') + '\r\n';
}

// Same list with typical mistakes to practise on: a repeated ID, a missing ID, a missing last name,
// a wrong class year, the same name under two IDs, and an unreadable permission value.
export function rosterWithProblems() {
  const rows = fictionalRoster(40);
  rows[5].id = rows[4].id;
  rows[9].id = '';
  rows[14].last = '';
  rows[20].year = 2009;
  rows[25] = { ...rows[26], id: 'FX-9026' };
  rows[30].permission = 'Maybe';
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fictional-roster-318.csv'), toRosterCsv(fictionalRoster()));
  fs.writeFileSync(path.join(dir, 'fictional-roster-with-problems.csv'), toRosterCsv(rosterWithProblems()));
  console.log(`Wrote fictional practice files to ${dir}`);
}
