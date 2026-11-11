/**
 * OD-8 (owner, 2026-11-11): Jiesong keeps two roles, ADMIN and SALES. Integration suites written for the
 * six-role model keep their persona names; each persona is stored with the live role that now does that job.
 * Retired roles themselves are covered by middleware/auth.test.js and routes/rbac-policy-matrix.test.js.
 */
const PERSONA_ROLE = Object.freeze({ PURCHASE: 'SALES', WAREHOUSE: 'SALES', BOSS: 'SALES', FINANCE: 'ADMIN' });
const dbRole = (persona) => PERSONA_ROLE[persona] || persona;
module.exports = { dbRole, PERSONA_ROLE };
