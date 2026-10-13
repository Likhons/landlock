// Prototype role-based access control.
// DEMO ONLY: the role comes from the X-Demo-Role request header, which any client can set.
// That is NOT authentication. In production the role must come from a verified identity
// (real login + secure session / signed token) and be checked here on the server.
const ROLES = {
  buyer: { bn: 'ক্রেতা', en: 'Buyer' },
  sub_registrar: { bn: 'সাব-রেজিস্ট্রার', en: 'Sub-Registrar' },
  ac_land: { bn: 'এসি ল্যান্ড অফিসার', en: 'AC Land Officer' },
};
const DEFAULT_ROLE = 'buyer'; // least privilege

// Buyer has no write permissions (read-only).
// Sub-Registrar: sale/deed registration + mortgage deeds (registered at the Sub-Registry office).
// AC Land Officer: mutation (namjari) only - complete it, or formally reject it (plot becomes Disputed).
const PERMISSIONS = {
  buyer: [],
  sub_registrar: ['sale.initiate', 'sale.register', 'sale.cancel', 'mortgage.create', 'mortgage.release'],
  ac_land: ['sale.mutate', 'sale.reject_mutation'],
};

const ALL_PERMISSIONS = [...new Set(Object.values(PERMISSIONS).flat())];

// Explicit extra authorization is a server-side decision only, e.g.
//   LANDLOCK_EXTRA_GRANTS="sub_registrar:sale.mutate,ac_land:sale.register"
(process.env.LANDLOCK_EXTRA_GRANTS || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((g) => {
  const [role, perm] = g.split(':');
  if (!PERMISSIONS[role] || !ALL_PERMISSIONS.includes(perm)) {
    throw new Error(`Invalid LANDLOCK_EXTRA_GRANTS entry: ${g}`);
  }
  if (!PERMISSIONS[role].includes(perm)) PERMISSIONS[role].push(perm);
});

// Which permission a ledger event needs (used when replaying the ledger).
const EVENT_PERMISSION = {
  SALE_INITIATED: 'sale.initiate',
  SALE_BLOCKED: 'sale.initiate',
  REGISTRATION_DONE: 'sale.register',
  MUTATION_DONE: 'sale.mutate',
  MUTATION_REJECTED: 'sale.reject_mutation',
  SALE_CANCELLED: 'sale.cancel',
  MORTGAGE_CREATED: 'mortgage.create',
  MORTGAGE_BLOCKED: 'mortgage.create',
  MORTGAGE_RELEASED: 'mortgage.release',
};

const can = (role, perm) => Boolean(PERMISSIONS[role] && PERMISSIONS[role].includes(perm));

// Who is allowed to do `perm`, for friendly error messages.
const rolesWith = (perm) => Object.keys(PERMISSIONS).filter((r) => can(r, perm));

function resolveRole(req) {
  const raw = req.get('X-Demo-Role');
  if (!raw) return { role: DEFAULT_ROLE };
  const role = raw.trim().toLowerCase();
  return ROLES[role] ? { role } : { error: `Unknown demo role: ${raw}` };
}

function describe() {
  return {
    demo_only: true,
    notice: 'DEMO ROLE SWITCH: the role is chosen by the client and is not authentication. Production requires real login, secure sessions and server-side authorization based on verified identities.',
    default_role: DEFAULT_ROLE,
    roles: Object.fromEntries(Object.entries(ROLES).map(([id, l]) => [id, { ...l, permissions: PERMISSIONS[id] }])),
  };
}

module.exports = { ROLES, DEFAULT_ROLE, EVENT_PERMISSION, can, rolesWith, resolveRole, describe };
