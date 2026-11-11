const CATEGORIES = ['Production/Dissemination', 'Operationalization/Implementation'];
const STATES = ['pending', 'reviewed', 'not-required'];
const ACTORS = ['Ali', 'Caroline'];
const encoder = new TextEncoder();
const COOKIE = '__Host-wb_review';
const SESSION_SECONDS = 12 * 60 * 60;
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  headers.set('Cache-Control', 'private, no-store, max-age=0');
  // Native POST forms need their real Origin for the same-origin write check.
  // Keep referrers within this site; never send them to external destinations.
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Content-Security-Policy', CSP);
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Document bundles are already gzipped. Avoid Cloudflare compressing them twice.
  return new Response(response.body, { status: response.status, headers, encodeBody: headers.has('Content-Encoding') ? 'manual' : 'automatic' });
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
function base64(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function unbase64(value) { return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)); }
async function hash(value) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function key(secret) { return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
async function session(secret) {
  const payload = base64(encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() })));
  const signature = base64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload))));
  return `${payload}.${signature}`;
}
async function authenticated(request, secret) {
  try {
    const token = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!token || token.length > 1000) return false;
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !signature) return false;
    const data = JSON.parse(new TextDecoder().decode(unbase64(payload)));
    if (!Number.isFinite(data.exp) || data.exp <= Date.now() / 1000 || data.exp > Date.now() / 1000 + SESSION_SECONDS + 10) return false;
    return crypto.subtle.verify('HMAC', await key(secret), unbase64(signature), encoder.encode(payload));
  } catch { return false; }
}
async function samePassword(a, b) {
  const x = await hash(a), y = await hash(b); let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
function loginPage(error = '') {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Private document type review</title><style>body{font:16px/1.5 system-ui;margin:10vh auto;padding:24px;max-width:440px;color:#26362e;background:#fffefa}h1{font:28px Georgia,serif}label,input,button{display:block}input,button{font:inherit;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 16px;border:1px solid #cbd4cc;border-radius:6px}button{background:#254e3d;color:white}p{color:#59675e}</style></head><body><h1>Document type review</h1><p>Private workspace for Ali and Caroline.</p>${error ? `<p role="alert">${error}</p>` : ''}<form method="post" action="/login"><label for="password">Shared password</label><input id="password" name="password" type="password" required maxlength="300" autocomplete="current-password"><button>Enter review workspace</button></form></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
async function loadSample(env) {
  const response = await env.ASSETS.fetch(new Request('https://assets.internal/types.json'));
  if (!response.ok) throw new Error('Corpus assets are not prepared');
  return response.json();
}
async function ensureState(env, sample) {
  const initial = Object.fromEntries(sample.map(t => [t.name, { category: t.category, status: t.review ? 'pending' : 'not-required', by: null, at: null, reviewedBy: null, reviewedAt: null }]));
  await env.DB.prepare('INSERT OR IGNORE INTO review_state(id, records, revision) VALUES(1, ?, 0)').bind(JSON.stringify(initial)).run();
  // Expand the prototype additively. Keep every existing decision and attribution.
  // A revision check prevents migration from overwriting a concurrent human save.
  for (let retry=0;retry<3;retry++) {
    const stored=await env.DB.prepare('SELECT records, revision FROM review_state WHERE id=1').first();
    const existing=JSON.parse(stored.records);
    const additions=Object.keys(initial).filter(type=>!Object.hasOwn(existing,type));
    if (!additions.length) return;
    for (const type of additions) existing[type]=initial[type];
    const result=await env.DB.prepare('UPDATE review_state SET records=?, revision=revision+1 WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(existing),stored.revision).all();
    if(result.results.length) return;
  }
  throw new Error('Review migration conflicted with concurrent edits');
}
async function readState(env, exportAll = false) {
  const state = await env.DB.prepare('SELECT records, revision FROM review_state WHERE id=1').first();
  const limit = exportAll ? '' : ' LIMIT 14';
  const events = await env.DB.prepare(`SELECT id, type, actor AS by, at, action FROM review_events ORDER BY rowid DESC${limit}`).all();
  const comments = await env.DB.prepare(`SELECT id, type, actor AS by, at, text FROM review_comments ORDER BY rowid DESC${exportAll ? '' : ' LIMIT 12'}`).all();
  return { revision: state.revision, modelContent: { schema: 'types-v2', sampleOnly: false, records: JSON.parse(state.records), events: events.results.reverse() }, privateContent: { comments: comments.results.reverse() } };
}
async function saveState(request, env, sample) {
  const body = await request.json(), actor = body.actor;
  if (!ACTORS.includes(actor) || !Number.isSafeInteger(body.revision) || !body.records || !Array.isArray(body.comments) || body.comments.length > 12) return json({ error: 'Invalid review update' }, 400);
  const stored = await env.DB.prepare('SELECT records, revision FROM review_state WHERE id=1').first();
  if (stored.revision !== body.revision) return json({ error: 'Someone else saved a newer decision. Reload and review their changes before trying again.' }, 409);
  const records = JSON.parse(stored.records), known = new Set(sample.map(t => t.name)), changes = [], now = new Date().toISOString();
  if (Object.keys(body.records).length !== known.size || Object.keys(body.records).some(t => !known.has(t))) return json({ error: 'Unexpected document types' }, 400);
  for (const type of known) {
    const next = body.records[type], before = records[type];
    const unassigned=next?.category===null&&sample.find(t=>t.name===type)?.originalType===''&&next.status==='pending';
    if (!next || !(CATEGORIES.includes(next.category)||unassigned) || !STATES.includes(next.status)) return json({ error: 'Invalid category or review status' }, 400);
    if (before.category === next.category && before.status === next.status) continue;
    const status = before.status === 'reviewed' && before.category !== next.category ? 'pending' : next.status;
    records[type] = { category: next.category, status, by: actor, at: now, reviewedBy: status === 'reviewed' ? actor : null, reviewedAt: status === 'reviewed' ? now : null };
    changes.push({ id: crypto.randomUUID(), type, action: `${before.category} / ${before.status} → ${next.category} / ${status}` });
  }
  const existingIds = new Set((await env.DB.prepare('SELECT id FROM review_comments').all()).results.map(c => c.id));
  const additions = [];
  for (const c of body.comments) {
    if (typeof c.id === 'string' && existingIds.has(c.id)) continue;
    if (!known.has(c.type) || typeof c.text !== 'string' || !c.text.trim() || c.text.length > 350) return json({ error: 'Invalid comment' }, 400);
    additions.push({ id: await hash(JSON.stringify([c.type, c.at, c.by, c.text])), type: c.type, text: c.text.trim() });
  }
  const genuinelyNew = additions.filter(c => !existingIds.has(c.id));
  if (!changes.length && !genuinelyNew.length) return json(await readState(env));
  const writeId = crypto.randomUUID();
  const batch = [env.DB.prepare('UPDATE review_state SET records=?, revision=revision+1, write_id=? WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(records), writeId, body.revision)];
  for (const e of changes) batch.push(env.DB.prepare('INSERT INTO review_events(id,type,actor,at,action) SELECT ?,?,?,?,? FROM review_state WHERE id=1 AND write_id=?').bind(e.id,e.type,actor,now,e.action,writeId));
  for (const c of genuinelyNew) batch.push(env.DB.prepare('INSERT OR IGNORE INTO review_comments(id,type,actor,at,text) SELECT ?,?,?,?,? FROM review_state WHERE id=1 AND write_id=?').bind(c.id,c.type,actor,now,c.text,writeId));
  const result = await env.DB.batch(batch);
  if (!result[0].results.length) return json({ error: 'A newer save arrived. Reload before trying again.' }, 409);
  return json(await readState(env));
}

export default {
  async fetch(request, env) {
    try { return secure(await route(request, env)); }
    catch (error) { console.error('Review request failed:', error.name); return secure(json({ error: 'The review workspace is temporarily unavailable. Nothing was saved; please try again.' }, 503)); }
  }
};

async function route(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (path === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
  const setupChecks = [
    [Boolean(env.REVIEW_PASSWORD) && env.REVIEW_PASSWORD.length >= 12, 'The shared password must have at least 12 characters.'],
    [Boolean(env.SESSION_SECRET) && env.SESSION_SECRET.length >= 32, 'The private session key must have at least 32 characters.'],
    [Boolean(env.DB), 'The review database is not connected.'],
    [Boolean(env.ASSETS), 'The protected application files are not connected.']
  ];
  const missing = setupChecks.find(([ok]) => !ok);
  if (missing) return json({ error: 'Private review setup is not complete. ' + missing[1] }, 503);
  if (!['GET','HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return json({ error: 'This action must come from the review website.' }, 403);
  if (request.method === 'POST' && path === '/login') {
    if (Number(request.headers.get('Content-Length') || 0) > 4096) return json({ error: 'Request too large' }, 413);
    const raw = await request.text(); if (raw.length > 4096) return json({ error: 'Request too large' }, 413);
    const ip = await hash((request.headers.get('CF-Connecting-IP') || 'unknown') + env.SESSION_SECRET), bucket = Math.floor(Date.now() / 600000);
    await env.DB.prepare('DELETE FROM login_attempts WHERE bucket < ?').bind(bucket - 1).run();
    await env.DB.prepare('INSERT INTO login_attempts(ip_hash,bucket,attempts) VALUES(?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET bucket=excluded.bucket, attempts=CASE WHEN login_attempts.bucket=excluded.bucket THEN login_attempts.attempts+1 ELSE 1 END').bind(ip,bucket).run();
    const attempt = await env.DB.prepare('SELECT attempts FROM login_attempts WHERE ip_hash=?').bind(ip).first();
    if (attempt.attempts > 10) return new Response(loginPage('Too many attempts. Please try again in ten minutes.').body, { status:429, headers:{ 'Content-Type':'text/html; charset=utf-8','Retry-After':'600' } });
    const password = new URLSearchParams(raw).get('password') || '';
    if (!await samePassword(password, env.REVIEW_PASSWORD)) return new Response(loginPage('The password did not match. Please try again.').body, { status:401, headers:{'Content-Type':'text/html; charset=utf-8'} });
    const token = await session(env.SESSION_SECRET);
    return new Response(null, { status:303, headers:{Location:'/', 'Set-Cookie':`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`} });
  }
  if (!await authenticated(request, env.SESSION_SECRET)) {
    if (path.startsWith('/api/')) return json({ error: 'Please enter the shared password to continue.' },401);
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error:'Sign in first.' },401);
    return loginPage();
  }
  if (path === '/logout' && request.method === 'POST') return new Response(null, {status:303,headers:{Location:'/', 'Set-Cookie':`${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`}});
  if (path.startsWith('/api/')) {
    const sample = await loadSample(env);
    if (['/api/types','/api/sample'].includes(path) && request.method === 'GET') return json(sample);
    if (path === '/api/documents' && request.method === 'GET') {
      const type=sample.find(t=>t.name===url.searchParams.get('type'));
      if (!type?.asset || !/^type-\d{3}$/.test(type.asset)) return json({error:'Unknown document type'},404);
      const response=await env.ASSETS.fetch(new Request(`https://assets.internal/documents/${type.asset}.json.gz`));
      if(!response.ok)return json({error:'Document openings are temporarily unavailable.'},503);
      const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Content-Encoding','gzip');
      return new Response(response.body,{headers});
    }
    await ensureState(env,sample);
    if (path === '/api/state' && request.method === 'GET') return json(await readState(env));
    if (path === '/api/state' && request.method === 'PUT') { const raw=await request.text(); if(raw.length>131072)return json({error:'Review update too large'},413);return saveState(new Request(request.url,{method:'PUT',headers:request.headers,body:raw}),env,sample); }
    if (path === '/api/export' && request.method === 'GET') {const response=json(await readState(env,true));response.headers.set('Content-Disposition','attachment; filename="world-bank-type-reviews.json"');return response;}
    return json({error:'Not found'},404);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({error:'Method not allowed'},405);
  if (!['/','/index.html','/client.mjs','/prototype.mjs'].includes(path)) return json({error:'Not found'},404);
  return env.ASSETS.fetch(new Request(new URL(path === '/' ? '/index.html' : path,'https://assets.internal'),{method:request.method}));
}
