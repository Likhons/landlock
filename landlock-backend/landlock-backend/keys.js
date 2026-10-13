// Sub-Registrar's signing key (Ed25519). Generated once and kept in keys.json.
// In real use the private key would sit in a hardware module at the registry office.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'keys.json');

function load() {
  if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const k = {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  fs.writeFileSync(FILE, JSON.stringify(k, null, 2));
  return k;
}

const keys = load();
const SIGNER = 'Sub-Registry Office (demo key)';

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

module.exports = { sign, verify, SIGNER, publicKey: keys.publicKey };