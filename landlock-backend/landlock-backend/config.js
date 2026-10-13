// Runtime configuration, read once from environment variables (and an optional .env file that
// server.js loads first). Every setting defaults to the SAFE choice when it is missing.
const production = process.env.NODE_ENV === 'production';

// Demo-only endpoints (/api/dev/*: reset and attack simulations) are OFF unless explicitly enabled with
// LANDLOCK_DEMO_MODE=true or the --demo flag, and they can never be enabled when NODE_ENV=production.
const demoRequested = process.env.LANDLOCK_DEMO_MODE === 'true' || process.argv.includes('--demo');
const demoMode = demoRequested && !production;

// A new signing key may only be generated automatically for a brand-new, empty database, and never
// in production or when LANDLOCK_REQUIRE_KEY=true (then the key file must already exist).
const requireKey = production || process.env.LANDLOCK_REQUIRE_KEY === 'true';

// Clear one-line start-up error, without a stack trace, then stop.
function fatal(message) {
  console.error(`LandLock cannot start: ${message}`);
  process.exit(1);
}

module.exports = { production, demoRequested, demoMode, requireKey, fatal };
