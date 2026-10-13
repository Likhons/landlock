// Simple JSON-file database (no native modules, so it installs cleanly on Windows)
// Survey history below is SAMPLE data for the prototype (CS -> SA -> RS -> BS).
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'data.json');

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

let db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : seed();

function save() { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }
function reset() { db = seed(); save(); }
function get() { return db; }

save();
module.exports = { get, save, reset };