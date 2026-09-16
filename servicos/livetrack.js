// Daemon LiveTrack Garmin -> Traccar (garminalex) + banco garmin (tempo real)
// Acompanha as sessões de livetrack_sessoes com status nova/ativa usando Chromium (a Garmin bloqueia clientes diretos).
const puppeteer = require('puppeteer');
const mysql = require('mysql2/promise');
const fs = require('fs');
const LOG = '/var/log/garmin-livetrack.log';
const log = m => fs.appendFileSync(LOG, `${new Date().toISOString()} [live] ${m}\n`);
const ini = {}; let sec = '';
for (const l of fs.readFileSync(process.env.GARMIN_CONF || '/etc/garmin-alequizao.ini', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*\[(.+)\]\s*$/); if (m) { sec = m[1]; ini[sec] = {}; continue; } const kv = l.match(/^\s*([^#;=]+?)\s*=\s*(.*)$/); if (kv && sec) ini[sec][kv[1]] = kv[2]; }
const OSMAND = (ini.traccar?.osmand || 'http://127.0.0.1:5055/').replace(/\/?$/, '/');
const espera = ms => new Promise(r => setTimeout(r, ms));
const alterna = (a, b) => a + Math.random() * (b - a); // tempos alternados
const ativos = new Map();
let browser, db;

async function traccar(p, nome, device) {
  if (!device) return;
  const q = new URLSearchParams({ id: device, lat: p.lat, lon: p.lon, timestamp: Math.round(p.ts / 1000), valid: 'true', livetrack: 'true', atividade: nome || 'LiveTrack' });
  if (p.alt != null) q.set('altitude', p.alt);
  if (p.vel != null) q.set('speed', (p.vel * 1.943844).toFixed(2));
  if (p.fc != null) q.set('heartRate', p.fc);
  if (p.dist != null) q.set('odometer', Math.round(p.dist));
  try { await fetch(OSMAND + '?' + q); } catch (e) { log('traccar: ' + e.message); }
}

async function acompanhar(s) {
  const [[app]] = await db.query("SELECT device FROM relogio_apps WHERE usuario_id=? AND status='pronto' ORDER BY id LIMIT 1", [s.usuario_id]).catch(() => [[null]]);
  const device = app?.device;
  const page = await browser.newPage();
  let csrf = null, falhas = 0, ultimo = s.ultimo_ponto || 0, pontos = s.pontos || 0;
  page.on('request', r => { if (r.url().includes('livetrack.garmin.com/api/')) { const t = r.headers()['livetrack-csrf-token']; if (t) csrf = t; } });
  const get = (url, params) => page.evaluate(async ({ url, params, csrf }) => {
    const u = new URL(url); Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { cache: 'no-store', headers: { 'livetrack-csrf-token': csrf } });
    const t = await r.text(); return { ok: r.ok, status: r.status, data: t ? JSON.parse(t) : null };
  }, { url, params, csrf });
  try {
    await page.goto(`https://livetrack.garmin.com/session/${s.sessao}/token/${s.token}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    for (let i = 0; i < 30 && !csrf; i++) await espera(1000);
    if (!csrf) throw new Error('sem token CSRF da Garmin');
    await db.execute("UPDATE livetrack_sessoes SET status='ativa', erro=NULL, tentativas=0, proxima=NULL WHERE id=?", [s.id]);
    log(`acompanhando sessão ${s.sessao}`);
    while (true) {
      const ses = await get(`https://livetrack.garmin.com/api/sessions/${s.sessao}`, { token: s.token });
      if (!ses.ok) { if (++falhas > 5) throw new Error('HTTP ' + ses.status); await espera(alterna(20000, 40000)); continue; }
      falhas = 0; const S = ses.data || {};
      const tr = await get(`https://livetrack.garmin.com/api/sessions/${s.sessao}/track-points/common`, { token: s.token, begin: S.start || '' });
      const brutos = Array.isArray(tr.data) ? tr.data : (tr.data?.trackPoints || []);
      for (const r of brutos) {
        const pos = r.position || {}; let ts = r.timestamp ?? r.dateTime ?? r.time; if (typeof ts === 'string') ts = Date.parse(ts);
        const md = r.metaData || r.metadata || {};
        const p = { ts, lat: r.latitude ?? r.lat ?? pos.lat, lon: r.longitude ?? r.lon ?? pos.lon, alt: md.ELEVATION ?? r.altitude ?? null, vel: md.SPEED ?? r.speedMetersPerSec ?? null,
          fc: md.HEART_RATE ?? r.heartRateBeatsPerMin ?? null, dist: md.TOTAL_DISTANCE ?? r.totalDistanceMeters ?? null, dur: md.TOTAL_DURATION ?? r.totalDurationSecs ?? null };
        if (p.lat == null || !ts || ts <= ultimo) continue;
        await db.execute('INSERT IGNORE INTO livetrack_pontos (sessao_id,ts,lat,lon,alt,vel,fc,dist,dur,extra) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [s.id, ts, p.lat, p.lon, p.alt, p.vel, p.fc != null ? Math.round(p.fc) : null, p.dist, p.dur != null ? Math.round(p.dur) : null, JSON.stringify(md)]);
        await traccar(p, S.sessionName, device); ultimo = ts; pontos++;
        await db.execute('UPDATE livetrack_sessoes SET pontos=?, ultimo_ponto=?, lat=?, lon=?, nome=COALESCE(?,nome) WHERE id=?', [pontos, ultimo, p.lat, p.lon, S.sessionName || null, s.id]);
      }
      const fim = S.viewable === false || (S.end && Date.now() > Date.parse(S.end));
      if (fim) { await db.execute("UPDATE livetrack_sessoes SET status='fim' WHERE id=?", [s.id]); log(`sessão ${s.sessao} terminou (${pontos} pontos)`); break; }
      await espera(alterna(8000, 16000));
    }
  } catch (e) {
    log(`sessão ${s.sessao}: ${e.message}`);
    // nova tentativa com espera crescente (1, 2, 4… até 30 min) para não martelar a Garmin
    const t = (s.tentativas || 0) + 1, espera = Math.min(30, 2 ** (t - 1));
    await db.execute("UPDATE livetrack_sessoes SET status=IF(TIMESTAMPDIFF(HOUR,criado,NOW())>24,'fim','nova'), erro=?, tentativas=?, proxima=NOW() + INTERVAL ? MINUTE WHERE id=?", [e.message.slice(0, 300), t, espera, s.id]);
  } finally { await page.close().catch(() => { }); ativos.delete(s.id); }
}

(async () => {
  db = await mysql.createPool({ host: ini.db?.host || '127.0.0.1', user: ini.db?.usuario, password: ini.db?.senha, database: ini.db?.banco, connectionLimit: 4 });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  browser.on('disconnected', () => { log('Chromium caiu — reiniciando o serviço'); process.exit(1); });
  log('daemon iniciado');
  while (true) {
    try {
      const [rows] = await db.query("SELECT * FROM livetrack_sessoes WHERE status IN ('nova','ativa') AND criado > NOW() - INTERVAL 2 DAY AND (proxima IS NULL OR proxima <= NOW())");
      for (const s of rows) if (!ativos.has(s.id)) { ativos.set(s.id, 1); acompanhar(s); }
    } catch (e) { log('loop: ' + e.message); }
    await espera(alterna(15000, 30000));
  }
})();
