// Safe file writes for the JSON storage.
const fs = require('fs');
const path = require('path');
const { fatal } = require('./config');

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Atomic replace: write a temp file next to the target, flush it to disk, then rename it over the
// target. A crash mid-write leaves the old file intact instead of a half-written one.
// On Windows, OneDrive or antivirus can briefly lock the file, so the rename is retried a few times.
function writeJsonAtomic(file, value, options = {}) {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w', options.mode);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (attempt >= 10 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) {
        try { fs.unlinkSync(tmp); } catch (_) { /* temp already gone */ }
        throw e;
      }
      sleep(20 * attempt);
    }
  }
}

// One server per data folder: two processes writing the same data.json would overwrite each other.
// The lock file holds the owner's PID; a lock left by a process that no longer runs is taken over.
function acquireLock(lockFile) {
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      process.on('exit', () => { try { fs.unlinkSync(lockFile); } catch (_) { /* already removed */ } });
      return;
    } catch (e) {
      if (e.code === 'ENOENT') fatal('the data folder does not exist. Set LANDLOCK_DATA_DIR to an existing folder.');
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(fs.readFileSync(lockFile, 'utf8'));
      if (pid && pid !== process.pid && isRunning(pid)) {
        fatal(`another LandLock server (PID ${pid}) is already using this data folder. Stop it first. `
          + `If it is not running, delete ${path.basename(lockFile)}.`);
      }
      fs.unlinkSync(lockFile); // stale lock
    }
  }
  fatal(`could not create ${path.basename(lockFile)}.`);
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

module.exports = { writeJsonAtomic, acquireLock };
