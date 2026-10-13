// Simple JSON-file database (no native modules, so it installs cleanly on Windows)
// DEMO/SAMPLE DATA: the plots, owners and survey history below (CS -> SA -> RS -> BS) are invented
// for the prototype. They are NOT verified official khatian records.
// seed() is also the trusted starting state: the ledger's GENESIS entry is checked against it.
const fs = require('fs');
const path = require('path');
const { fatal } = require('./config');
const { writeJsonAtomic, acquireLock } = require('./fsutil');
const DIR = process.env.LANDLOCK_DATA_DIR || __dirname;
const FILE = path.join(DIR, 'data.json');

function seed() {
  return {
    plots: [
      {
        id: 'P1', mouza: 'Rampura', khatian_no: '101', dag_no: '123', area: 10, current_owner: 'Rahim', status: 'Free', mortgage: null,
        survey: [
          { survey: 'CS', year: 1924, owner: 'Abdul Latif', area: 10, source: 'original', ref: 'CS Khatian 45' },
          { survey: 'SA', year: 1960, owner: 'Abdul Latif', area: 10, source: 'original', ref: 'SA Khatian 88' },
          { survey: 'RS', year: 1985, owner: 'Hashem Ali', area: 10, source: 'inheritance', ref: 'Warish certificate' },
          { survey: 'BS', year: 2012, owner: 'Rahim', area: 10, source: 'sale', ref: 'Deed 4521/1998' },
        ],
      },
      {
        id: 'P2', mouza: 'Rampura', khatian_no: '101', dag_no: '124', area: 8, current_owner: 'Karim', status: 'Free', mortgage: null,
        survey: [
          { survey: 'CS', year: 1924, owner: 'Nur Mia', area: 8, source: 'original', ref: 'CS Khatian 45' },
          { survey: 'SA', year: 1960, owner: 'Nur Mia', area: 8, source: 'original', ref: 'SA Khatian 88' },
          { survey: 'RS', year: 1985, owner: 'Fazlu Sheikh', area: 8, source: 'unknown', ref: '' },
          { survey: 'BS', year: 2012, owner: 'Karim', area: 8, source: 'sale', ref: 'Deed 902/2005' },
        ],
      },
      {
        id: 'P3', mouza: 'Banasree', khatian_no: '205', dag_no: '56', area: 15, current_owner: 'Salma', status: 'Free', mortgage: null,
        survey: [
          { survey: 'CS', year: 1924, owner: 'Rahman', area: 12, source: 'original', ref: 'CS Khatian 12' },
          { survey: 'SA', year: 1960, owner: 'Rahman', area: 12, source: 'original', ref: 'SA Khatian 30' },
          { survey: 'RS', year: 1985, owner: 'Rahman', area: 15, source: 'original', ref: 'RS Khatian 77' },
          { survey: 'BS', year: 2012, owner: 'Salma', area: 15, source: 'sale', ref: 'Deed 311/2009' },
        ],
      },
      {
        id: 'P4', mouza: 'Banasree', khatian_no: '205', dag_no: '57', area: 12, current_owner: 'Jamal', status: 'Free',
        mortgage: { bank: 'Janata Bank', loan_ref: 'LN-2024-77' },
        survey: [
          { survey: 'CS', year: 1924, owner: 'Miah Uddin', area: 12, source: 'original', ref: 'CS Khatian 12' },
          { survey: 'SA', year: 1960, owner: 'Miah Uddin', area: 12, source: 'original', ref: 'SA Khatian 30' },
          { survey: 'RS', year: 1985, owner: 'Kamal', area: 12, source: 'inheritance', ref: 'Warish certificate' },
          { survey: 'BS', year: 2012, owner: 'Jamal', area: 12, source: 'sale', ref: 'Deed 650/2010' },
        ],
      },
      {
        id: 'P5', mouza: 'Uttara', khatian_no: '310', dag_no: '9', area: 20, current_owner: 'Nasrin', status: 'Free', mortgage: null,
        survey: [
          { survey: 'CS', year: 1924, owner: 'Sufia Khatun', area: 20, source: 'original', ref: 'CS Khatian 9' },
          { survey: 'SA', year: 1960, owner: 'Sufia Khatun', area: 20, source: 'original', ref: 'SA Khatian 14' },
          { survey: 'RS', year: 1985, owner: 'Sufia Khatun', area: 20, source: 'original', ref: 'RS Khatian 21' },
          { survey: 'BS', year: 2012, owner: 'Nasrin', area: 20, source: 'inheritance', ref: 'Warish certificate' },
        ],
      },
    ],
    transactions: [],
    ledger: [],
  };
}

// A plot is identified by mouza + khatian no. + dag no. (ignoring case and spaces); the combination must be unique.
const plotKey = (p) => [p.mouza, p.khatian_no, p.dag_no].map((v) => String(v).trim().toLowerCase()).join('|');
function duplicatePlotKeys(plots) {
  const seen = new Map();
  const dups = [];
  for (const p of plots) {
    const k = plotKey(p);
    if (seen.has(k)) dups.push(`${seen.get(k)} and ${p.id} (mouza ${p.mouza}, khatian ${p.khatian_no}, dag ${p.dag_no})`);
    else seen.set(k, p.id);
  }
  return dups;
}

acquireLock(`${FILE}.lock`);

// Load the existing file, or start from the sample data when there is none. A file that cannot be
// read is NEVER replaced automatically: the server stops and leaves it untouched.
function load() {
  if (!fs.existsSync(FILE)) return { data: seed(), fresh: true };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    fatal(`${path.basename(FILE)} is not valid JSON, so it was NOT overwritten. Restore it from a backup, `
      + 'or move it aside to start again with the sample data.');
  }
  if (!data || !Array.isArray(data.plots) || !Array.isArray(data.transactions) || !Array.isArray(data.ledger)) {
    fatal(`${path.basename(FILE)} does not have the expected plots / transactions / ledger lists, so it was NOT overwritten.`);
  }
  return { data, fresh: false };
}

const loaded = load();
let db = loaded.data;

// Refuse to start on ambiguous plot identifiers (a database constraint the JSON file cannot enforce itself)
const dups = duplicatePlotKeys(db.plots);
if (dups.length) fatal(`duplicate plot identifiers in ${path.basename(FILE)}: ${dups.join('; ')}`);

function save() { writeJsonAtomic(FILE, db); }
function reset() { db = seed(); save(); }
function get() { return db; }

// All-or-nothing writes: a copy is taken before a write request changes anything. If the request fails
// midway (e.g. a disk error after the plot was updated but before the ledger entry was written), the
// copy is put back in memory and written again, so no half-finished change survives.
function snapshot() { return JSON.stringify(db); }
function restore(copy) {
  db = JSON.parse(copy);
  try { save(); } catch (_) { /* disk still failing: memory is correct; the integrity check reports any gap */ }
}

if (loaded.fresh) save();
module.exports = { get, save, reset, seed, snapshot, restore };