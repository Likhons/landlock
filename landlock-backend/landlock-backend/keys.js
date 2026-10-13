// Sub-Registrar's signing key (Ed25519), kept in keys.json (or the file named by LANDLOCK_KEY_FILE).
// In real use the private key would sit in a hardware module (HSM) or managed key service at the registry office.
// PROTOTYPE RISK: keys.json holds the PRIVATE key in plain text. It is git-ignored and must never be
// sent to the frontend, returned by the API or logged. Only sign/verify/publicKey are exported.
//
// The SAME key must be used for the whole life of a ledger: a new key cannot verify old signatures.
// So a key is generated only for a brand-new, empty database, never overwritten, and a missing or
// broken key file stops the server with a clear message instead of silently signing with a new key.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { requireKey, fatal } = require('./config');

const FILE = process.env.LANDLOCK_KEY_FILE || path.join(__dirname, 'keys.json');
const NAME = path.basename(FILE);
const SIGNER = 'Sub-Registry Office (demo key)';
let keys = null;

function generate() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const k = {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  // 'wx' = create only: an existing key file is never overwritten. 0o600 = owner-only where supported.
  fs.writeFileSync(FILE, JSON.stringify(k, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(`Generated a new signing key (${NAME}). Keep it private and back it up with the data.`);
  return k;
}

// Checks the file holds a matching Ed25519 key pair. Messages never include the key itself.
function validate(k) {
  if (!k || typeof k.publicKey !== 'string' || typeof k.privateKey !== 'string') {
    fatal(`${NAME} must contain "publicKey" and "privateKey" (PEM text).`);
  }
  let pub;
  let priv;
  try {
    pub = crypto.createPublicKey(k.publicKey);
    priv = crypto.createPrivateKey(k.privateKey);
  } catch (e) {
    fatal(`${NAME} does not contain readable PEM keys.`);
  }
  if (pub.asymmetricKeyType !== 'ed25519' || priv.asymmetricKeyType !== 'ed25519') fatal(`${NAME} must hold an Ed25519 key pair.`);
  const probe = Buffer.from('landlock-key-check');
  if (!crypto.verify(null, probe, pub, crypto.sign(null, probe, priv))) {
    fatal(`the public and private keys in ${NAME} do not belong together.`);
  }
  return k;
}

// Called once at start-up by ledger.js. allowGenerate is true only for a brand-new, empty database.
function init({ allowGenerate }) {
  if (fs.existsSync(FILE)) {
    let k;
    try {
      k = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch (e) {
      fatal(`${NAME} is not valid JSON. Restore the original key file; it was not overwritten.`);
    }
    keys = validate(k);
    return;
  }
  if (!allowGenerate) {
    fatal(`signing key file ${NAME} is missing, but signed ledger data already exists. Restore the original `
      + 'key file (or point LANDLOCK_KEY_FILE at it). A new key could not verify the existing records. '
      + 'To deliberately start over, move data.json and the trusted/ folder aside.');
  }
  if (requireKey) fatal(`signing key file ${NAME} is missing and automatic key generation is disabled (production or LANDLOCK_REQUIRE_KEY=true).`);
  keys = generate();
}

function sign(data) {
  return crypto.sign(null, Buffer.from(data), keys.privateKey).toString('base64');
}

function verify(data, signature) {
  if (!signature) return false;
  try {
    return crypto.verify(null, Buffer.from(data), keys.publicKey, Buffer.from(signature, 'base64'));
  } catch (e) {
    return false;
  }
}

module.exports = {
  init, sign, verify, SIGNER,
  get publicKey() { return keys.publicKey; },
};
