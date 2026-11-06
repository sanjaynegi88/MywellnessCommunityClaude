// API authentication: personal bearer tokens (hashed at rest) with roles.
//   admin    – everything, including user management
//   approver – may activate offers and approve publishing (the human approval gateway)
//   editor   – may create/edit records and run jobs
//   viewer   – read only
const crypto = require('crypto');
const { db, newId, now } = require('../db');
const config = require('../config');

const RANK = { viewer: 1, editor: 2, approver: 3, admin: 4 };
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

async function createUser(name, role) {
  if (!RANK[role]) throw new Error('role must be admin, approver, editor or viewer');
  const token = 'mwc_' + crypto.randomBytes(24).toString('base64url');
  const user = { id: newId(), name, role, token_hash: hash(token), created_at: now(), disabled: false };
  await db()('users').insert(user);
  return { id: user.id, name, role, token };   // token is shown once and never stored in clear
}

async function userFromToken(token) {
  if (!token) return null;
  if (config.security.bootstrapAdminToken && token === config.security.bootstrapAdminToken) return { id: 'bootstrap', name: 'Bootstrap admin', role: 'admin' };
  const u = await db()('users').where({ token_hash: hash(token) }).first();
  return u && !u.disabled ? { id: u.id, name: u.name, role: u.role } : null;
}

function requireRole(min) {
  return async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const user = await userFromToken(token);
      if (!user) return res.status(401).json({ error: 'Sign in with a valid API token.' });
      if (RANK[user.role] < RANK[min]) return res.status(403).json({ error: `This needs the ${min} role.` });
      req.user = user; next();
    } catch (e) { next(e); }
  };
}

module.exports = { createUser, userFromToken, requireRole, RANK };
