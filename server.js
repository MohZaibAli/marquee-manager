// Marquee Manager server: serves index.html and a password-protected REST API backed by PostgreSQL.
// Run: npm install && DATABASE_URL=postgres://... APP_PASSWORD=choose-one node server.js
const express = require('express');
const { Pool, types } = require('pg');
types.setTypeParser(1082, v => v); // keep DATE as 'YYYY-MM-DD' so time zones never shift a day
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { DATABASE_URL, APP_PASSWORD } = process.env;
if (!DATABASE_URL) { console.error('Missing DATABASE_URL. Example: DATABASE_URL=postgres://localhost:5432/marquee'); process.exit(1); }
if (!APP_PASSWORD || APP_PASSWORD.length < 6) { console.error('Missing APP_PASSWORD (at least 6 characters). This is the password the client signs in with.'); process.exit(1); }

// Sessions are signed cookies, so they survive server restarts. Changing APP_PASSWORD signs everyone out.
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('mm:' + APP_PASSWORD).digest('hex');
const COOKIE = 'mm_session';
const SESSION_DAYS = 30;
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const newToken = () => { const exp = String(Date.now() + SESSION_DAYS * 864e5); return exp + '.' + sign(exp); };
const validToken = t => { const [exp, sig] = String(t || '').split('.'); return !!exp && !!sig && same(sig, sign(exp)) && Number(exp) > Date.now(); };
const readCookie = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)))[COOKIE];
const setCookie = (req, res, value, maxAge) => res.append('Set-Cookie',
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${req.secure ? '; Secure' : ''}`);

const pool = new Pool({ connectionString: DATABASE_URL, ssl: /sslmode=require/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined });
const TABLES = ['categories', 'bookings', 'payments', 'staff', 'salaries', 'expenses', 'assets'];
const app = express();
app.set('trust proxy', 1); // so req.secure is right behind a hosting provider's HTTPS proxy
app.use(express.json({ limit: '5mb' }));
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html'))); // only the page is public

// ---- Login ----
const attempts = new Map(); // ip -> {n, until}
app.post('/api/login', (req, res) => {
  const a = attempts.get(req.ip) || { n: 0, until: 0 };
  if (a.until > Date.now()) return res.status(429).json({ error: 'Too many wrong tries. Wait 5 minutes and try again.' });
  if (!same(req.body?.password || '', APP_PASSWORD)) {
    a.n += 1; if (a.n >= 5) { a.n = 0; a.until = Date.now() + 5 * 60e3; }
    attempts.set(req.ip, a);
    return res.status(401).json({ error: 'Wrong password.' });
  }
  attempts.delete(req.ip);
  setCookie(req, res, newToken(), SESSION_DAYS * 86400);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { setCookie(req, res, '', 0); res.json({ ok: true }); });
app.get('/api/session', (req, res) => validToken(readCookie(req)) ? res.json({ ok: true }) : res.status(401).json({ error: 'Signed out' }));
app.use('/api', (req, res, next) => validToken(readCookie(req)) ? next() : res.status(401).json({ error: 'Signed out' }));

// ---- Data API ----
const columns = {}; // allowed column names per table, read from the database
async function cols(t) {
  if (!columns[t]) {
    const r = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_name=$1', [t]);
    columns[t] = r.rows.map(x => x.column_name).filter(c => !['id', 'created_at'].includes(c));
  }
  return columns[t];
}
// Dates come back as text and empty strings become NULL so the UI stays simple.
const out = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'id' ? String(v) : v instanceof Date ? v.toISOString().slice(0, 10) : v === null ? '' : String(v)]));
const clean = (t, body) => Object.entries(body || {}).filter(([k]) => columns[t].includes(k)).map(([k, v]) => [k, v === '' ? null : v]);
const table = (req, res, next) => TABLES.includes(req.params.t) ? cols(req.params.t).then(() => next(), next) : res.status(404).json({ error: 'Unknown table' });
const wrap = fn => (req, res, next) => fn(req, res).catch(next);

// One hall can hold one event per date and time (Day / Night). Returns the clashing booking, if any.
async function clash(b, id) {
  if (!b.hall || !b.date) return null;
  const r = await pool.query(
    'SELECT title FROM bookings WHERE hall=$1 AND date=$2 AND shift IS NOT DISTINCT FROM $3 AND id<>$4 LIMIT 1',
    [b.hall, b.date, b.shift || null, id || 0]);
  return r.rows[0] || null;
}
const clashError = (b, c) => `${b.hall} is already booked on ${b.date}${b.shift ? ' (' + b.shift + ')' : ''} for "${c.title}".`;

app.get('/api/:t', table, wrap(async (req, res) => {
  res.json((await pool.query(`SELECT * FROM ${req.params.t} ORDER BY id`)).rows.map(out));
}));
app.post('/api/:t', table, wrap(async (req, res) => {
  const kv = clean(req.params.t, req.body);
  if (!kv.length) return res.status(400).json({ error: 'Nothing to save' });
  if (req.params.t === 'bookings') {
    const b = Object.fromEntries(kv), c = await clash(b);
    if (c) return res.status(409).json({ error: clashError(b, c) });
  }
  const sql = `INSERT INTO ${req.params.t} (${kv.map(x => x[0]).join(',')}) VALUES (${kv.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`;
  res.json(out((await pool.query(sql, kv.map(x => x[1]))).rows[0]));
}));
app.put('/api/:t/:id', table, wrap(async (req, res) => {
  const kv = clean(req.params.t, req.body);
  if (!kv.length) return res.status(400).json({ error: 'Nothing to save' });
  if (req.params.t === 'bookings') {
    const old = (await pool.query('SELECT * FROM bookings WHERE id=$1', [req.params.id])).rows[0];
    if (!old) return res.status(404).json({ error: 'Not found' });
    const b = { ...out(old), ...Object.fromEntries(kv) }, c = await clash(b, req.params.id);
    if (c) return res.status(409).json({ error: clashError(b, c) });
  }
  const sql = `UPDATE ${req.params.t} SET ${kv.map((x, i) => `${x[0]}=$${i + 1}`).join(',')} WHERE id=$${kv.length + 1} RETURNING *`;
  const r = await pool.query(sql, [...kv.map(x => x[1]), req.params.id]);
  r.rows[0] ? res.json(out(r.rows[0])) : res.status(404).json({ error: 'Not found' });
}));
app.delete('/api/:t/:id', table, wrap(async (req, res) => {
  await pool.query(`DELETE FROM ${req.params.t} WHERE id=$1`, [req.params.id]);
  res.sendStatus(204);
}));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); });

const PORT = process.env.PORT || 3000;
pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'))
  .then(() => app.listen(PORT, () => console.log('Marquee Manager on http://localhost:' + PORT)))
  .catch(e => {
    const why = e.message || e.code || (e.errors && e.errors.map(x => x.message).join('; ')) || String(e);
    console.error('Database error:', why);
    if (/ECONNREFUSED/.test(why)) console.error('Hint: PostgreSQL is not running. On Mac: brew services start postgresql@16');
    else if (/password|role/.test(why)) console.error('Hint: wrong user or password in DATABASE_URL.');
    else if (/does not exist/.test(why)) console.error('Hint: create the database first: createdb marquee');
    process.exit(1);
  });
