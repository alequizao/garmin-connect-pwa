/* Garmin Connect (clone PWA) — Alequizão */
'use strict';
const $ = s => document.querySelector(s);
const app = $('#app');
const ESPORTES = {
  corrida: { n: 'Corrida', i: '🏃', gps: true, met: 9.8 }, caminhada: { n: 'Caminhada', i: '🚶', gps: true, met: 3.8 },
  ciclismo: { n: 'Ciclismo', i: '🚴', gps: true, met: 7.5 }, trilha: { n: 'Trilha', i: '🥾', gps: true, met: 6 },
  natacao: { n: 'Natação', i: '🏊', gps: false, met: 8 }, musculacao: { n: 'Musculação', i: '🏋️', gps: false, met: 5 },
  hiit: { n: 'HIIT', i: '🔥', gps: false, met: 10 }, yoga: { n: 'Yoga', i: '🧘', gps: false, met: 3 },
  eliptico: { n: 'Elíptico', i: '⚙️', gps: false, met: 6 }, esteira: { n: 'Esteira', i: '🎽', gps: false, met: 8.5 },
  futebol: { n: 'Futebol', i: '⚽', gps: true, met: 8 }, remo: { n: 'Remo', i: '🚣', gps: true, met: 7 },
  patins: { n: 'Patins', i: '🛼', gps: true, met: 7 }, surf: { n: 'Surf', i: '🏄', gps: true, met: 5 },
  outro: { n: 'Outro', i: '⭐', gps: true, met: 5 },
};
const S = { usuario: null, metas: {}, tela: 'inicio', online: navigator.onLine, dash: null, fcAtual: null, fcDevice: null, passosHoje: 0, install: null };

/* ---------- util ---------- */
const pad = n => String(n).padStart(2, '0');
const fmtTempo = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${pad(m)}:${pad(x)}` : `${pad(m)}:${pad(x)}`; };
const fmtDist = m => (m || 0) >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m || 0) + ' m';
const fmtRitmo = minKm => { if (!minKm || !isFinite(minKm) || minKm > 60) return '--:--'; const m = Math.floor(minKm), s = Math.round((minKm - m) * 60); return `${m}:${pad(s === 60 ? 59 : s)}`; };
const fmtNum = n => Math.round(n || 0).toLocaleString('pt-BR');
const hojeISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dtLocal = d => `${hojeISO(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtData = s => { const d = new Date(s.replace(' ', 'T')); const h = hojeISO(); const ds = hojeISO(d); const ont = hojeISO(new Date(Date.now() - 864e5)); const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`; if (ds === h) return `Hoje, ${hora}`; if (ds === ont) return `Ontem, ${hora}`; return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) + ', ' + hora; };
const haversine = (a, b) => { const R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r; const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastT; function toast(m, ms = 2200) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function modal(html, aoAbrir) { const m = $('#modal'); $('#modalBox').innerHTML = html; m.hidden = false; m.onclick = e => { if (e.target === m) fecharModal(); }; aoAbrir && aoAbrir($('#modalBox')); }
function fecharModal() { $('#modal').hidden = true; }
async function api(acao, dados, metodo) {
  const opt = { method: metodo || (dados ? 'POST' : 'GET'), headers: {} };
  if (dados) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(dados); }
  const r = await fetch('api.php?acao=' + acao + (dados ? '' : (typeof arguments[2] === 'string' ? '' : '')) , opt);
  const j = await r.json().catch(() => ({ ok: false, erro: 'Resposta inválida' }));
  if (r.status === 401) { S.usuario = null; renderLogin(); throw new Error('Não autenticado'); }
  if (!j.ok && j.erro) throw new Error(j.erro);
  return j;
}
const apiGet = (acao, params = {}) => fetch('api.php?acao=' + acao + '&' + new URLSearchParams(params)).then(r => r.json());
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('g_' + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('g_' + k, JSON.stringify(v)); } catch { } }, del: k => localStorage.removeItem('g_' + k) };

/* ---------- boot ---------- */
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=' + (window.SW_V || ''), { scope: './' }).catch(() => { });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.install = e; mostrarInstalar(); });
  window.addEventListener('online', () => { S.online = true; $('.off')?.remove(); sincronizarPendentes(); });
  window.addEventListener('offline', () => { S.online = false; avisoOffline(); });
  if (!S.online) avisoOffline();
  const tokenRedef = new URLSearchParams(location.search).get('redefinir'); if (tokenRedef) return renderRedefinir(tokenRedef);
  try { const j = await apiGet('eu'); if (j.logado) { S.usuario = j.usuario; S.metas = j.metas; iniciarApp(); } else renderLogin(); }
  catch { const u = store.get('usuario'); if (u) { S.usuario = u; S.metas = store.get('metas', {}); iniciarApp(); } else renderLogin(); }
}
function avisoOffline() { if (!$('.off')) { const d = document.createElement('div'); d.className = 'off'; d.textContent = 'Sem conexão — os dados serão sincronizados depois'; document.body.appendChild(d); } }
function mostrarInstalar() { if (store.get('instalar_recusado') || window.matchMedia('(display-mode: standalone)').matches) return; const d = document.createElement('div'); d.className = 'instalar'; d.innerHTML = '<span>📲 Instale o Garmin Connect na tela inicial</span><button id="btnInst">Instalar</button><button id="btnInstNao" style="background:none;color:#fff">✕</button>'; document.body.appendChild(d); $('#btnInst').onclick = async () => { S.install.prompt(); await S.install.userChoice; d.remove(); }; $('#btnInstNao').onclick = () => { store.set('instalar_recusado', 1); d.remove(); }; }
function iniciarApp() {
  store.set('usuario', S.usuario); store.set('metas', S.metas);
  const q = new URLSearchParams(location.search);
  if (Gravador.retomar()) return;
  const rota = rotaAtual();
  if (q.get('tela')) { history.replaceState(null, '', location.pathname + (q.get('acao') ? '?acao=' + q.get('acao') : '')); navegar(q.get('tela'), q.get('arg') || undefined, { substituir: true }); }
  else navegar(rota ? rota.tela : 'inicio', rota ? rota.arg : undefined, { substituir: true });
  if (q.get('acao') === 'agua') setTimeout(() => modalAgua(), 300);
  Podometro.iniciar();
  sincronizarPendentes();
  lembretes();
  AoVivo.iniciar();
}

/* ---------- recuperar senha ---------- */
function modalEsqueci() {
  modal(`<h2>Esqueci minha senha</h2><p class="mini">Digite o e-mail da sua conta. Enviaremos um link para criar uma nova senha (vale por 1 hora).</p><form id="fEsq"><div class="campo"><label>E-mail</label><input name="email" type="email" autocomplete="email" required></div><button class="btn" id="bEsq">Enviar link</button></form><div id="esqMsg" class="mini" style="margin-top:12px"></div>`, () => {
    $('#fEsq').onsubmit = async e => { e.preventDefault(); $('#bEsq').disabled = true; $('#bEsq').textContent = 'Enviando…';
      try { const j = await api('senha_esqueci', Object.fromEntries(new FormData(e.target))); $('#esqMsg').innerHTML = '✅ ' + esc(j.msg); $('#fEsq').remove(); }
      catch (x) { $('#esqMsg').innerHTML = '❌ ' + esc(x.message); $('#bEsq').disabled = false; $('#bEsq').textContent = 'Enviar link'; } };
  });
}
function renderRedefinir(token) {
  app.innerHTML = `<div class="login"><div class="marca"><div class="delta">▲</div>NOVA SENHA</div><form id="fRed"><div class="campo"><label>Nova senha</label><input name="senha" type="password" minlength="6" autocomplete="new-password" required></div><div class="campo"><label>Repita a nova senha</label><input name="senha2" type="password" minlength="6" autocomplete="new-password" required></div><button class="btn" id="bRed">Salvar nova senha</button><p class="centro mini" style="margin-top:16px"><a href="./">Voltar ao login</a></p></form></div>`;
  $('#fRed').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    if (f.senha !== f.senha2) return toast('As senhas não conferem');
    try { const j = await api('senha_redefinir', { token, senha: f.senha }); history.replaceState(null, '', location.pathname); toast('Senha alterada! Você já está conectado.', 3500); S.usuario = j.usuario; const eu = await apiGet('eu'); S.metas = eu.metas; iniciarApp(); }
    catch (x) { toast(x.message, 4000); } };
}

/* ---------- login ---------- */
function renderLogin(registro = false) {
  app.innerHTML = `<div class="login"><div class="marca"><div class="delta">▲</div>GARMIN CONNECT</div>
  <form id="fLogin">
  ${registro ? '<div class="campo"><label>Nome</label><input name="nome" required></div>' : ''}
  <div class="campo"><label>E-mail ou usuário</label><input name="email" autocomplete="username" required></div>
  <div class="campo"><label>Senha</label><input name="senha" type="password" autocomplete="current-password" required></div>
  <button class="btn" type="submit">${registro ? 'Criar conta' : 'Entrar'}</button>
  <p class="centro mini" style="margin-top:16px"><a href="#" id="alt">${registro ? 'Já tenho conta' : 'Criar conta nova'}</a>${registro ? '' : ' · <a href="#" id="esqueci">Esqueci minha senha</a>'}</p></form></div>`;
  $('#esqueci') && ($('#esqueci').onclick = e => { e.preventDefault(); modalEsqueci(); });
  $('#alt').onclick = e => { e.preventDefault(); renderLogin(!registro); };
  $('#fLogin').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    try { const j = await api(registro ? 'registrar' : 'login', f); S.usuario = j.usuario; const eu = await apiGet('eu'); S.metas = eu.metas; iniciarApp(); } catch (x) { toast(x.message); }
  };
}

/* ---------- navegação ---------- */
/* ---------- rotas web: cada tela tem endereço próprio (#/tela/arg) — refresh e "voltar" mantêm o lugar ---------- */
const TITULOS = { inicio: 'Meu dia', atividades: 'Atividades', atividade: 'Atividade', mapa: 'Mapa', gravar: 'Gravar', saude: 'Saúde', app: 'Apps', mais: 'Mais', perfil: 'Perfil',
  estatisticas: 'Desempenho', relatorios: 'Relatórios', treinos: 'Treinos', metrica: 'Histórico', dispositivo: 'Relógio' };
const TELAS = () => ({ inicio: renderInicio, atividades: renderAtividades, gravar: renderGravar, saude: renderSaude, perfil: renderPerfil, atividade: renderAtividadeDetalhe, estatisticas: renderEstatisticas,
  treinos: renderTreinos, metrica: renderMetricaHistorico, mapa: renderMapa, app: renderApp, dispositivo: renderDispositivo, relatorios: renderRelatorios, mais: renderMais });
function rotaAtual() {
  const m = location.hash.match(/^#\/([a-z_]+)(?:\/([^?#]*))?/);
  return m && TELAS()[m[1]] ? { tela: m[1], arg: m[2] ? decodeURIComponent(m[2]) : undefined } : null;
}
function navegar(tela, arg, opcoes = {}) {
  if (!TELAS()[tela]) tela = 'inicio';
  if (arg === '' || arg === null) arg = undefined;
  S.tela = tela; S.arg = arg;
  const hash = '#/' + tela + (arg !== undefined ? '/' + encodeURIComponent(arg) : '');
  if (!opcoes.historico && location.hash !== hash) history[opcoes.substituir ? 'replaceState' : 'pushState']({ tela, arg }, '', location.pathname + hash);
  document.title = (TITULOS[tela] || 'Garmin Connect') + ' · Garmin Connect';
  if (!opcoes.manterRolagem) window.scrollTo(0, 0);
  clearTimeout(typeof WK !== 'undefined' ? WK.timer : 0);
  TELAS()[tela](arg);
}
window.addEventListener('popstate', () => { if (!S.usuario || $('#fLogin') || Gravador.a) return; const r = rotaAtual() || { tela: 'inicio' }; fecharModal(); navegar(r.tela, r.arg, { historico: true }); });
document.addEventListener('click', e => { const b = e.target.closest('[data-tela]'); if (b) navegar(b.dataset.tela, b.dataset.arg); });

/* ---------- ÍCONES (linha, estilo Garmin Connect) ---------- */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" ${extra}>${d}</svg>`;
const ICO = {
  inicio: svg('<path d="M4 12.5l5 5L20 6.5"/>'),
  atividades: svg('<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  mapa: svg('<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z"/><path d="M9 4v14M15 6v14"/>'),
  gravar: svg('<path d="M8 5.5v13l11-6.5z"/>'),
  saude: svg('<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>'),
  app: svg('<rect x="7" y="2.5" width="10" height="4" rx="1"/><rect x="7" y="17.5" width="10" height="4" rx="1"/><circle cx="12" cy="12" r="6"/><path d="M12 9.5V12l1.8 1.2"/>'),
  perfil: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  barras: svg('<path d="M5 20V13M9.7 20V9M14.3 20V11M19 20V5M3 21.5h18"/>', 'class="w-graf"'),
  relatorios: svg('<path d="M4 5h16v11H4zM4 16l3 4h10l3-4"/><path d="M9 9.5h6"/>'),
  sync: svg('<path d="M19.5 8.5A8 8 0 0 0 5 7.5M4.5 15.5A8 8 0 0 0 19 16.5"/><path d="M19.8 3.8v4.9h-4.9M4.2 20.2v-4.9h4.9"/>'),
  coracao: svg('<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" fill="currentColor"/>'),
  passos: svg('<path d="M8.5 3.5c1.8 0 2.6 2.3 2.4 4.6-.2 2.2-1 3.9-2.6 3.9S6 10.3 5.9 8.2C5.8 5.8 6.8 3.5 8.5 3.5zM6.3 13.5l4.2-.1-.2 3.1c-.1 1.4-1 2.4-2.2 2.3-1.2 0-1.9-1-1.9-2.3zM15.5 6.5c1.7 0 2.7 2.3 2.6 4.7-.1 2.1-.9 3.7-2.4 3.8-1.6 0-2.4-1.7-2.6-3.9-.2-2.3.6-4.6 2.4-4.6zM13.5 16.4l4.2.1-.1 2.8c0 1.3-.8 2.2-2 2.2-1.2 0-2-1-2.1-2.4z" fill="currentColor" stroke="none"/>'),
  intensidade: svg('<circle cx="15" cy="13.5" r="6.5"/><path d="M15 10.5v3l2 1.3M13 3.5h4M2.5 10h5M3.5 13.5h4M2.5 17h5"/>'),
  bateria: svg('<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M11.5 8.5l-2.5 4h3.5l-2.5 3" />'),
  sono: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  estresse: svg('<path d="M3 12h3.5l2-5 3.5 10 2.5-7 1.5 2H21"/>'),
  agua: svg('<path d="M12 3.5s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>'),
  peso: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9a5 5 0 0 1 7 0l-2 2.5h-3z"/>'),
  calorias: svg('<path d="M12 21c4 0 6.5-2.8 6.5-6.4 0-4.4-4.2-6.2-4.6-10.6-2.6 1.6-4 4.2-3.7 7-1.2-.7-2-1.9-2.2-3.3C6.4 9.3 5.5 11.4 5.5 14.6 5.5 18.2 8 21 12 21z"/>'),
  semana: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  medalha: svg('<circle cx="12" cy="14.5" r="5.5"/><path d="M8.5 10.2L6 3.5h4l2 5 2-5h4l-2.5 6.7"/>'),
  mais: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  perfilUser: svg('<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
  relogio: svg('<rect x="7" y="2.5" width="10" height="4" rx="1"/><rect x="7" y="17.5" width="10" height="4" rx="1"/><circle cx="12" cy="12" r="6"/><path d="M12 9.5V12l1.8 1.2"/>'),
};

/* widget no estilo "Meu dia" do Garmin Connect: faixa de título, barra de meta, corpo e canto de meta batida */
function widget({ ico, cor = '#fff', titulo, tela, arg, id, barra, ok, corpo, classe = '' }) {
  return `<section class="w ${classe} ${tela || id ? 'click' : ''}" ${id ? `id="${id}"` : ''} ${tela ? `data-tela="${tela}"` : ''} ${arg != null ? `data-arg="${arg}"` : ''}>
    <header class="w-top"><span class="w-ico" style="color:${cor}">${ico}</span><span class="w-tit">${titulo}</span>${tela ? ICO.barras : ''}</header>
    ${barra ? `<div class="w-barra"><i style="width:${Math.max(0, Math.min(100, barra.pct * 100))}%;background:${barra.cor}"></i></div>` : ''}
    <div class="w-corpo">${corpo}</div>${ok ? '<div class="w-ok"><span>✓</span></div>' : ''}</section>`;
}
const kv = linhas => `<dl class="kv">${linhas.filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
function anelFC(bpm, min = 40, max = 200) {
  const r = 52, c = 2 * Math.PI * r, arco = c * 0.8, pct = bpm ? Math.max(0, Math.min(1, (bpm - min) / (max - min))) : 0;
  const ang = (126 + 288 * pct) * Math.PI / 180, x = 64 + r * Math.cos(ang), y = 64 + r * Math.sin(ang);
  return `<svg class="anel-fc" viewBox="0 0 128 128"><defs><linearGradient id="gfc" x1="0" y1="1" x2="1" y2="1"><stop offset="0" stop-color="#1fa3e3"/><stop offset=".55" stop-color="#f5c23b"/><stop offset="1" stop-color="#ef4b5b"/></linearGradient></defs>
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="url(#gfc)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${arco} ${c}" transform="rotate(126 64 64)"/>
    ${bpm ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="#111" stroke="#fff" stroke-width="3"/>` : ''}
    <text x="64" y="76" text-anchor="middle" class="anel-fc-v">${bpm ?? '--'}</text></svg>`;
}

/* ---------- INÍCIO (Meu dia) ---------- */
async function renderInicio(silencioso) {
  if (!(silencioso === true && $('#dash'))) app.innerHTML = `<div class="tela tela-dia">
    <div class="barra-topo">
      <button class="bt-ico" data-tela="relatorios" title="Relatórios">${ICO.relatorios}</button>
      <button class="avatar" data-tela="perfil" title="Perfil">${esc((S.usuario.nome || '?')[0].toUpperCase())}</button>
      <button class="relogio-bt" data-tela="dispositivo" title="Relógio"><span id="dotRelogio" class="dot"></span>${ICO.relogio}</button>
      <button class="bt-ico" id="btSync" title="Sincronizar">${ICO.sync}</button>
    </div>
    <div class="dia-sub"><span>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span><button class="link" data-tela="estatisticas">DESEMPENHO ›</button></div>
    <div id="dash"><div class="w"><div class="w-corpo"><div class="mini centro">Carregando…</div></div></div></div>${tabbar('inicio')}</div>`;
  $('#btSync').onclick = async e => { e.currentTarget.classList.add('girando'); try { await api('sincronizar_agora', {}); toast('Sincronizando com a Garmin…'); } catch (x) { toast(x.message); } setTimeout(() => $('#btSync')?.classList.remove('girando'), 2500); };
  let d; try { d = await apiGet('dashboard'); S.dash = d; store.set('dash', d); } catch { d = store.get('dash'); }
  if (!d || !d.ok) { $('#dash').innerHTML = '<div class="vazio"><div class="i">📡</div>Sem dados offline</div>'; return; }
  S.metas = d.metas; S.usuario = d.usuario;
  const h = d.hoje, m = d.metas; const passos = Math.max(h.passos || 0, Podometro.total());
  const dias = [...Array(7)].map((_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - 6 + i); return hojeISO(dt); });
  const fcs = d.fc.map(x => x.bpm), ultimoFC = fcs.length ? fcs[fcs.length - 1] : (S.fcAtual || null);
  const energia = calcEnergia(h), ultima = d.ultima;
  const minSemana = dias.reduce((s, dt) => s + (dt === hojeISO() ? (h.minutos_intensidade || 0) : (d.semana[dt]?.minutos_intensidade || 0)), 0);
  const sonoTxt = h.sono ? `${Math.floor(h.sono)}<small>h</small>${pad(Math.round((h.sono % 1) * 60))}<small>min</small>` : '--';
  const esp = ultima ? (ESPORTES[ultima.tipo] || ESPORTES.outro) : null;
  const dist = ultima ? (ultima.distancia_m >= 1000 ? (ultima.distancia_m / 1000).toFixed(2).replace('.', ',') : Math.round(ultima.distancia_m)) : '';
  const semGarmin = !d.integracao_garmin;
  $('#dash').innerHTML = `
  ${semGarmin ? widget({ ico: ICO.relogio, cor: '#1fa3e3', titulo: 'Conecte seu relógio Garmin', id: 'cConectar', corpo: `<div class="mini" style="margin-bottom:8px">Traga seus treinos, sono, passos e frequência cardíaca do Garmin Connect em 4 passos:</div>${PASSOS_GARMIN}<button class="btn" data-tela="perfil" data-arg="integracoes" style="margin-top:6px">Conectar agora</button>` }) : ''}
  ${ultima ? `<section class="w w-atv click" data-tela="atividade" data-arg="${ultima.id}"><header class="w-top"><span class="w-ico">${esp.i}</span><span class="w-tit">${esc(ultima.nome)}</span>${ICO.barras}</header>
    <div class="w-corpo atv-corpo"><div><div class="num-atv">${dist}</div><div class="un">${ultima.distancia_m >= 1000 ? 'QUILÔMETROS' : 'METROS'}</div><div class="quando">${fmtData(ultima.inicio)}</div></div>
    ${kv([['TEMPO', fmtTempo(ultima.duracao_s)], ultima.ritmo_medio && ['RITMO', fmtRitmo(ultima.ritmo_medio) + '/km'], ultima.fc_media && ['FC MÉDIA', ultima.fc_media + ' bpm'], ['CALORIAS', fmtNum(ultima.calorias)]])}</div></section>`
    : widget({ ico: ICO.gravar, cor: '#fb8c1e', titulo: 'Comece a gravar', tela: 'gravar', corpo: '<div class="mini">Nenhuma atividade ainda</div>' })}
  <section class="w" id="cRelogio">${cardRelogio(null)}</section>
  ${widget({ ico: ICO.coracao, cor: '#f0506e', titulo: 'Frequência cardíaca', tela: 'metrica', arg: 'fc', corpo: `<div class="lado">${anelFC(ultimoFC)}${kv([['REPOUSO', (h.fc_repouso || S.usuario.fc_repouso || '--') + ' bpm'], ['ALTA', (fcs.length ? Math.max(...fcs) : '--') + ' bpm'], ['BAIXA', (fcs.length ? Math.min(...fcs) : '--') + ' bpm']])}</div>` })}
  ${widget({ ico: ICO.passos, cor: '#1fa3e3', titulo: 'Passos', tela: 'metrica', arg: 'passos', barra: { pct: passos / m.passos, cor: 'linear-gradient(90deg,#f5c23b,#fb8c1e)' }, ok: passos >= m.passos, corpo: `<div class="lado"><div class="num azul">${fmtNum(passos)}</div>${kv([['META', fmtNum(m.passos)], ['DISTÂNCIA', fmtDist(passos * 0.75)]])}</div>` })}
  ${widget({ ico: ICO.intensidade, cor: '#fb8c1e', titulo: 'Minutos de intensidade', tela: 'metrica', arg: 'minutos_intensidade', barra: { pct: minSemana / m.minutos_intensidade, cor: 'linear-gradient(90deg,#b44fd6,#6c6ff0,#1fa3e3)' }, ok: minSemana >= m.minutos_intensidade, corpo: `<div class="lado"><div class="num laranja">${fmtNum(minSemana)}<span class="suf">/SEMANA</span></div>${kv([['META', fmtNum(m.minutos_intensidade)], ['HOJE', fmtNum(h.minutos_intensidade)]])}</div>` })}
  ${widget({ ico: ICO.bateria, cor: '#3cc7a8', titulo: 'Body Battery', tela: 'metrica', arg: 'energia', barra: { pct: (energia || 0) / 100, cor: 'linear-gradient(90deg,#ef4b5b,#f5c23b,#3cc7a8)' }, corpo: `<div class="lado"><div class="num verde">${energia ?? '--'}</div>${kv([['NÍVEL', energia == null ? '--' : energia > 70 ? 'Alto' : energia > 40 ? 'Médio' : 'Baixo'], ['ESTRESSE', h.stress ?? '--']])}</div>` })}
  ${widget({ ico: ICO.sono, cor: '#8b7cf6', titulo: 'Sono', tela: 'metrica', arg: 'sono', id: 'cSono', barra: { pct: (h.sono || 0) / m.sono_h, cor: 'linear-gradient(90deg,#3b3fb8,#8b7cf6)' }, ok: h.sono >= m.sono_h, corpo: `<div class="lado"><div class="num roxo">${sonoTxt}</div>${kv([['META', m.sono_h + ' h'], h.sono_extra?.deitou && ['DORMIU', h.sono_extra.deitou + ' → ' + (h.sono_extra.acordou || '')], h.sono_extra?.score && ['NOTA', h.sono_extra.score]])}</div>` })}
  ${widget({ ico: ICO.estresse, cor: '#fb8c1e', titulo: 'Estresse', tela: 'metrica', arg: 'stress', id: 'cStress', corpo: `<div class="lado"><div class="num ${(h.stress || 0) > 50 ? 'laranja' : 'azul'}">${h.stress ?? '--'}</div>${kv([['NÍVEL', h.stress == null ? '--' : h.stress < 25 ? 'Repouso' : h.stress < 50 ? 'Baixo' : h.stress < 75 ? 'Médio' : 'Alto']])}</div>` })}
  ${widget({ ico: ICO.agua, cor: '#1fa3e3', titulo: 'Hidratação', id: 'cAgua', barra: { pct: (h.agua || 0) / m.agua_ml, cor: 'linear-gradient(90deg,#1b6fd8,#1fa3e3)' }, ok: h.agua >= m.agua_ml, corpo: `<div class="lado"><div class="num azul">${fmtNum(h.agua)}<span class="suf">ML</span></div>${kv([['META', fmtNum(m.agua_ml) + ' ml'], ['', '<span class="link">+ adicionar</span>']])}</div>` })}
  ${widget({ ico: ICO.calorias, cor: '#ef4b5b', titulo: 'Calorias ativas', tela: 'metrica', arg: 'calorias_ativas', barra: { pct: (h.calorias_ativas || 0) / m.calorias, cor: 'linear-gradient(90deg,#fb8c1e,#ef4b5b)' }, ok: h.calorias_ativas >= m.calorias, corpo: `<div class="lado"><div class="num">${fmtNum(h.calorias_ativas)}</div>${kv([['META', fmtNum(m.calorias)], ['ANDARES', fmtNum(h.andares)]])}</div>` })}
  ${widget({ ico: ICO.peso, cor: '#c9ced6', titulo: 'Peso', tela: 'metrica', arg: 'peso', corpo: `<div class="lado"><div class="num">${d.peso ? (+d.peso.valor).toFixed(1).replace('.', ',') : (S.usuario.peso_kg ? (+S.usuario.peso_kg).toFixed(1).replace('.', ',') : '--')}<span class="suf">KG</span></div>${kv([['META', m.peso_alvo ? m.peso_alvo + ' kg' : '--'], ['IMC', imc()]])}</div>` })}
  ${widget({ ico: ICO.semana, cor: '#1fa3e3', titulo: 'Esta semana', tela: 'atividades', barra: { pct: d.resumo_semana.d / 1000 / m.distancia_semana_km, cor: 'linear-gradient(90deg,#1b6fd8,#3cc7a8)' }, ok: d.resumo_semana.d / 1000 >= m.distancia_semana_km, corpo: `<div class="lado"><div class="num">${(d.resumo_semana.d / 1000).toFixed(1).replace('.', ',')}<span class="suf">KM</span></div>${kv([['META', m.distancia_semana_km + ' km'], ['ATIVIDADES', d.resumo_semana.n], ['TEMPO', fmtTempo(d.resumo_semana.t)]])}</div>
     <canvas class="graf" id="gPassos"></canvas><div class="semana-dias">${dias.map(dt => { const v = dt === hojeISO() ? passos : (d.semana[dt]?.passos || 0); return `<div class="d ${v >= m.passos ? 'ok' : ''} ${dt === hojeISO() ? 'hoje' : ''}"><div class="c">${v >= m.passos ? '✓' : ''}</div>${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][new Date(dt + 'T12:00').getDay()]}</div>`; }).join('')}</div>` })}
  ${d.medalhas.length ? widget({ ico: ICO.medalha, cor: '#f5c23b', titulo: 'Medalhas recentes', tela: 'estatisticas', corpo: `<div class="medalhas-linha">${d.medalhas.map(x => `<span>${CATALOGO[x.codigo]?.icone || '🏅'}</span>`).join('')}</div>` }) : ''}
  ${widget({ ico: ICO.atividades, cor: '#c9ced6', titulo: 'Treinos e calendário', tela: 'treinos', corpo: '<div class="mini">Planeje treinos, acompanhe o calendário e marque concluídos</div>' })}`;
  grafBarras($('#gPassos'), dias.map(dt => dt === hojeISO() ? passos : (d.semana[dt]?.passos || 0)), '#1fa3e3', m.passos);
  AoVivo.pintar();
  $('#cAgua').onclick = modalAgua;
  $('#cSono').onclick = e => { if (!h.sono) { e.stopPropagation(); modalSono(); } };
  $('#cStress').onclick = e => { if (h.stress == null) { e.stopPropagation(); modalStress(); } };
}

function tabbar(ativa) {
  const grupo = { relatorios: 'mais', estatisticas: 'mais', treinos: 'mais', perfil: 'mais', dispositivo: 'mais', metrica: 'saude', atividade: 'atividades' };
  const marcada = grupo[S.tela] || ativa;
  const t = [['inicio', 'Meu dia'], ['atividades', 'Atividades'], ['mapa', 'Mapa'], ['gravar', 'Gravar'], ['saude', 'Saúde'], ['app', 'Apps'], ['mais', 'Mais']];
  // no computador a barra lateral também mostra os atalhos do menu Mais
  const extras = [['relatorios', 'Relatórios', ICO.relatorios], ['estatisticas', 'Desempenho', ICO.barras], ['treinos', 'Treinos', ICO.semana], ['dispositivo', 'Relógio', ICO.relogio], ['perfil', 'Perfil', ICO.perfilUser]];
  return `<nav class="tabbar">${t.map(([k, n]) => `<button class="${k === marcada ? 'ativo' : ''} ${k === 'gravar' ? 'gravar' : ''} ${k === 'mais' ? 'so-celular' : ''}" data-tela="${k}"><span class="i">${ICO[k] || ICO.app}</span><span class="n">${n}</span></button>`).join('')}
    <div class="so-desktop lateral-sep">Mais</div>${extras.map(([k, n, ic]) => `<button class="so-desktop ${S.tela === k ? 'ativo' : ''}" data-tela="${k}"><span class="i">${ic}</span><span class="n">${n}</span></button>`).join('')}</nav>`;
}

function cardRelogio(r, seg) {
  const vivo = seg != null && seg < 90, recente = seg != null && seg < 420;
  const dot = $('#dotRelogio'); if (dot) dot.className = 'dot ' + (vivo ? 'on' : recente ? 'meio' : '');
  const topo = `<header class="w-top"><span class="w-ico" style="color:#1fa3e3">${ICO.relogio}</span><span class="w-tit">Relógio</span><span class="vivo ${vivo ? 'on' : recente ? 'meio' : ''}">${!r ? 'aguardando' : vivo ? '● AO VIVO' : recente ? '● conectado' : '● sem sinal'}</span></header>`;
  if (!r) return topo + `<div class="w-corpo"><div class="mini">Instale o app Rastreador na aba Relógio para ver bateria, FC e posição ao vivo.</div></div>`;
  const quando = seg == null ? '--' : seg < 60 ? `há ${seg} s` : seg < 3600 ? `há ${Math.round(seg / 60)} min` : `há ${Math.round(seg / 3600)} h`;
  const modo = r.origem === 'ao_vivo' ? 'GPS a cada 30 s' : r.origem === 'segundo_plano' ? 'segundo plano · 5 min' : 'envio manual';
  const b = Math.round(r.bateria);
  return topo + `<div class="w-barra"><i style="width:${b}%;background:${b > 50 ? 'linear-gradient(90deg,#3cc7a8,#5ee08a)' : b > 20 ? 'linear-gradient(90deg,#f5c23b,#fb8c1e)' : '#ef4b5b'}"></i></div>
  <div class="w-corpo"><div class="lado"><div class="num ${b > 20 ? 'verde' : 'verm'}">${b}<span class="suf">%${+r.carregando ? ' ⚡' : ''}</span></div>
  ${kv([['FC', (r.fc ?? '--') + ' bpm'], ['BODY BATTERY', r.body_battery ?? '--'], ['PASSOS', r.passos != null ? fmtNum(r.passos) : '--'], ['AUTONOMIA', r.bateria_dias ? Math.round(r.bateria_dias) + ' dias' : '--']])}</div>
  <div class="rodape">Última leitura <b>${quando}</b> · ${modo}${r.lat ? ` · <a href="#" data-tela="mapa">ver no mapa</a>` : ''}</div></div>`;
}

/* ---------- componentes ---------- */
function anel(pct, cor, tam = 120, esp = 11, cx) {
  const r = (tam - esp) / 2, c = 2 * Math.PI * r, p = Math.min(1, Math.max(0, pct || 0));
  return `<div class="anel" style="width:${tam}px;height:${tam}px"><svg width="${tam}" height="${tam}"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" stroke="#2a2d33" stroke-width="${esp}" fill="none"/><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" stroke="${cor}" stroke-width="${esp}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" style="transition:stroke-dashoffset .8s"/></svg><div class="centro">${cx || ''}</div></div>`;
}
function grafBarras(cv, vals, cor, meta, labels) {
  const c = cv.getContext('2d'), W = cv.width = cv.clientWidth * 2, H = cv.height = cv.clientHeight * 2; c.clearRect(0, 0, W, H);
  const mx = Math.max(meta || 0, ...vals, 1), n = vals.length, bw = W / n * 0.6, gap = W / n;
  if (meta) { c.strokeStyle = '#555'; c.setLineDash([6, 6]); c.beginPath(); const y = H - 30 - (meta / mx) * (H - 50); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.setLineDash([]); }
  vals.forEach((v, i) => { const h = (v / mx) * (H - 50), x = i * gap + (gap - bw) / 2; c.fillStyle = meta && v >= meta ? '#3ddc84' : cor; c.beginPath(); c.roundRect(x, H - 30 - h, bw, h, 6); c.fill(); if (labels) { c.fillStyle = '#9aa0a6'; c.font = '20px sans-serif'; c.textAlign = 'center'; c.fillText(labels[i], x + bw / 2, H - 6); } });
}
function grafLinha(cv, series, opts = {}) {
  const c = cv.getContext('2d'), W = cv.width = cv.clientWidth * 2, H = cv.height = cv.clientHeight * 2; c.clearRect(0, 0, W, H);
  const todos = series.flatMap(s => s.v).filter(v => v != null && isFinite(v)); if (!todos.length) return;
  let mn = opts.min ?? Math.min(...todos), mx = opts.max ?? Math.max(...todos); if (mx === mn) { mx += 1; mn -= 1; }
  const pad = 8, px = i => pad + i / (series[0].v.length - 1 || 1) * (W - pad * 2), py = v => H - pad - (v - mn) / (mx - mn) * (H - pad * 2);
  series.forEach(s => {
    c.beginPath(); c.lineWidth = 3; c.strokeStyle = s.cor; let first = true;
    s.v.forEach((v, i) => { if (v == null || !isFinite(v)) return; first ? c.moveTo(px(i), py(v)) : c.lineTo(px(i), py(v)); first = false; });
    c.stroke();
    if (s.area) { c.lineTo(px(s.v.length - 1), H); c.lineTo(px(0), H); c.closePath(); c.fillStyle = s.cor + '33'; c.fill(); }
  });
  c.fillStyle = '#9aa0a6'; c.font = '20px sans-serif'; c.textAlign = 'left'; c.fillText(opts.fmt ? opts.fmt(mx) : Math.round(mx), pad, 22); c.fillText(opts.fmt ? opts.fmt(mn) : Math.round(mn), pad, H - 10);
}
function zonasFC() { const max = S.usuario?.fc_max || 190; return [[0.5, 0.6, '#9aa0a6', 'Aquecimento'], [0.6, 0.7, '#00a0df', 'Fácil'], [0.7, 0.8, '#3ddc84', 'Aeróbico'], [0.8, 0.9, '#ff8a00', 'Limiar'], [0.9, 1.01, '#ff4d4f', 'Máximo']].map(([a, b, cor, n], i) => ({ z: i + 1, de: Math.round(max * a), ate: Math.round(max * b), cor, n })); }
function zonaDe(bpm) { const z = zonasFC(); for (let i = z.length - 1; i >= 0; i--) if (bpm >= z[i].de) return z[i]; return null; }
function calorias(tipo, seg, fcMedia) { const p = +S.usuario?.peso_kg || 75; const met = ESPORTES[tipo]?.met || 5; let kcal = met * p * (seg / 3600); if (fcMedia) { const idade = S.usuario?.idade || 30; const sexoM = S.usuario?.sexo !== 'F'; const kcalMin = sexoM ? (-55.0969 + 0.6309 * fcMedia + 0.1988 * p + 0.2017 * idade) / 4.184 : (-20.4022 + 0.4472 * fcMedia - 0.1263 * p + 0.074 * idade) / 4.184; if (kcalMin > 0) kcal = kcalMin * seg / 60; } return Math.round(kcal); }

function imc() { const p = +S.usuario?.peso_kg, a = +S.usuario?.altura_cm / 100; return p && a ? (p / a / a).toFixed(1) : '--'; }
function calcEnergia(h) { if (h.energia != null) return Math.round(h.energia); if (!h.sono) return null; const ex = h.sono_extra || {}; let e = 25 + h.sono * 8.5 + (ex.qualidade === 'Excelente' ? 8 : ex.qualidade === 'Ruim' ? -10 : 0); let acordou = 7; if (ex.acordou) { const [hh, mm] = ex.acordou.split(':').map(Number); acordou = hh + mm / 60; } const horasAcordado = Math.max(0, (new Date().getHours() + new Date().getMinutes() / 60) - acordou); e -= horasAcordado * 2.5; e -= (h.minutos_intensidade || 0) * 0.35; if (h.stress != null) e -= h.stress * 0.15; return Math.round(Math.max(5, Math.min(100, e))); }

/* modais de saúde */
function modalAgua() {
  const h = S.dash?.hoje || {}; const m = S.metas;
  modal(`<h2>💧 Hidratação</h2><div class="num-grande" style="color:#00a0df" id="aguaV">${fmtNum(h.agua)} <small style="font-size:16px;color:#9aa0a6">/ ${fmtNum(m.agua_ml)} ml</small></div><div class="barra"><i id="aguaB" style="width:${Math.min(100, (h.agua || 0) / m.agua_ml * 100)}%"></i></div>
  <div class="agua-botoes"><button data-ml="150">🥛 150</button><button data-ml="250">🥤 250</button><button data-ml="500">🍶 500</button><button data-ml="750">🧴 750</button></div>
  <div class="agua-botoes"><button data-ml="-250" style="color:#ff4d4f">− 250 ml</button><button id="aguaCustom">Outro valor</button></div>`, box => {
    box.querySelectorAll('[data-ml]').forEach(b => b.onclick = async () => { const ml = +b.dataset.ml; const j = await api('metrica_salvar', { tipo: 'agua', valor: ml }); S.dash.hoje = j.hoje; $('#aguaV').innerHTML = `${fmtNum(j.hoje.agua)} <small style="font-size:16px;color:#9aa0a6">/ ${fmtNum(m.agua_ml)} ml</small>`; $('#aguaB').style.width = Math.min(100, j.hoje.agua / m.agua_ml * 100) + '%'; medalhasNovas(j.novas_medalhas); if (S.tela === 'inicio') renderInicio(); });
    $('#aguaCustom').onclick = async () => { const v = prompt('Quantidade em ml'); if (v) { await api('metrica_salvar', { tipo: 'agua', valor: +v, modo: 'add' }); fecharModal(); renderInicio(); } };
  });
}
function modalSono() {
  const h = S.dash?.hoje || {}; const ex = h.sono_extra || {};
  modal(`<h2>😴 Registrar sono</h2><form id="fSono"><div class="linha"><div class="campo"><label>Deitou</label><input type="time" name="deitou" value="${ex.deitou || '23:00'}"></div><div class="campo"><label>Acordou</label><input type="time" name="acordou" value="${ex.acordou || '07:00'}"></div></div>
  <div class="campo"><label>Qualidade</label><select name="qualidade"><option>Excelente</option><option selected>Boa</option><option>Regular</option><option>Ruim</option></select></div>
  <div class="campo"><label>Sono profundo (estimado, %)</label><input type="range" name="profundo" min="5" max="40" value="${ex.profundo || 20}"></div>
  <div class="campo"><label>Data (noite de)</label><input type="date" name="data" value="${hojeISO()}"></div><button class="btn">Salvar</button></form>`, box => {
    $('#fSono').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const [h1, m1] = f.deitou.split(':').map(Number), [h2, m2] = f.acordou.split(':').map(Number); let min = (h2 * 60 + m2) - (h1 * 60 + m1); if (min <= 0) min += 1440; const j = await api('metrica_salvar', { tipo: 'sono', valor: +(min / 60).toFixed(2), data: f.data, extra: { deitou: f.deitou, acordou: f.acordou, qualidade: f.qualidade, profundo: +f.profundo } }); medalhasNovas(j.novas_medalhas); fecharModal(); toast('Sono registrado'); renderInicio(); };
  });
}
function modalStress() { modal(`<h2>🧠 Nível de estresse</h2><p class="mini">Como você está se sentindo agora? (0 = totalmente relaxado, 100 = muito estressado)</p><div class="num-grande" id="stV">${S.dash?.hoje?.stress ?? 25}</div><input type="range" id="stR" min="0" max="100" value="${S.dash?.hoje?.stress ?? 25}" style="width:100%"><button class="btn" id="stOk" style="margin-top:14px">Salvar</button>`, () => { $('#stR').oninput = e => $('#stV').textContent = e.target.value; $('#stOk').onclick = async () => { await api('metrica_salvar', { tipo: 'stress', valor: +$('#stR').value }); fecharModal(); renderInicio(); }; }); }
function modalValor(tipo, titulo, unidade, atual, step = 0.1, modo = 'set') { modal(`<h2>${titulo}</h2><div class="stepper"><button id="vm">−</button><input type="number" id="vv" step="${step}" value="${atual ?? ''}"><button id="vp">+</button></div><div class="centro mini" style="margin:6px 0 14px">${unidade}</div><div class="campo"><label>Data</label><input type="date" id="vd" value="${hojeISO()}"></div><button class="btn" id="vok">Salvar</button>`, () => { $('#vm').onclick = () => $('#vv').value = (+$('#vv').value - step).toFixed(step < 1 ? 1 : 0); $('#vp').onclick = () => $('#vv').value = (+$('#vv').value + step).toFixed(step < 1 ? 1 : 0); $('#vok').onclick = async () => { const j = await api('metrica_salvar', { tipo, valor: +$('#vv').value, data: $('#vd').value, modo }); medalhasNovas(j.novas_medalhas); fecharModal(); toast('Salvo'); navegar(S.tela, S.arg); }; }); }
const CATALOGO = { primeira_atividade: { icone: '🏁' }, corrida_5k: { icone: '🏃' }, corrida_10k: { icone: '🥈' }, meia_maratona: { icone: '🥇' }, maratona: { icone: '🏆' }, ciclismo_50k: { icone: '🚴' }, ciclismo_100k: { icone: '🚵' }, passos_10k: { icone: '👟' }, passos_20k: { icone: '🔥' }, sequencia_7: { icone: '📅' }, madrugador: { icone: '🌅' }, coruja: { icone: '🦉' }, atividades_10: { icone: '🔟' }, atividades_50: { icone: '⭐' }, atividades_100: { icone: '💯' }, escalador: { icone: '⛰️' }, hidratado: { icone: '💧' }, bem_dormido: { icone: '😴' }, peso_registrado: { icone: '⚖️' }, distancia_total_100: { icone: '🛣️' }, distancia_total_1000: { icone: '🌍' } };
function medalhasNovas(lista) { if (lista && lista.length) { toast('🏅 Nova medalha: ' + lista.map(c => c.replace(/_/g, ' ')).join(', '), 4000); if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } }

/* ---------- MÉTRICA histórico ---------- */
async function renderMetricaHistorico(tipo) {
  S.arg = tipo;
  const cfg = { passos: ['Passos', '#00a0df', 'passos'], fc: ['Frequência cardíaca', '#ff4d4f', 'bpm'], sono: ['Sono', '#a76cff', 'h'], peso: ['Peso', '#fff', 'kg'], stress: ['Estresse', '#ff8a00', ''], energia: ['Body Battery', '#3ddc84', ''], agua: ['Hidratação', '#00a0df', 'ml'], spo2: ['Oximetria (SpO2)', '#00a0df', '%'], fc_repouso: ['FC em repouso', '#ff4d4f', 'bpm'] }[tipo] || [tipo, '#fff', ''];
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="saude">‹</button><h1>${cfg[0]}</h1></div><div class="chips" style="margin:0"><span class="chip ativo" data-d="7">7d</span><span class="chip" data-d="30">30d</span><span class="chip" data-d="365">1a</span></div></div><div id="mh"></div>${tabbar('saude')}</div>`;
  const carregar = async dias => {
    if (tipo === 'fc') {
      const j = await apiGet('fc_listar', { data: hojeISO() }); const v = j.itens.map(x => x.bpm);
      $('#mh').innerHTML = `<div class="card"><h3>Hoje — ${v.length} amostras</h3><canvas class="graf" id="g1" style="height:160px"></canvas><div class="grid3 centro" style="margin-top:8px"><div><div class="grande" style="font-size:22px">${v.length ? Math.min(...v) : '--'}</div><div class="mini">mín</div></div><div><div class="grande" style="font-size:22px">${v.length ? Math.round(v.reduce((a, b) => a + b) / v.length) : '--'}</div><div class="mini">média</div></div><div><div class="grande" style="font-size:22px">${v.length ? Math.max(...v) : '--'}</div><div class="mini">máx</div></div></div></div>
      <div class="card"><h3>Zonas de FC (máx ${S.usuario.fc_max})</h3>${zonasFC().map(z => `<div class="zona"><span class="z" style="background:${z.cor}">${z.z}</span>${z.n} <span class="mini" style="margin-left:auto">${z.de}–${z.ate} bpm</span></div>`).join('')}</div>
      <div class="card"><button class="btn" id="bBle">📡 Conectar sensor Bluetooth</button><div class="mini centro" style="margin-top:8px">Cintas e relógios com perfil Heart Rate (Garmin HRM, Polar, Xiaomi, etc.)</div><button class="btn sec" id="bMan" style="margin-top:8px">Registrar FC em repouso manualmente</button></div>`;
      if (v.length) grafLinha($('#g1'), [{ v, cor: '#ff4d4f', area: true }]);
      $('#bBle').onclick = () => BLE.conectar(); $('#bMan').onclick = () => modalValor('fc_repouso', 'FC em repouso', 'bpm', S.usuario.fc_repouso || 60, 1);
      return;
    }
    const j = await apiGet('metricas_listar', { tipo, dias }); const it = j.itens;
    const mapa = {}; it.forEach(x => mapa[x.data] = +x.valor);
    const ds = [...Array(Math.min(dias, 60))].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (Math.min(dias, 60) - 1) + i); return hojeISO(d); });
    const vals = ds.map(d => mapa[d] ?? (tipo === 'peso' ? null : 0));
    const com = it.map(x => +x.valor);
    const meta = { passos: S.metas.passos, sono: S.metas.sono_h, agua: S.metas.agua_ml }[tipo];
    $('#mh').innerHTML = `<div class="card"><h3>Últimos ${dias} dias</h3><canvas class="graf" id="g1" style="height:160px"></canvas><div class="grid3 centro" style="margin-top:8px"><div><div class="grande" style="font-size:22px">${com.length ? (com.reduce((a, b) => a + b) / com.length).toFixed(tipo === 'passos' || tipo === 'agua' ? 0 : 1) : '--'}</div><div class="mini">média</div></div><div><div class="grande" style="font-size:22px">${com.length ? Math.max(...com).toFixed(tipo === 'passos' || tipo === 'agua' ? 0 : 1) : '--'}</div><div class="mini">máx</div></div><div><div class="grande" style="font-size:22px">${meta ? it.filter(x => +x.valor >= meta).length : '--'}</div><div class="mini">dias na meta</div></div></div></div>
    <div class="card"><button class="btn" id="bAdd">+ Registrar ${cfg[0].toLowerCase()}</button></div>
    <div class="card"><h3>Histórico</h3><table class="tabela">${it.slice().reverse().map(x => `<tr><td>${new Date(x.data + 'T12:00').toLocaleDateString('pt-BR')}</td><td>${tipo === 'sono' ? fmtTempo(x.valor * 3600).slice(0, -3) + ' h' : (+x.valor).toLocaleString('pt-BR') + ' ' + cfg[2]}</td></tr>`).join('') || '<tr><td colspan=2 class="mini">Nenhum registro</td></tr>'}</table></div>`;
    if (tipo === 'peso') grafLinha($('#g1'), [{ v: vals, cor: '#fff' }]); else grafBarras($('#g1'), vals, cfg[1], meta);
    $('#bAdd').onclick = () => tipo === 'sono' ? modalSono() : tipo === 'agua' ? modalAgua() : tipo === 'stress' ? modalStress() : modalValor(tipo, cfg[0], cfg[2], tipo === 'peso' ? (S.usuario.peso_kg || 70) : tipo === 'passos' ? (S.dash?.hoje?.passos || 0) : tipo === 'spo2' ? 97 : 50, tipo === 'peso' ? 0.1 : tipo === 'passos' ? 100 : 1, tipo === 'passos' ? 'max' : 'set');
  };
  document.querySelectorAll('.chip[data-d]').forEach(c => c.onclick = () => { document.querySelectorAll('.chip[data-d]').forEach(x => x.classList.remove('ativo')); c.classList.add('ativo'); carregar(+c.dataset.d); });
  carregar(7);
}

/* ---------- SAÚDE ---------- */
async function renderSaude() {
  const d = S.dash || (await apiGet('dashboard').then(j => (S.dash = j)).catch(() => store.get('dash'))); const h = d?.hoje || {};
  const itens = [['fc', '❤️', 'Frequência cardíaca', (S.fcAtual || (d?.fc?.length ? d.fc[d.fc.length - 1].bpm : null)) ? (S.fcAtual || d.fc[d.fc.length - 1].bpm) + ' bpm' : 'Conectar sensor'], ['sono', '😴', 'Sono', h.sono ? h.sono.toFixed(1) + ' h' : 'Registrar'], ['stress', '🧠', 'Estresse', h.stress ?? '--'], ['energia', '🔋', 'Body Battery', calcEnergia(h) ?? '--'], ['agua', '💧', 'Hidratação', fmtNum(h.agua) + ' ml'], ['peso', '⚖️', 'Peso', (d?.peso ? (+d.peso.valor).toFixed(1) : S.usuario.peso_kg || '--') + ' kg'], ['spo2', '🫁', 'Oximetria', h.spo2 ? h.spo2 + '%' : '--'], ['passos', '👟', 'Passos', fmtNum(Math.max(h.passos || 0, Podometro.total()))], ['fc_repouso', '💤', 'FC em repouso', (h.fc_repouso || S.usuario.fc_repouso || '--') + ' bpm']];
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Saúde</h1><button class="ico-btn" id="btnFC2">${S.fcDevice ? '💓' : '📡'}</button></div>
  <div class="card" id="cRelogio">${cardRelogio(null)}</div><div class="card"><h3>Sensores do celular</h3><div class="mini">Podômetro: <b id="podStat">${Podometro.ativo ? 'ativo (' + fmtNum(Podometro.total()) + ' passos hoje)' : 'inativo'}</b><br>Sensor FC Bluetooth: <b>${S.fcDevice ? S.fcDevice + ' — ' + (S.fcAtual || '--') + ' bpm' : 'não conectado'}</b><br>GPS: <b>${'geolocation' in navigator ? 'disponível' : 'indisponível'}</b></div>${Podometro.ativo ? '' : '<button class="btn sec peq" id="podOn" style="margin-top:8px">Ativar podômetro</button>'}</div>
  <div class="card"><div class="lista">${itens.map(([k, i, n, v]) => `<div class="item" data-tela="metrica" data-arg="${k}"><div class="ic">${i}</div><div class="info"><b>${n}</b><span>Toque para ver histórico</span></div><div class="dir"><b>${v}</b></div><span style="color:#555">›</span></div>`).join('')}</div></div>
  <div class="card"><h3>Estatísticas de saúde da semana</h3><canvas class="graf" id="gSono"></canvas><div class="mini centro">Horas de sono nos últimos 7 dias</div></div>${tabbar('saude')}</div>`;
  AoVivo.pintar();
  $('#btnFC2').onclick = () => BLE.conectar(); $('#podOn') && ($('#podOn').onclick = () => Podometro.iniciar(true));
  if (d?.semana) { const dias = [...Array(7)].map((_, i) => { const dt = new Date(); dt.setDate(dt.getDate() - 6 + i); return hojeISO(dt); }); grafBarras($('#gSono'), dias.map(x => d.semana[x]?.sono || 0), '#a76cff', S.metas.sono_h, dias.map(x => ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][new Date(x + 'T12:00').getDay()])); }
}

/* ---------- ATIVIDADES ---------- */
async function renderAtividades(filtro = '') {
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Atividades</h1><div class="acoes"><button class="ico-btn" id="bImp" title="Importar GPX">📥</button><button class="ico-btn" id="bMan" title="Adicionar manual">+</button></div></div>
  <div class="chips"><span class="chip ${!filtro ? 'ativo' : ''}" data-f="">Todas</span>${Object.entries(ESPORTES).slice(0, 8).map(([k, v]) => `<span class="chip ${filtro === k ? 'ativo' : ''}" data-f="${k}">${v.i} ${v.n}</span>`).join('')}</div><div id="lst" class="card"><div class="mini centro">Carregando…</div></div>${tabbar('atividades')}</div>`;
  document.querySelectorAll('.chip[data-f]').forEach(c => c.onclick = () => renderAtividades(c.dataset.f));
  $('#bImp').onclick = importarGPX; $('#bMan').onclick = atividadeManual;
  let j; try { j = await apiGet('atividades_listar', { tipo: filtro, limite: 100 }); store.set('atv_' + filtro, j.itens); } catch { j = { itens: store.get('atv_' + filtro, []) }; }
  const pend = store.get('pendentes', []);
  if (!j.itens.length && !pend.length) { $('#lst').innerHTML = '<div class="vazio"><div class="i">🏃</div>Nenhuma atividade ainda.<br><br><button class="btn peq" data-tela="gravar">Gravar agora</button></div>'; return; }
  $('#lst').className = 'card lista';
  $('#lst').innerHTML = pend.map(a => `<div class="item"><div class="ic">⏳</div><div class="info"><b>${esc(a.nome)}</b><span>Aguardando sincronização</span></div><div class="dir"><b>${fmtDist(a.distancia_m)}</b>${fmtTempo(a.duracao_s)}</div></div>`).join('') +
    j.itens.map(a => `<div class="item" data-tela="atividade" data-arg="${a.id}"><div class="ic">${ESPORTES[a.tipo]?.i || '⭐'}</div><div class="info"><b>${esc(a.nome)}</b><span>${fmtData(a.inicio)}${a.fc_media ? ' · ❤️ ' + a.fc_media : ''}</span></div><div class="dir"><b>${a.distancia_m > 0 ? fmtDist(a.distancia_m) : fmtNum(a.calorias) + ' kcal'}</b>${fmtTempo(a.duracao_s)}${a.ritmo_medio && a.tipo !== 'ciclismo' ? ' · ' + fmtRitmo(a.ritmo_medio) : a.velocidade_media && a.tipo === 'ciclismo' ? ' · ' + (+a.velocidade_media).toFixed(1) + ' km/h' : ''}</div></div>`).join('');
}
function importarGPX() { modal(`<h2>📥 Importar GPX</h2><div class="campo"><label>Esporte</label><select id="impTipo">${Object.entries(ESPORTES).map(([k, v]) => `<option value="${k}">${v.i} ${v.n}</option>`).join('')}</select></div><div class="campo"><label>Arquivo .gpx (Garmin, Strava, etc.)</label><input type="file" id="impArq" accept=".gpx,application/gpx+xml"></div><button class="btn" id="impOk">Importar</button>`, () => { $('#impOk').onclick = async () => { const f = $('#impArq').files[0]; if (!f) return toast('Escolha um arquivo'); const gpx = await f.text(); try { const j = await api('importar_gpx', { gpx, tipo: $('#impTipo').value }); fecharModal(); toast('Importada!'); navegar('atividade', j.id); } catch (x) { toast(x.message); } }; }); }
function atividadeManual() {
  modal(`<h2>+ Atividade manual</h2><form id="fMan"><div class="campo"><label>Esporte</label><select name="tipo">${Object.entries(ESPORTES).map(([k, v]) => `<option value="${k}">${v.i} ${v.n}</option>`).join('')}</select></div><div class="campo"><label>Nome</label><input name="nome" placeholder="Ex.: Treino de pernas"></div><div class="linha"><div class="campo"><label>Data e hora</label><input type="datetime-local" name="inicio" value="${hojeISO()}T${pad(new Date().getHours())}:${pad(new Date().getMinutes())}" required></div><div class="campo"><label>Duração (min)</label><input type="number" name="min" value="30" required></div></div><div class="linha"><div class="campo"><label>Distância (km)</label><input type="number" step="0.01" name="km" value="0"></div><div class="campo"><label>FC média</label><input type="number" name="fc"></div></div><div class="campo"><label>Esforço percebido (1-10)</label><input type="range" name="esforco" min="1" max="10" value="5"></div><div class="campo"><label>Notas</label><textarea name="notas" rows="2"></textarea></div><button class="btn">Salvar</button></form>`, () => {
    $('#fMan').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const seg = +f.min * 60; const dist = +f.km * 1000; const ini = new Date(f.inicio); const a = { uid: 'man-' + Date.now(), tipo: f.tipo, nome: f.nome || ESPORTES[f.tipo].n, inicio: dtLocal(ini), fim: dtLocal(new Date(ini.getTime() + seg * 1000)), duracao_s: seg, tempo_movimento_s: seg, distancia_m: dist, calorias: calorias(f.tipo, seg, +f.fc || null), fc_media: +f.fc || null, velocidade_media: dist ? +(dist / seg * 3.6).toFixed(2) : null, ritmo_medio: dist ? +(seg / 60 / (dist / 1000)).toFixed(2) : null, esforco: +f.esforco, notas: f.notas }; await salvarAtividade(a); fecharModal(); renderAtividades(); };
  });
}
async function salvarAtividade(a) {
  try { const j = await api('atividade_salvar', { atividade: a }); medalhasNovas(j.novas_medalhas); toast('Atividade salva'); return j.id; }
  catch (x) { if (!S.online || /fetch|network|Failed/i.test(x.message)) { const p = store.get('pendentes', []); p.push(a); store.set('pendentes', p); toast('Salva offline — sincroniza depois'); return null; } toast(x.message); throw x; }
}
async function sincronizarPendentes() { const p = store.get('pendentes', []); if (!p.length || !S.online) return; const resto = []; for (const a of p) { try { await api('atividade_salvar', { atividade: a }); } catch { resto.push(a); } } store.set('pendentes', resto); if (resto.length < p.length) toast(`${p.length - resto.length} atividade(s) sincronizada(s)`); }

/* ---------- DETALHE ---------- */
async function renderAtividadeDetalhe(id) {
  S.arg = id;
  if (!window.L) await carregarLeaflet();
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="atividades">‹</button><h1>Atividade</h1></div></div><div id="det"><div class="mini centro">Carregando…</div></div>${tabbar('atividades')}</div>`;
  let a; try { a = (await apiGet('atividade_obter', { id })).atividade; } catch (x) { $('#det').innerHTML = '<div class="vazio">Não foi possível carregar</div>'; return; }
  const pts = a.pontos || []; const comGps = pts.filter(p => p.lat).length > 1;
  const z = zonasFC(); const tempoZona = [0, 0, 0, 0, 0]; let prevT = null;
  pts.forEach(p => { if (p.fc && prevT != null) { const zn = zonaDe(p.fc); if (zn) tempoZona[zn.z - 1] += (p.t - prevT) / 1000; } prevT = p.t; });
  const totZ = tempoZona.reduce((x, y) => x + y, 0);
  // splits por km
  const splits = []; let acc = 0, ini = pts[0]?.t, iniD = 0;
  for (let i = 1; i < pts.length; i++) { if (!pts[i].lat || !pts[i - 1].lat) continue; acc += haversine(pts[i - 1], pts[i]); if (acc - iniD >= 1000) { splits.push({ km: splits.length + 1, seg: (pts[i].t - ini) / 1000, fc: pts[i].fc }); ini = pts[i].t; iniD = acc; } }
  if (acc - iniD > 100 && pts.length) splits.push({ km: +(splits.length + (acc - iniD) / 1000).toFixed(2), seg: (pts[pts.length - 1].t - ini) / 1000, parcial: (acc - iniD) / 1000 });
  const est = ESPORTES[a.tipo] || ESPORTES.outro;
  $('#det').innerHTML = `<div class="card"><div style="display:flex;gap:12px;align-items:center"><div class="ic" style="font-size:34px">${est.i}</div><div style="flex:1"><div style="font-size:19px;font-weight:700" id="dNome">${esc(a.nome)}</div><div class="mini">${fmtData(a.inicio)} · ${est.n}${a.clima ? ' · ' + esc(a.clima) : ''}</div></div><button class="ico-btn" id="bEd">✏️</button></div></div>
  ${comGps ? '<div class="mapa-det" id="mapa"></div>' : ''}
  <div class="card"><div class="grid3 centro">
   <div><div class="grande" style="font-size:24px">${fmtDist(a.distancia_m)}</div><div class="mini">Distância</div></div>
   <div><div class="grande" style="font-size:24px">${fmtTempo(a.duracao_s)}</div><div class="mini">Tempo</div></div>
   <div><div class="grande" style="font-size:24px">${a.tipo === 'ciclismo' ? (+a.velocidade_media || 0).toFixed(1) + '<small>km/h</small>' : fmtRitmo(a.ritmo_medio) + '<small>/km</small>'}</div><div class="mini">${a.tipo === 'ciclismo' ? 'Vel. média' : 'Ritmo médio'}</div></div>
   <div><div class="grande" style="font-size:24px">${fmtNum(a.calorias)}</div><div class="mini">Calorias</div></div>
   <div><div class="grande" style="font-size:24px;color:#ff4d4f">${a.fc_media || '--'}</div><div class="mini">FC média</div></div>
   <div><div class="grande" style="font-size:24px;color:#ff4d4f">${a.fc_max || '--'}</div><div class="mini">FC máx</div></div>
   <div><div class="grande" style="font-size:24px">${a.elevacao_ganho || 0}<small>m</small></div><div class="mini">Elev. ganho</div></div>
   <div><div class="grande" style="font-size:24px">${fmtTempo(a.tempo_movimento_s || a.duracao_s)}</div><div class="mini">Em movimento</div></div>
   <div><div class="grande" style="font-size:24px">${a.velocidade_max ? (+a.velocidade_max).toFixed(1) + '<small>km/h</small>' : a.passos ? fmtNum(a.passos) : a.cadencia ? a.cadencia + '<small>spm</small>' : '--'}</div><div class="mini">${a.velocidade_max ? 'Vel. máx' : a.passos ? 'Passos' : 'Cadência'}</div></div>
  </div>${a.esforco ? `<div class="mini centro" style="margin-top:10px">Esforço percebido: ${a.esforco}/10 · Efeito de treino: <b>${(a.duracao_s / 600 * (a.esforco / 5)).toFixed(1)}</b></div>` : ''}</div>
  ${pts.some(p => p.vel != null) ? `<div class="card"><h3>${a.tipo === 'ciclismo' ? 'Velocidade' : 'Ritmo'}</h3><canvas class="graf" id="gVel"></canvas></div>` : ''}
  ${pts.some(p => p.fc) ? `<div class="card"><h3>Frequência cardíaca</h3><canvas class="graf" id="gFC"></canvas>${totZ ? `<div style="margin-top:10px">${z.map((zn, i) => `<div class="zona"><span class="z" style="background:${zn.cor}">${zn.z}</span>${zn.n}<div class="barra" style="flex:1;margin:0 8px"><i style="width:${tempoZona[i] / totZ * 100}%;background:${zn.cor}"></i></div><span class="mini">${fmtTempo(tempoZona[i])}</span></div>`).join('')}</div>` : ''}</div>` : ''}
  ${pts.some(p => p.alt != null) ? `<div class="card"><h3>Elevação</h3><canvas class="graf" id="gAlt"></canvas><div class="mini">Ganho ${a.elevacao_ganho} m · Perda ${a.elevacao_perda} m</div></div>` : ''}
  ${splits.length ? `<div class="card"><h3>Parciais</h3><table class="tabela"><tr><th>km</th><th>Tempo</th><th>Ritmo</th><th>FC</th></tr>${splits.map(s => `<tr><td>${s.km}</td><td>${fmtTempo(s.seg)}</td><td>${fmtRitmo(s.seg / 60 / (s.parcial || 1))}</td><td>${s.fc || '--'}</td></tr>`).join('')}</table></div>` : ''}
  ${a.voltas?.length ? `<div class="card"><h3>Voltas</h3><table class="tabela"><tr><th>#</th><th>Tempo</th><th>Distância</th></tr>${a.voltas.map((v, i) => `<tr><td>${i + 1}</td><td>${fmtTempo(v.seg)}</td><td>${fmtDist(v.dist)}</td></tr>`).join('')}</table></div>` : ''}
  ${a.notas ? `<div class="card"><h3>Notas</h3><div>${esc(a.notas)}</div></div>` : ''}
  <div class="linha"><button class="btn sec" id="bShare">📤 Compartilhar</button>${comGps ? `<a class="btn sec" href="gpx/${a.id}" download>⬇ GPX</a>` : ''}</div>
  <button class="btn perigo" id="bDel" style="margin-top:12px">Excluir atividade</button>`;
  if (comGps) { const mapa = L.map('mapa', { zoomControl: false, attributionControl: false }); camadaGoogle().addTo(mapa); const ll = pts.filter(p => p.lat).map(p => [p.lat, p.lon]); const linha = L.polyline(ll, { color: '#00a0df', weight: 4 }).addTo(mapa); L.circleMarker(ll[0], { radius: 6, color: '#3ddc84', fillOpacity: 1 }).addTo(mapa); L.circleMarker(ll[ll.length - 1], { radius: 6, color: '#ff4d4f', fillOpacity: 1 }).addTo(mapa); mapa.fitBounds(linha.getBounds(), { padding: [20, 20] }); }
  const amostra = (arr, n = 150) => { if (arr.length <= n) return arr; const r = []; for (let i = 0; i < n; i++) r.push(arr[Math.floor(i * arr.length / n)]); return r; };
  if ($('#gVel')) { const v = amostra(pts).map(p => a.tipo === 'ciclismo' ? p.vel : (p.vel > 0.5 ? 60 / (p.vel * 3.6) : null)); grafLinha($('#gVel'), [{ v, cor: '#00a0df', area: true }], a.tipo === 'ciclismo' ? { fmt: x => x.toFixed(0) + ' km/h' } : { fmt: x => fmtRitmo(x) }); }
  if ($('#gFC')) grafLinha($('#gFC'), [{ v: amostra(pts).map(p => p.fc || null), cor: '#ff4d4f', area: true }]);
  if ($('#gAlt')) grafLinha($('#gAlt'), [{ v: amostra(pts).map(p => p.alt), cor: '#3ddc84', area: true }], { fmt: x => x.toFixed(0) + ' m' });
  $('#bDel').onclick = async () => { if (confirm('Excluir esta atividade?')) { await api('atividade_excluir', { id: a.id }); toast('Excluída'); navegar('atividades'); } };
  $('#bEd').onclick = () => modal(`<h2>Editar</h2><form id="fEd"><div class="campo"><label>Nome</label><input name="nome" value="${esc(a.nome)}"></div><div class="campo"><label>Esporte</label><select name="tipo">${Object.entries(ESPORTES).map(([k, v]) => `<option value="${k}" ${k === a.tipo ? 'selected' : ''}>${v.i} ${v.n}</option>`).join('')}</select></div><div class="campo"><label>Esforço (1-10)</label><input type="range" name="esforco" min="1" max="10" value="${a.esforco || 5}"></div><div class="campo"><label>Notas</label><textarea name="notas" rows="3">${esc(a.notas || '')}</textarea></div><button class="btn">Salvar</button></form>`, () => { $('#fEd').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await api('atividade_editar', { id: a.id, ...f }); fecharModal(); renderAtividadeDetalhe(a.id); }; });
  $('#bShare').onclick = () => { const txt = `${est.i} ${a.nome}\n${fmtDist(a.distancia_m)} em ${fmtTempo(a.duracao_s)}${a.ritmo_medio ? ' · ' + fmtRitmo(a.ritmo_medio) + '/km' : ''}${a.fc_media ? ' · ❤️ ' + a.fc_media + ' bpm' : ''} · ${a.calorias} kcal\nvia Garmin Connect`; if (navigator.share) navigator.share({ title: a.nome, text: txt }); else { navigator.clipboard.writeText(txt); toast('Copiado'); } };
}

/* ---------- GRAVAR ---------- */
function renderGravar() {
  carregarLeaflet();
  const ult = store.get('esporte', 'corrida');
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Gravar atividade</h1><button class="ico-btn" id="btnFC3">${S.fcDevice ? '💓' : '📡'}</button></div>
  <div class="esportes" id="esp">${Object.entries(ESPORTES).map(([k, v]) => `<div class="esporte ${k === ult ? 'ativo' : ''}" data-e="${k}"><div class="i">${v.i}</div>${v.n}</div>`).join('')}</div>
  <div class="card" style="margin-top:14px"><h3>Opções</h3>
   <label style="display:flex;justify-content:space-between;padding:8px 0"><span>Pausa automática</span><input type="checkbox" id="oPausa" ${store.get('autopausa', true) ? 'checked' : ''}></label>
   <label style="display:flex;justify-content:space-between;padding:8px 0"><span>Voz a cada km</span><input type="checkbox" id="oVoz" ${store.get('voz', true) ? 'checked' : ''}></label>
   <label style="display:flex;justify-content:space-between;padding:8px 0"><span>Volta automática a cada km</span><input type="checkbox" id="oVolta" ${store.get('autovolta', true) ? 'checked' : ''}></label>
   <label style="display:flex;justify-content:space-between;padding:8px 0"><span>Manter tela ligada</span><input type="checkbox" id="oTela" ${store.get('tela', true) ? 'checked' : ''}></label>
   <div class="mini">Sensor FC: ${S.fcDevice ? '💓 ' + S.fcDevice : 'nenhum — toque em 📡 para conectar'}</div></div>
  <button class="btn verde" id="bIniciar" style="font-size:18px;padding:16px;margin-bottom:30px">▶ INICIAR</button>${tabbar('gravar')}</div>`;
  $('#btnFC3').onclick = () => BLE.conectar();
  document.querySelectorAll('.esporte').forEach(e => e.onclick = () => { document.querySelectorAll('.esporte').forEach(x => x.classList.remove('ativo')); e.classList.add('ativo'); store.set('esporte', e.dataset.e); });
  ['autopausa:oPausa', 'voz:oVoz', 'autovolta:oVolta', 'tela:oTela'].forEach(s => { const [k, id] = s.split(':'); $('#' + id).onchange = e => store.set(k, e.target.checked); });
  $('#bIniciar').onclick = () => Gravador.iniciar(store.get('esporte', 'corrida'));
}

const Gravador = {
  a: null, watch: null, timer: null, wake: null, mapa: null, linha: null, marcador: null, ultimoPt: null, pausado: false, autoPausado: false, ultimoMov: 0, ultimoKmVoz: 0, iniVolta: null,
  iniciar(tipo) {
    const ag = new Date();
    this.a = { uid: 'g-' + ag.getTime(), tipo, nome: `${ESPORTES[tipo].n} ${ag.getHours() < 12 ? 'da manhã' : ag.getHours() < 18 ? 'da tarde' : 'da noite'}`, inicio: dtLocal(ag), t0: ag.getTime(), duracao_s: 0, tempo_movimento_s: 0, distancia_m: 0, elevacao_ganho: 0, elevacao_perda: 0, velocidade_max: 0, pontos: [], voltas: [], fcs: [], passos0: Podometro.total(), pausas: 0 };
    this.pausado = false; this.ultimoPt = null; this.ultimoKmVoz = 0; this.iniVolta = { t: ag.getTime(), d: 0 };
    this.render(); this.ligarGPS(); this.ligarTimer(); this.wakeLock(); this.persistir();
    if (store.get('voz', true)) falar('Atividade iniciada');
  },
  retomar() { const s = store.get('gravando'); if (!s) return false; this.a = s; this.pausado = true; this.ultimoPt = null; this.render(); this.ligarGPS(); this.ligarTimer(); toast('Atividade recuperada — toque em ▶ para continuar'); return true; },
  persistir() { store.set('gravando', this.a); },
  render() {
    const gps = ESPORTES[this.a.tipo].gps;
    app.innerHTML = `<div class="gravando">${gps ? '<div class="mapa" id="mapaLive"><div class="status-gps"><span class="pt ruim" id="gpsPt"></span><span id="gpsTxt">Buscando GPS…</span></div></div>' : '<div style="height:12vh;display:flex;align-items:center;justify-content:center;font-size:44px">' + ESPORTES[this.a.tipo].i + '</div>'}
    <div class="dados">
     <div class="dado grande"><div class="v" id="vTempo">00:00</div><div class="l">Tempo</div></div>
     ${gps ? `<div class="dado"><div class="v" id="vDist">0,00</div><div class="l">km</div></div><div class="dado"><div class="v" id="vRitmo">--:--</div><div class="l">${this.a.tipo === 'ciclismo' ? 'km/h' : 'ritmo /km'}</div></div>` : `<div class="dado"><div class="v" id="vCal">0</div><div class="l">kcal</div></div><div class="dado"><div class="v" id="vPassos">0</div><div class="l">passos</div></div>`}
     <div class="dado"><div class="v" id="vFC" style="color:#ff4d4f">${S.fcAtual || '--'}</div><div class="l">bpm ${S.fcDevice ? '' : '<span id="bleLink" style="color:#00a0df">conectar</span>'}</div></div>
     <div class="dado"><div class="v" id="vExtra">${gps ? '0' : fmtNum(S.fcAtual ? zonaDe(S.fcAtual)?.z || 0 : 0)}</div><div class="l">${gps ? 'elev. m' : 'zona FC'}</div></div>
    </div>
    <div class="mini centro" id="vAvg" style="padding-bottom:4px">${gps ? 'Média --:-- · Máx 0 km/h' : ''}</div>
    <div class="controles"><button class="ctrl volta" id="cVolta">⏱</button><button class="ctrl ${this.pausado ? 'inicio' : 'pausa'}" id="cPausa">${this.pausado ? '▶' : '❚❚'}</button><button class="ctrl parar" id="cParar">■</button></div></div>`;
    $('#cPausa').onclick = () => this.togglePausa(); $('#cParar').onclick = () => this.parar(); $('#cVolta').onclick = () => this.volta(false);
    $('#bleLink') && ($('#bleLink').onclick = () => BLE.conectar());
    if (gps && !window.L) carregarLeaflet().then(() => { if (window.L && this.a && !this.mapa && $('#mapaLive')) this.render(); });
    if (gps && window.L) { this.mapa = L.map('mapaLive', { zoomControl: false, attributionControl: false }).setView([-9.66, -35.73], 15); camadaGoogle().addTo(this.mapa); this.linha = L.polyline(this.a.pontos.filter(p => p.lat).map(p => [p.lat, p.lon]), { color: '#00a0df', weight: 5 }).addTo(this.mapa); this.marcador = L.circleMarker([0, 0], { radius: 8, color: '#fff', fillColor: '#00a0df', fillOpacity: 1 }).addTo(this.mapa); }
  },
  ligarGPS() {
    if (!ESPORTES[this.a.tipo].gps || !navigator.geolocation) return;
    this.watch = navigator.geolocation.watchPosition(p => this.ponto(p), e => { $('#gpsTxt') && ($('#gpsTxt').textContent = 'GPS: ' + (e.code === 1 ? 'permissão negada' : 'sem sinal')); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
  },
  ponto(p) {
    const c = p.coords; const acc = c.accuracy || 999;
    const pt = $('#gpsPt'); if (pt) { pt.className = 'pt ' + (acc < 15 ? 'ok' : acc < 40 ? 'med' : 'ruim'); $('#gpsTxt').textContent = `GPS ±${Math.round(acc)} m`; }
    if (acc > 50) return;
    const novo = { t: p.timestamp || Date.now(), lat: c.latitude, lon: c.longitude, alt: c.altitude, vel: c.speed != null && c.speed >= 0 ? c.speed : null, fc: S.fcAtual || null, cad: Podometro.cadencia() || null };
    if (this.marcador) { this.marcador.setLatLng([novo.lat, novo.lon]); if (!this.ultimoPt) this.mapa.setView([novo.lat, novo.lon], 16); else this.mapa.panTo([novo.lat, novo.lon]); }
    if (this.pausado && !this.autoPausado) return;
    if (this.ultimoPt) {
      const d = haversine(this.ultimoPt, novo); const dt = (novo.t - this.ultimoPt.t) / 1000;
      if (d < 1.5 && dt < 10) return; // parado
      const v = dt > 0 ? d / dt : 0; if (v > (this.a.tipo === 'ciclismo' ? 30 : 12)) return; // salto impossível
      if (novo.vel == null) novo.vel = v;
      // auto-pausa
      if (store.get('autopausa', true) && ESPORTES[this.a.tipo].gps) {
        if (v < 0.4) { if (!this.autoPausado && Date.now() - this.ultimoMov > 5000) { this.autoPausado = true; this.pausado = true; this.atualizarBotoes(); toast('Pausa automática'); } }
        else { this.ultimoMov = Date.now(); if (this.autoPausado) { this.autoPausado = false; this.pausado = false; this.atualizarBotoes(); toast('Retomado'); } }
      }
      if (this.pausado) { this.ultimoPt = novo; return; }
      this.a.distancia_m += d;
      if (novo.alt != null && this.ultimoPt.alt != null) { const da = novo.alt - this.ultimoPt.alt; if (Math.abs(da) < 15) { if (da > 0.5) this.a.elevacao_ganho += da; else if (da < -0.5) this.a.elevacao_perda -= da; } }
      if (novo.vel * 3.6 > this.a.velocidade_max) this.a.velocidade_max = novo.vel * 3.6;
      if (this.linha) this.linha.addLatLng([novo.lat, novo.lon]);
      const km = Math.floor(this.a.distancia_m / 1000);
      if (km > this.ultimoKmVoz) { this.ultimoKmVoz = km; if (store.get('autovolta', true)) this.volta(true); if (store.get('voz', true)) { const r = this.ritmoAtual(); falar(`${km} quilômetro${km > 1 ? 's' : ''}. Tempo ${fmtTempo(this.a.duracao_s).replace(':', ' e ')}. ${this.a.tipo === 'ciclismo' ? 'Velocidade média ' + (this.a.distancia_m / this.a.tempo_movimento_s * 3.6).toFixed(1) + ' por hora' : 'Ritmo médio ' + fmtRitmo(this.a.tempo_movimento_s / 60 / (this.a.distancia_m / 1000)).replace(':', ' e ')}`); } }
    } else this.ultimoMov = Date.now();
    this.ultimoPt = novo; this.a.pontos.push(novo);
    if (this.a.pontos.length % 10 === 0) this.persistir();
  },
  ritmoAtual() { const p = this.a.pontos.slice(-5); if (p.length < 2) return null; const d = p.slice(1).reduce((s, x, i) => s + haversine(p[i], x), 0); const t = (p[p.length - 1].t - p[0].t) / 1000; return d > 0 ? (t / 60) / (d / 1000) : null; },
  ligarTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.pausado) { this.a.duracao_s++; this.a.tempo_movimento_s++; if (S.fcAtual) this.a.fcs.push(S.fcAtual); if (!ESPORTES[this.a.tipo].gps && S.fcAtual && this.a.duracao_s % 5 === 0) this.a.pontos.push({ t: Date.now(), fc: S.fcAtual }); }
      else if (!this.autoPausado) { /* pausa manual não conta */ } else this.a.duracao_s++;
      const g = ESPORTES[this.a.tipo].gps;
      $('#vTempo') && ($('#vTempo').textContent = fmtTempo(this.a.duracao_s));
      if (g) { $('#vDist').textContent = (this.a.distancia_m / 1000).toFixed(2).replace('.', ','); const r = this.ritmoAtual(); const vAtual = this.a.pontos.length ? (this.a.pontos[this.a.pontos.length - 1].vel || 0) * 3.6 : 0; $('#vRitmo').textContent = this.a.tipo === 'ciclismo' ? vAtual.toFixed(1) : fmtRitmo(r); $('#vExtra').textContent = Math.round(this.a.elevacao_ganho); const med = this.a.distancia_m > 0 ? (this.a.tipo === 'ciclismo' ? (this.a.distancia_m / this.a.tempo_movimento_s * 3.6).toFixed(1) + ' km/h' : fmtRitmo(this.a.tempo_movimento_s / 60 / (this.a.distancia_m / 1000))) : '--'; $('#vAvg').textContent = `Média ${med} · Máx ${this.a.velocidade_max.toFixed(1)} km/h · ${calorias(this.a.tipo, this.a.duracao_s, this.fcMedia())} kcal${this.autoPausado ? ' · PAUSA AUTO' : ''}`; }
      else { $('#vCal').textContent = calorias(this.a.tipo, this.a.duracao_s, this.fcMedia()); $('#vPassos').textContent = fmtNum(Podometro.total() - this.a.passos0); $('#vExtra').textContent = S.fcAtual ? (zonaDe(S.fcAtual)?.z || 0) : '-'; }
      $('#vFC') && ($('#vFC').textContent = S.fcAtual || '--');
      if (this.a.duracao_s % 15 === 0) this.persistir();
    }, 1000);
  },
  fcMedia() { return this.a.fcs.length ? Math.round(this.a.fcs.reduce((a, b) => a + b) / this.a.fcs.length) : null; },
  togglePausa() { this.pausado = !this.pausado; this.autoPausado = false; if (!this.pausado) this.ultimoPt = null; this.atualizarBotoes(); if (store.get('voz', true)) falar(this.pausado ? 'Pausado' : 'Retomado'); if (navigator.vibrate) navigator.vibrate(60); },
  atualizarBotoes() { const b = $('#cPausa'); if (b) { b.className = 'ctrl ' + (this.pausado ? 'inicio' : 'pausa'); b.textContent = this.pausado ? '▶' : '❚❚'; } },
  volta(auto) { const ag = Date.now(); const v = { seg: this.a.tempo_movimento_s - (this.iniVolta.s || 0), dist: this.a.distancia_m - this.iniVolta.d, auto }; this.a.voltas.push(v); this.iniVolta = { t: ag, d: this.a.distancia_m, s: this.a.tempo_movimento_s }; if (!auto) { toast(`Volta ${this.a.voltas.length}: ${fmtTempo(v.seg)} · ${fmtDist(v.dist)}`); if (navigator.vibrate) navigator.vibrate(40); } },
  async wakeLock() { try { if (store.get('tela', true) && 'wakeLock' in navigator) { this.wake = await navigator.wakeLock.request('screen'); document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && this.a && !this.wake?.released) { } else if (document.visibilityState === 'visible' && this.a) this.wake = await navigator.wakeLock.request('screen').catch(() => null); }); } } catch { } },
  async parar() {
    if (this.a.duracao_s < 5) { if (!confirm('Descartar atividade?')) return; return this.descartar(); }
    this.pausado = true; this.atualizarBotoes();
    const a = this.a; const gps = ESPORTES[a.tipo].gps;
    modal(`<h2>Salvar atividade</h2><div class="grid3 centro" style="margin-bottom:12px"><div><div class="grande" style="font-size:22px">${fmtTempo(a.duracao_s)}</div><div class="mini">tempo</div></div><div><div class="grande" style="font-size:22px">${fmtDist(a.distancia_m)}</div><div class="mini">distância</div></div><div><div class="grande" style="font-size:22px">${calorias(a.tipo, a.duracao_s, this.fcMedia())}</div><div class="mini">kcal</div></div></div>
    <form id="fSalvar"><div class="campo"><label>Nome</label><input name="nome" value="${esc(a.nome)}"></div><div class="campo"><label>Como foi? (esforço 1-10)</label><input type="range" name="esforco" min="1" max="10" value="5"></div><div class="campo"><label>Notas</label><textarea name="notas" rows="2"></textarea></div><button class="btn verde">💾 Salvar</button><button class="btn sec" type="button" id="bRetomar" style="margin-top:8px">Continuar gravando</button><button class="btn perigo" type="button" id="bDesc" style="margin-top:8px">Descartar</button></form>`, () => {
      $('#bRetomar').onclick = () => { fecharModal(); this.pausado = false; this.ultimoPt = null; this.atualizarBotoes(); };
      $('#bDesc').onclick = () => { if (confirm('Descartar mesmo?')) { fecharModal(); this.descartar(); } };
      $('#fSalvar').onsubmit = async e => {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const b = e.target.querySelector('button'); b.disabled = true;
        const fcm = this.fcMedia(); const mov = Math.max(1, a.tempo_movimento_s); const passos = gps ? (a.tipo === 'ciclismo' ? 0 : Math.max(Podometro.total() - a.passos0, Math.round(a.distancia_m / 0.8))) : Podometro.total() - a.passos0;
        const final = { uid: a.uid, tipo: a.tipo, nome: f.nome || a.nome, inicio: a.inicio, fim: dtLocal(new Date()), duracao_s: a.duracao_s, tempo_movimento_s: a.tempo_movimento_s, distancia_m: +a.distancia_m.toFixed(1), calorias: calorias(a.tipo, a.duracao_s, fcm), fc_media: fcm, fc_max: a.fcs.length ? Math.max(...a.fcs) : null, velocidade_media: a.distancia_m ? +(a.distancia_m / mov * 3.6).toFixed(2) : null, velocidade_max: a.velocidade_max ? +a.velocidade_max.toFixed(2) : null, ritmo_medio: a.distancia_m > 50 ? +(mov / 60 / (a.distancia_m / 1000)).toFixed(2) : null, elevacao_ganho: Math.round(a.elevacao_ganho), elevacao_perda: Math.round(a.elevacao_perda), passos, cadencia: passos && a.tipo !== 'ciclismo' ? Math.round(passos / (mov / 60)) : null, esforco: +f.esforco, notas: f.notas, pontos: a.pontos.map(p => ({ t: p.t, lat: p.lat, lon: p.lon, alt: p.alt != null ? +p.alt.toFixed(1) : undefined, vel: p.vel != null ? +p.vel.toFixed(2) : undefined, fc: p.fc || undefined, cad: p.cad || undefined })), voltas: a.voltas };
        const id = await salvarAtividade(final).catch(() => null);
        fecharModal(); this.limpar(); if (store.get('voz', true)) falar('Atividade salva'); if (id) navegar('atividade', id); else navegar('atividades');
      };
    });
  },
  descartar() { this.limpar(); toast('Descartada'); navegar('gravar'); },
  limpar() { clearInterval(this.timer); if (this.watch != null) navigator.geolocation.clearWatch(this.watch); this.wake?.release?.(); this.a = null; store.del('gravando'); },
};
function falar(t) { try { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(t); u.lang = 'pt-BR'; u.rate = 1.05; speechSynthesis.speak(u); } catch { } }

/* ---------- BLE Heart Rate ---------- */
const BLE = {
  dev: null, ultimas: [],
  async conectar() {
    if (!navigator.bluetooth) { toast('Bluetooth Web não disponível neste navegador (use Chrome/Edge no Android)', 4000); return; }
    try {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service', 'device_information'] });
      toast('Conectando a ' + dev.name + '…');
      const srv = await dev.gatt.connect(); const hr = await srv.getPrimaryService('heart_rate'); const ch = await hr.getCharacteristic('heart_rate_measurement');
      await ch.startNotifications();
      ch.addEventListener('characteristicvaluechanged', e => { const v = e.target.value; const flags = v.getUint8(0); const bpm = flags & 1 ? v.getUint16(1, true) : v.getUint8(1); if (bpm > 25 && bpm < 250) { S.fcAtual = bpm; $('#vFC') && ($('#vFC').textContent = bpm); this.ultimas.push({ ts: Date.now(), bpm }); if (this.ultimas.length >= 30) { const l = this.ultimas.splice(0, 30); api('fc_amostra', { amostras: l.filter((_, i) => i % 5 === 0) }).catch(() => { }); } } });
      dev.addEventListener('gattserverdisconnected', () => { S.fcDevice = null; S.fcAtual = null; toast('Sensor FC desconectado'); });
      this.dev = dev; S.fcDevice = dev.name || 'Sensor FC'; toast('💓 ' + S.fcDevice + ' conectado');
      api('dispositivo_salvar', { nome: S.fcDevice, tipo: 'fc', identificador: dev.id }).catch(() => { });
      if (S.tela !== 'gravando' && !Gravador.a) navegar(S.tela, S.arg);
    } catch (x) { if (!/cancel/i.test(x.message)) toast('Falha: ' + x.message, 3500); }
  }
};

/* ---------- Podômetro (acelerômetro) ---------- */
const Podometro = {
  ativo: false, passos: 0, dia: hojeISO(), ultimoPasso: 0, buf: [], tempos: [], enviadoEm: 0,
  total() { if (this.dia !== hojeISO()) { this.dia = hojeISO(); this.passos = 0; } return this.passos; },
  cadencia() { const ag = Date.now(); this.tempos = this.tempos.filter(t => ag - t < 60000); return this.tempos.length; },
  async iniciar(forcar) {
    const salvo = store.get('passos'); if (salvo && salvo.dia === hojeISO()) this.passos = salvo.n; this.dia = hojeISO();
    if (!('DeviceMotionEvent' in window)) return;
    if (typeof DeviceMotionEvent.requestPermission === 'function') { if (!forcar && !store.get('pod_perm')) return; try { const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') return; store.set('pod_perm', 1); } catch { return; } }
    if (this.ativo) return; this.ativo = true;
    window.addEventListener('devicemotion', e => this.amostra(e));
    if (forcar) { toast('Podômetro ativado'); $('#podStat') && ($('#podStat').textContent = 'ativo'); }
  },
  amostra(e) {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); this.buf.push(mag); if (this.buf.length > 8) this.buf.shift();
    const med = this.buf.reduce((x, y) => x + y, 0) / this.buf.length; const ag = Date.now();
    if (mag - med > 1.6 && ag - this.ultimoPasso > 280) { this.ultimoPasso = ag; this.total(); this.passos++; this.tempos.push(ag); if (this.passos % 20 === 0) { store.set('passos', { dia: this.dia, n: this.passos }); if (ag - this.enviadoEm > 60000) { this.enviadoEm = ag; api('metrica_salvar', { tipo: 'passos', valor: this.passos, modo: 'max' }).catch(() => { }); } } }
  }
};

/* ---------- lembretes ---------- */
function lembretes() {
  if (!('Notification' in window)) return;
  const cfg = store.get('lembretes', { agua: true, mover: true });
  if (Notification.permission === 'granted') {
    setInterval(() => { const h = new Date().getHours(); if (cfg.agua && h >= 8 && h <= 21 && new Date().getMinutes() === 0) new Notification('💧 Hora de beber água', { body: 'Registre sua hidratação no Garmin Connect', icon: 'icons/icon-192.png' }); }, 60000);
  }
}

/* ---------- ESTATÍSTICAS / MEDALHAS / RECORDES ---------- */
async function renderEstatisticas() {
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="inicio">‹</button><h1>Desempenho</h1></div></div><div id="est"><div class="mini centro">Carregando…</div></div>${tabbar('inicio')}</div>`;
  const j = await apiGet('estatisticas'); const tem = new Set(j.medalhas.map(m => m.codigo));
  $('#est').innerHTML = `<div class="card"><h3>Totais por esporte</h3><table class="tabela"><tr><th>Esporte</th><th>Ativ.</th><th>Distância</th><th>Tempo</th><th>kcal</th></tr>${j.por_tipo.map(t => `<tr><td>${ESPORTES[t.tipo]?.i || ''} ${ESPORTES[t.tipo]?.n || t.tipo}</td><td>${t.n}</td><td>${fmtDist(t.d)}</td><td>${fmtTempo(t.t)}</td><td>${fmtNum(t.c)}</td></tr>`).join('') || '<tr><td colspan=5 class="mini">Sem atividades</td></tr>'}</table></div>
  <div class="card"><h3>Recordes pessoais</h3>${j.recordes.length ? `<div class="lista">${j.recordes.map(r => `<div class="item" data-tela="atividade" data-arg="${r.atividade.id}"><div class="ic">🏅</div><div class="info"><b>${ESPORTES[r.tipo].n} ${r.distancia >= 1000 ? (r.distancia / 1000).toFixed(r.distancia % 1000 ? 3 : 0).replace('.', ',') + ' km' : r.distancia + ' m'}</b><span>${fmtData(r.atividade.inicio)}</span></div><div class="dir"><b>${fmtTempo(r.tempo_est)}</b>${fmtRitmo(r.tempo_est / 60 / (r.distancia / 1000))}/km</div></div>`).join('')}</div>` : '<div class="mini">Complete corridas de 1 km ou mais para gerar recordes</div>'}${j.maior_distancia.map(m => `<div class="mini" style="margin-top:6px">Maior distância em ${ESPORTES[m.tipo]?.n || m.tipo}: <b>${fmtDist(m.distancia_m)}</b></div>`).join('')}<div class="mini" style="margin-top:6px">Máximo de passos em um dia: <b>${fmtNum(j.max_passos)}</b></div></div>
  <div class="card"><h3>Mensal</h3><canvas class="graf" id="gMes"></canvas><table class="tabela">${j.meses.map(m => `<tr><td>${m.mes.split('-').reverse().join('/')}</td><td>${m.n} ativ.</td><td>${fmtDist(m.d)}</td><td>${fmtTempo(m.t)}</td></tr>`).join('')}</table></div>
  <div class="card"><h3>Medalhas (${tem.size}/${Object.keys(j.catalogo).length})</h3><div class="medalhas">${Object.entries(j.catalogo).map(([k, m]) => `<div class="medalha ${tem.has(k) ? '' : 'off'}" title="${esc(m.desc)}"><div class="i">${m.icone}</div>${m.nome}</div>`).join('')}</div></div>`;
  const ms = j.meses.slice().reverse(); grafBarras($('#gMes'), ms.map(m => +m.d / 1000), '#00a0df', 0, ms.map(m => m.mes.slice(5)));
}

/* ---------- TREINOS ---------- */
async function renderTreinos() {
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="inicio">‹</button><h1>Treinos</h1></div><button class="ico-btn" id="bNovo">+</button></div><div id="tr"></div>${tabbar('inicio')}</div>`;
  const j = await apiGet('treinos');
  $('#tr').innerHTML = j.itens.length ? `<div class="card lista">${j.itens.map(t => `<div class="item"><div class="ic">${t.concluido ? '✅' : ESPORTES[t.tipo]?.i || '📋'}</div><div class="info"><b>${esc(t.nome)}</b><span>${t.agendado ? new Date(t.agendado + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' : ''}${t.etapas.map(e => e.tipo + ' ' + e.valor + (e.unidade || '')).join(' → ')}</span></div><button class="btn peq ${t.concluido ? 'sec' : ''}" data-id="${t.id}" data-c="${t.concluido ? 0 : 1}">${t.concluido ? 'Reabrir' : 'Concluir'}</button><button class="ico-btn" data-del="${t.id}">🗑</button></div>`).join('')}</div>` : '<div class="vazio"><div class="i">📋</div>Nenhum treino planejado.<br>Crie treinos com etapas (aquecimento, intervalos, recuperação).</div>';
  $('#tr').querySelectorAll('[data-c]').forEach(b => b.onclick = async () => { const t = j.itens.find(x => x.id == b.dataset.id); await api('treino_salvar', { ...t, concluido: +b.dataset.c }); renderTreinos(); });
  $('#tr').querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Excluir treino?')) { await api('treino_excluir', { id: +b.dataset.del }); renderTreinos(); } });
  $('#bNovo').onclick = () => modal(`<h2>Novo treino</h2><form id="fTr"><div class="campo"><label>Nome</label><input name="nome" required placeholder="Ex.: Intervalado 6x400m"></div><div class="linha"><div class="campo"><label>Esporte</label><select name="tipo">${Object.entries(ESPORTES).map(([k, v]) => `<option value="${k}">${v.i} ${v.n}</option>`).join('')}</select></div><div class="campo"><label>Data</label><input type="date" name="agendado"></div></div><div class="campo"><label>Etapas (uma por linha: tipo valor unidade — ex.: Aquecimento 10 min)</label><textarea name="etapas" rows="5">Aquecimento 10 min
Corrida 5 km
Desaquecimento 5 min</textarea></div><button class="btn">Salvar</button></form>`, () => { $('#fTr').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const etapas = f.etapas.split('\n').filter(Boolean).map(l => { const m = l.trim().match(/^(.+?)\s+([\d.,]+)\s*(\S*)$/); return m ? { tipo: m[1], valor: m[2], unidade: m[3] } : { tipo: l, valor: '', unidade: '' }; }); await api('treino_salvar', { nome: f.nome, tipo: f.tipo, agendado: f.agendado, etapas }); fecharModal(); renderTreinos(); }; });
}

/* ---------- PERFIL ---------- */
function renderPerfil(ancora) {
  const u = S.usuario, m = S.metas;
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Perfil</h1><button class="ico-btn" id="bSair" title="Sair">${svg('<path d="M12 3.5v8M7 6.3a7 7 0 1 0 10 0"/>')}</button></div>
  <div class="card centro"><div style="width:80px;height:80px;border-radius:50%;background:var(--azul2);margin:0 auto 8px;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700">${esc(u.nome[0].toUpperCase())}</div><div style="font-size:20px;font-weight:700">${esc(u.nome)}</div><div class="mini">${esc(u.email)} · membro desde ${new Date(u.criado.replace(' ', 'T')).toLocaleDateString('pt-BR')}</div></div>
  <div class="card"><h3>Dados pessoais</h3><form id="fPerfil"><div class="campo"><label>Nome</label><input name="nome" value="${esc(u.nome)}"></div><div class="linha"><div class="campo"><label>Nascimento</label><input type="date" name="nascimento" value="${u.nascimento || ''}"></div><div class="campo"><label>Sexo</label><select name="sexo"><option value="">—</option><option value="M" ${u.sexo === 'M' ? 'selected' : ''}>Masculino</option><option value="F" ${u.sexo === 'F' ? 'selected' : ''}>Feminino</option><option value="O" ${u.sexo === 'O' ? 'selected' : ''}>Outro</option></select></div></div><div class="linha"><div class="campo"><label>Altura (cm)</label><input type="number" name="altura_cm" value="${u.altura_cm || ''}"></div><div class="campo"><label>Peso (kg)</label><input type="number" step="0.1" name="peso_kg" value="${u.peso_kg || ''}"></div></div><div class="linha"><div class="campo"><label>FC máxima</label><input type="number" name="fc_max" value="${u.fc_max || ''}"></div><div class="campo"><label>FC repouso</label><input type="number" name="fc_repouso" value="${u.fc_repouso || ''}"></div></div><div class="campo"><label>E-mail para recuperar a senha</label><input type="email" name="email_recuperacao" value="${esc(u.email_recuperacao || '')}" placeholder="${/@/.test(u.email) ? esc(u.email) : 'seu@email.com'}"></div><div class="campo"><label>Nova senha (opcional)</label><input type="password" name="senha_nova" autocomplete="new-password"></div><button class="btn">Salvar perfil</button></form></div>
  <div class="card"><h3>Metas diárias</h3><form id="fMetas"><div class="linha"><div class="campo"><label>Passos</label><input type="number" name="passos" value="${m.passos}"></div><div class="campo"><label>Calorias ativas</label><input type="number" name="calorias" value="${m.calorias}"></div></div><div class="linha"><div class="campo"><label>Água (ml)</label><input type="number" name="agua_ml" value="${m.agua_ml}"></div><div class="campo"><label>Sono (h)</label><input type="number" step="0.5" name="sono_h" value="${m.sono_h}"></div></div><div class="linha"><div class="campo"><label>Min. intensidade/semana</label><input type="number" name="minutos_intensidade" value="${m.minutos_intensidade}"></div><div class="campo"><label>Distância/semana (km)</label><input type="number" step="0.5" name="distancia_semana_km" value="${m.distancia_semana_km}"></div></div><div class="campo"><label>Peso alvo (kg)</label><input type="number" step="0.1" name="peso_alvo" value="${m.peso_alvo || ''}"></div><button class="btn">Salvar metas</button></form></div>
  <div class="card"><h3>Zonas de frequência cardíaca</h3>${zonasFC().map(z => `<div class="zona"><span class="z" style="background:${z.cor}">${z.z}</span>${z.n}<span class="mini" style="margin-left:auto">${z.de}–${z.ate} bpm</span></div>`).join('')}<div class="mini">Baseadas na FC máx ${u.fc_max}${!S.usuario.fc_max ? ' (220 − idade)' : ''}</div></div>
  <div class="card"><h3>Dispositivos e sensores</h3><div id="devs" class="mini">…</div><button class="btn sec peq" id="bBle4" style="margin-top:8px">📡 Conectar sensor FC</button> <button class="btn sec peq" id="bPod" style="margin-top:8px">👟 Ativar podômetro</button></div>
  <div class="card"><h3>Notificações</h3><label style="display:flex;justify-content:space-between;padding:6px 0"><span>Lembrete de água (de hora em hora)</span><input type="checkbox" id="nAgua" ${store.get('lembretes', { agua: true }).agua ? 'checked' : ''}></label><button class="btn sec peq" id="bNotif">Permitir notificações</button></div>
  <div class="card" id="cInteg"><h3>Integrações (relógios)</h3><div id="integ" class="mini">Carregando…</div></div>
  <div class="card"><h3>Dados</h3><a class="btn sec" href="api.php?acao=exportar_tudo" download>⬇ Exportar todos os dados (JSON)</a><div class="mini centro" style="margin-top:8px">Garmin Connect (clone) v${window.APP_VERSAO} · ${store.get('pendentes', []).length} atividade(s) pendente(s)</div></div>${tabbar('perfil')}</div>`;
  $('#bSair').onclick = async () => { if (confirm('Sair da conta?')) { await api('sair', {}); store.del('usuario'); store.del('dash'); renderLogin(); } };
  $('#fPerfil').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const j = await api('perfil_salvar', f); S.usuario = j.usuario; store.set('usuario', j.usuario); toast('Perfil salvo'); renderPerfil(); };
  $('#fMetas').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const j = await api('metas_salvar', f); S.metas = j.metas; store.set('metas', j.metas); toast('Metas salvas'); };
  $('#bBle4').onclick = () => BLE.conectar(); $('#bPod').onclick = () => Podometro.iniciar(true);
  $('#nAgua').onchange = e => store.set('lembretes', { agua: e.target.checked });
  $('#bNotif').onclick = async () => { const r = await Notification.requestPermission(); toast(r === 'granted' ? 'Notificações permitidas' : 'Não permitido'); if (r === 'granted') lembretes(); };
  renderIntegracoes().then(() => { if (ancora === 'integracoes') $('#integ')?.closest('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  { const sv = new URLSearchParams(location.search).get('strava'); if (sv) { toast({ ok: '🟧 Strava conectado!', negado: 'Autorização cancelada no Strava', erro: 'Não foi possível conectar ao Strava. Tente de novo.', semapp: 'O Strava ainda não foi configurado pelo administrador.' }[sv] || sv, 4000); history.replaceState(null, '', location.pathname); } }
  apiGet('dispositivos').then(j => { $('#devs').innerHTML = (j.itens.length ? j.itens.map(d => `💓 ${esc(d.nome)} — último uso ${new Date(d.ultimo_uso.replace(' ', 'T')).toLocaleDateString('pt-BR')}`).join('<br>') : 'Nenhum sensor pareado ainda') + `<br>📱 Este celular — GPS ${'geolocation' in navigator ? '✓' : '✗'}, acelerômetro ${'DeviceMotionEvent' in window ? '✓' : '✗'}, Bluetooth ${navigator.bluetooth ? '✓' : '✗'}`; }).catch(() => { });
}

const PASSOS_GARMIN = `<ol class="passos">
  <li><b>No celular</b>, instale o app <b>Garmin Connect</b>, crie a conta e pareie o seu relógio. Sincronize uma vez pelo app.</li>
  <li>Se a sua conta Garmin tiver <b>verificação em duas etapas</b>, desative em connect.garmin.com → Configurações da conta → Segurança (o modo automático não funciona com ela).</li>
  <li>Toque em <b>Conectar conta Garmin</b> abaixo e informe o <b>mesmo e-mail e senha</b> do app Garmin Connect.</li>
  <li>Toque em <b>Sincronizar agora</b>. Em até 1 minuto chegam atividades com rota, passos, sono, frequência cardíaca, estresse, Body Battery e peso. Depois disso é automático.</li>
  <li><b>Opcional:</b> para bateria e GPS ao vivo do relógio, gere o app na aba <b>App</b>.</li></ol>`;
async function pintarEnvioStrava(st) {
  const el = $('#stEnvio'); if (!el) return;
  const e = await apiGet('strava_estado').catch(() => null); if (!e?.ok || !$('#stEnvio')) return;
  const pct = e.total ? Math.round(e.enviados / e.total * 100) : 0;
  el.innerHTML = `<div class="mini" style="margin-top:10px"><b style="color:#fff">Enviar treinos do relógio para o Strava</b></div>
   <div class="barra" style="margin:8px 0"><i style="width:${pct}%;background:#fc4c02"></i></div>
   <div class="mini">${e.enviados} de ${e.total} enviados${e.fila ? ` · ${e.fila} na fila (vai aos poucos, respeitando o limite do Strava)` : ''}${e.erros ? ` · <span style="color:#ef4b5b">${e.erros} com erro</span>` : ''}</div>
   ${e.ultimos_erros.map(x => `<div class="mini" style="color:#ef4b5b">• ${esc(x.nome)}: ${esc(x.erro || '')}</div>`).join('')}
   ${st.envio ? '' : '<div class="mini" style="color:#fb8c1e;margin-top:6px">Para enviar, toque em Reconectar e permita “enviar atividades” no Strava.</div>'}
   <label class="linha-chk"><input type="checkbox" id="stAuto" ${st.enviar_auto ? 'checked' : ''}> Enviar novos treinos automaticamente</label>
   <button class="btn peq strava-bt" id="stTodos" ${st.envio ? '' : 'disabled'}>⬆ Enviar todos os treinos para o Strava</button>`;
  $('#stAuto').onchange = async ev => { try { await api('strava_auto', { ligado: ev.target.checked ? 1 : 0 }); toast(ev.target.checked ? 'Novos treinos vão para o Strava' : 'Envio automático desligado'); } catch (x) { toast(x.message); } };
  $('#stTodos').onclick = async () => { if (!confirm(`Enviar ${e.total - e.enviados} treino(s) para o Strava? Os que já estão lá não são repetidos.`)) return; try { await api('strava_enviar_todos', {}); toast('Treinos na fila — o envio começa em até 1 minuto', 4000); pintarEnvioStrava(st); } catch (x) { toast(x.message, 4000); } };
  if (e.fila && S.tela === 'perfil') setTimeout(() => pintarEnvioStrava(st), 15000);
}
async function renderIntegracoes() {
  const j = await apiGet('integracoes').catch(() => null); if (!j) return;
  const g = j.itens.garmin, st = j.itens.strava;
  const stat = x => !x ? '<span style="color:#9aa0a6">não configurado</span>' : x.status === 'ok' ? `<span style="color:#3ddc84">✓ sincronizado ${x.ultimo_sync ? fmtData(x.ultimo_sync) : ''}</span>` : x.status === 'erro' ? `<span style="color:#ff4d4f">erro: ${esc(x.erro || '')}</span>` : '<span style="color:#ff8a00">⏳ aguardando sincronização</span>';
  $('#integ').innerHTML = `<div style="margin-bottom:14px"><b style="color:#fff;font-size:14px">⌚ Garmin (relógios Garmin)</b><br>${stat(g)}${!g || g.status === 'erro' ? `<details class="guia" ${!g ? 'open' : ''}><summary>Passo a passo para conectar</summary>${PASSOS_GARMIN}</details>` : ''}${g?.email ? '<br>Conta: ' + esc(g.email) : ''}<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn peq" id="iGar">${g ? 'Alterar conta' : 'Conectar conta Garmin'}</button>${g ? '<button class="btn sec peq" data-sync="garmin">Sincronizar agora</button><button class="btn sec peq" data-rm="garmin">Remover</button>' : ''}</div></div>
  <div class="strava-bloco"><b style="color:#fff;font-size:14px">🟧 Strava</b><br>${st?.conectado ? `<span style="color:#3ddc84">✓ conectado${st.atleta ? ' como ' + esc(st.atleta) : ''}</span>` : stat(st)}
   <div class="mini" style="margin:6px 0">${st?.conectado ? 'Traz os treinos do Strava (ex.: Haylou) e envia os treinos do seu relógio para o Strava.' : 'Toque em <b>Conectar com Strava</b>, entre com o <b>e-mail e a senha do Strava</b> na página do próprio Strava e toque em <b>Autorizar</b> (deixe marcada a opção de enviar atividades).'}</div>
   <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn peq strava-bt" id="iStr">${st?.conectado ? (st.envio ? 'Reconectar' : 'Reconectar (permitir envio)') : 'Conectar com Strava'}</button>${st ? '<button class="btn sec peq" data-sync="strava">Buscar do Strava</button><button class="btn sec peq" data-rm="strava">Desconectar</button>' : ''}</div>
   ${st?.conectado ? `<div class="strava-envio" id="stEnvio"><div class="mini">Carregando envio…</div></div>` : ''}</div>`;
  $('#iGar').onclick = () => modal(`<h2>⌚ Conta Garmin Connect</h2><p class="mini">Use o <b>mesmo e-mail e senha do app Garmin Connect</b>. O servidor sincroniza sozinho (a cada minuto de forma leve e a cada 30 min completo). Contas com verificação em duas etapas não funcionam no modo automático.</p><form id="fGar"><div class="campo"><label>E-mail Garmin</label><input name="email" type="email" value="${esc(g?.email || '')}" required></div><div class="campo"><label>Senha Garmin</label><input name="senha" type="password" required></div><button class="btn">Salvar e sincronizar</button></form>`, () => { $('#fGar').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await api('integracao_salvar', { servico: 'garmin', ...f }); await api('sincronizar_agora', {}); fecharModal(); toast('Conta salva — sincronizando em até 1 min'); renderIntegracoes(); }; });
  if (st?.conectado) pintarEnvioStrava(st);
  $('#iStr').onclick = () => { if (j.itens.strava_plataforma || st?.client_id) { location.href = 'strava.php'; return; } modal(`<h2>⌚ Conectar o Strava</h2><p class="mini"><b>Dá para entrar com a conta Google</b>: na página do Strava que abre ao autorizar, toque em <b>“Entrar com o Google”</b>.<br><br>Antes, só uma vez, é preciso uma “chave de acesso” do Strava — <b>é grátis, não precisa do plano pago</b>:<br>1) Abra <a href="https://www.strava.com/settings/api" target="_blank">strava.com/settings/api</a> (entre com o Google).<br>2) Crie o aplicativo: nome livre, site <b>alequizao.com</b>, <b>Authorization Callback Domain: alequizao.com</b>.<br>3) Copie o <b>Client ID</b> e o <b>Client Secret</b> abaixo e toque em Salvar — em seguida você autoriza com o Google.</p><form id="fStr"><div class="campo"><label>Client ID</label><input name="client_id" required inputmode="numeric"></div><div class="campo"><label>Client Secret</label><input name="client_secret" required></div><button class="btn">Salvar e autorizar</button></form>`, () => { $('#fStr').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); await api('integracao_salvar', { servico: 'strava', ...f }); location.href = 'strava.php'; }; }); };
  $('#integ').querySelectorAll('[data-sync]').forEach(b => b.onclick = async () => { await api('sincronizar_agora', {}); toast('Sincronização solicitada (até 1 min)'); setTimeout(renderIntegracoes, 20000); });
  $('#integ').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (confirm('Remover integração?')) { await api('integracao_remover', { servico: b.dataset.rm }); renderIntegracoes(); } });
}
boot();

/* ---------- MAPA (onde está o relógio) ---------- */
const TILE_GOOGLE = 'https://mt{s}.google.com/vt/lyrs=y,traffic&x={x}&y={y}&z={z}&s=Galil';
/* Leaflet sob demanda: so baixa CSS+JS quando uma tela com mapa abre */
function carregarLeaflet() {
  if (window.L) return Promise.resolve();
  if (window.__leafletP) return window.__leafletP;
  const base = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = base + 'leaflet.min.css'; document.head.appendChild(css);
  return window.__leafletP = new Promise(ok => { const js = document.createElement('script'); js.src = base + 'leaflet.min.js'; js.onload = ok; js.onerror = () => { window.__leafletP = null; ok(); }; document.head.appendChild(js); });
}
function camadaGoogle() { return L.tileLayer(TILE_GOOGLE, { subdomains: ['0', '1', '2', '3'], maxZoom: 21 }); }
const tempoAtras = ts => { if (!ts) return '--'; const s = Math.round(Date.now() / 1000 - ts); if (s < 60) return 'agora'; if (s < 3600) return Math.round(s / 60) + ' min atrás'; if (s < 86400) return Math.round(s / 3600) + ' h atrás'; return Math.round(s / 86400) + ' dia(s) atrás'; };
let mapaTimer = null;
async function renderMapa() {
  clearTimeout(mapaTimer);
  if (!window.L) { await carregarLeaflet(); if (S.tela !== 'mapa') return; }
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Mapa</h1><div class="acoes"><button class="ico-btn" id="mLive" title="Adicionar link do LiveTrack">📡</button><button class="ico-btn" id="mCentro" title="Centralizar">🎯</button></div></div>
  <div class="card" style="padding:0;overflow:hidden"><div id="mapaG" style="height:52vh;min-height:320px"></div></div>
  <div class="grid2"><div class="card"><h3>Posição atual</h3><div id="mPos" class="mini">Carregando…</div></div><div class="card"><h3>Relógio</h3><div id="mRel" class="mini">…</div></div></div>
  <div class="card"><h3>Camadas</h3><label class="linha-chk"><input type="checkbox" id="cRotas" checked> Todas as rotas (mapa de calor)</label><label class="linha-chk"><input type="checkbox" id="c24" checked> Trilha das últimas 24 h</label><label class="linha-chk"><input type="checkbox" id="cLive" checked> LiveTrack</label><div class="mini" style="margin-top:6px">As posições vêm do app <b>Rastreador Alequizão</b> no relógio (a cada 5 min), do LiveTrack durante treinos e das rotas gravadas. Tudo também chega ao Traccar no dispositivo <b>garminalex</b>.</div></div>
  <div class="card"><h3>App no relógio</h3><div class="mini">1) Conecte o Forerunner 165 no computador pelo cabo USB.<br>2) Baixe o arquivo abaixo e copie para a pasta <b>GARMIN/APPS</b> do relógio.<br>3) Desconecte, abra o app <b>Rastreador Alequizão</b> no relógio uma vez e aperte START.<br>O envio automático passa a acontecer a cada 5 min enquanto o celular estiver com o Garmin Connect aberto em segundo plano e o Bluetooth ligado.</div><button class="btn sec" style="margin-top:10px" data-tela="app">📲 Gerar / baixar app do relógio</button></div>
  ${tabbar('mapa')}</div>`;
  const mapa = L.map('mapaG', { zoomControl: false, attributionControl: false }).setView([-9.6, -35.73], 12); camadaGoogle().addTo(mapa);
  const grupos = { rotas: L.layerGroup().addTo(mapa), t24: L.layerGroup().addTo(mapa), live: L.layerGroup().addTo(mapa), atual: L.layerGroup().addTo(mapa) };
  let atual = null, primeira = true;
  const cores = { corrida: '#ff4d4f', ciclismo: '#ffd23f', caminhada: '#3ddc84', trilha: '#a76cff' };
  async function carregar() {
    if (S.tela !== 'mapa' || !$('#mapaG')) return;
    let j; try { j = await apiGet('mapa'); } catch { mapaTimer = setTimeout(carregar, 30000); return; }
    Object.values(grupos).forEach(g => g.clearLayers());
    j.rotas.forEach(r => L.polyline(r.ll, { color: cores[r.tipo] || '#00a0df', weight: 3, opacity: .45 }).bindPopup(`<b>${esc(r.nome)}</b><br>${fmtData(r.inicio)} · ${fmtDist(r.distancia_m)}`).on('click', () => { }).addTo(grupos.rotas));
    if (j.trilha24h.length > 1) L.polyline(j.trilha24h.map(p => [p.lat, p.lon]), { color: '#fff', weight: 4, dashArray: '6 6' }).addTo(grupos.t24);
    if (j.live_pontos.length) L.polyline(j.live_pontos.map(p => [p.lat, p.lon]), { color: '#00e5ff', weight: 5 }).addTo(grupos.live);
    atual = j.atual;
    if (atual) {
      const ic = L.divIcon({ className: '', html: '<div class="pino-relogio">⌚</div>', iconSize: [40, 40], iconAnchor: [20, 20] });
      L.marker([atual.lat, atual.lon], { icon: ic }).bindPopup(`<b>${esc(atual.fonte)}</b><br>${tempoAtras(atual.ts)}${atual.fc ? '<br>❤️ ' + atual.fc + ' bpm' : ''}`).addTo(grupos.atual);
      if (primeira) mapa.setView([atual.lat, atual.lon], 16);
      $('#mPos').innerHTML = `<b style="color:#fff">${tempoAtras(atual.ts)}</b><br>${esc(atual.fonte)}<br>${new Date(atual.ts * 1000).toLocaleString('pt-BR')}<br><a href="https://www.google.com/maps?q=${atual.lat},${atual.lon}" target="_blank">${atual.lat.toFixed(5)}, ${atual.lon.toFixed(5)}</a>`;
    } else $('#mPos').textContent = 'Sem posição ainda';
    if (primeira && !atual && j.rotas.length) mapa.fitBounds(j.rotas[0].ll);
    primeira = false;
    const r = j.relogio;
    $('#mRel').innerHTML = r ? `🔋 <b style="color:#fff">${Math.round(r.bateria)}%</b>${+r.carregando ? ' ⚡ carregando' : ''}${r.bateria_dias ? ' · ~' + Math.round(r.bateria_dias) + ' dias' : ''}<br>${r.fc ? '❤️ ' + r.fc + ' bpm · ' : ''}${r.passos != null ? '👟 ' + fmtNum(r.passos) : ''}<br>${r.body_battery != null ? '⚡ Body Battery ' + r.body_battery + ' · ' : ''}${r.estresse != null ? '🧠 ' + r.estresse : ''}<br>Última leitura ${tempoAtras(Date.parse(r.recebido.replace(' ', 'T')) / 1000)}`
      : 'O app do relógio ainda não enviou nada. Instale o app abaixo.';
    if (j.live && j.live.status === 'ativa') $('#mRel').innerHTML += `<br><b style="color:#00e5ff">● LiveTrack ao vivo</b> (${j.live.pontos} pontos)`;
    mapaTimer = setTimeout(carregar, alternado(20000, 40000));
  }
  const alternado = (a, b) => a + Math.random() * (b - a);
  $('#cRotas').onchange = e => e.target.checked ? grupos.rotas.addTo(mapa) : grupos.rotas.remove();
  $('#c24').onchange = e => e.target.checked ? grupos.t24.addTo(mapa) : grupos.t24.remove();
  $('#cLive').onchange = e => e.target.checked ? grupos.live.addTo(mapa) : grupos.live.remove();
  $('#mCentro').onclick = () => atual && mapa.setView([atual.lat, atual.lon], 17);
  $('#mLive').onclick = () => modal(`<h2>📡 LiveTrack</h2><p class="mini">Os links de LiveTrack enviados para <b>alequizao.dev@gmail.com</b> entram sozinhos. Para acompanhar um link manualmente, cole abaixo.</p><div class="campo"><label>Link do LiveTrack</label><input id="ltUrl" placeholder="https://livetrack.garmin.com/session/…/token/…"></div><button class="btn" id="ltOk">Acompanhar</button>`, () => { $('#ltOk').onclick = async () => { try { await api('livetrack_add', { url: $('#ltUrl').value }); fecharModal(); toast('LiveTrack adicionado'); } catch (x) { toast(x.message); } }; });
  carregar();
}

/* ---------- RELATÓRIOS (o que o relógio não mostra) ---------- */
async function renderRelatorios() {
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="inicio">‹</button><h1>Relatórios</h1></div></div><div id="rel"><div class="card"><div class="mini centro">Calculando…</div></div></div>${tabbar('inicio')}</div>`;
  let j; try { j = await apiGet('relatorios'); } catch { $('#rel').innerHTML = '<div class="vazio">Sem conexão</div>'; return; }
  if (!j.ok) { $('#rel').innerHTML = `<div class="vazio">${esc(j.erro || 'Erro')}</div>`; return; }
  const dia = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const ult = j.carga[j.carga.length - 1] || {};
  const nomeDist = d => ({ 400: '400 m', 1000: '1 km', 1609: '1 milha', 3000: '3 km', 5000: '5 km', 10000: '10 km', 21097: 'Meia maratona' }[d] || d + ' m');
  const maxHeat = Math.max(1, ...j.heatmap.flat());
  const cor = r => r == null ? '#555' : Math.abs(r) >= .5 ? (r > 0 ? '#3ddc84' : '#ff4d4f') : Math.abs(r) >= .3 ? '#ffd23f' : '#9aa0a6';
  const forca = r => r == null ? 'poucos dados' : Math.abs(r) >= .7 ? 'forte' : Math.abs(r) >= .5 ? 'moderada' : Math.abs(r) >= .3 ? 'fraca' : 'sem relação';
  const zonasCores = ['#555', '#9aa0a6', '#00a0df', '#3ddc84', '#ff8a00', '#ff4d4f'];
  const sono = j.sono.slice(-14);
  $('#rel').innerHTML = `
  <div class="card"><h3>💡 Destaques</h3>${j.insights.map(t => `<div class="insight">${esc(t)}</div>`).join('') || '<div class="mini">Ainda poucos dados</div>'}</div>

  <div class="card"><h3>Forma × fadiga (modelo de Banister)</h3>
   <div class="grid3 centro"><div><div class="grande" style="color:#00a0df">${ult.ctl ?? '--'}</div><div class="mini">Forma (42 d)</div></div><div><div class="grande" style="color:#ff8a00">${ult.atl ?? '--'}</div><div class="mini">Fadiga (7 d)</div></div><div><div class="grande" style="color:${(ult.tsb ?? 0) >= 0 ? '#3ddc84' : '#ff4d4f'}">${ult.tsb ?? '--'}</div><div class="mini">Equilíbrio</div></div></div>
   <canvas class="graf" id="gForma"></canvas><div class="mini centro"><span style="color:#00a0df">■</span> forma <span style="color:#ff8a00">■</span> fadiga <span style="color:#3ddc84">■</span> equilíbrio — últimos 120 dias</div></div>

  <div class="card"><h3>Risco de lesão (ACWR) <span class="mini">${ult.acwr ?? '--'}</span></h3><canvas class="graf" id="gAcwr"></canvas><div class="mini centro">Carga aguda (7 d) ÷ crônica (28 d). Ideal entre 0,8 e 1,3; acima de 1,5 = risco alto.</div></div>

  <div class="card"><h3>Consistência</h3><div class="grid3 centro"><div><div class="grande">${j.sequencia_semanas}</div><div class="mini">semanas seguidas ativas</div></div><div><div class="grande">${j.projecao.proj_mes}</div><div class="mini">km previstos no mês (${j.projecao.km_mes} feitos)</div></div><div><div class="grande">${j.projecao.proj_ano}</div><div class="mini">km previstos no ano (${j.projecao.km_ano} feitos)</div></div></div><canvas class="graf" id="gSem"></canvas><div class="mini centro">km por semana — 16 semanas</div></div>

  <div class="card"><h3>Eficiência aeróbica por corrida</h3><canvas class="graf" id="gEf"></canvas><div class="mini centro">Metros por minuto a cada 100 bpm (mais alto = mais rápido gastando menos coração)</div>
   <table class="tabela" style="margin-top:8px"><tr><th>Data</th><th>km</th><th>Ritmo</th><th>FC</th><th>Desacopl.</th><th>Deriva</th><th>Clima</th></tr>${j.corridas.slice().reverse().map(c => `<tr data-tela="atividade" data-arg="${c.id}"><td>${new Date(c.data.replace(' ', 'T')).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</td><td>${c.km}</td><td>${fmtRitmo(c.ritmo)}</td><td>${c.fc ?? '--'}</td><td style="color:${c.desacoplamento == null ? '' : c.desacoplamento > 5 ? '#ff8a00' : '#3ddc84'}">${c.desacoplamento ?? '--'}%</td><td>${c.deriva != null ? (c.deriva > 0 ? '+' : '') + c.deriva : '--'}</td><td>${c.temp_c != null ? c.temp_c + '° ' + (c.umidade ?? '') + '%' : '--'}</td></tr>`).join('')}</table>
   <div class="mini">Desacoplamento: quanto sua eficiência cai da 1ª para a 2ª metade (até 5% = boa base aeróbica). Deriva: quanto a FC subiu do início ao fim.</div></div>

  <div class="card"><h3>Melhores esforços reais (medidos no GPS)</h3><table class="tabela"><tr><th>Distância</th><th>Tempo</th><th>Ritmo</th><th>Quando</th></tr>${j.recordes.map(r => `<tr data-tela="atividade" data-arg="${r.melhor.id}"><td>${nomeDist(r.dist)}</td><td><b>${fmtTempo(r.melhor.seg)}</b></td><td>${fmtRitmo(r.melhor.seg / 60 / (r.dist / 1000))}/km</td><td>${new Date(r.melhor.data.replace(' ', 'T')).toLocaleDateString('pt-BR')}</td></tr>`).join('')}</table>
   ${j.previsoes ? `<div class="mini" style="margin-top:8px">Previsões da Garmin: 5 km <b>${fmtTempo(j.previsoes.time5K)}</b> · 10 km <b>${fmtTempo(j.previsoes.time10K)}</b> · 21 km <b>${fmtTempo(j.previsoes.timeHalfMarathon)}</b> · 42 km <b>${fmtTempo(j.previsoes.timeMarathon)}</b></div>` : ''}
   <canvas class="graf" id="gRec5"></canvas><div class="mini centro">Evolução do seu melhor 1 km em cada corrida (menor = melhor)</div></div>

  <div class="card"><h3>Tempo em zonas de FC por semana</h3><div id="zonasSem"></div><div class="mini">${['Repouso', 'Z1 aquecimento', 'Z2 fácil', 'Z3 aeróbico', 'Z4 limiar', 'Z5 máximo'].map((n, i) => `<span style="color:${zonasCores[i]}">■</span> ${n}`).join(' ')}</div><div class="mini" style="margin-top:4px">Regra 80/20: ~80% do tempo deveria ser em Z1–Z2.</div></div>

  <div class="card"><h3>Quando você treina</h3><div class="heat">${j.heatmap.map((l, d) => `<div class="heat-l"><span>${dia[d]}</span>${l.map((v, h) => `<i title="${dia[d]} ${h}h: ${v} min" style="background:rgba(0,160,223,${v ? .15 + .85 * v / maxHeat : .04})"></i>`).join('')}</div>`).join('')}<div class="heat-l mini"><span></span>${[...Array(24)].map((_, h) => `<i style="background:none">${h % 6 ? '' : h}</i>`).join('')}</div></div></div>

  <div class="card"><h3>Sono — regularidade e fases</h3><div class="grid3 centro"><div><div class="grande">${j.sono_resumo.media_h ?? '--'}<small>h</small></div><div class="mini">média 14 noites</div></div><div><div class="grande">±${j.sono_resumo.desvio_deitar_min ?? '--'}<small>min</small></div><div class="mini">variação na hora de deitar</div></div><div><div class="grande">${j.sono_resumo.debito_14d_h}<small>h</small></div><div class="mini">débito vs meta ${j.sono_resumo.meta_h} h</div></div></div>
   <div class="fases">${sono.map(s => { const t = s.profundo + s.rem + s.leve + s.acordado || 1; return `<div class="fase-l"><span>${s.d.slice(8)}/${s.d.slice(5, 7)}</span><div class="fase-b"><i style="width:${s.profundo / t * 100}%;background:#0072ce"></i><i style="width:${s.leve / t * 100}%;background:#00a0df"></i><i style="width:${s.rem / t * 100}%;background:#a76cff"></i><i style="width:${s.acordado / t * 100}%;background:#ff5c8a"></i></div><b>${s.h.toFixed(1)}h</b><span class="mini">${s.deitou ?? ''}→${s.acordou ?? ''}${s.nota ? ' · ' + s.nota : ''}</span></div>`; }).join('')}</div>
   <div class="mini"><span style="color:#0072ce">■</span> profundo <span style="color:#00a0df">■</span> leve <span style="color:#a76cff">■</span> REM <span style="color:#ff5c8a">■</span> acordado · número = nota do sono</div></div>

  <div class="card"><h3>Recuperação: HRV × FC de repouso</h3><canvas class="graf" id="gRec"></canvas><div class="mini centro"><span style="color:#3ddc84">■</span> HRV noturna (ms) <span style="color:#ff4d4f">■</span> FC de repouso — HRV subindo e FC caindo = bem recuperado</div></div>

  <div class="card"><h3>Estresse × Body Battery</h3><canvas class="graf" id="gEst"></canvas><div class="mini centro"><span style="color:#ff8a00">■</span> estresse médio <span style="color:#3ddc84">■</span> Body Battery</div></div>

  <div class="card"><h3>O que afeta seu desempenho (correlações)</h3>${j.correlacoes.map(c => `<div class="corr"><div><b>${esc(c.nome)}</b><div class="mini">${forca(c.r)}${c.n ? ' · ' + c.n + ' amostras' : ''}</div></div><div class="corr-v" style="color:${cor(c.r)}">${c.r ?? '--'}</div></div>`).join('')}<div class="mini">De −1 a +1. Perto de 0 = sem relação; ±0,5 ou mais = relação clara.</div></div>

  <div class="card"><h3>Passos por dia da semana</h3><canvas class="graf" id="gPassos"></canvas></div>

  ${j.idade_fitness ? `<div class="card"><h3>Idade fitness</h3><div class="grid3 centro"><div><div class="grande">${j.idade_fitness.chronologicalAge}</div><div class="mini">idade real</div></div><div><div class="grande">${(+j.idade_fitness.fitnessAge).toFixed(1)}</div><div class="mini">idade fitness</div></div><div><div class="grande" style="color:#3ddc84">${(+j.idade_fitness.achievableFitnessAge).toFixed(1)}</div><div class="mini">possível alcançar</div></div></div>${Object.entries(j.idade_fitness.components || {}).filter(([, v]) => v.targetValue).map(([k, v]) => `<div class="mini">• ${({ vigorousDaysAvg: 'Dias vigorosos/semana', vigorousMinutesAvg: 'Minutos vigorosos/semana', bmi: 'IMC', rhr: 'FC repouso', bodyFat: 'Gordura corporal' })[k] || k}: ${(+v.value).toFixed(1)} → meta ${v.targetValue}</div>`).join('')}</div>` : ''}
  `;
  const c = j.carga;
  grafLinha($('#gForma'), [{ v: c.map(x => x.ctl), cor: '#00a0df' }, { v: c.map(x => x.atl), cor: '#ff8a00' }, { v: c.map(x => x.tsb), cor: '#3ddc84' }]);
  grafLinha($('#gAcwr'), [{ v: c.map(x => x.acwr), cor: '#ffd23f' }, { v: c.map(() => 1.5), cor: '#ff4d4f' }, { v: c.map(() => 0.8), cor: '#555' }], { min: 0 });
  grafBarras($('#gSem'), j.semanas.map(s => s.km), '#00a0df', 0, j.semanas.map(s => s.sem.slice(-2)));
  grafLinha($('#gEf'), [{ v: j.corridas.map(x => x.eficiencia), cor: '#3ddc84' }]);
  const r1 = j.recordes.find(r => r.dist === 1000); if (r1) grafLinha($('#gRec5'), [{ v: r1.historico.map(h => h.seg / 60), cor: '#ff4d4f' }]);
  const zs = Object.entries(j.zonas_semana); const mz = Math.max(1, ...zs.map(([, z]) => z.reduce((a, b) => a + b, 0)));
  $('#zonasSem').innerHTML = zs.map(([w, z]) => `<div class="fase-l"><span>${w.slice(-3)}</span><div class="fase-b" style="width:100%">${z.map((s, i) => `<i style="width:${s / mz * 100}%;background:${zonasCores[i]}"></i>`).join('')}</div><b>${Math.round(z.reduce((a, b) => a + b, 0) / 60)}′</b></div>`).join('') || '<div class="mini">Sem dados de FC</div>';
  const dias = Object.keys({ ...j.fc_repouso, ...Object.fromEntries(j.hrv.map(h => [h.d, 1])) }).sort();
  const hv = Object.fromEntries(j.hrv.map(h => [h.d, h.v]));
  grafLinha($('#gRec'), [{ v: dias.map(d => hv[d] ?? null), cor: '#3ddc84' }, { v: dias.map(d => j.fc_repouso[d] ?? null), cor: '#ff4d4f' }]);
  const de = Object.keys({ ...j.stress, ...j.energia }).sort();
  grafLinha($('#gEst'), [{ v: de.map(d => j.stress[d] ?? null), cor: '#ff8a00' }, { v: de.map(d => j.energia[d] ?? null), cor: '#3ddc84' }], { min: 0, max: 100 });
  grafBarras($('#gPassos'), j.passos_semana, '#a76cff', S.metas.passos, dia);
}

/* ---------- AO VIVO: atualização automática (AJAX) ---------- */
const AoVivo = {
  versao: null, timer: null, ultimo: null,
  iniciar() { if (!this.timer) this.ciclo(); document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearTimeout(this.timer); this.ciclo(); } }); },
  pintar() { const c = $('#cRelogio'); if (c && this.ultimo) c.innerHTML = cardRelogio(this.ultimo.relogio, this.ultimo.segundos + Math.round((Date.now() - this.ultimo.em) / 1000)); },
  async ciclo() {
    clearTimeout(this.timer);
    if (!document.hidden && S.usuario && S.online) {
      try {
        const j = await apiGet('ao_vivo');
        if (j.ok) {
          this.ultimo = { ...j, em: Date.now() }; this.pintar();
          const mudou = this.versao && j.versao !== this.versao; this.versao = j.versao;
          const livre = $('#modal').hidden && !Gravador.a && !document.activeElement?.matches('input,select,textarea');
          if (mudou && livre && (['inicio', 'saude', 'atividades', 'estatisticas', 'relatorios', 'metrica', 'dispositivo', 'mais'].includes(S.tela) || (S.tela === 'app' && !/^(sim|walkie)/.test(String(S.arg || ''))))) {
            const y = window.scrollY;
            if (S.tela === 'inicio') await renderInicio(true);
            else { if (S.tela === 'saude') S.dash = await apiGet('dashboard').catch(() => S.dash); await TELAS()[S.tela](S.arg); }
            requestAnimationFrame(() => window.scrollTo(0, y));
          }
        }
      } catch { }
    }
    this.timer = setTimeout(() => this.ciclo(), 15000 + Math.random() * 10000);
  }
};
setInterval(() => AoVivo.pintar(), 5000);

/* ---------- ABA APP: gerar o app do relógio com dispositivo próprio ---------- */
const slugDevice = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
let appTimer = null;
async function renderApp(arg) {
  clearTimeout(appTimer); clearTimeout(WK.timer);
  if (arg === 'walkie') return renderWalkie();
  if (arg === 'mimei') return renderMimei();
  if (arg === 'ben10') return renderBen10();
  if (arg === 'tama') return renderTama();
  if (arg && String(arg).startsWith('sim')) return renderSimulador(arg);
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('rastreador')}${cartaoPareamento('rastreador', 'Rastreador Alequizão')}
  <div class="card"><h3>📍 Rastreador — gerar app com dispositivo próprio</h3>
   <div class="mini" style="margin-bottom:10px">Cada pessoa gera o seu app. Ele já sai configurado para enviar bateria, GPS, frequência cardíaca, passos, Body Battery e estresse para o dispositivo escolhido no Traccar.</div>
   <form id="fApp"><div class="campo"><label>Nome do dispositivo</label><input name="nome" id="aNome" maxlength="60" placeholder="Ex.: Garmin da Maria" required></div>
   <div class="campo"><label>Identificador no Traccar (sem espaço)</label><input name="device" id="aDev" maxlength="40" placeholder="garminmaria" required></div>
   <div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="aModelo" list="aModelos" placeholder="Ex.: Forerunner 165, fenix 7, Venu 3" value="Forerunner® 165 (fr165)" autocomplete="off" required><datalist id="aModelos"></datalist><div class="mini" id="aModeloInfo"></div></div>
   <button class="btn" id="aBtn">⬇ Gerar e baixar</button></form>
   <div id="aProg" class="mini" style="margin-top:10px"></div></div>
  <div class="card"><h3>Meus apps</h3><div id="aLista" class="mini">Carregando…</div></div>
  <div class="card"><h3>Como instalar</h3><div class="mini">1) Conecte o relógio no computador pelo cabo USB.<br>2) Copie o arquivo <b>.prg</b> baixado para a pasta <b>GARMIN/APPS</b> (se já houver outro Rastreador, substitua).<br>3) Desconecte. No relógio: <b>START</b> → role até <b>Adicionar</b> → <b>Rastreador Alequizão</b>.<br>4) Abra o app uma vez. <b>Aberto</b>: GPS ao vivo a cada 30 s. <b>Fechado</b>: envia sozinho a cada 5 min (limite da Garmin).<br>O celular precisa estar perto, com Bluetooth ligado e o app Garmin Connect instalado.</div></div>
  ${tabbar('app')}</div>`;
  ligarPareamento();
  let editado = false, modelos = [];
  fetch('app/modelos.json?v=1').then(r => r.json()).then(l => { modelos = l; $('#aModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const acharModelo = t => {
    t = (t || '').trim(); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1];
    const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const q = n(t); if (!q) return null;
    return modelos.find(m => m.id === id) || modelos.find(m => m.id === q)
      || modelos.find(m => m.nome.split('/').some(p => n(p) === q) || n(m.nome) === q)
      || (l => l.length === 1 ? l[0] : null)(modelos.filter(m => n(m.nome).startsWith(q)));
  };
  $('#aModelo').oninput = e => { const m = acharModelo(e.target.value); $('#aModeloInfo').innerHTML = m ? `✅ ${esc(m.nome)} · código <b>${m.id}</b>` : (e.target.value ? '⚠️ Modelo não encontrado — escolha um da lista' : ''); };
  $('#aNome').oninput = e => { if (!editado) $('#aDev').value = slugDevice(e.target.value); };
  $('#aDev').oninput = e => { editado = true; e.target.value = slugDevice(e.target.value); };
  $('#fApp').onsubmit = async e => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const mod = acharModelo($('#aModelo').value); if (!mod) { $('#aProg').innerHTML = '❌ Modelo do relógio não encontrado. Comece a digitar e escolha na lista.'; return; } f.modelo = mod.id;
    $('#aBtn').disabled = true; $('#aProg').innerHTML = '⏳ Enviando pedido…';
    try {
      const j = await api('app_criar', f);
      $('#aProg').innerHTML = `⚙️ Criando <b>${esc(j.device)}</b> no Traccar e compilando o app (cerca de 30 s)…`;
      const esperar = async (n = 0) => {
        const s = await apiGet('app_status', { id: j.id });
        if (s.status === 'pronto') { $('#aProg').innerHTML = `✅ App pronto! O download começou. <a href="api.php?acao=app_baixar&id=${j.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + j.id; $('#aBtn').disabled = false; e.target.reset(); editado = false; carregarApps(); return; }
        if (s.status === 'erro') { $('#aProg').innerHTML = '❌ Erro ao compilar: ' + esc(s.erro || ''); $('#aBtn').disabled = false; carregarApps(); return; }
        if (n > 90) { $('#aProg').textContent = 'Demorando mais que o normal — veja em Meus apps'; $('#aBtn').disabled = false; return; }
        setTimeout(() => esperar(n + 1), 2000);
      };
      esperar(); carregarApps();
    } catch (x) { $('#aProg').innerHTML = '❌ ' + esc(x.message); $('#aBtn').disabled = false; }
  };
  async function carregarApps() {
    if (S.tela !== 'app') return;
    const j = await apiGet('apps_listar').catch(() => null); if (!j || !$('#aLista')) return;
    $('#aLista').innerHTML = j.itens.length ? `<div class="lista">${j.itens.map(a => `<div class="item"><div class="ic">⌚</div><div class="info"><b>${esc(a.nome)}</b><span>${a.tipo === 'walkie' ? '📻 Walkie-Talkie · ' + esc(a.canal || '') : '📍 ' + esc(a.device)} · ${esc(a.modelo)} · ${a.status === 'pronto' ? (a.envios ? a.envios + ' envios · último ' + fmtData(a.ultimo) : 'ainda sem envios') : a.status === 'erro' ? '❌ ' + esc(a.erro || 'erro') : '⚙️ ' + a.status}</span></div>${a.status === 'pronto' && !String(a.modelo).startsWith('loja') ? `<a class="btn peq" href="api.php?acao=app_baixar&id=${a.id}">⬇</a>` : String(a.modelo).startsWith('loja') ? '<span class="mini">🏪 loja</span>' : ''}<button class="ico-btn" data-rm="${a.id}" title="Excluir">🗑</button></div>`).join('')}</div>` : 'Nenhum app gerado ainda';
    $('#aLista').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (confirm('Excluir este app? O relógio com ele instalado para de enviar.')) { await api('app_excluir', { id: +b.dataset.rm }); carregarApps(); } });
    appTimer = setTimeout(carregarApps, 20000);
  }
  carregarApps();
}

/* ---------- RELÓGIO: dados completos do aparelho conectado ---------- */
const RECURSOS_PT = { hasOpticalHeartRate: 'Frequência cardíaca no pulso', bluetoothLowEnergyDevice: 'Bluetooth', wifi: 'Wi-Fi', appSupport: 'Apps Connect IQ', liveTrackCapable: 'LiveTrack', gpsRouteCapable: 'Rotas com GPS', bodyBatteryCapable: 'Body Battery', sleepCapable: 'Sono', stressCapable: 'Estresse', pulseOxCapable: 'Oximetria (SpO2)', hrvStatusCapable: 'Status de HRV', trainingReadinessCapable: 'Prontidão para treino', trainingStatusCapable: 'Status de treino', vo2MaxRunCapable: 'VO2 máx corrida', vo2MaxBikeCapable: 'VO2 máx ciclismo', racePredictorCapable: 'Previsão de provas', respirationCapable: 'Respiração', incidentDetectionCapable: 'Detecção de incidentes', musicCapable: 'Música', paymentCapable: 'Garmin Pay', workoutCapable: 'Treinos', trainingPlanCapable: 'Planos de treino', coursesCapable: 'Percursos', morningReportCapable: 'Relatório matinal', sleepScoreCapable: 'Pontuação do sono', enduranceScoreCapable: 'Pontuação de resistência', hillScoreCapable: 'Pontuação de subida', recoveryTimeCapable: 'Tempo de recuperação', runningPowerCapable: 'Potência de corrida', intensityMinutesCapable: 'Minutos de intensidade', floorsClimbedCapable: 'Andares', hydrationCapable: 'Hidratação', menstrualCycleCapable: 'Ciclo menstrual', badgesCapable: 'Medalhas', firmwareUpdateCapable: 'Atualização de firmware', findMyPhoneCapable: 'Encontrar celular' };
async function renderDispositivo() {
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="inicio">‹</button><h1>Relógio</h1></div><div class="acoes"><button class="ico-btn" id="dSync" title="Sincronizar">${ICO.sync}</button></div></div><div id="disp"><div class="w"><div class="w-corpo"><div class="mini centro">Carregando…</div></div></div></div>${tabbar('inicio')}</div>`;
  const j = await apiGet('dispositivo').catch(() => null);
  if (!j || !j.ok) { $('#disp').innerHTML = '<div class="vazio">Sem conexão</div>'; return; }
  if (!j.integracao) { navegar('perfil', 'integracoes'); return; }
  $('#dSync').onclick = async e => { e.currentTarget.classList.add('girando'); await api('sincronizar_agora', {}).catch(() => { }); toast('Sincronizando com a Garmin…'); setTimeout(() => $('#dSync')?.classList.remove('girando'), 2500); };
  const d = j.dispositivo, l = j.leitura, dt = t => t ? new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
  const seg = l ? Math.round(Date.now() / 1000 - Date.parse(l.recebido.replace(' ', 'T')) / 1000) : null;
  const statusInteg = j.integracao.status === 'ok' ? `<span class="verde">✓ conectado</span>` : j.integracao.status === 'erro' ? `<span class="verm">erro: ${esc(j.integracao.erro || '')}</span>` : '<span class="laranja">aguardando sincronização</span>';
  $('#disp').innerHTML = `
  <section class="w disp-hero">${d?.imagem ? `<img src="${esc(d.imagem)}" alt="" loading="lazy">` : `<div class="disp-sem">${ICO.relogio}</div>`}
    <div class="w-corpo"><div class="disp-nome">${esc(d?.nome || 'Relógio Garmin')}</div><div class="mini">${esc(d?.modelo || '')}</div>
    ${kv([['CONTA GARMIN', statusInteg], ['ÚLTIMA SINCRONIZAÇÃO', j.integracao.ultimo_sync ? fmtData(j.integracao.ultimo_sync) : '--'], ['RELÓGIO → GARMIN', d?.ultimo_upload ? dt(d.ultimo_upload) : '--'], ['FIRMWARE', d?.firmware || '--'], ['Nº DE SÉRIE', d?.serie || '--'], ['REGISTRADO EM', d?.registrado ? new Date(d.registrado * 1000).toLocaleDateString('pt-BR') : '--']])}</div></section>
  <section class="w" id="cRelogio">${cardRelogio(l, seg)}</section>
  ${j.serie24h.length > 1 ? widget({ ico: ICO.bateria, cor: '#3cc7a8', titulo: 'Bateria nas últimas 24 h', corpo: `<canvas class="graf" id="gBat"></canvas><div class="mini centro"><span class="verde">■</span> bateria % <span style="color:#ef4b5b">■</span> FC <span style="color:#f5c23b">■</span> Body Battery</div>` }) : ''}
  ${widget({ ico: ICO.estresse, cor: '#1fa3e3', titulo: 'Sensores ao vivo', corpo: l ? kv([['FREQUÊNCIA CARDÍACA', (l.fc ?? '--') + ' bpm'], ['BODY BATTERY', l.body_battery ?? '--'], ['ESTRESSE', l.estresse ?? '--'], ['OXIGENAÇÃO', l.spo2 ? l.spo2 + '%' : '--'], ['PASSOS HOJE', l.passos != null ? fmtNum(l.passos) : '--'], ['ALTITUDE', l.alt != null ? Math.round(l.alt) + ' m' : '--'], ['POSIÇÃO', l.lat ? `<a href="#" data-tela="mapa">${(+l.lat).toFixed(5)}, ${(+l.lon).toFixed(5)}</a>` : '--'], ['PRECISÃO DO GPS', l.precisao >= 3 ? 'boa' : l.precisao == 2 ? 'fraca' : l.precisao == 1 ? 'última conhecida' : '--']]) : '<div class="mini">Instale o app Rastreador para ver os sensores ao vivo.</div>' })}
  ${widget({ ico: ICO.sync, cor: '#1fa3e3', titulo: 'Dados recebidos', corpo: kv([['ENVIOS DO APP (24 H)', j.envios24h], ['ATIVIDADES DA GARMIN', j.atividades_garmin], ['SESSÕES LIVETRACK', j.livetrack?.n ?? 0], ['APPS GERADOS', j.apps.length]]) + `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn peq" data-tela="app">📲 Gerar app do relógio</button><button class="btn sec peq" data-tela="perfil" data-arg="integracoes">Integrações</button><button class="btn sec peq" data-tela="mapa">Ver no mapa</button></div>` })}
  ${j.previsoes?.time5K ? widget({ ico: ICO.medalha, cor: '#f5c23b', titulo: 'Previsões de prova', tela: 'relatorios', corpo: kv([['5 KM', fmtTempo(j.previsoes.time5K)], ['10 KM', fmtTempo(j.previsoes.time10K)], ['MEIA MARATONA', fmtTempo(j.previsoes.timeHalfMarathon)], ['MARATONA', fmtTempo(j.previsoes.timeMarathon)]]) }) : ''}
  ${d?.recursos?.length ? widget({ ico: ICO.atividades, cor: '#c9ced6', titulo: `Recursos do relógio (${d.recursos.length})`, corpo: `<div class="recursos">${d.recursos.map(r => `<span>${esc(RECURSOS_PT[r] || r.replace(/Capable$/, '').replace(/([A-Z])/g, ' $1').toLowerCase())}</span>`).join('')}</div>` + (d.zonas?.length ? `<div class="mini" style="margin-top:10px">Zonas de FC: ${d.zonas.map(esc).join(', ')} · até ${d.max_treinos || '--'} treinos</div>` : '') }) : ''}`;
  if (j.serie24h.length > 1) grafLinha($('#gBat'), [{ v: j.serie24h.map(x => +x.bateria), cor: '#3cc7a8' }, { v: j.serie24h.map(x => x.fc != null ? +x.fc : null), cor: '#ef4b5b' }, { v: j.serie24h.map(x => x.body_battery != null ? +x.body_battery : null), cor: '#f5c23b' }], { min: 0, max: 200 });
}

/* ---------- pareamento dos apps da Connect IQ Store ---------- */
function cartaoPareamento(tipo, nomeApp) {
  return widget({ ico: '🏪', cor: '#3cc7a8', titulo: 'App da loja Connect IQ', corpo: `<div class="mini" style="margin-bottom:10px">Instalou o <b>${nomeApp}</b> pela Connect IQ Store? Gere um código e digite no app (no relógio ou nas configurações do app no Garmin Connect). O código vale 15 minutos. Pela loja o app se atualiza sozinho.</div>
    <div class="parear" data-parear="${tipo}"><button class="btn" data-gerar="${tipo}">🔑 Gerar código de pareamento</button><div class="parear-cod" hidden></div><div class="mini parear-st"></div></div>` });
}
function ligarPareamento() {
  document.querySelectorAll('[data-gerar]').forEach(b => b.onclick = async () => {
    const box = b.closest('.parear'), cod = box.querySelector('.parear-cod'), st = box.querySelector('.parear-st');
    b.disabled = true;
    try {
      const r = await api('pareamento_codigo', { tipo: b.dataset.gerar });
      cod.hidden = false; cod.textContent = r.codigo.split('').join(' '); b.textContent = '↻ Gerar outro código'; b.disabled = false;
      let fim = Date.now() + r.expira_min * 60000; clearInterval(box._t);
      box._t = setInterval(async () => {
        if (!document.body.contains(box)) return clearInterval(box._t);
        const s = Math.max(0, Math.round((fim - Date.now()) / 1000));
        if (!s) { clearInterval(box._t); st.textContent = 'Código vencido — gere outro.'; cod.classList.add('vencido'); return; }
        st.textContent = `Aguardando o relógio… vale por mais ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (s % 4 === 0) { const q = await apiGet('pareamento_status', { codigo: r.codigo }).catch(() => null);
          if (q?.usado) { clearInterval(box._t); cod.classList.add('ok'); st.innerHTML = `✅ Relógio pareado (${esc((q.modelo || '').replace('loja:', ''))})! Já pode usar o app.`; toast('Relógio pareado!'); } }
      }, 1000);
    } catch (x) { toast(x.message); b.disabled = false; }
  });
}

/* ---------- APPS › WALKIE-TALKIE ALEQUIZÃO ---------- */
const segApps = ativo => (setTimeout(pintarLojas, 0), '') + `<div id="lojaLinks"></div><div class="seg"><button class="${ativo === 'rastreador' ? 'ativo' : ''}" data-tela="app">📍 Rastreador</button><button class="${ativo === 'walkie' ? 'ativo' : ''}" data-tela="app" data-arg="walkie">📻 Walkie-Talkie</button><button class="${ativo === 'mimei' ? 'ativo' : ''}" data-tela="app" data-arg="mimei">🍺 ME MIMEI</button><button class="${ativo === 'ben10' ? 'ativo' : ''}" data-tela="app" data-arg="ben10">⌚ Ben 10</button><button class="${ativo === 'tama' ? 'ativo' : ''}" data-tela="app" data-arg="tama">🥚 Bichinho</button><button class="${ativo === 'sim' ? 'ativo' : ''}" data-tela="app" data-arg="sim">🖥️ Simulador</button></div>`;
const WK = { canal: null, ultimo: 0, timer: null, canais: [] };
async function renderWalkie() {
  clearTimeout(WK.timer);
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1><div class="acoes"><button class="ico-btn" id="wkPush" title="Notificações no celular e no relógio">🔔</button></div></div>${segApps('walkie')}
  <div id="wk"><div class="w"><div class="w-corpo"><div class="mini centro">Carregando…</div></div></div></div>${tabbar('app')}</div>`;
  $('#wkPush').onclick = ativarPush;
  const j = await apiGet('walkie_canais').catch(() => null); if (!j) return;
  WK.canais = j.itens;
  if (!WK.canal || !j.itens.find(c => c.id == WK.canal)) WK.canal = j.itens[0]?.id || null;
  const c = j.itens.find(x => x.id == WK.canal);
  $('#wk').innerHTML = `
  ${cartaoPareamento('walkie', 'Walkie-Talkie Alequizão')}
  ${widget({ ico: '📻', cor: '#fb8c1e', titulo: 'Canais', corpo: `${j.itens.length ? `<div class="chips">${j.itens.map(x => `<span class="chip ${x.id == WK.canal ? 'ativo' : ''}" data-canal="${x.id}">${esc(x.nome)} <small>${x.online ? '● ' + x.online : ''}</small></span>`).join('')}</div>` : '<div class="mini" style="margin-bottom:10px">Crie um canal ou entre com o código que alguém te passou.</div>'}
    <div class="linha"><button class="btn peq" id="wkNovo">+ Criar canal</button><button class="btn sec peq" id="wkEntrar">Entrar com código</button></div>` })}
  ${c ? `
  <section class="w"><header class="w-top"><span class="w-ico">💬</span><span class="w-tit">${esc(c.nome)}</span><span class="vivo ${c.online ? 'on' : ''}">${c.online} relógio(s) on-line</span></header>
   <div class="w-corpo"><div class="mini">Código do canal: <b class="codigo">${esc(c.codigo)}</b> · ${c.membros} participante(s) · <a href="#" id="wkCompart">compartilhar</a>${c.dono ? ` · <a href="#" id="wkRenomear">renomear</a> · <a href="#" id="wkExcluir" class="verm">excluir canal</a>` : ` · <a href="#" id="wkSair">sair</a>`}</div>
   <div class="chat" id="wkChat"></div>
   <div class="rapidas" id="wkRapidas"></div>
   <form class="enviar" id="wkForm"><input id="wkTexto" maxlength="120" placeholder="Mensagem para os relógios" autocomplete="off"><button type="button" class="ico-btn" id="wkMic" title="Falar (vira texto)">🎙️</button><button class="ico-btn enviar-bt" title="Enviar">➤</button></form>
   <div class="linha" style="margin-top:10px"><button class="btn laranja peq" id="wkAtencao">📣 Chamar atenção (10 s)</button><button class="btn perigo peq" id="wkSos">🆘 SOS</button></div></div></section>
  ${widget({ ico: '⚡', cor: '#f5c23b', titulo: 'Mensagens rápidas do relógio', corpo: `<div class="mini" style="margin-bottom:8px">${c.dono ? 'Aparecem no botão START do relógio de todos do canal (até 15, com até 30 letras). O relógio atualiza sozinho.' : 'Só quem criou o canal pode alterar.'}</div><div id="wkFrases"></div>${c.dono ? `<form class="enviar" id="wkFraseForm" style="margin-top:10px"><input id="wkFraseNova" maxlength="30" placeholder="Nova mensagem rápida"><button class="ico-btn enviar-bt" title="Adicionar">+</button></form>` : ''}` })}
  ${widget({ ico: '⌚', cor: '#1fa3e3', titulo: 'Instalar no relógio', corpo: `<div class="mini" style="margin-bottom:10px">Gere o app com o seu nome. No relógio aparecem TODOS os seus canais (o primeiro é o principal; troque em START → Canais). Cada pessoa gera o dela.</div>
    <form id="wkApp"><div class="campo"><label>Seu nome no walkie-talkie</label><input name="nome" maxlength="20" required placeholder="Ex.: Alex" value="${esc((S.usuario.nome || '').split(' ')[0])}"></div>
    <div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="wkModelo" list="wkModelos" value="Forerunner® 165 (fr165)" required autocomplete="off"><datalist id="wkModelos"></datalist><div class="mini" id="wkModeloInfo"></div></div>
    <button class="btn" id="wkAppBt">⬇ Gerar e baixar Walkie-Talkie</button></form><div id="wkProg" class="mini" style="margin-top:10px"></div>` })}
  ${c.dono ? widget({ ico: '🔗', cor: '#8b7cf6', titulo: 'Integração (Lembretes e outros sistemas)', corpo: `<div class="mini" style="margin-bottom:8px">Com esta chave, o <b>Lembretes</b> (alequizao.com/lembretes) manda avisos direto para os relógios deste canal: cole-a na ficha do contato, no campo “Chave do Walkie-Talkie”. Não compartilhe em público — quem tem a chave consegue enviar mensagens.</div><div class="enviar"><input id="wkChave" readonly value="${esc(c.chave_api || '')}"><button type="button" class="ico-btn" id="wkCopiar" title="Copiar">📋</button><button type="button" class="ico-btn" id="wkNovaChave" title="Gerar nova chave">↻</button></div>` }) : ''}
  ${widget({ ico: '🔔', cor: '#3cc7a8', titulo: 'Receber nas notificações do relógio', corpo: `<div id="pushStatus" class="push-status">Verificando este aparelho…</div><div id="pushGuia"></div><div class="linha" style="margin-top:10px"><button class="btn peq" id="wkPush2">🔔 Ativar neste aparelho</button><button class="btn sec peq" id="wkPushTeste">Enviar teste</button></div>` })}` : ''}`;
  document.querySelectorAll('[data-canal]').forEach(e => e.onclick = () => { WK.canal = +e.dataset.canal; WK.ultimo = 0; renderWalkie(); });
  ligarPareamento();
  $('#wkNovo').onclick = () => modal(`<h2>Novo canal</h2><form id="fCanal"><div class="campo"><label>Nome do canal</label><input name="nome" maxlength="40" required placeholder="Ex.: Grupo de corrida"></div><button class="btn">Criar</button></form>`, () => { $('#fCanal').onsubmit = async e => { e.preventDefault(); try { const r = await api('walkie_criar', Object.fromEntries(new FormData(e.target))); WK.canal = r.id; fecharModal(); toast('Canal criado — código ' + r.codigo, 3500); renderWalkie(); } catch (x) { toast(x.message); } }; });
  $('#wkEntrar').onclick = () => modal(`<h2>Entrar em um canal</h2><form id="fEnt"><div class="campo"><label>Código do canal</label><input name="codigo" maxlength="8" required style="text-transform:uppercase;letter-spacing:4px"></div><button class="btn">Entrar</button></form>`, () => { $('#fEnt').onsubmit = async e => { e.preventDefault(); try { const r = await api('walkie_entrar', Object.fromEntries(new FormData(e.target))); WK.canal = r.id; fecharModal(); toast('Você entrou em ' + r.nome); renderWalkie(); } catch (x) { toast(x.message); } }; });
  if (!c) return;
  const pintarFrases = lista => {
    const pad = ['OK', 'Chegando', 'Me espera', 'Estou bem', 'Ja estou indo', 'Onde voce esta?', 'Me liga', 'Terminei o treino', 'Preciso de ajuda'];
    const l = lista && lista.length ? lista : pad; c.frasesLista = l;
    $('#wkRapidas').innerHTML = l.map(f => `<button class="chip" data-rapida="${esc(f)}">${esc(f)}</button>`).join('');
    $('#wkFrases').innerHTML = `<div class="lista">${l.map((f, i) => `<div class="item frase"><div class="info"><b>${esc(f)}</b></div>${c.dono ? `<button class="ico-btn" data-sobe="${i}" title="Subir" ${i ? '' : 'disabled'}>↑</button><button class="ico-btn" data-edita="${i}" title="Editar">✎</button><button class="ico-btn" data-apaga="${i}" title="Apagar">🗑</button>` : ''}</div>`).join('')}</div>${lista && lista.length ? '' : '<div class="mini">(mensagens padrão — personalize à vontade)</div>'}`;
    document.querySelectorAll('[data-rapida]').forEach(b => b.onclick = () => enviarWk(b.dataset.rapida));
    const salvar = async nova => { try { const r = await api('walkie_frases', { canal: c.id, frases: nova }); pintarFrases(r.frases); toast('Mensagens salvas'); } catch (x) { toast(x.message); } };
    document.querySelectorAll('[data-apaga]').forEach(b => b.onclick = () => { if (confirm('Apagar "' + l[+b.dataset.apaga] + '"?')) salvar(l.filter((_, i) => i != b.dataset.apaga)); });
    document.querySelectorAll('[data-sobe]').forEach(b => b.onclick = () => { const n = [...l], i = +b.dataset.sobe; [n[i - 1], n[i]] = [n[i], n[i - 1]]; salvar(n); });
    document.querySelectorAll('[data-edita]').forEach(b => b.onclick = () => { const i = +b.dataset.edita; const v = prompt('Editar mensagem rápida (até 30 letras):', l[i]); if (v != null && v.trim()) { const n = [...l]; n[i] = v.trim().slice(0, 30); salvar(n); } });
    if ($('#wkFraseForm')) $('#wkFraseForm').onsubmit = e => { e.preventDefault(); const v = $('#wkFraseNova').value.trim(); if (!v) return; if (l.length >= 15) return toast('Máximo de 15 mensagens'); salvar([...(lista && lista.length ? lista : pad), v]); };
  };
  pintarFrases((c.frases || '').split('\n').filter(Boolean));
  const enviarWk = async (texto, tipo = 'texto') => { try { await api('walkie_enviar', { canal: c.id, texto, tipo }); $('#wkTexto').value = ''; carregar(); } catch (x) { toast(x.message); } };
  $('#wkForm').onsubmit = e => { e.preventDefault(); const t = $('#wkTexto').value.trim(); if (t) enviarWk(t); };
  $('#wkAtencao').onclick = () => enviarWk($('#wkTexto').value.trim() || 'Atenção!', 'atencao');
  $('#wkSos').onclick = () => { if (confirm('Enviar SOS para todos do canal?')) enviarWk($('#wkTexto').value.trim() || 'SOS! Preciso de ajuda', 'sos'); };
  $('#wkCompart').onclick = e => { e.preventDefault(); const txt = `Entre no meu canal do Walkie-Talkie Alequizão: código ${c.codigo} — ${location.origin}/garmin/`; navigator.share ? navigator.share({ text: txt }).catch(() => { }) : (navigator.clipboard?.writeText(txt), toast('Convite copiado')); };
  $('#wkRenomear') && ($('#wkRenomear').onclick = async e => { e.preventDefault(); const n = prompt('Novo nome do canal:', c.nome); if (n && n.trim()) { try { await api('walkie_editar', { id: c.id, nome: n.trim() }); renderWalkie(); } catch (x) { toast(x.message); } } });
  $('#wkExcluir') && ($('#wkExcluir').onclick = async e => { e.preventDefault(); if (confirm(`Excluir o canal "${c.nome}"? Todas as mensagens serão apagadas (o app do relógio continua funcionando com os outros canais).`)) { try { await api('walkie_excluir', { id: c.id }); WK.canal = null; toast('Canal excluído'); renderWalkie(); } catch (x) { toast(x.message); } } });
  $('#wkCopiar') && ($('#wkCopiar').onclick = () => { navigator.clipboard?.writeText(c.chave_api); toast('Chave copiada'); });
  $('#wkNovaChave') && ($('#wkNovaChave').onclick = async () => { if (confirm('Gerar uma nova chave? A antiga para de funcionar (atualize no Lembretes).')) { await api('walkie_editar', { id: c.id, nova_chave: 1 }); renderWalkie(); } });
  $('#wkSair') && ($('#wkSair').onclick = async e => { e.preventDefault(); if (confirm('Sair do canal?')) { await api('walkie_sair', { id: c.id }); WK.canal = null; renderWalkie(); } });
  $('#wkPush2').onclick = async () => { await ativarPush(); pushDiagnostico(); };
  pushDiagnostico();
  $('#wkPushTeste').onclick = async () => { try { const r = await api('push_teste', {}); toast(r.enviados ? 'Teste enviado — confira o celular e o relógio' : 'Ative as notificações primeiro', 4000); } catch (x) { toast(x.message); } };
  // microfone: o celular transcreve a fala em texto (o relógio não tem áudio)
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  $('#wkMic').onclick = () => {
    if (!Rec) return toast('Seu navegador não transcreve voz. Use o teclado do celular (tem microfone).', 4000);
    const r = new Rec(); r.lang = 'pt-BR'; r.interimResults = true; $('#wkMic').classList.add('gravando-mic');
    r.onresult = ev => { $('#wkTexto').value = [...ev.results].map(x => x[0].transcript).join(' ').slice(0, 120); };
    r.onend = () => { $('#wkMic').classList.remove('gravando-mic'); if ($('#wkTexto').value.trim()) $('#wkTexto').focus(); };
    r.start();
  };
  // gerar app
  let modelos = []; fetch('app/modelos.json?v=1').then(r => r.json()).then(l => { modelos = l; $('#wkModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const acharMod = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(p => n(p) === q)) || ((l) => l.length === 1 ? l[0] : null)(modelos.filter(m => n(m.nome).startsWith(q))); };
  $('#wkModelo').oninput = e => { const m = acharMod(e.target.value); $('#wkModeloInfo').innerHTML = m ? `✅ ${esc(m.nome)}` : '⚠️ Escolha um modelo da lista'; };
  $('#wkApp').onsubmit = async e => {
    e.preventDefault(); const m = acharMod($('#wkModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    $('#wkAppBt').disabled = true; $('#wkProg').textContent = '⚙️ Compilando o Walkie-Talkie (cerca de 30 s)…';
    try {
      const r = await api('walkie_app', { canal: c.id, nome: new FormData(e.target).get('nome'), modelo: m.id });
      const esperar = async (n = 0) => { const s = await apiGet('app_status', { id: r.id });
        if (s.status === 'pronto') { $('#wkProg').innerHTML = `✅ Pronto! Copie o arquivo para GARMIN/APPS no relógio. <a href="api.php?acao=app_baixar&id=${r.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + r.id; $('#wkAppBt').disabled = false; return; }
        if (s.status === 'erro' || n > 90) { $('#wkProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); $('#wkAppBt').disabled = false; return; }
        setTimeout(() => esperar(n + 1), 2000); };
      esperar();
    } catch (x) { $('#wkProg').textContent = '❌ ' + x.message; $('#wkAppBt').disabled = false; }
  };
  // chat ao vivo
  WK.ultimo = 0; $('#wkChat').innerHTML = '';
  async function carregar() {
    if (S.tela !== 'app' || !$('#wkChat')) return;
    clearTimeout(WK.timer);
    const r = await apiGet('walkie_mensagens', { canal: c.id, desde: WK.ultimo }).catch(() => null);
    if (r?.ok && r.itens.length) {
      const chat = $('#wkChat'), noFim = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 60;
      chat.insertAdjacentHTML('beforeend', r.itens.map(m => `<div class="msg ${+m.meu ? 'eu' : ''} ${m.tipo !== 'texto' ? 'tipo-' + m.tipo : ''}"><div class="msg-autor">${esc(m.autor)} · ${m.origem === 'relogio' ? '⌚' : '📱'} ${m.criado.slice(11, 16)}</div><div class="msg-txt">${m.tipo === 'atencao' ? '📣 ' : m.tipo === 'sos' ? '🆘 ' : ''}${esc(m.texto)}${m.lat ? ` <a href="https://maps.google.com/?q=${m.lat},${m.lon}" target="_blank">📍 local</a>` : ''}</div></div>`).join(''));
      WK.ultimo = r.itens[r.itens.length - 1].id;
      if (noFim || r.itens.length === WK.ultimo) chat.scrollTop = chat.scrollHeight;
    } else if (!WK.ultimo) $('#wkChat').innerHTML = '<div class="mini centro" style="padding:20px 0">Nenhuma mensagem ainda. Diga oi! 👋</div>';
    WK.timer = setTimeout(carregar, 4000 + Math.random() * 2000);
  }
  carregar();
}
async function ativarPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return toast('Este navegador não recebe notificações. No iPhone, adicione o site à Tela de Início e abra por lá.', 5000);
    if (await Notification.requestPermission() !== 'granted') return toast('Permissão de notificação negada');
    const reg = await navigator.serviceWorker.ready; const { chave } = await apiGet('push_chave');
    const b = atob(chave.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - chave.length % 4) % 4));
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(b, ch => ch.charCodeAt(0)) });
    await api('push_inscrever', { inscricao: sub.toJSON() }); toast('🔔 Notificações ativadas neste aparelho', 3500);
  } catch (x) { toast('Não foi possível ativar: ' + x.message, 4000); }
}

/* diagnóstico do push neste aparelho, com passo a passo específico para iPhone */
async function pushDiagnostico() {
  const st = $('#pushStatus'), guia = $('#pushGuia'); if (!st) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const celular = ios || /Android/i.test(navigator.userAgent);
  const passoGarmin = `<li>No app <b>Garmin Connect</b>: <b>Mais → Configurações → Notificações → Apps</b> (ou "Notificações inteligentes") e permita <b>${ios ? 'Garmin Connect / Web' : 'Chrome'}</b>. No iPhone também: Ajustes → Notificações → <b>Garmin Connect</b> e o app do site com notificações ligadas.</li>`;
  if (ios && !instalado) {
    st.innerHTML = '⚠️ <b>No iPhone, as notificações só funcionam com o site instalado na Tela de Início.</b>';
    guia.innerHTML = `<ol class="passos"><li>Abra este site no <b>Safari</b> (iOS 16.4 ou mais novo).</li><li>Toque em <b>Compartilhar</b> (quadrado com seta) → <b>Adicionar à Tela de Início</b> → Adicionar.</li><li>Feche o Safari e abra o ícone <b>Connect</b> que apareceu na Tela de Início.</li><li>Entre na conta, vá em <b>Apps → Walkie-Talkie</b> e toque em <b>🔔 Ativar neste aparelho</b> (permita).</li>${passoGarmin}<li>Toque em <b>Enviar teste</b>: deve aparecer no iPhone e no relógio.</li></ol>`;
    $('#wkPush2').disabled = true; return;
  }
  $('#wkPush2').disabled = false;
  let sub = null, perm = (window.Notification && Notification.permission) || 'indisponivel';
  try { sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { }
  if (sub && perm === 'granted') st.innerHTML = `✅ <b>Notificações ativas neste ${celular ? 'celular' : 'computador'}.</b>${celular ? '' : ' Para chegar no relógio, ative também no celular.'}`;
  else if (perm === 'denied') st.innerHTML = '❌ Notificações bloqueadas. ' + (ios ? 'Ajustes → Notificações → Connect → Permitir.' : 'Libere nas configurações do navegador para este site.');
  else st.innerHTML = '🔕 Ainda não ativado neste aparelho.';
  guia.innerHTML = `<ol class="passos">${celular ? '' : '<li><b>Faça isto no celular</b> (o relógio só repassa notificações do celular).</li>'}<li>Toque em <b>🔔 Ativar neste aparelho</b> e permita.</li>${passoGarmin}<li>Toque em <b>Enviar teste</b>.</li></ol>`;
}

/* ---------- APPS › ME MIMEI (lanches que cabem nas calorias do dia) ---------- */
const EMOJIS_MIMEI = ['🍗', '🥟', '🍰', '🥧', '🥔', '🧀', '🔺', '🧆', '🫓', '🍺', '🍕', '🍔', '🌭', '🍟', '🍩', '🍪', '🍫', '🍬', '🍦', '🍨', '🍧', '🍇', '🍌', '🥤', '🧋', '☕', '🍷', '🥃', '🍹', '🍿', '🥐', '🥖', '🧁', '🍮', '🍭', '🌮', '🌯', '🥪', '🍝', '🍣', '🍤', '🥗', '🍳', '🥞', '🧇', '🥓', '🍖', '🥩', '🍜', '🍛', '🥜', '🍓', '🍉', '🍍', '🥭', '🥥'];
async function renderMimei() {
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('mimei')}<div id="mm" aria-busy="true"><section class="w w-mimei"><div class="mimei-skel" role="status" aria-label="Carregando ME MIMEI"><div class="l h1"></div><div class="l h2"></div><div class="g"><div class="l"></div><div class="l"></div><div class="l"></div><div class="l"></div></div></div></section></div>${tabbar('app')}</div>`;
  const j = await apiGet('mimei_estado').catch(() => null); if (!$('#mm')) return;
  if (!j || !j.ok) { const off = navigator.onLine === false; $('#mm').removeAttribute('aria-busy'); $('#mm').innerHTML = `<section class="w w-mimei"><div class="mimei-estado" role="alert"><div class="i" aria-hidden="true">${off ? '📡' : '⚠️'}</div><b>${off ? 'Você está offline' : 'Não deu para carregar o ME MIMEI'}</b><p class="mini">${off ? 'Conecte-se à internet para ver o saldo e registrar lanches.' : 'O servidor não respondeu. Tente de novo em instantes.'}</p><button class="btn" id="mmTentar">Tentar de novo</button></div></section>`; $('#mmTentar').onclick = renderMimei; return; }
  $('#mm').removeAttribute('aria-busy');
  window.MIMEI_BIB = j.biblioteca || [];
  const r = j.resumo, fmt = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
  // sabores: agrupa lanches com o mesmo "grupo" num bloco só, na posição do primeiro
  const blocos = [], porGrupo = {}; j.lanches.forEach((l, i) => { l._i = i; if (!l.grupo) return blocos.push({ l }); const k = l.grupo.toLowerCase(); if (!porGrupo[k]) blocos.push(porGrupo[k] = { grupo: l.grupo, itens: [] }); porGrupo[k].itens.push(l); });
  blocos.forEach((b, i) => { if (b.itens && b.itens.length === 1) blocos[i] = { l: b.itens[0] }; });
  const semAc = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const abertos = window.MIMEI_ABERTOS || (window.MIMEI_ABERTOS = new Set());
  const cardLanche = (l, titulo) => `<div class="mimei-card ${r.saldo >= l.kcal ? 'cabe' : 'nao-cabe'}"><img decoding="async" src="${esc(l.icone || '')}" alt="" loading="lazy" width="46" height="46" onerror="this.style.visibility='hidden'"><b aria-label="cabem ${fmt(Math.max(0, r.saldo / l.kcal))}">${fmt(Math.max(0, r.saldo / l.kcal))}<span class="x">×</span></b><span>${esc(titulo)}</span><small>${l.kcal} kcal${l.porcao ? ' · ' + esc(l.porcao) : ''}</small><button class="btn sec peq" data-comi="${l.id}" aria-label="Comi 1 ${esc(l.nome)}">Comi 1</button></div>`;
  const itemLanche = (l, titulo) => `<div class="item mimei-item" data-id="${l.id}" data-busca="${esc(semAc(`${l.nome} ${l.grupo || ''} ${l.sabor || ''}`))}"><span class="mimei-arrasta" aria-hidden="true" title="Arraste para reordenar">⠿</span><img loading="lazy" decoding="async" class="mimei-ic" width="42" height="42" src="${esc(l.icone || '')}" alt="" onerror="this.style.visibility='hidden'"><div class="info"><b>${esc(titulo)}</b><span>${l.kcal} kcal${l.porcao ? ' · ' + esc(l.porcao) : ''}</span></div><button class="ico-btn" data-sobe="${l.id}" title="Subir" aria-label="Subir ${esc(l.nome)}">↑</button><button class="ico-btn" data-edita="${l.id}" title="Editar" aria-label="Editar ${esc(l.nome)}">✎</button><button class="ico-btn" data-apaga="${l.id}" title="Apagar" aria-label="Apagar ${esc(l.nome)}">🗑</button></div>`;
  const kcals = j.lanches.map(l => +l.kcal).filter(k => k > 0), menor = kcals.length ? Math.min(...kcals) : 0;
  const estadoSaldo = r.saldo <= 0 ? 'zerado' : (menor && r.saldo < menor ? 'baixo' : '');
  const pctComido = r.queimado > 0 ? Math.min(100, r.comido / r.queimado * 100) : (r.comido > 0 ? 100 : 0);
  const grupos = blocos.filter(b => b.itens), filtro = window.MIMEI_FILTRO || (window.MIMEI_FILTRO = { q: '', g: '' });
  if (filtro.g && filtro.g !== '*cabe' && !grupos.some(b => b.grupo === filtro.g)) filtro.g = '';
  $('#mm').innerHTML = `
  <section class="w w-mimei"><header class="w-top"><span class="w-ico" aria-hidden="true">🍺</span><span class="w-tit">ME MIMEI — hoje</span></header>
   <div class="mimei-corpo">
    <div class="mimei-hero ${estadoSaldo}" role="group" aria-label="Saldo do dia">
     <div class="mimei-saldo"><b>${fmt(Math.max(0, r.saldo))}</b><span>kcal livres</span></div>
     <div class="mimei-barra" role="progressbar" aria-label="Calorias comidas sobre as queimadas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pctComido)}"><i style="width:${pctComido}%"></i></div>
     <div class="mimei-conta"><span>queimadas <b>${r.queimado}</b></span><em aria-hidden="true">−</em><span>comidas <b>${r.comido}</b></span><em aria-hidden="true">=</em><span class="hl">livres <b>${fmt(r.saldo)}</b> kcal</span></div>
    </div>
    <div class="mimei-tools">
     <label class="mimei-busca"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input type="search" id="mmBusca" placeholder="Buscar lanche ou sabor" aria-label="Buscar lanche ou sabor" autocomplete="off" enterkeyhint="search" value="${esc(filtro.q)}"><button type="button" id="mmLimpa" class="${filtro.q ? '' : 'mimei-off'}" aria-label="Limpar busca">✕</button></label>
     <div class="chips mimei-chips" id="mmChips" role="toolbar" aria-label="Filtrar por tipo">${[['', 'Todos', j.lanches.length], ['*cabe', 'Cabem hoje', j.lanches.filter(l => r.saldo >= l.kcal).length], ...grupos.map(b => [b.grupo, b.grupo, b.itens.length])].map(([k, n, c]) => `<button type="button" class="chip ${filtro.g === k ? 'ativo' : ''}" data-filtro="${esc(k)}" aria-pressed="${filtro.g === k}">${esc(n)} <i>${c}</i></button>`).join('')}</div>
     <div class="mimei-contagem" id="mmConta" aria-live="polite"></div>
    </div>
    <div class="mimei-grade" id="mmGrade"></div>
   </div></section>
  ${j.consumo.length ? widget({ ico: '🧾', cor: '#f5c23b', titulo: 'Comidos hoje', corpo: `<div class="lista">${j.consumo.map(c => `<div class="item"><div class="info"><b>${fmt(+c.qtd)}× ${esc(c.nome)}</b><span>${c.hora} · ${c.origem === 'relogio' ? '⌚ relógio' : '📱 site'}</span></div><div class="dir"><b>${c.kcal} kcal</b></div><button class="ico-btn" data-desfaz="${c.id}" title="Desfazer">↺</button></div>`).join('')}</div>` }) : ''}
  ${widget({ ico: '✏️', cor: '#f0506e', titulo: 'Meus lanches', corpo: `<div class="mini" style="margin-bottom:8px">Tudo o que mudar aqui aparece no relógio na próxima vez que o app abrir (ou em até 1 minuto com ele aberto).</div>
    <label class="mimei-busca mimei-busca-lista"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input type="search" id="mmBuscaL" placeholder="Buscar em meus lanches" aria-label="Buscar em meus lanches" autocomplete="off" enterkeyhint="search"><button type="button" id="mmLimpaL" class="mimei-off" aria-label="Limpar busca">✕</button></label><div class="mimei-contagem" id="mmContaL" aria-live="polite"></div>
    <div class="lista" id="mmLista">${blocos.map(b => b.itens ? `<details class="mimei-grupo"${abertos.has('L:' + b.grupo) ? ' open' : ''} data-grupo="L:${esc(b.grupo)}"><summary class="item mimei-item"><span class="mimei-arrasta" aria-hidden="true" title="Arraste para reordenar">⠿</span><img loading="lazy" decoding="async" class="mimei-ic" width="42" height="42" src="${esc(b.itens[0].icone || '')}" alt="" onerror="this.style.visibility='hidden'"><div class="info"><b>${esc(b.grupo)} · ${b.itens.length} sabores</b><span>${Math.min(...b.itens.map(l => l.kcal))}–${Math.max(...b.itens.map(l => l.kcal))} kcal</span></div><span class="mimei-seta">▾</span></summary><div class="mimei-sabores">${b.itens.map(l => itemLanche(l, l.sabor)).join('')}</div></details>` : itemLanche(b.l, b.l.nome)).join('')}</div>
    <button class="btn" id="mmNovo" style="margin-top:12px">+ Novo lanche</button>` })}
  ${widget({ ico: '⌚', cor: '#1fa3e3', titulo: 'Instalar no relógio (por cabo)', corpo: `<div class="mini" style="margin-bottom:10px">O app mostra quantos de cada lanche cabem nas suas calorias ativas do dia, com o ícone de cada um. Toque em START no relógio para registrar o que comeu.</div>
    <form id="mmApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="mmModelo" list="mmModelos" value="Forerunner® 165 (fr165)" required autocomplete="off"><datalist id="mmModelos"></datalist></div><button class="btn" id="mmAppBt">⬇ Gerar e baixar ME MIMEI</button></form><div id="mmProg" class="mini" style="margin-top:10px"></div>
    ${j.apps.length ? `<div class="lista" style="margin-top:10px">${j.apps.map(a => `<div class="item"><div class="ic">🍺</div><div class="info"><b>ME MIMEI · ${esc(a.modelo)}</b><span>${a.status === 'pronto' ? (a.visto ? 'último uso ' + fmtData(a.visto) : 'ainda não abriu no relógio') : a.status}</span></div>${a.status === 'pronto' ? `<a class="btn peq" href="api.php?acao=app_baixar&id=${a.id}">⬇</a>` : ''}<button class="ico-btn" data-rmapp="${a.id}">🗑</button></div>`).join('')}</div>` : ''}` })}`;

  const lista = j.lanches;
  document.querySelectorAll('details.mimei-grupo').forEach(d => d.ontoggle = () => abertos[d.open ? 'add' : 'delete'](d.dataset.grupo));
  document.querySelectorAll('[data-edita]').forEach(b => b.onclick = () => editarLanche(lista.find(x => x.id == b.dataset.edita), [...new Set(lista.map(x => x.grupo).filter(Boolean))]));
  const pintarGrade = () => {
    const q = semAc(filtro.q.trim()), g = filtro.g; let html, n;
    if (!q && !g) { html = blocos.map(b => b.itens ? `<details class="mimei-grupo"${abertos.has(b.grupo) ? ' open' : ''} data-grupo="${esc(b.grupo)}"><summary class="mimei-card ${r.saldo >= Math.min(...b.itens.map(l => l.kcal)) ? 'cabe' : 'nao-cabe'}"><img decoding="async" src="${esc(b.itens[0].icone || '')}" alt="" loading="lazy" width="46" height="46" onerror="this.style.visibility='hidden'"><b>${fmt(Math.max(0, r.saldo / Math.min(...b.itens.map(l => l.kcal))))}<span class="x">×</span></b><span>${esc(b.grupo)} · ${b.itens.length} sabores</span><small>${Math.min(...b.itens.map(l => l.kcal))}–${Math.max(...b.itens.map(l => l.kcal))} kcal</small><span class="btn sec peq" aria-hidden="true">Sabores ▾</span></summary><div class="mimei-grade">${b.itens.map(l => cardLanche(l, l.sabor)).join('')}</div></details>` : cardLanche(b.l, b.l.nome)).join(''); n = null; }
    else { const it = j.lanches.filter(l => (!g || (g === '*cabe' ? r.saldo >= l.kcal : l.grupo === g)) && (!q || semAc(`${l.nome} ${l.grupo || ''} ${l.sabor || ''}`).includes(q))); n = it.length; html = it.map(l => cardLanche(l, l.grupo && l.sabor && !q && g !== '*cabe' ? l.sabor : l.nome)).join(''); }
    const grade = $('#mmGrade'); if (!grade) return;
    grade.innerHTML = n === 0 ? `<div class="mimei-estado" style="grid-column:1/-1"><div class="i" aria-hidden="true">${g === '*cabe' && !q ? '🫙' : '🔍'}</div><b>${g === '*cabe' && !q ? 'Nada cabe no saldo agora' : 'Nenhum lanche encontrado'}</b><p class="mini">${g === '*cabe' && !q ? 'Mexa-se um pouco para liberar calorias.' : 'Tente outro nome ou limpe os filtros.'}</p>${q || g ? '<button class="btn sec" type="button" id="mmZera">Limpar filtros</button>' : ''}</div>` : html;
    $('#mmConta').textContent = n == null ? '' : `${n} ${n === 1 ? 'lanche' : 'lanches'}`;
    grade.querySelectorAll('details.mimei-grupo').forEach(d => d.ontoggle = () => abertos[d.open ? 'add' : 'delete'](d.dataset.grupo));
    grade.querySelectorAll('[data-comi]').forEach(b => b.onclick = async () => { b.disabled = true; try { await api('mimei_comi', { id: +b.dataset.comi, qtd: 1 }); toast('Registrado 😋'); renderMimei(); } catch (x) { b.disabled = false; toast(x.message || 'Falhou'); } });
    const z = $('#mmZera'); if (z) z.onclick = () => { filtro.q = ''; filtro.g = ''; $('#mmBusca').value = ''; $('#mmLimpa').classList.add('mimei-off'); document.querySelectorAll('[data-filtro]').forEach(c => { c.classList.toggle('ativo', c.dataset.filtro === ''); c.setAttribute('aria-pressed', c.dataset.filtro === ''); }); pintarGrade(); };
  };
  pintarGrade();
  $('#mmBusca').oninput = e => { filtro.q = e.target.value; $('#mmLimpa').classList.toggle('mimei-off', !filtro.q); pintarGrade(); };
  $('#mmLimpa').onclick = () => { filtro.q = ''; $('#mmBusca').value = ''; $('#mmLimpa').classList.add('mimei-off'); $('#mmBusca').focus(); pintarGrade(); };
  document.querySelectorAll('[data-filtro]').forEach(c => c.onclick = () => { filtro.g = c.dataset.filtro; document.querySelectorAll('[data-filtro]').forEach(o => { o.classList.toggle('ativo', o === c); o.setAttribute('aria-pressed', o === c); }); pintarGrade(); });
  document.querySelectorAll('[data-desfaz]').forEach(b => b.onclick = async () => { await api('mimei_consumo_excluir', { id: +b.dataset.desfaz }); renderMimei(); });
  document.querySelectorAll('[data-apaga]').forEach(b => b.onclick = async () => { const l = lista.find(x => x.id == b.dataset.apaga); if (confirm(`Apagar "${l.nome}"?`)) { await api('mimei_excluir', { id: l.id }); renderMimei(); } });
  // ↑ Subir: troca com o vizinho VISÍVEL de cima no DOM (dentro do mesmo grupo de sabores) e manda a ordem completa, como o arrasto
  const idsDom = () => [...document.querySelectorAll('#mmLista .mimei-item[data-id]')].map(x => +x.dataset.id);
  const salvarOrdem = async ids => { const y = scrollY; try { await api('mimei_ordem', { ids }); toast('Ordem salva'); } catch (x) { toast(x.message || 'Falhou'); } await renderMimei(); scrollTo(0, y); };
  const vizCima = it => { let v = it.previousElementSibling; while (v && v.classList.contains('mimei-off')) v = v.previousElementSibling; return v; };
  document.querySelectorAll('[data-sobe]').forEach(b => { const it = b.closest('.mimei-item'); b.disabled = !it.previousElementSibling; b.onclick = async () => { const v = vizCima(it); if (!v || b.disabled) return; const antes = idsDom().join(); it.parentElement.insertBefore(it, v); const ids = idsDom(); if (ids.join() === antes) return; b.disabled = true; await salvarOrdem(ids); }; });
  document.querySelectorAll('[data-rmapp]').forEach(b => b.onclick = async () => { if (confirm('Excluir este app? O relógio com ele instalado para de atualizar.')) { await api('app_excluir', { id: +b.dataset.rmapp }); renderMimei(); } });

  // busca em "Meus lanches"
  const filtrarLista = () => {
    const q = semAc($('#mmBuscaL').value.trim()); let n = 0;
    document.querySelectorAll('#mmLista .mimei-item[data-id]').forEach(it => { const ok = !q || it.dataset.busca.includes(q); it.classList.toggle('mimei-off', !ok); if (ok) n++; });
    document.querySelectorAll('#mmLista details.mimei-grupo').forEach(d => { const vis = d.querySelectorAll('.mimei-item[data-id]:not(.mimei-off)').length; d.classList.toggle('mimei-off', !vis); if (q && vis) d.open = true; else if (!q) d.open = abertos.has(d.dataset.grupo); });
    $('#mmLista').classList.toggle('filtrando', !!q);
    $('#mmContaL').textContent = q ? (n ? `${n} ${n === 1 ? 'lanche' : 'lanches'}` : 'Nenhum lanche encontrado') : '';
  };
  $('#mmBuscaL').oninput = () => { $('#mmLimpaL').classList.toggle('mimei-off', !$('#mmBuscaL').value); filtrarLista(); };
  $('#mmLimpaL').onclick = () => { $('#mmBuscaL').value = ''; $('#mmLimpaL').classList.add('mimei-off'); $('#mmBuscaL').focus(); filtrarLista(); };
  // arrastar para reordenar (pointer events: mouse e toque); usa o mesmo mimei_ordem dos botões ↑
  document.querySelectorAll('#mmLista summary .mimei-arrasta').forEach(h => h.onclick = e => e.preventDefault());
  document.querySelectorAll('#mmLista .mimei-arrasta').forEach(h => h.onpointerdown = e => {
    if ($('#mmLista').classList.contains('filtrando') || (e.button && e.pointerType === 'mouse')) return;
    const un = h.closest('.mimei-sabores > .mimei-item, #mmLista > *'), pai = un.parentElement, antes = [...document.querySelectorAll('#mmLista .mimei-item[data-id]')].map(x => x.dataset.id).join();
    e.preventDefault(); un.classList.add('mimei-arrastando'); const pega = e.clientY - un.getBoundingClientRect().top;
    // ouvintes no documento: mover o nó no DOM derruba o pointer capture
    const mover = ev => {
      if (ev.pointerId !== e.pointerId) return; ev.preventDefault();
      // troca quando o item "arrastado" (posição virtual do dedo) cobre metade do vizinho — antes o DEDO tinha de passar do meio do vizinho (~1 item inteiro, 81px nos sabores)
      const vis = x => x && !x.classList.contains('mimei-off') && x.getBoundingClientRect().height;
      const topo = ev.clientY - pega, base = topo + un.getBoundingClientRect().height;
      for (let k = 0; k < 50; k++) {
        const nx = un.nextElementSibling, pv = un.previousElementSibling, bn = vis(nx) && nx.getBoundingClientRect(), bp = vis(pv) && pv.getBoundingClientRect();
        if (bn && base > bn.top + bn.height / 2) pai.insertBefore(nx, un);
        else if (bp && topo < bp.bottom - bp.height / 2) pai.insertBefore(un, pv);
        else break;
      }
      if (ev.clientY < 70) scrollBy(0, -12); else if (ev.clientY > innerHeight - 110) scrollBy(0, 12);
    };
    const soltar = async ev => {
      if (ev.pointerId !== e.pointerId) return;
      document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar); document.removeEventListener('pointercancel', soltar);
      un.classList.remove('mimei-arrastando');
      const ids = idsDom();
      if (ids.join() === antes) return;
      await salvarOrdem(ids);
    };
    document.addEventListener('pointermove', mover, { passive: false }); document.addEventListener('pointerup', soltar); document.addEventListener('pointercancel', soltar);
  });
  // chips: degradê indicando que há mais à direita
  const chips = $('#mmChips'), fimChips = () => chips.classList.toggle('fim', chips.scrollLeft + chips.clientWidth >= chips.scrollWidth - 4);
  chips.onscroll = fimChips; fimChips();
  // busca/filtros fixos: sombra quando grudam no topo
  if (window.MIMEI_SCROLL) removeEventListener('scroll', window.MIMEI_SCROLL);
  window.MIMEI_SCROLL = () => { const t = $('#mm .mimei-tools'); if (!t) { removeEventListener('scroll', window.MIMEI_SCROLL); window.MIMEI_SCROLL = null; return; } const b = t.getBoundingClientRect(), c = t.parentElement.getBoundingClientRect(); t.classList.toggle('fixo', b.top <= parseFloat(getComputedStyle(t).top) + 1 && c.top < b.top - 1); };
  addEventListener('scroll', window.MIMEI_SCROLL, { passive: true }); window.MIMEI_SCROLL();
  $('#mmNovo').onclick = () => editarLanche(null, [...new Set(lista.map(x => x.grupo).filter(Boolean))]);
  ligarPareamento();
  // gerar app
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#mmModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(p => n(p) === q)) || ((l) => l.length === 1 ? l[0] : null)(modelos.filter(m => n(m.nome).startsWith(q))); };
  $('#mmApp').onsubmit = async e => {
    e.preventDefault(); const m = achar($('#mmModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    $('#mmAppBt').disabled = true; $('#mmProg').textContent = '⚙️ Compilando o ME MIMEI (cerca de 30 s)…';
    try {
      const a = await api('mimei_app', { modelo: m.id });
      const esperar = async (n = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#mmProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS no relógio. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; $('#mmAppBt').disabled = false; return; }
        if (s.status === 'erro' || n > 90) { $('#mmProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); $('#mmAppBt').disabled = false; return; }
        setTimeout(() => esperar(n + 1), 2000); };
      esperar();
    } catch (x) { $('#mmProg').textContent = '❌ ' + x.message; $('#mmAppBt').disabled = false; }
  };
}
function editarLanche(l, grupos = []) {
  let imagem = null, emoji = l?.emoji || '', bib = null;
  modal(`<h2>${l ? 'Editar lanche' : 'Novo lanche'}</h2><form id="fLanche">
    <div class="mimei-prev" ${l?.icone ? '' : 'style="height:0;margin:0"'} id="lcPrevBox"><img id="lcPrev" src="${esc(l?.icone || '')}" alt="" onerror="this.style.visibility='hidden'"><span id="lcEmojiAtual">${esc(emoji)}</span></div>
    <div class="campo"><label>🔎 Buscar calorias (tabela TACO + Open Food Facts)</label><input id="lcBusca" autocomplete="off" placeholder="Ex.: coxinha, pastel de queijo, doritos"><div id="lcResultados" class="busca-res"></div></div>
    <div class="campo"><label>Nome</label><input name="nome" maxlength="40" required value="${esc(l?.nome || '')}" placeholder="Ex.: Coxinha"></div>
    <div class="campo"><label>Grupo (opcional — junta sabores, ex.: Cuscuz, Tapioca)</label><input name="grupo" maxlength="40" list="lcGrupos" autocomplete="off" value="${esc(l?.grupo || '')}" placeholder="sem grupo"><datalist id="lcGrupos">${grupos.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
    <div class="linha"><div class="campo"><label>Gramas da porção</label><input id="lcGramas" type="number" min="1" max="3000" placeholder="opcional"></div><div class="campo"><label>Calorias (kcal)</label><input name="kcal" type="number" min="1" max="5000" required value="${l?.kcal || ''}"></div></div>
    <div class="campo"><label>Porção (texto)</label><input name="porcao" maxlength="40" value="${esc(l?.porcao || '')}" placeholder="1 unidade"></div>
    <div class="mini" id="lcBase" style="margin:-6px 0 12px"></div>
    <div class="campo"><label>Ícone 3D da biblioteca…</label><div class="emojis bib" id="lcBib">${(window.MIMEI_BIB || []).map(b => `<button type="button" data-bib="${b}" title="${b.replace(/_/g, ' ')}"><img src="app/mimei/biblioteca/${b}.png" alt=""></button>`).join('')}</div></div>
    <div class="campo"><label>…ou um emoji…</label><div class="emojis">${EMOJIS_MIMEI.map(e => `<button type="button" class="${e === emoji ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div></div>
    <div class="campo"><label>…ou envie uma imagem (PNG/JPG, fundo transparente fica melhor)</label><input type="file" id="lcImg" accept="image/*"></div>
    <button class="btn" id="lcOk">Salvar</button></form>`, () => {
    document.querySelectorAll('[data-bib]').forEach(b => b.onclick = () => { bib = b.dataset.bib; emoji = ''; imagem = null; $('#lcImg').value = ''; document.querySelectorAll('[data-bib],[data-emoji]').forEach(x => x.classList.toggle('on', x === b)); $('#lcPrevBox').removeAttribute('style'); $('#lcPrev').src = b.querySelector('img').src; $('#lcPrev').style.visibility = 'visible'; $('#lcEmojiAtual').textContent = ''; });
    document.querySelectorAll('[data-emoji]').forEach(b => b.onclick = () => { emoji = b.dataset.emoji; imagem = null; bib = null; $('#lcImg').value = ''; document.querySelectorAll('[data-emoji]').forEach(x => x.classList.toggle('on', x === b)); $('#lcEmojiAtual').textContent = emoji; $('#lcPrev').style.visibility = 'hidden'; });
    // busca de calorias
    let kcal100 = null, tBusca = null, achados = [];
    const fmt1 = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
    const recalcular = () => { const g = +$('#lcGramas').value; if (kcal100 && g) { document.querySelector('[name=kcal]').value = Math.round(kcal100 * g / 100); if (!document.querySelector('[name=porcao]').dataset.manual) document.querySelector('[name=porcao]').value = g + ' g'; } };
    $('#lcGramas').oninput = recalcular;
    document.querySelector('[name=porcao]').oninput = e => { e.target.dataset.manual = 1; };
    $('#lcBusca').oninput = e => { clearTimeout(tBusca); const q = e.target.value.trim(); if (q.length < 2) { $('#lcResultados').innerHTML = ''; return; }
      tBusca = setTimeout(async () => { $('#lcResultados').innerHTML = '<div class="mini">Buscando…</div>';
        const r = await apiGet('mimei_buscar', { q }).catch(() => null); achados = r?.itens || [];
        $('#lcResultados').innerHTML = achados.length ? achados.map((a, i) => `<button type="button" class="busca-item" data-i="${i}">${a.img ? `<img src="${esc(a.img)}" alt="">` : '<span class="busca-sem">🍽️</span>'}<span><b>${esc(a.nome)}</b><small>${a.marca ? esc(a.marca) + ' · ' : ''}${fmt1(a.kcal100)} kcal/100 g${a.porcao_g ? ' · porção ' + (a.porcao ? esc(a.porcao) : a.porcao_g + ' g') + ' = ' + Math.round(a.kcal100 * a.porcao_g / 100) + ' kcal' : ''} · ${a.fonte}</small></span></button>`).join('') : '<div class="mini">Nada encontrado — preencha à mão.</div>';
        document.querySelectorAll('.busca-item').forEach(b => b.onclick = () => { const a = achados[+b.dataset.i]; kcal100 = a.kcal100;
          document.querySelector('[name=nome]').value = a.nome.split(',')[0].slice(0, 40);
          $('#lcGramas').value = a.porcao_g || 100; delete document.querySelector('[name=porcao]').dataset.manual;
          document.querySelector('[name=porcao]').value = a.porcao ? String(a.porcao).slice(0, 40) : (a.porcao_g || 100) + ' g'; if (a.porcao) document.querySelector('[name=porcao]').dataset.manual = 1;
          recalcular(); $('#lcBase').textContent = `Base: ${fmt1(a.kcal100)} kcal a cada 100 g (${a.fonte}). Ajuste as gramas da sua porção.`; $('#lcResultados').innerHTML = ''; $('#lcBusca').value = ''; });
      }, 350); };
    $('#lcImg').onchange = e => { const f = e.target.files[0]; if (!f) return; if (f.size > 3e6) return toast('Imagem muito grande (máx. 3 MB)'); const rd = new FileReader(); rd.onload = () => { imagem = rd.result; $('#lcPrev').src = imagem; $('#lcPrev').style.visibility = 'visible'; $('#lcEmojiAtual').textContent = ''; }; rd.readAsDataURL(f); };
    $('#fLanche').onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); $('#lcOk').disabled = true; $('#lcOk').textContent = 'Salvando…';
      try { await api('mimei_salvar', { id: l?.id, nome: f.nome, kcal: +f.kcal, porcao: f.porcao, grupo: f.grupo, emoji, imagem, biblioteca: bib }); fecharModal(); toast('Lanche salvo — o relógio atualiza sozinho'); renderMimei(); }
      catch (x) { toast(x.message, 4000); $('#lcOk').disabled = false; $('#lcOk').textContent = 'Salvar'; }
    };
  });
}

/* ---------- MAIS: menu organizado ---------- */
function renderMais() {
  const u = S.usuario || {};
  const grupos = [
    ['Seus dados', [['perfil', ICO.perfilUser, 'Perfil e metas', 'Dados pessoais, metas diárias e zonas de FC'], ['perfil', ICO.sync, 'Integrações', 'Garmin, Strava e sincronização', 'integracoes'], ['dispositivo', ICO.relogio, 'Relógio', 'Bateria, sensores e recursos do aparelho']]],
    ['Análises', [['relatorios', ICO.relatorios, 'Relatórios', 'Forma × fadiga, risco de lesão, sono, correlações'], ['estatisticas', ICO.barras, 'Desempenho', 'Totais, recordes e medalhas'], ['treinos', ICO.semana, 'Treinos e calendário', 'Planeje e marque treinos concluídos']]],
    ['Apps do relógio', [['app', ICO.app, 'Rastreador', 'GPS, bateria e FC ao vivo no Traccar'], ['app', '📻', 'Walkie-Talkie', 'Canais, mensagens rápidas e SOS', 'walkie'], ['app', '🍺', 'ME MIMEI', 'Quantos lanches cabem nas calorias do dia', 'mimei'], ['app', '⌚', 'Omnitrix Ben 10', 'Escolha o alien girando o Omnitrix', 'ben10'], ['app', '🥚', 'Bichinho Virtual', 'Cuide do bichinho: ovo, fome, cocô e sono', 'tama']]],
  ];
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Mais</h1></div>
  <section class="w mais-perfil click" data-tela="perfil"><div class="w-corpo"><div class="avatar">${esc((u.nome || '?')[0].toUpperCase())}</div><div><b>${esc(u.nome || '')}</b><span>${esc(u.email || '')}</span></div><span class="seta">›</span></div></section>
  ${grupos.map(([titulo, itens]) => `<div class="mais-grupo">${titulo}</div><section class="w"><div class="lista mais-lista">${itens.map(([tela, ic, nome, desc, arg]) => `<div class="item" data-tela="${tela}"${arg ? ` data-arg="${arg}"` : ''}><div class="ic">${ic}</div><div class="info"><b>${nome}</b><span>${desc}</span></div><span class="seta">›</span></div>`).join('')}</div></section>`).join('')}
  <section class="w"><div class="lista mais-lista"><div class="item" id="maisSair"><div class="ic verm">⏻</div><div class="info"><b>Sair</b><span>Desconectar desta conta</span></div></div></div></section>
  <div class="mais-grupo">Desenvolvedor</div><section class="w"><div class="lista mais-lista dev">
    <a class="item" href="https://instagram.com/alequizao" target="_blank" rel="noopener"><div class="ic">📸</div><div class="info"><b>Instagram</b><span>@alequizao</span></div><span class="seta">›</span></a>
    <a class="item" href="https://wa.me/5582988717072" target="_blank" rel="noopener"><div class="ic">💬</div><div class="info"><b>WhatsApp</b><span>+55 82 98871-7072</span></div><span class="seta">›</span></a>
    <a class="item" href="mailto:alequizao.dev@gmail.com"><div class="ic">✉️</div><div class="info"><b>E-mail</b><span>alequizao.dev@gmail.com</span></div><span class="seta">›</span></a>
    <a class="item" href="https://alequizao.com" target="_blank" rel="noopener"><div class="ic">🌐</div><div class="info"><b>Site</b><span>alequizao.com</span></div><span class="seta">›</span></a>
    <a class="item" href="https://github.com/alequizao" target="_blank" rel="noopener"><div class="ic">🐙</div><div class="info"><b>GitHub</b><span>github.com/alequizao</span></div><span class="seta">›</span></a>
  </div></section>
  <div class="mini centro" style="margin:10px 0">Garmin Connect (clone) v${window.APP_VERSAO} · desenvolvido por Alequizao</div>${tabbar('mais')}</div>`;
  $('#maisSair').onclick = async () => { if (confirm('Sair da conta?')) { await api('sair', {}); store.del('usuario'); store.del('dash'); history.replaceState(null, '', location.pathname); renderLogin(); } };
}

/* ---------- APPS › SIMULADOR (relógio real desenhado com as medidas do Connect IQ SDK) ---------- */
// Cada usuário logado conta como um relógio próprio (token "simulador"), então duas pessoas testam o Walkie-Talkie entre si.
const SIM = { dev: null, img: null, app: 'mimei', canvas: null, escala: 1, menu: null, timer: null,
  mimei: { dados: null, sel: 0, icones: {}, estado: '' },
  walkie: { token: null, canal: null, canais: [], mensagens: [], ultimoId: 0, desloc: 0, frases: null, estado: 'Conectando...', cfg: null },
  rastreador: { ativo: true, leitura: null, estado: '' }, sobre: null };
async function renderSimulador(arg) {
  const [modeloArg, appArg] = String(arg || '').split('-').slice(1);
  if (appArg) SIM.app = appArg;
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('sim')}
  <section class="w"><header class="w-top"><span class="w-ico">🖥️</span><span class="w-tit">Simulador do relógio</span></header><div class="w-corpo">
    <div class="sim-apps">${[['mimei', '🍺', 'ME MIMEI'], ['walkie', '📻', 'Walkie-Talkie'], ['rastreador', '📍', 'Rastreador'], ['tama', '🥚', 'Bichinho'], ['omnitrix', '🟢', 'Omnitrix']].map(([k, i, n]) => `<button class="chip ${SIM.app === k ? 'ativo' : ''}" data-simapp="${k}">${i} ${n}</button>`).join('')}</div>
    <div class="sim-barra"><input id="simModelo" list="simModelos" value="Forerunner® 165 (fr165)" autocomplete="off"><datalist id="simModelos"></datalist><button class="btn peq" id="simFoto">📷 Baixar foto</button></div>
    <div class="sim-palco"><canvas id="simCanvas"></canvas></div>
    <div class="mini centro" id="simDica"></div>
  </div></section>${tabbar('app')}</div>`;
  SIM.canvas = $('#simCanvas');
  const modelos = await fetch('app/modelos.json?v=2').then(r => r.json()).catch(() => []);
  $('#simModelos').innerHTML = modelos.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join('');
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(p => n(p) === q)); };
  const rota = () => history.replaceState(null, '', `#/app/sim-${SIM.dev?.id || 'fr165'}-${SIM.app}`);
  const carregarModelo = async id => {
    SIM.dev = await fetch(`app/sim/${id}.json`).then(r => r.json());
    SIM.img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = `app/sim/${SIM.dev.imagem}`; });
    SIM.mimei.icones = {}; rota(); simDesenhar(); simCarregarIcones();
  };
  document.querySelectorAll('[data-simapp]').forEach(b => b.onclick = () => { SIM.app = b.dataset.simapp; SIM.menu = null; document.querySelectorAll('[data-simapp]').forEach(x => x.classList.toggle('ativo', x === b)); rota(); simIniciarApp(); });
  $('#simModelo').onchange = () => { const m = achar($('#simModelo').value); if (m) carregarModelo(m.id); };
  $('#simFoto').onclick = () => { const a = document.createElement('a'); a.download = `${SIM.app}-${SIM.dev?.id || 'relogio'}.png`; a.href = SIM.canvas.toDataURL('image/png'); a.click(); };
  const inicial = (modeloArg && modelos.find(m => m.id === modeloArg)) || modelos.find(m => m.id === 'fr165') || modelos[0];
  $('#simModelo').value = `${inicial.nome} (${inicial.id})`;
  await carregarModelo(inicial.id);
  simIniciarApp();
  let ini = null;
  SIM.canvas.onpointerdown = e => { ini = simPonto(e); };
  SIM.canvas.onpointerup = e => {
    const p = simPonto(e); if (!ini || !SIM.dev) return; const dx = p.x - ini.x, dy = p.y - ini.y; ini = null; const t = SIM.dev.tela;
    if (Math.hypot(dx, dy) > 30) return simTecla(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'next' : 'prev') : (dy < 0 ? 'next' : 'prev'));
    for (const [k, r] of Object.entries(SIM.dev.teclas || {})) if (p.x >= r.x - 10 && p.x <= r.x + r.width + 10 && p.y >= r.y - 10 && p.y <= r.y + r.height + 10) return simTecla({ enter: 'start', esc: 'back', up: 'prev', down: 'next' }[k] || k);
    if (SIM.dev.toque && p.x > t.x && p.x < t.x + t.width && p.y > t.y && p.y < t.y + t.height) simToque(p.y - t.y);
  };
  document.onkeydown = e => { if (!$('#simCanvas') || /input|select|textarea/i.test(document.activeElement?.tagName)) return;
    const m = { ArrowDown: 'next', ArrowRight: 'next', ArrowUp: 'prev', ArrowLeft: 'prev', Enter: 'start', Escape: 'back', Backspace: 'back' }[e.key]; if (m) { e.preventDefault(); simTecla(m); } };
}
function simPonto(e) { const r = SIM.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / SIM.escala, y: (e.clientY - r.top) / SIM.escala }; }
async function simIniciarApp() {
  if (!document.querySelector('#simCanvas')) { SIM.canvas = null; return; }
  clearTimeout(SIM.timer); SIM.menu = null; SIM.sobre = null;
  const dicas = { mimei: 'Deslize ou use ↑ ↓ ← → para trocar de lanche; START (Enter) abre "Comi" e "Desfazer". Ações valem de verdade.',
    walkie: 'Você conta como um relógio próprio: abra o simulador em outra conta (ex.: jeovana) para conversar. START abre mensagens rápidas, escrever, chamar atenção, SOS e canais.',
    omnitrix: 'START (Enter) abre o Omnitrix, ↑ ↓ giram entre os 59 aliens e START transforma. É o mesmo Omnitrix da aba Ben 10.',
    tama: 'Cuide do bichinho: ↑ ↓ escolhem o ícone, START (Enter) usa, VOLTAR (Esc) cancela. É o mesmo bichinho da aba Bichinho.',
    rastreador: 'Mostra a última leitura real do seu relógio. O simulador não envia posição nem bateria (para não criar dados falsos). MENU (segurar UP) abre Sobre.' };
  $('#simDica') && ($('#simDica').textContent = dicas[SIM.app]);
  if (SIM.app === 'mimei') await simMimeiDados();
  if (SIM.app === 'walkie') await simWalkieIniciar();
  if (SIM.app === 'rastreador') await simRastreadorDados();
  clearInterval(SIM.b10Timer);
  clearInterval(B10.anim); B10.anim = null;
  if (SIM.app === 'omnitrix') {
    if (!B10.aliens.length) { try { B10.aliens = await fetch('app/ben10/aliens.json?v=2').then(x => x.json()); } catch (e) { } }
    SIM.b10Timer = setInterval(() => { if (SIM.app === 'omnitrix' && SIM.canvas) { b10Tique(); simDesenhar(); } else clearInterval(SIM.b10Timer); }, 50);
  }
  clearInterval(SIM.tamaTimer); clearInterval(TAMA.anim2); TAMA.anim2 = null; if (SIM.app === 'tama') { tamaCarregar(); tamaSimular(); SIM.tamaTimer = setInterval(() => { if (SIM.app === 'tama' && SIM.canvas) tamaTique(); else clearInterval(SIM.tamaTimer); }, 250); }
  simDesenhar();
}
/* ---- ME MIMEI ---- */
async function simMimeiDados() {
  const j = await apiGet('mimei_estado').catch(() => null); if (!j?.ok) return;
  const r = j.resumo; j.lanches.forEach(l => l.pode = l.kcal > 0 ? Math.round(r.saldo / l.kcal * 10) / 10 : 0);
  const ult = j.consumo[0]; r.ultimo = ult ? `${String(+ult.qtd).replace('.', ',')}x ${ult.nome}` : null;
  const M = SIM.mimei; M.dados = j; if (M.sel >= j.lanches.length) M.sel = 0; M.estado = ''; simCarregarIcones(); simDesenhar();
}
function simCarregarIcones() { const M = SIM.mimei; (M.dados?.lanches || []).forEach(l => { if (!l.icone || l.id in M.icones) return; M.icones[l.id] = null; const i = new Image(); i.onload = () => { M.icones[l.id] = i; simDesenhar(); }; i.src = l.icone; }); }
/* ---- WALKIE-TALKIE (fala com walkie.php como um relógio de verdade) ---- */
async function simWalkiePedir(dados) {
  const W = SIM.walkie; if (!W.token) W.token = (await api('sim_token', { tipo: 'walkie' })).token;
  const r = await fetch('walkie.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: W.token, versao: 'simulador', ...dados }) });
  return r.ok ? r.json() : { ok: false, status: r.status };
}
async function simWalkieIniciar() { const W = SIM.walkie; W.mensagens = []; W.ultimoId = 0; W.desloc = 0; await simWalkieBuscar(); }
async function simWalkieBuscar() {
  if (SIM.app !== 'walkie' || !$('#simCanvas')) return; const W = SIM.walkie; clearTimeout(SIM.timer);
  const d = { acao: 'receber', desde: W.ultimoId, limite: 20 }; if (W.canal) d.canal = W.canal;
  const j = await simWalkiePedir(d).catch(() => null);
  if (!j?.ok) W.estado = 'Sem conexao';
  else {
    W.canais = j.canais || []; if (!W.canal && j.canal_id) W.canal = j.canal_id; W.nomeCanal = j.canal; W.frases = j.frases; W.cfg = j.config;
    W.estado = j.online != null ? `${j.online} no canal` : 'Online';
    const novas = (j.mensagens || []).filter(m => m.id > W.ultimoId);
    if (novas.length) { W.mensagens.push(...novas); W.mensagens = W.mensagens.slice(-20); W.ultimoId = novas[novas.length - 1].id; W.desloc = 0;
      if (W.carregado && novas.some(m => !m.meu)) { const u = novas[novas.length - 1]; simVibrar(u.atencao || u.sos ? 10 : 1); } }
    W.carregado = true;
  }
  simDesenhar(); SIM.timer = setTimeout(simWalkieBuscar, ((W.cfg?.intervalo_s) || 8) * 1000);
}
function simVibrar(seg) { const cv = SIM.canvas; if (!cv) return; cv.classList.add('sim-vibra'); navigator.vibrate?.(seg > 1 ? Array(10).fill([700, 300]).flat() : [200, 100, 200]); setTimeout(() => cv.classList.remove('sim-vibra'), seg * 1000); }
async function simWalkieEnviar(texto, tipo = 'texto') {
  const W = SIM.walkie; W.estado = 'Enviando...'; simDesenhar();
  const d = { acao: 'enviar', texto, tipo, sos: tipo === 'sos' ? 1 : 0 }; if (W.canal) d.canal = W.canal;
  const r = await simWalkiePedir(d).catch(() => null); W.estado = r?.ok ? 'Enviado' : 'Falha no envio'; simWalkieBuscar();
}
/* ---- RASTREADOR (somente exibição da última leitura real) ---- */
async function simRastreadorDados() {
  const j = await apiGet('ao_vivo').catch(() => null); const R = SIM.rastreador; R.leitura = j?.relogio || null;
  R.estado = R.leitura ? `Ultima leitura real ha ${Math.max(0, Math.round((j.segundos || 0) / 60))} min` : 'Sem leituras do relogio';
  simDesenhar(); clearTimeout(SIM.timer); SIM.timer = setTimeout(() => SIM.app === 'rastreador' && simRastreadorDados(), 20000);
}
/* ---- teclas e menus ---- */
function simTecla(t) {
  if (SIM.sobre) { if (t === 'next') SIM.sobre.deslocamento++; else if (t === 'prev') SIM.sobre.deslocamento = Math.max(0, SIM.sobre.deslocamento - 1); else if (t === 'back') SIM.sobre = null; return simDesenhar(); }
  if (SIM.app === 'rastreador' && t === 'menu') { SIM.sobre = { app: 'Rastreador', versao: '', deslocamento: 0 }; return simDesenhar(); }
  if (SIM.menu) {
    const m = SIM.menu;
    if (t === 'next') m.i = (m.i + 1) % m.itens.length; else if (t === 'prev') m.i = (m.i - 1 + m.itens.length) % m.itens.length;
    else if (t === 'back') SIM.menu = m.pai || null; else if (t === 'start') simEscolher(m.itens[m.i]);
    return simDesenhar();
  }
  if (SIM.app === 'mimei') { const M = SIM.mimei, n = M.dados?.lanches.length || 0;
    if (t === 'next' && n) M.sel = (M.sel + 1) % n; else if (t === 'prev' && n) M.sel = (M.sel - 1 + n) % n; else if ((t === 'start' || t === 'menu') && n) simMenuMimei(); }
  if (SIM.app === 'walkie') { const W = SIM.walkie;
    if (t === 'prev') W.desloc = Math.min(W.desloc + 1, Math.max(0, W.mensagens.length - 1)); else if (t === 'next') W.desloc = Math.max(0, W.desloc - 1); else if (t === 'start' || t === 'menu') simMenuWalkie(); }
  if (SIM.app === 'omnitrix') { b10Acao({ start: 'start', back: 'voltar', prev: 'cima', next: 'baixo', menu: 'start' }[t] || 'start'); return simDesenhar(); }
  if (SIM.app === 'tama') { tamaBotao({ start: 'start', back: 'back', prev: 'cima', next: 'baixo', menu: 'start' }[t] || 'start'); return simDesenhar(); }
  if (SIM.app === 'rastreador' && t === 'start') { SIM.rastreador.ativo = !SIM.rastreador.ativo; }
  simDesenhar();
}
function simToque(yTela) {
  if (!SIM.menu) { if (SIM.app !== 'rastreador') simTecla('start'); return; }
  const m = SIM.menu, alt = SIM.dev.tela.height / 5, i = Math.floor((yTela - alt) / alt) + m.topo;
  if (i >= 0 && i < m.itens.length) { m.i = i; simEscolher(m.itens[i]); }
}
function simMenuMimei() {
  const M = SIM.mimei, l = M.dados.lanches[M.sel], r = M.dados.resumo;
  const itens = [{ t: 'Comi 1', s: l.porcao || `${l.kcal} kcal`, q: 1 }, { t: 'Comi meia', s: `${Math.round(l.kcal / 2)} kcal`, q: 0.5 }, { t: 'Comi 2', s: `${l.kcal * 2} kcal`, q: 2 }];
  if (r.ultimo) itens.push({ t: 'Desfazer ultimo', s: r.ultimo, a: 'desfazer' });
  itens.push({ t: 'Atualizar', s: 'v1.8.0', a: 'atualizar' }, { t: 'Sobre', s: 'desenvolvedor', a: 'sobre' });
  SIM.menu = { titulo: l.nome, itens, i: 0, topo: 0 };
}
function simMenuWalkie() {
  const W = SIM.walkie, itens = [];
  if (W.canais.length > 1) itens.push({ t: `Canais (${W.canais.length})`, s: `atual: ${W.nomeCanal || ''}`, a: 'canais' });
  itens.push({ t: 'Escrever', s: 'teclado do relogio', a: 'escrever' });
  (W.frases || ['OK', 'Chegando', 'Me espera', 'Estou bem']).forEach(f => itens.push({ t: f, a: 'frase' }));
  itens.push({ t: 'Chamar atencao', s: 'vibra 10 s nos outros', a: 'atencao' }, { t: 'SOS', s: 'envia sua localizacao', a: 'sos' }, { t: 'Atualizar', s: 'simulador', a: 'atualizar' }, { t: 'Sobre', s: 'desenvolvedor', a: 'sobre' });
  SIM.menu = { titulo: 'Enviar', itens, i: 0, topo: 0 };
}
async function simEscolher(it) {
  const pai = SIM.menu; SIM.menu = null;
  if (it.a === 'sobre') { SIM.sobre = { app: SIM.app === 'mimei' ? 'ME MIMEI' : 'Walkie-Talkie', versao: SIM.app === 'mimei' ? '1.12.0' : '2.3.2', deslocamento: 0 }; return simDesenhar(); }
  if (SIM.app === 'mimei') {
    const M = SIM.mimei, l = M.dados.lanches[M.sel]; M.estado = it.a === 'desfazer' ? 'Desfazendo...' : it.a === 'atualizar' ? 'Atualizando...' : 'Registrando...'; simDesenhar();
    try { if (it.q) await api('mimei_comi', { id: l.id, qtd: it.q }); else if (it.a === 'desfazer') await api('mimei_desfazer', {}); } catch (x) { toast(x.message); }
    return simMimeiDados();
  }
  if (SIM.app === 'walkie') {
    const W = SIM.walkie;
    if (it.a === 'canais') { SIM.menu = { titulo: 'Canais', pai, i: 0, topo: 0, itens: W.canais.map((c, i) => ({ t: c.nome, s: `${c.online} on-line${i === 0 ? ' · principal' : ''}${c.id == W.canal ? ' · aberto' : ''}`, a: 'abrircanal', id: c.id })) }; return simDesenhar(); }
    if (it.a === 'abrircanal') { W.canal = it.id; return simWalkieIniciar(); }
    if (it.a === 'escrever') { const t = prompt('Mensagem (até 120 letras):'); if (t && t.trim()) simWalkieEnviar(t.trim().slice(0, 120)); return; }
    if (it.a === 'frase') return simWalkieEnviar(it.t);
    if (it.a === 'atencao') return simWalkieEnviar('Atencao!', 'atencao');
    if (it.a === 'sos') return simWalkieEnviar('SOS! Preciso de ajuda', 'sos');
    return simWalkieBuscar();
  }
}
/* ---- desenho ---- */
function simDesenhar() {
  const d = SIM.dev, cv = SIM.canvas; if (!d || !cv) return;
  const larguraFoto = SIM.img ? SIM.img.width : d.tela.width + 2 * d.tela.x, alturaFoto = SIM.img ? SIM.img.height : d.tela.height + 2 * d.tela.y;
  SIM.escala = Math.min(460, cv.parentElement.clientWidth) / larguraFoto;
  const dpr = window.devicePixelRatio || 1;
  cv.width = larguraFoto * SIM.escala * dpr; cv.height = alturaFoto * SIM.escala * dpr; cv.style.width = larguraFoto * SIM.escala + 'px'; cv.style.height = alturaFoto * SIM.escala + 'px';
  const c = cv.getContext('2d'); c.setTransform(SIM.escala * dpr, 0, 0, SIM.escala * dpr, 0, 0); c.clearRect(0, 0, larguraFoto, alturaFoto);
  if (SIM.img) c.drawImage(SIM.img, 0, 0);
  const { x: tx, y: ty, width: w, height: h } = d.tela, redondo = d.forma === 'round';
  c.save(); c.translate(tx, ty); c.beginPath(); redondo ? c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2) : c.rect(0, 0, w, h); c.clip();
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  const fonte = nome => { const f = d.fontes[nome] || { px: 16, peso: 400 }; return { css: `${f.peso >= 700 ? 700 : 400} ${f.px}px Roboto, Arial, sans-serif`, h: Math.round(f.px * 1.17) }; };
  const cor = x => '#' + x.toString(16).padStart(6, '0');
  if (SIM.sobre && typeof simDesenharSobre === 'function') simDesenharSobre(c, w, h, redondo, fonte, cor, SIM.sobre);
  else if (SIM.menu) simDesenharMenu(c, w, h, redondo, fonte, cor);
  else if (SIM.app === 'omnitrix') b10Desenhar(c, w, h);
  else if (SIM.app === 'tama') tamaDesenhar(c, w, h);
  else if (SIM.app === 'mimei') simDesenharMimei(c, w, h, redondo, fonte, cor);
  else if (SIM.app === 'walkie' && typeof simDesenharWalkie === 'function') { const W = SIM.walkie, pos = W.canais.findIndex(x => x.id == W.canal);
    simDesenharWalkie(c, w, h, redondo, fonte, cor, { canal: W.nomeCanal || 'Walkie-Talkie', posCanal: pos + 1, totalCanais: W.canais.length, mensagens: W.mensagens, deslocamento: W.desloc, estado: W.estado, atualizacao: false, aviso: W.cfg?.aviso || '' }); }
  else if (SIM.app === 'rastreador' && typeof simDesenharRastreador === 'function') { const R = SIM.rastreador, l = R.leitura;
    simDesenharRastreador(c, w, h, redondo, fonte, cor, { ativo: R.ativo, bateria: l ? Math.round(l.bateria) : '--', gps: l?.precisao >= 3 ? 'bom' : l?.precisao == 2 ? 'fraco' : l ? 'procurando' : 'sem sinal', enviados: 0, ultimoEnvio: l ? l.recebido.slice(11, 19) : null, ultimoOk: true, estado: R.estado }); }
  c.restore();
}
const simCorda = (w, h, redondo, y1, y2) => { if (!redondo) return w * 0.92; const r = w / 2, cy = h / 2, dd = Math.max(Math.abs(y1 - cy), Math.abs(y2 - cy)); return dd >= r ? 0 : 2 * Math.sqrt(r * r - dd * dd) * 0.92; };
function simTexto(c, t, x, y, f, corTxt, alinhar = 'center', largMax) { c.font = f.css; c.fillStyle = corTxt; c.textAlign = alinhar; c.textBaseline = 'top'; t = String(t);
  c.fillText(t, x, y); }
/* réplica do onUpdate do ME MIMEI (MeMimeiApp.mc v1.6): nada abreviado — fonte diminui e texto quebra em linhas */
function simQuebrar(c, t, f, larg) {
  c.font = f.css; const linhas = []; let atual = '';
  for (let p of String(t).split(' ')) {
    const tent = atual ? atual + ' ' + p : p;
    if (c.measureText(tent).width <= larg) { atual = tent; continue; }
    if (atual) linhas.push(atual);
    while (p.length > 1 && c.measureText(p).width > larg) { let k = p.length - 1; while (k > 1 && c.measureText(p.slice(0, k)).width > larg) k--; linhas.push(p.slice(0, k)); p = p.slice(k); }
    atual = p;
  }
  if (atual) linhas.push(atual); return linhas;
}
function simMedir(c, t, fontes, larg) { for (const f of fontes) { c.font = f.css; if (c.measureText(t).width <= larg) return [f, [t]]; } const f = fontes[fontes.length - 1]; return [f, simQuebrar(c, t, f, larg)]; }
function simDesenharMimei(c, w, h, redondo, fonte, cor) {
  const M = SIM.mimei, dados = M.dados, r = dados?.resumo || {}, cx = w / 2, cy = h / 2;
  const fT = fonte('xtiny'), corda = (y1, y2) => simCorda(w, h, redondo, y1, y2);
  const pct = r.queimado > 0 ? Math.min(1, (r.comido || 0) / r.queimado) : 0;
  if (redondo) { const esp = Math.max(2, Math.floor(w * 0.012)), raio = w / 2 - esp - 1; c.lineWidth = esp; c.strokeStyle = cor(0x26262A); c.beginPath(); c.arc(cx, cy, raio, 0, Math.PI * 2); c.stroke();
    if (pct > 0.01) { c.strokeStyle = cor(0xF5A623); c.beginPath(); c.arc(cx, cy, raio, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); c.stroke(); } }
  const n = dados?.lanches.length || 0, yIni = h * (redondo ? 0.07 : 0.03), yFim = h * (redondo ? 0.94 : 0.97);
  const desenharLinhas = (med, y, corTxt) => { const [f, linhas] = med; linhas.forEach((ln, i) => simTexto(c, ln, cx, y + i * f.h, f, corTxt)); };
  if (!n) { desenharLinhas(simMedir(c, M.estado || 'Nenhum lanche', [fonte('small'), fT], w * 0.7), cy - fT.h, '#fff'); return; }
  const l = dados.lanches[M.sel], fmt = v => { const s2 = Math.round(v * 10) / 10; return (Math.abs(s2 - Math.trunc(s2)) < 0.05 ? Math.trunc(s2) : s2.toFixed(1)).toString().replace('.', ','); };
  const telaGrande = w >= 360, base = telaGrande ? 0.40 : 0.34;
  const numTxt = fmt(l.pode) + 'x', kcalTxt = String(l.kcal);
  const itens = [{ t: 'ME MIMEI', f: [fT], cor: 0xF5C23B }, { t: `${r.saldo ?? '--'} kcal livres`, f: [fT], cor: 0x9A9AA0 }, { bloco: true }, { t: l.nome, f: telaGrande ? [fonte('medium'), fonte('small'), fonte('tiny'), fT] : [fonte('small'), fonte('tiny'), fT], cor: 0xFFFFFF }];
  if (l.porcao) itens.push({ t: l.porcao, f: [fT], cor: 0x9A9AA0 });
  itens.push({ rodape: true, t: n <= 9 ? '' : `${M.sel + 1} / ${n}`, f: [fT], cor: 0x6A6A70 });
  const disponivel = yFim - yIni; let tam = Math.floor(w * base), espaco = 0;
  const larguras = itens.map(() => w * (redondo ? 0.78 : 0.92)), medidas = [], alturas = [], ys = [];
  for (let passada = 0; passada < 2; passada++) {
    let soma = 0;
    itens.forEach((it, k) => { if (it.bloco) return; if (it.rodape && n <= 9 && !M.estado) { medidas[k] = null; alturas[k] = fT.h; soma += fT.h; return; }
      medidas[k] = simMedir(c, it.rodape && M.estado ? M.estado : it.t, it.f, larguras[k]); alturas[k] = medidas[k][0].h * medidas[k][1].length; soma += alturas[k]; });
    tam = Math.floor(w * base); if (tam > disponivel - soma - 4 * (itens.length + 1)) tam = Math.floor(disponivel - soma - 4 * (itens.length + 1)); if (tam < 24) tam = 24;
    espaco = Math.max(0, (disponivel - soma - tam) / (itens.length + 1));
    let yy = yIni + espaco; itens.forEach((it, k) => { const hk = it.bloco ? tam : alturas[k]; ys[k] = yy; larguras[k] = corda(yy, yy + hk); yy += hk + espaco; });
  }
  itens.forEach((it, k) => {
    const y = ys[k];
    if (it.bloco) {
      const larg = corda(y, y + tam), fontesLado = ['large', 'medium', 'small', 'tiny', 'xtiny'].map(fonte); let fLado = fT, precisa = 0;
      for (const f of fontesLado) { c.font = f.css; const a = Math.max(c.measureText(numTxt).width, c.measureText(kcalTxt).width); c.font = fT.css; const b = Math.max(c.measureText('cabem').width, c.measureText('kcal').width);
        fLado = f; precisa = Math.max(a, b); if (precisa <= (larg - tam) / 2 - 6) break; }
      let t2 = tam; if (precisa > (larg - t2) / 2 - 6) t2 = Math.max(16, Math.floor(larg - 2 * precisa - 12));
      const ic = M.icones[l.id];
      if (ic) { const s = Math.min(t2 / ic.width, t2 / ic.height); c.drawImage(ic, cx - ic.width * s / 2, y + (tam - ic.height * s) / 2, ic.width * s, ic.height * s); }
      else { c.fillStyle = cor(0x2A2A2C); c.beginPath(); c.arc(cx, y + tam / 2, t2 / 2, 0, Math.PI * 2); c.fill(); }
      const yL = y + (tam - fLado.h - fT.h) / 2, xE = cx - t2 / 2 - 6 - precisa / 2, xD = cx + t2 / 2 + 6 + precisa / 2;
      simTexto(c, numTxt, xE, yL, fLado, cor(0xF5C23B)); simTexto(c, 'cabem', xE, yL + fLado.h, fT, cor(0x9A9AA0));
      simTexto(c, kcalTxt, xD, yL, fLado, '#fff'); simTexto(c, 'kcal', xD, yL + fLado.h, fT, cor(0x9A9AA0));
    } else if (medidas[k] === null) {
      const passo = Math.floor(w * 0.035), xp = cx - (n - 1) * passo / 2; for (let q = 0; q < n; q++) { c.fillStyle = q === M.sel ? cor(0xF5C23B) : cor(0x4A4A50); c.beginPath(); c.arc(xp + q * passo, y + fT.h / 2, q === M.sel ? 3 : 2, 0, Math.PI * 2); c.fill(); }
    } else desenharLinhas(medidas[k], y, it.rodape && M.estado ? cor(0x9A9AA0) : cor(it.cor));
  });
}
/* menu no estilo Menu2 da Garmin, respeitando as bordas */
function simDesenharMenu(c, w, h, redondo, fonte, cor) {
  const m = SIM.menu, fTit = fonte('small'), fItem = fonte('medium'), fSub = fonte('xtiny'), corda = (y1, y2) => simCorda(w, h, redondo, y1, y2);
  const yTit = h * 0.1; { const [f, ls] = simMedir(c, m.titulo, [fTit, fonte('tiny'), fonte('xtiny')], corda(yTit, yTit + fTit.h)); simTexto(c, ls.join(' '), w / 2, yTit + (fTit.h - f.h) / 2, f, '#fff'); }
  c.fillStyle = cor(0x1FA3E3); c.fillRect(w * 0.25, yTit + fTit.h + 4, w * 0.5, 2);
  const topoLista = yTit + fTit.h + 12, alt = (h * 0.92 - topoLista) / 3; m.topo = Math.max(0, Math.min(m.i - 1, m.itens.length - 3));
  for (let k = 0; k < 3 && m.topo + k < m.itens.length; k++) {
    const idx = m.topo + k, it = m.itens[idx], sel = idx === m.i, fT = sel ? fItem : fTit, y0 = topoLista + alt * k;
    const bloco = fT.h + (it.s ? fSub.h : 0), yy = y0 + (alt - bloco) / 2;
    if (sel) { c.fillStyle = cor(0x1C1C1E); c.fillRect(0, y0 + 2, w, alt - 4); }
    simTexto(c, it.t, w / 2, yy, fT, sel ? '#fff' : cor(0x8A8A90), 'center', corda(yy, yy + fT.h));
    if (it.s) simTexto(c, it.s, w / 2, yy + fT.h, fSub, cor(0x8A8A90), 'center', corda(yy + fT.h, yy + fT.h + fSub.h));
  }
}


/* ---------- simulador: réplicas SEM cortes do Walkie-Talkie (RadioApp.mc v2.3.1) e do Rastreador (PrincipalView.mc) ---------- */
function simLayoutHelpers(c, w, h, redondo, fonte) {
  const cy = h / 2;
  const corda = (y1, y2) => { if (!redondo) return w * 0.92; const r = w / 2, d = Math.max(Math.abs(y1 - cy), Math.abs(y2 - cy)); return d >= r ? 1 : 2 * Math.sqrt(r * r - d * d) * 0.92; };
  const largura = (t, f) => { c.font = f.css; return c.measureText(t).width; };
  /* quebra por palavra; palavra maior que a linha quebra por caracteres */
  const quebrar = (t, f, larg) => {
    const linhas = []; let atual = '';
    for (let pal of String(t ?? '').split(' ').filter(Boolean)) {
      const teste = atual ? atual + ' ' + pal : pal;
      if (largura(teste, f) <= larg) { atual = teste; continue; }
      if (atual) { linhas.push(atual); atual = ''; }
      while (largura(pal, f) > larg && pal.length > 1) { let n = pal.length - 1; while (n > 1 && largura(pal.slice(0, n), f) > larg) n--; linhas.push(pal.slice(0, n)); pal = pal.slice(n); }
      atual = pal;
    }
    if (atual || !linhas.length) linhas.push(atual);
    return linhas;
  };
  /* [fonte, linhas]: primeira fonte que cabe inteira; senão a menor, quebrada (largura da corda na altura real) */
  const medir = (t, nomes, y) => {
    t = String(t ?? '');
    for (const nome of nomes) { const f = fonte(nome); if (largura(t, f) <= corda(y, y + f.h)) return { f, linhas: [t] }; }
    const f = fonte(nomes[nomes.length - 1]); let linhas = quebrar(t, f, corda(y, y + f.h));
    for (let i = 0; i < 4; i++) { const novas = quebrar(t, f, corda(y, y + f.h * linhas.length)); if (novas.length === linhas.length) return { f, linhas: novas }; linhas = novas; }
    return { f, linhas };
  };
  /* bloco que termina em yBase: quebra na corda da altura final, até estabilizar */
  const medirAcima = (t, nome, yBase) => { t = String(t ?? ''); const f = fonte(nome); let linhas = [t];
    for (let i = 0; i < 6; i++) { const novas = quebrar(t, f, corda(yBase - f.h * linhas.length, yBase)); if (novas.length === linhas.length) return { f, linhas: novas }; linhas = novas; }
    return { f, linhas: quebrar(t, f, corda(yBase - f.h * linhas.length, yBase)) }; };
  const altura = m => m.f.h * m.linhas.length;
  const desenhar = (m, cx, y, corCss, ini = 0, fim = m.linhas.length) => { c.font = m.f.css; c.fillStyle = corCss; c.textAlign = 'center'; c.textBaseline = 'top'; for (let i = ini; i < fim && i < m.linhas.length; i++) c.fillText(m.linhas[i], cx, y + (i - ini) * m.f.h); };
  /* pilha de blocos [texto, nomesFontes, cor] com sobra em espaços iguais */
  const pilha = (itens, yIni, yFim) => {
    let alt = itens.map(i => fonte(i[1][0]).h), med = [], esp = 0;
    for (let it = 0; it < 4; it++) {
      esp = Math.max(0, (yFim - yIni - alt.reduce((a, b) => a + b, 0)) / (itens.length + 1));
      let y = yIni + esp, mudou = false;
      itens.forEach((i, k) => { med[k] = medir(i[0], i[1], y); const novo = altura(med[k]); if (novo !== alt[k]) { mudou = true; alt[k] = novo; } y += alt[k] + esp; });
      if (!mudou) break;
    }
    let y = yIni + esp; itens.forEach((i, k) => { desenhar(med[k], w / 2, y, i[2]); y += alt[k] + esp; });
  };
  return { corda, quebrar, medir, medirAcima, altura, desenhar, pilha };
}

function simDesenharWalkie(c, w, h, redondo, fonte, cor, dados) {
  const { corda, quebrar, medir, medirAcima, altura, desenhar } = simLayoutHelpers(c, w, h, redondo, fonte);
  const cx = w / 2, fx = fonte('xtiny'), fh = fx.h;
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  const yIni = h * (redondo ? 0.07 : 0.03), yFim = h * (redondo ? 0.94 : 0.97), esp = fh * 0.25;
  let y = yIni;
  const mT = medir('WALKIE-TALKIE', ['xtiny'], y); desenhar(mT, cx, y, cor(0xFB8C1E)); y += altura(mT);
  const nomeCanal = dados.totalCanais > 1 ? `${dados.canal} (${dados.posCanal}/${dados.totalCanais})` : (dados.canal || 'Walkie-Talkie');
  const mC = medir(nomeCanal, ['tiny', 'xtiny'], y); desenhar(mC, cx, y, '#fff'); y += altura(mC) + 2;
  const lsep = corda(y, y + 2) * 0.7; c.fillStyle = cor(0x1FA3E3); c.fillRect(cx - lsep / 2, y, lsep, 2); y += 2 + esp;
  // rodapé medido de baixo para cima
  const rodape = dados.atualizacao ? 'Atualizacao disponivel' : (dados.aviso || dados.estado || '');
  const dica = dados.atualizacao ? 'alequizao.com/garmin > Apps' : 'START: responder';
  const mD = medirAcima(dica, 'xtiny', yFim);
  const mR = medirAcima(rodape, 'xtiny', yFim - altura(mD));
  const yRod = yFim - altura(mD) - altura(mR);
  desenhar(mR, cx, yRod, dados.atualizacao ? cor(0x5EE08A) : cor(0xAAAAAA)); desenhar(mD, cx, yRod + altura(mR), cor(0xFB8C1E));
  const base = yRod - esp, msgs = dados.mensagens || [], n = msgs.length, desl = dados.deslocamento || 0;
  if (!n) { const mV = medir('Nenhuma mensagem', ['xtiny'], (y + base - fh) / 2); desenhar(mV, cx, (y + base - altura(mV)) / 2, cor(0xAAAAAA)); return; }
  const aviso = desl > 0, limite = aviso ? base - fh : base, largArea = corda(y, limite);
  const blocos = []; let alt = 0;
  for (let i = Math.max(0, n - 1 - desl); i >= 0; i--) {
    const m = msgs[i]; let t = m.texto || ''; if (m.sos) t = 'SOS: ' + t; else if (m.atencao) t = '(!) ' + t;
    const mA = { f: fx, linhas: quebrar(`${m.autor} ${m.hora}`, fx, largArea) }, mX = { f: fx, linhas: quebrar(t, fx, largArea) };
    const hb = altura(mA) + altura(mX) + esp;
    const corM = m.sos ? 0xEF4B5B : m.atencao ? 0xFB8C1E : m.meu ? 0x1FA3E3 : 0xF5C23B;
    if (alt + hb > limite - y) {
      if (!blocos.length) { // a mais recente sozinha não cabe: linhas que cabem + indicação para rolar (linhaIni = dados.linhaIni)
        const todas = [...mA.linhas.map(l => [l, cor(corM)]), ...mX.linhas.map(l => [l, '#fff'])];
        let cabem = Math.max(1, Math.floor((limite - y) / fh)); const temMais = todas.length > cabem; if (temMais) cabem = Math.max(1, cabem - 1);
        const ini = Math.min(dados.linhaIni || 0, Math.max(0, todas.length - cabem));
        c.font = fx.css; c.textAlign = 'center'; c.textBaseline = 'top';
        for (let L = 0; L < cabem && ini + L < todas.length; L++) { c.fillStyle = todas[ini + L][1]; c.fillText(todas[ini + L][0], cx, y + L * fh); }
        if (temMais) { const mS = medir(`DOWN: continua (${ini + cabem}/${todas.length})`, ['xtiny'], y + cabem * fh); desenhar(mS, cx, y + cabem * fh, cor(0x1FA3E3), 0, 1); }
      }
      break;
    }
    blocos.push({ mA, mX, hb, corM }); alt += hb;
  }
  let yy = limite - alt;
  for (let k = blocos.length - 1; k >= 0; k--) { const b = blocos[k]; desenhar(b.mA, cx, yy, cor(b.corM)); desenhar(b.mX, cx, yy + altura(b.mA), '#fff'); yy += b.hb; }
  if (aviso && blocos.length) { const mAv = medir(`v mais recentes (${desl})`, ['xtiny'], limite); desenhar(mAv, cx, limite, cor(0x1FA3E3), 0, 1); }
}

function simDesenharRastreador(c, w, h, redondo, fonte, cor, dados) {
  const { pilha } = simLayoutHelpers(c, w, h, redondo, fonte);
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  let txt = `Enviados: ${dados.enviados ?? 0}`; if (dados.ultimoEnvio) txt += ` · ${dados.ultimoEnvio}${dados.ultimoOk ? ' ok' : ' x'}`;
  pilha([
    [dados.ativo ? 'AO VIVO' : 'RASTREADOR', ['xtiny'], dados.ativo ? cor(0x3DDC84) : cor(0x00A0DF)],
    [`${Math.round(dados.bateria ?? 0)}%`, ['numberMedium', 'numberMild', 'large', 'medium'], '#fff'],
    [`GPS: ${dados.gps || 'sem sinal'}`, ['xtiny'], cor(0xAAAAAA)],
    [txt, ['xtiny'], cor(0xAAAAAA)],
    [dados.estado || '', ['xtiny'], cor(0xAAAAAA)],
    ['fechado: envia a cada 5 min', ['xtiny'], cor(0x6A6A70)],
  ], h * (redondo ? 0.07 : 0.03), h * (redondo ? 0.94 : 0.97));
}

/* "Sobre o desenvolvedor" (Sobre.mc): itens a partir de dados.deslocamento; o que não cabe inteiro fica para a rolagem */
function simDesenharSobre(c, w, h, redondo, fonte, cor, dados) {
  const { medir, altura, desenhar } = simLayoutHelpers(c, w, h, redondo, fonte);
  const cx = w / 2, fh = fonte('xtiny').h, x = ['xtiny'], s = ['small', 'tiny', 'xtiny'];
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  const cinza = cor(0x9A9AA0), azul = cor(0x1FA3E3);
  const l = [[dados.app || '', s, cor(0xF5C23B)]];
  if (dados.versao) l.push(['versao ' + dados.versao, x, cinza]);
  l.push(['Desenvolvido por', x, cinza], ['Alequizao', s, '#fff'], ['Instagram', x, cinza], ['@alequizao', x, azul], ['WhatsApp', x, cinza], ['+55 82 98871-7072', x, azul],
    ['E-mail', x, cinza], ['alequizao.dev@gmail.com', x, azul], ['Site', x, cinza], ['alequizao.com', x, azul], ['GitHub', x, cinza], ['github.com/alequizao', x, azul]);
  const desl = Math.max(0, Math.min(dados.deslocamento || 0, l.length - 1));
  const yIni = h * (redondo ? 0.1 : 0.04), yFim = h * (redondo ? 0.9 : 0.96), esp = fh * 0.2;
  const seta = (t, y) => { c.font = fonte('xtiny').css; c.fillStyle = cor(0x6A6A70); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(t, cx, y); };
  let y = yIni; if (desl > 0) { seta('^', y); y += fh; }
  let i = desl;
  for (; i < l.length; i++) {
    const m = medir(l[i][0], l[i][1], y), alt = altura(m), reserva = i < l.length - 1 ? fh : 0;
    if (y + alt + reserva > yFim && i > desl) break;
    desenhar(m, cx, y, l[i][2]); y += alt + esp;
  }
  if (i < l.length) seta('v', yFim - fh);
}

// ---------- Omnitrix Ben 10 (app interativo) ----------
// sons do Omnitrix (mesmas notas do relógio) e brilho da tela
let B10AC = null;
function b10Som(notas) { try { B10AC = B10AC || new (window.AudioContext || window.webkitAudioContext)(); let t = B10AC.currentTime; for (let i = 0; i < notas.length; i += 2) { const d = notas[i + 1] / 1000; if (notas[i]) { const o = B10AC.createOscillator(), g = B10AC.createGain(); o.type = 'square'; o.frequency.value = notas[i]; g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(B10AC.destination); o.start(t); o.stop(t + d); } t += d; } } catch (e) { } }
function b10Luz(cor) { const cv = document.querySelector('#b10cv'); if (!cv) return; cv.style.transition = 'box-shadow .15s'; cv.style.boxShadow = `0 0 90px 20px ${cor}`; setTimeout(() => { cv.style.transition = 'box-shadow 1.2s'; cv.style.boxShadow = '0 0 40px #22ff4433'; }, 400); }

const B10 = { timer: null, aliens: [], img: {}, esc: 0, modo: 'app', estado: 'pronto', fim: 0, quadro: 0, anim: null };
const b10Img = i => { const a = B10.aliens[i]; if (!a) return null; if (!B10.img[a.slug]) { const im = new Image(); im.onload = () => { const cv = $('#b10cv'); cv ? desenharBen10(cv) : simDesenhar(); }; im.src = 'app/ben10/' + a.slug + '.png'; B10.img[a.slug] = im; } return B10.img[a.slug]; };
function b10Aro(c, cx, cy, r, cor) {
  const circ = (rr, k) => { c.fillStyle = k; c.beginPath(); c.arc(cx, cy, rr, 0, 7); c.fill(); };
  circ(r, '#555'); circ(r * .86, '#222'); c.fillStyle = '#999';
  for (let k = 0; k < 4; k++) { c.save(); c.translate(cx, cy); c.rotate(Math.PI / 4 + k * Math.PI / 2); c.fillRect(r * .87, -r * .07, r * .12, r * .14); c.restore(); }
  circ(r * .82, '#000'); c.strokeStyle = cor; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, r * .82, 0, 7); c.stroke();
}
function b10Ampulheta(c, cx, cy, r, cor) {
  const a = r * .5, b = r * .58, ci = r * .07;
  c.fillStyle = cor; c.beginPath(); [[cx - a, cy - b], [cx + a, cy - b], [cx + ci, cy], [cx + a, cy + b], [cx - a, cy + b], [cx - ci, cy]].forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.fill();
}
function b10Texto(c, txt, x, y, maxW, px, cor, peso = 700) {
  c.fillStyle = cor; let t = px; c.font = `${peso} ${t}px Roboto, sans-serif`;
  while (c.measureText(txt).width > maxW && t > px * .6) { t--; c.font = `${peso} ${t}px Roboto, sans-serif`; }
  if (c.measureText(txt).width <= maxW || !txt.includes(' ')) return c.fillText(txt, x, y);
  const i = txt.indexOf(' '); c.fillText(txt.slice(0, i), x, y - t * .55); c.fillText(txt.slice(i + 1), x, y + t * .55);
}
function desenharBen10(cv) { b10Desenhar(cv.getContext('2d'), cv.width, cv.height); }
function b10Desenhar(c, W, H) {
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2, d = new Date(), h = d.getHours();
  const n = B10.aliens.length || 1, al = B10.aliens[B10.esc] || { nome: 'OMNITRIX', cor: '#22FF44' };
  c.clearRect(0, 0, W, H); c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.textAlign = 'center'; c.textBaseline = 'middle';
  const dd = String(h).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
  const est = B10.estado, resta = Math.max(0, Math.round((B10.fim - Date.now()) / 1000)), mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  if (est === 'pronto' || est === 'recarga') {
    const cor = est === 'recarga' ? '#FF2200' : '#22FF44';
    b10Aro(c, cx, cy, r, cor); b10Ampulheta(c, cx, cy, r, cor);
    c.fillStyle = '#000'; c.font = `700 ${r * .36}px Roboto, sans-serif`; c.fillText(dd, cx, cy - r * .34); c.fillText(mm, cx, cy + r * .34);
    b10Texto(c, est === 'recarga' ? 'RECARREGANDO' : al.nome.toUpperCase(), cx, cy - r * .7, r * .8, r * .1, est === 'recarga' ? '#FF2200' : al.cor);
    b10Texto(c, est === 'recarga' ? mmss(resta) : 'START ESCOLHE', cx, cy + r * .7, r * .8, r * .08, est === 'recarga' ? '#FF2200' : '#bbb', 500);
  } else if (est === 'transformando') {
    const p = 1 - B10.quadro / 14; c.fillStyle = p < .7 ? '#22FF44' : '#fff'; c.beginPath(); c.arc(cx, cy, r * .15 + r * 1.3 * p, 0, 7); c.fill();
    if (p < .7) { c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r * .1 + r * .9 * p, 0, 7); c.fill(); }
  } else if (est === 'selecao') {
    b10Aro(c, cx, cy, r, '#22FF44');
    for (let i = 0; i < 24; i++) { const an = -Math.PI / 2 + i * 2 * Math.PI / 24 - B10.esc * 2 * Math.PI / n; c.fillStyle = i ? '#226633' : '#22FF44'; c.beginPath(); c.arc(cx + Math.cos(an) * r * .76, cy + Math.sin(an) * r * .76, i ? r * .018 : r * .035, 0, 7); c.fill(); }
    const abre = B10.giro ? 1 : 1 - B10.quadro / 6;
    c.fillStyle = '#22FF44'; c.beginPath(); c.arc(cx, cy - r * .04, r * .52 * abre, 0, 7); c.fill();
    const im = b10Img(B10.esc), t = r * .92, dx = B10.giro ? B10.giro * B10.quadro * r * .1 : 0;
    if (im && im.complete && (B10.giro || !B10.quadro)) c.drawImage(im, cx - t / 2 + dx, cy - r * .04 - t / 2, t, t);
    b10Texto(c, al.nome.toUpperCase(), cx, cy + r * .6, r * .9, r * .11, al.cor);
    c.font = `500 ${r * .07}px Roboto, sans-serif`; c.fillStyle = '#bbb'; c.fillText(`${B10.esc + 1} DE ${n}`, cx, cy - r * .66);
  } else {
    const cor = al.cor; c.fillStyle = cor; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill(); c.fillStyle = '#000'; c.beginPath(); c.arc(cx, cy, r * .93, 0, 7); c.fill();
    c.fillStyle = cor; c.beginPath(); c.arc(cx, cy - r * .05, r * .48, 0, 7); c.fill();
    const im = b10Img(B10.esc), t = r * .92; if (im && im.complete) c.drawImage(im, cx - t / 2, cy - r * .05 - t / 2, t, t);
    c.font = `500 ${r * .09}px Roboto, sans-serif`; c.fillStyle = '#fff'; c.fillText(dd + ':' + mm, cx, cy - r * .72);
    b10Texto(c, al.nome.toUpperCase(), cx, cy + r * .56, r * .9, r * .11, cor);
    c.font = `500 ${r * .08}px Roboto, sans-serif`; c.fillStyle = resta <= 30 ? '#FF2200' : '#bbb'; c.fillText(mmss(resta), cx, cy + r * .78);
  }
}
function b10Tique() {
  const cv = $('#b10cv');
  if (!cv && !(typeof SIM === 'object' && SIM.app === 'omnitrix' && SIM.canvas)) { clearInterval(B10.anim); B10.anim = null; return; }
  if (B10.quadro > 0) B10.quadro--; else B10.giro = 0;
  if (B10.estado === 'transformando' && !B10.quadro) { B10.estado = 'alien'; B10.fim = Date.now() + 600000; b10Som([220, 120, 160, 250]); }
  if (B10.estado === 'alien' && Date.now() >= B10.fim) b10Acao('fim');
  if (B10.estado === 'recarga' && Date.now() >= B10.fim) { B10.estado = 'pronto'; b10Som([1200, 80, 0, 40, 1800, 140]); b10Luz('#22ff44'); }
  cv ? desenharBen10(cv) : simDesenhar();
}
function b10Acao(a) {
  if (!B10.aliens.length) return;
  const n = B10.aliens.length;
  if (a === 'start') { if (B10.estado === 'pronto') { B10.estado = 'selecao'; B10.quadro = 6; b10Som([900, 40, 1300, 40, 1900, 70]); b10Luz('#22ff4488'); } else if (B10.estado === 'selecao') { B10.estado = 'transformando'; B10.quadro = 14; navigator.vibrate?.([120, 80, 400]); b10Som([500, 60, 700, 60, 900, 60, 1200, 60, 1500, 60, 1900, 70, 2400, 80, 3000, 260]); b10Luz('#aaffbb'); } }
  if (a === 'cima' || a === 'baixo') { if (B10.estado === 'pronto') { B10.estado = 'selecao'; B10.quadro = 6; } if (B10.estado === 'selecao') { B10.esc = (B10.esc + (a === 'baixo' ? 1 : -1) + n) % n; B10.giro = a === 'baixo' ? 1 : -1; B10.quadro = 4; b10Som([2200, 18]); b10Lista(); } }
  if (a === 'voltar') { if (B10.estado === 'selecao') { B10.estado = 'pronto'; b10Som([1600, 40, 1000, 60]); } else if (B10.estado === 'alien' || B10.estado === 'transformando') a = 'fim'; }
  if (a === 'fim') { B10.estado = 'recarga'; B10.fim = Date.now() + 60000; B10.quadro = 0; b10Som([1400, 120, 0, 60, 1400, 120, 0, 60, 900, 120, 600, 160, 350, 300]); b10Luz('#ff2200'); }
}
function b10Lista() {
  const l = $('#b10Lista'); if (!l) return;
  l.querySelectorAll('[data-b10a]').forEach(b => b.classList.toggle('ativo', +b.dataset.b10a === B10.esc));
  if (!B10.aliens.length) return;
  $('#b10Nome') && ($('#b10Nome').textContent = `${B10.aliens[B10.esc].nome} · ${B10.aliens[B10.esc].original} (${B10.aliens[B10.esc].serie})`);
}
async function renderBen10() {
  if (!B10.aliens.length) { try { B10.aliens = await fetch('app/ben10/aliens.json?v=2').then(x => x.json()); } catch (e) { } }
  const a = B10.aliens[B10.esc] || {};
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('ben10')}
  <section class="w"><header class="w-top"><span class="w-ico">⌚</span><span class="w-tit">Omnitrix Ben 10</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   
   <canvas id="b10cv" width="360" height="360" style="width:min(300px,80vw);height:auto;border-radius:50%;box-shadow:0 0 40px #22ff4433;touch-action:pan-y;cursor:pointer"></canvas>
   <div class="chips"><button class="chip" data-b10bt="cima">▲ Cima</button><button class="chip" data-b10bt="start">● START</button><button class="chip" data-b10bt="baixo">▼ Baixo</button><button class="chip" data-b10bt="voltar">↩ Voltar</button></div>
   <div class="mini" style="text-align:center;max-width:460px">Igual ao relógio do desenho: <b>START</b> (ou toque na tela) abre o mostrador, <b>Cima/Baixo</b> (ou deslizar) gira entre os aliens e <b>START</b> de novo <b>transforma</b> — clarão verde, vibração e a silhueta do alien com o tempo da transformação (10 min). Quando acaba, ou ao apertar <b>Voltar</b>, o Omnitrix fica <b>vermelho recarregando</b> por 1 minuto. O último alien escolhido fica guardado.</div>
   <div class="mini" id="b10Nome" style="text-align:center">${a.nome ? `${a.nome} · ${a.original} (${a.serie})` : ''}</div>
   <div id="b10Lista" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;width:100%;max-height:260px;overflow:auto">${B10.aliens.map((x, i) => `<button class="chip ${i === B10.esc ? 'ativo' : ''}" data-b10a="${i}" title="${esc(x.nome)}" style="display:flex;flex-direction:column;align-items:center;padding:4px;min-width:0"><span style="width:44px;height:44px;border-radius:50%;background:#22FF44;display:flex;align-items:center;justify-content:center"><img src="app/ben10/${x.slug}.png" loading="lazy" alt="" style="width:40px;height:40px"></span><span style="font-size:10px;line-height:1.1;white-space:normal;text-align:center">${esc(x.nome)}</span></button>`).join('')}</div>
  </div></section>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="b10App"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="b10Modelo" list="b10Modelos" value="Forerunner® 165 (fr165)" autocomplete="off" required><datalist id="b10Modelos"></datalist></div>
   <div class="chips"><button class="btn" data-b10gera="omnitrix">⬇ Baixar Omnitrix</button></div>
   <div class="mini" id="b10Prog" style="margin-top:8px">Copie o arquivo .prg para a pasta GARMIN/APPS do relógio (cabo USB). O interativo aparece na lista de apps (dá para pôr num atalho de botão); o mostrador, em Aparência.</div></form></div>
  ${tabbar('app')}</div>`;
  const cv = $('#b10cv');
  clearInterval(B10.anim); clearInterval(SIM.b10Timer); B10.anim = setInterval(b10Tique, 50); cv ? desenharBen10(cv) : simDesenhar();
  document.querySelectorAll('[data-b10bt]').forEach(b => b.onclick = () => b10Acao(b.dataset.b10bt));
  document.querySelectorAll('[data-b10a]').forEach(b => b.onclick = () => { B10.esc = +b.dataset.b10a; if (B10.estado === 'pronto') { B10.estado = 'selecao'; B10.quadro = 6; } b10Lista(); });
  cv.onclick = () => b10Acao('start');
  let x0 = null; cv.ontouchstart = e => { x0 = e.touches[0].clientX; }; cv.ontouchend = e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 30) { e.preventDefault(); b10Acao(dx < 0 ? 'baixo' : 'cima'); } };
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#b10Modelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(p => n(p) === q)) || ((l) => l.length === 1 ? l[0] : null)(modelos.filter(m => n(m.nome).startsWith(q))); };
  $('#b10App').onsubmit = e => e.preventDefault();
  document.querySelectorAll('[data-b10gera]').forEach(bt => bt.onclick = async e => {
    e.preventDefault(); const m = achar($('#b10Modelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bts = document.querySelectorAll('[data-b10gera]'); bts.forEach(b => b.disabled = true);
    $('#b10Prog').textContent = '⚙️ Compilando (cerca de 30 s)…';
    try {
      const a = await api('ben10_app', { modelo: m.id, variante: bt.dataset.b10gera });
      const esperar = async (n = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#b10Prog').innerHTML = `✅ É hora do herói! Copie para GARMIN/APPS. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bts.forEach(b => b.disabled = false); return; }
        if (s.status === 'erro' || n > 90) { $('#b10Prog').textContent = '❌ ' + (s.erro || 'Demorou demais'); bts.forEach(b => b.disabled = false); return; }
        setTimeout(() => esperar(n + 1), 2000); };
      esperar();
    } catch (x) { $('#b10Prog').textContent = '❌ ' + x.message; bts.forEach(b => b.disabled = false); }
  });
}

// ---------- links dos pacotes da Connect IQ Store (app/loja-*) ----------
let LOJAS = null;
async function pintarLojas() {
  const el = $('#lojaLinks'); if (!el) return;
  if (!LOJAS) { const r = await apiGet('lojas').catch(() => null); LOJAS = r?.lojas || []; }
  if (!LOJAS.length || !$('#lojaLinks')) return;
  $('#lojaLinks').innerHTML = `<section class="w" style="margin-bottom:12px"><header class="w-top"><span class="w-ico">🏪</span><span class="w-tit">Arquivos para a Connect IQ Store</span></header><div class="lista">${LOJAS.map(l => `<a class="item" href="${esc(l.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">${l.icone ? `<img src="${esc(l.icone)}" alt="" width="42" height="42" style="border-radius:10px">` : '<div class="ic">📦</div>'}<div class="info"><b>${esc(l.titulo)}</b><span>Atualizado ${esc(l.data)} · abrir página ↗</span></div><span class="seta">›</span></a>`).join('')}</div></section>`;
}

// ---------- Bichinho Virtual (mesma lógica e mesmos desenhos do app do relógio) ----------
const TAMA_SPR = {
  EGG: [384, 960, 2016, 4080, 8184, 16380, 15420, 31806, 31134, 31710, 31806, 32764, 16380, 8184, 2016, 0],
  BEBE: [0, 0, 0, 0, 0, 2016, 2064, 4104, 5160, 4104, 5064, 4104, 2064, 2016, 0, 0],
  CRIANCA: [0, 0, 2016, 2064, 4104, 9252, 9252, 8196, 8772, 8580, 4104, 4080, 2064, 6168, 0, 0],
  JOVEM: [8196, 12300, 12276, 8196, 16386, 19506, 19506, 16386, 16770, 16962, 8196, 8184, 4680, 4680, 13932, 0],
  ADULTO: [24582, 20490, 20466, 16386, 32769, 39993, 37929, 39993, 33153, 40965, 37833, 17442, 16380, 8772, 8772, 30318],
  RANZINZA: [8772, 13932, 16380, 16386, 32769, 38937, 35889, 32769, 32769, 34785, 34833, 32769, 16386, 16380, 6168, 14364],
  ANJO: [2016, 2064, 2016, 0, 2016, 2064, 4680, 4104, 4488, 4104, 12300, 20490, 4104, 5736, 6552, 0],
  COCO: [0, 24, 36, 110, 65, 221, 131, 255],
  CORACAO: [108, 255, 255, 126, 60, 24, 0, 0],
  CORACAO_V: [108, 146, 130, 68, 40, 16, 0, 0],
  CAVEIRA: [126, 255, 153, 153, 255, 102, 126, 90],
  ZZZ: [240, 32, 64, 240, 15, 2, 4, 15],
  COMIDA: [24, 60, 126, 126, 255, 129, 129, 255],
  DOCE: [129, 219, 126, 90, 126, 219, 129, 0],
  I_COMER: [164, 172, 236, 76, 68, 68, 68, 68],
  I_LUZ: [56, 68, 130, 130, 68, 56, 56, 16],
  I_BRINCAR: [60, 90, 153, 255, 255, 153, 90, 60],
  I_REMEDIO: [1, 2, 6, 14, 28, 56, 80, 128],
  I_LIMPAR: [48, 88, 120, 48, 126, 255, 126, 0],
  I_STATUS: [255, 129, 189, 129, 177, 129, 255, 0],
  BEBETCHI: [0, 0, 0, 960, 1056, 2640, 2064, 2448, 1056, 972, 1060, 2068, 2072, 2016, 576, 1632],
  BEBE2: [0, 0, 960, 1056, 2064, 2640, 2064, 3024, 1056, 960, 1056, 2064, 1056, 960, 0, 0],
  MARUTCHI: [0, 0, 2016, 2064, 4104, 9828, 9828, 8196, 9156, 4104, 4080, 1056, 1056, 3120, 0, 0],
  BICOTCHI: [0, 0, 4032, 4128, 8208, 9832, 8207, 8207, 8208, 4128, 4032, 1152, 1152, 3264, 0, 0],
  ORELHAS: [12300, 12300, 14364, 8184, 8196, 19506, 19506, 16386, 17346, 8196, 8184, 2448, 2448, 6552, 0, 0],
  ESPINHO: [384, 960, 2016, 8190, 8193, 17200, 17200, 16384, 16768, 16960, 8196, 8184, 4680, 12876, 0, 0],
  GATOTCHI: [24582, 20490, 20466, 16386, 32769, 39993, 37929, 39993, 33153, 40965, 37833, 17442, 16380, 8772, 8772, 30318],
  PATOTCHI: [4032, 4128, 8208, 19656, 19656, 16392, 16415, 16415, 16392, 8208, 8208, 16368, 4672, 4672, 12912, 0],
  BLOBTCHI: [0, 2016, 4080, 8184, 9828, 9828, 8196, 8580, 8196, 8184, 4080, 2016, 576, 1632, 0, 0],
  VERMETCHI: [0, 0, 1920, 2112, 5792, 4128, 2112, 1920, 768, 1536, 3072, 6144, 12288, 24576, 32767, 0],
  VELHOTCHI: [960, 1056, 2064, 2640, 2064, 2448, 1056, 3120, 5064, 4104, 5064, 2064, 1056, 1056, 3120, 0],
  FANTASMA: [0, 2016, 2064, 4104, 4680, 4104, 4488, 4104, 4104, 4104, 4104, 5544, 6744, 0, 0, 0],
  TUMBA: [0, 960, 1056, 2064, 3024, 2640, 3024, 2064, 2448, 2448, 2064, 4080, 8184, 16380, 0, 0],
  CORACAO_P: [108, 255, 126, 56, 0, 0, 0, 0],
  I_DISCIPLINA: [60, 66, 153, 165, 153, 153, 66, 60],
  I_ATENCAO: [24, 24, 24, 24, 24, 0, 24, 24],
  ROBOTCHI: [384, 384, 4080, 4104, 5736, 5736, 4104, 5064, 8184, 8196, 11316, 8196, 8184, 3120, 3120, 7224],
  MASCARATCHI: [0, 2016, 2064, 4104, 16383, 11313, 16383, 4104, 4488, 4104, 2064, 2016, 576, 1632, 0, 0],
  PRATO: [0, 0, 8160, 8208, 12240, 8208, 8160, 4032, 0, 0, 0, 0, 0, 0, 0, 0],
};
const TAMA_LCD = '#a8b58a', TAMA_PIX = '#243018', TAMA_OFF = '#8c9a70', TAMA_CASCA = '#e84a8a';
const TAMA_ICONES = ['I_COMER', 'I_LUZ', 'I_BRINCAR', 'I_REMEDIO', 'I_LIMPAR', 'I_DISCIPLINA', 'I_STATUS', 'I_ATENCAO'];
// 0 ovo · 1 bebê · 2 criança · 3 e 4 adolescentes · 5 a 10 adultos · 11 secreto · 12 morto
const TAMA_NOMES = ['OVO', 'BOLINHA', 'REDONDO', 'PONTINHAS', 'BIQUINHO', 'GATINHO', 'ROBOZINHO', 'MASCARADO', 'PATINHO', 'MINHOCA', 'GOSMINHA', 'VEIO', 'ANJINHO'];
const TAMA_SPRPET = ['EGG', 'BEBETCHI', 'MARUTCHI', 'ESPINHO', 'BICOTCHI', 'GATOTCHI', 'ROBOTCHI', 'MASCARATCHI', 'PATOTCHI', 'VERMETCHI', 'BLOBTCHI', 'VELHOTCHI', 'FANTASMA'];
const TAMA_DORMIR = [22, 20, 20, 21, 21, 22, 22, 23, 22, 22, 22, 22, 22], TAMA_ACORDAR = [9, 9, 9, 9, 9, 9, 9, 11, 9, 9, 10, 9, 9];
const TAMA_PESOMIN = [5, 5, 10, 20, 20, 30, 30, 30, 30, 10, 30, 30, 5];
const TAMA_RFOME = [70, 30, 45, 60, 60, 70, 70, 45, 70, 60, 45, 70, 70], TAMA_RFELIZ = [60, 25, 40, 55, 55, 65, 65, 40, 65, 55, 40, 65, 65];
const TAMA_RCOCO = [180, 45, 90, 150, 150, 180, 180, 120, 180, 150, 120, 180, 180];
const TAMA = { tela: 'principal', sel: -1, sub: 0, q: 0, posX: 8, dirX: 1, anim: '', animQ: 0, animTxt: '', rod: 0, acertos: 0, lado: 0, escolha: 0, mostra: 0, chamava: false, anim2: null, p: null };
let TAMAC = null;
function tamaSom(notas) { if (TAMA.p && TAMA.p.somLig === 0) return; try { TAMAC = TAMAC || new (window.AudioContext || window.webkitAudioContext)(); let t = TAMAC.currentTime; for (let i = 0; i < notas.length; i += 2) { const d = notas[i + 1] / 1000; if (notas[i]) { const o = TAMAC.createOscillator(), g = TAMAC.createGain(); o.type = 'square'; o.frequency.value = notas[i]; g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(TAMAC.destination); o.start(t); o.stop(t + d); } t += d; } } catch (e) { } }
const tamaBip = () => tamaSom([2000, 30]);
function tamaNovoOvo() { const a = Math.floor(Date.now() / 1000); TAMA.p = { ver: 2, per: 0, nasc: a, ultimo: a, idade: 0, fome: 2, feliz: 2, peso: 5, coco: 0, doente: 0, doses: 0, luz: 1, disc: 0, somLig: 1, erroC: 0, erroD: 0, erroCrianca: 0, birra: 0, aFome: 0, aFeliz: 0, aCoco: 0, tZero: 0, tFome0: 0, tDoente: 0, tLuz: 0, tBir: 0 }; tamaSalvar(); }
function tamaCarregar() {
  try {
    const d = JSON.parse(localStorage.getItem('tama2') || 'null');
    if (d && d.ver === 2 && d.nasc) { tamaNovoOvo(); for (const k in TAMA.p) if (typeof d[k] === 'number') TAMA.p[k] = d[k]; return; }
  } catch (e) { }
  tamaNovoOvo();
}
function tamaSalvar() { try { localStorage.setItem('tama2', JSON.stringify(TAMA.p)); } catch (e) { } }
function tamaDormindo(t) { const p = TAMA.p; if (!p || p.per === 0 || p.per === 12) return false; const h = new Date(t * 1000).getHours(), d = TAMA_DORMIR[p.per], a = TAMA_ACORDAR[p.per]; return d > a ? (h >= d || h < a) : (h >= d && h < a); }
// o ícone de atenção acende por fome, tristeza, birra ou luz acesa na hora de dormir (a doença não avisa)
function tamaChamando() { const p = TAMA.p; if (!p || p.per === 0 || p.per === 12) return false; if (tamaDormindo(Math.floor(Date.now() / 1000))) return p.luz === 1; return p.fome === 0 || p.feliz === 0 || p.birra === 1; }
function tamaEvoluir() {
  const p = TAMA.p, antes = p.per;
  tamaEvoluirFase();
  if (p.per !== antes && p.peso < TAMA_PESOMIN[p.per]) p.peso = TAMA_PESOMIN[p.per];
}
function tamaEvoluirFase() {
  const p = TAMA.p;
  if (p.per === 1 && p.idade >= 65) { p.per = 2; p.erroCrianca = p.erroC; }
  else if (p.per === 2 && p.idade >= 3 * 1440) { p.per = (p.erroC - p.erroCrianca) <= 2 ? 3 : 4; p.erroCrianca = p.erroC; }
  else if ((p.per === 3 || p.per === 4) && p.idade >= 6 * 1440) {
    if (p.per === 3 && p.erroC <= 2) p.per = p.erroD === 0 ? 5 : p.erroD === 1 ? 6 : 7;
    else p.per = p.erroD <= 1 ? 8 : p.erroD <= 3 ? 9 : 10;
  } else if (p.per === 7 && p.disc === 0 && p.erroC <= 3 && p.idade >= 10 * 1440) p.per = 11;
}
function tamaPasso(t) {
  const p = TAMA.p;
  p.idade += 5; tamaEvoluir();
  if (tamaDormindo(t)) {
    if (p.luz === 1) { p.tLuz += 5; if (p.tLuz % 15 === 0) p.erroC++; } else p.tLuz = 0;
    p.tFome0 = p.fome === 0 ? p.tFome0 + 5 : 0;
    p.tDoente = p.doente === 1 ? p.tDoente + 5 : 0;
    if (p.tFome0 >= 720 || p.tDoente >= 1440) p.per = 12;
    return;
  }
  p.tLuz = 0;
  p.aFome += 5; if (p.aFome >= TAMA_RFOME[p.per]) { p.aFome = 0; if (p.fome > 0) p.fome--; }
  p.aFeliz += 5; if (p.aFeliz >= TAMA_RFELIZ[p.per]) { p.aFeliz = 0; if (p.feliz > 0) p.feliz--; }
  p.aCoco += 5; if (p.aCoco >= TAMA_RCOCO[p.per]) { p.aCoco = 0; if (p.coco < 4) p.coco++; }
  if (!p.birra && p.fome > 0 && p.feliz > 0 && !p.doente && Math.random() < 1 / 36) { p.birra = 1; p.tBir = 0; }
  if (p.birra === 1) { p.tBir += 5; if (p.tBir >= 15) { p.erroD++; p.birra = 0; p.tBir = 0; } }
  if (p.fome === 0 || p.feliz === 0) { p.tZero += 5; if (p.tZero % 15 === 0) p.erroC++; } else p.tZero = 0;
  p.tFome0 = p.fome === 0 ? p.tFome0 + 5 : 0;
  if (!p.doente && (p.coco >= 4 || p.tFome0 >= 360 || p.peso >= 90)) { p.doente = 1; p.doses = 2; }
  p.tDoente = p.doente === 1 ? p.tDoente + 5 : 0;
  const limite = Math.max(12, 25 - p.erroC - 2 * p.erroD);
  if (p.tFome0 >= 720 || p.tDoente >= 1440 || p.idade / 1440 >= limite) p.per = 12;
}
function tamaSimular() {
  const p = TAMA.p, agora = Math.floor(Date.now() / 1000);
  if (p.per === 0) { if (agora - p.nasc < 300) { p.ultimo = agora; return; } p.per = 1; p.idade = 0; p.ultimo = p.nasc + 300; tamaSom([1047, 120, 1319, 120, 1568, 120, 2093, 300]); navigator.vibrate?.(300); }
  if (p.per === 12) { p.ultimo = agora; return; }
  if (agora - p.ultimo > 7 * 86400) p.ultimo = agora - 7 * 86400;
  const antes = p.per;
  while (agora - p.ultimo >= 300 && p.per !== 12) { p.ultimo += 300; tamaPasso(p.ultimo); }
  if (p.per === 12) tamaSom([784, 300, 659, 300, 523, 300, 392, 700]);
  else if (p.per !== antes) { tamaSom([523, 100, 659, 100, 784, 100, 1047, 250]); tamaAnim('feliz', 12, 'CRESCEU!'); }
  tamaSalvar();
}
const tamaAnim = (a, q, txt) => { TAMA.tela = 'anim'; TAMA.anim = a; TAMA.animQ = q; TAMA.animTxt = txt || ''; };
function tamaTique() {
  if (!TAMA.p) tamaCarregar();
  TAMA.q++;
  if (TAMA.q % 240 === 0 || (TAMA.p.per === 0 && Math.floor(Date.now() / 1000) - TAMA.p.nasc >= 300)) tamaSimular();
  if (TAMA.animQ > 0 && --TAMA.animQ === 0) { TAMA.tela = 'principal'; TAMA.anim = ''; tamaSalvar(); }
  if (TAMA.q % 4 === 0 && TAMA.tela === 'principal') {
    const maxX = TAMA.p.coco === 0 ? 16 : TAMA.p.coco <= 2 ? 8 : 0;
    if (Math.random() < 0.34) TAMA.dirX = -TAMA.dirX;
    TAMA.posX += TAMA.dirX * 2; if (TAMA.posX < 0) { TAMA.posX = 0; TAMA.dirX = 1; } if (TAMA.posX > maxX) { TAMA.posX = maxX; TAMA.dirX = -1; }
    const pr = tamaChamando();
    if (pr && !TAMA.chamava) { tamaSom([2400, 80, 0, 60, 2400, 80, 0, 60, 2400, 80]); navigator.vibrate?.([80, 60, 80]); }
    TAMA.chamava = pr;
  }
  if (TAMA.tela === 'jogo' && TAMA.mostra > 0 && --TAMA.mostra === 0) tamaRodada();
  tamaPintar();
}
function tamaRodada() {
  const p = TAMA.p;
  if (TAMA.rod >= 5) {
    if (p.peso > TAMA_PESOMIN[p.per]) p.peso--;
    if (TAMA.acertos >= 3) { if (p.feliz < 4) p.feliz++; if (p.fome > 0 && p.feliz > 0) p.tZero = 0; tamaAnim('feliz', 12, TAMA.acertos + '/5 GANHOU'); tamaSom([1047, 100, 1319, 100, 1568, 250]); }
    else { tamaAnim('triste', 10, TAMA.acertos + '/5 PERDEU'); tamaSom([523, 150, 392, 300]); }
    tamaSalvar(); return;
  }
  TAMA.rod++; TAMA.lado = Math.random() < 0.5 ? -1 : 1; TAMA.escolha = 0;
}
function tamaComer(qual) {
  const p = TAMA.p;
  if (qual === 0) { if (p.fome >= 4) { tamaAnim('triste', 8, 'CHEIO!'); return tamaSom([300, 200]); } p.fome++; p.peso++; }
  else { if (p.feliz < 4) p.feliz++; p.peso += 2; }
  if (p.peso > 99) p.peso = 99;
  if (p.fome > 0 && p.feliz > 0) p.tZero = 0;
  tamaAnim(qual === 0 ? 'comida' : 'doce', 12, ''); tamaSom([1200, 60, 0, 120, 1200, 60, 0, 120, 1200, 60]); tamaSalvar();
}
// 0 comer · 1 luz · 2 brincar · 3 remédio · 4 limpar · 5 bronca · 6 status
function tamaUsar(i) {
  const p = TAMA.p, dorme = tamaDormindo(Math.floor(Date.now() / 1000));
  if (i === 6) { TAMA.tela = 'status'; TAMA.sub = 0; return; }
  if (p.per === 0) return tamaSom([400, 120]);
  if (i === 1) { p.luz = 1 - p.luz; p.tLuz = 0; return tamaSalvar(); }
  if (p.luz === 0) return tamaSom([400, 120]);
  if (i === 5) {
    if (p.birra === 1) { p.birra = 0; p.tBir = 0; if (p.disc < 100) p.disc += 25; tamaAnim('bronca', 10, 'DISCIPLINA ' + p.disc + '%'); tamaSom([300, 90, 0, 60, 300, 90]); }
    else { if (p.feliz > 0) p.feliz--; tamaAnim('triste', 10, 'SEM MOTIVO'); tamaSom([300, 200]); }
    return tamaSalvar();
  }
  if (dorme && (i === 0 || i === 2)) { tamaAnim('dorme', 8, 'ZZZ...'); return tamaSom([300, 200]); }
  if (i === 0) { TAMA.tela = 'comer'; TAMA.sub = 0; return; }
  if (i === 2) { if (p.doente === 1) { tamaAnim('triste', 8, 'DOENTE'); return tamaSom([300, 200]); } TAMA.tela = 'jogo'; TAMA.rod = 0; TAMA.acertos = 0; return tamaRodada(); }
  if (i === 3) {
    if (p.doente === 1) { p.doses--; if (p.doses <= 0) { p.doente = 0; p.tDoente = 0; p.doses = 0; tamaAnim('remedio', 10, 'CUROU!'); tamaSom([880, 80, 1175, 80, 1760, 200]); } else { tamaAnim('remedio', 10, 'FALTA ' + p.doses); tamaSom([880, 80, 1175, 120]); } }
    else { tamaAnim('triste', 8, 'NÃO PRECISA'); tamaSom([300, 200]); }
    return tamaSalvar();
  }
  if (i === 4) { if (p.coco > 0) { p.coco = 0; tamaAnim('limpar', 12, ''); tamaSom([1500, 40, 1700, 40, 1900, 40, 2100, 80]); tamaSalvar(); } else tamaSom([400, 120]); }
}
function tamaBotao(b) {
  if (!TAMA.p) tamaCarregar();
  tamaBip(); const p = TAMA.p;
  if (TAMA.tela === 'anim') return;
  if (p.per === 12) { if (b === 'start') { tamaNovoOvo(); TAMA.tela = 'principal'; TAMA.sel = -1; tamaSom([1568, 80, 2093, 160]); } return tamaPintar(); }
  if (TAMA.tela === 'status') {
    if (b === 'back') TAMA.tela = 'principal';
    else if (b === 'start' && TAMA.sub === 4) { p.somLig = 1 - p.somLig; tamaSalvar(); }
    else TAMA.sub = (TAMA.sub + (b === 'cima' ? 4 : 1)) % 5;
    return tamaPintar();
  }
  if (TAMA.tela === 'comer') { if (b === 'back') TAMA.tela = 'principal'; else if (b === 'start') tamaComer(TAMA.sub); else TAMA.sub = 1 - TAMA.sub; return tamaPintar(); }
  if (TAMA.tela === 'jogo') {
    if (b === 'back') { TAMA.tela = 'principal'; TAMA.mostra = 0; }
    else if (TAMA.mostra === 0 && (b === 'cima' || b === 'baixo')) { TAMA.escolha = b === 'cima' ? -1 : 1; TAMA.mostra = 5; if (TAMA.escolha === TAMA.lado) { TAMA.acertos++; tamaSom([1568, 60, 2093, 100]); } else tamaSom([392, 150]); }
    return tamaPintar();
  }
  if (b === 'back') { TAMA.sel = -1; return tamaPintar(); }
  if (b === 'cima') TAMA.sel = TAMA.sel <= 0 ? 6 : TAMA.sel - 1;
  else if (b === 'baixo') TAMA.sel = TAMA.sel >= 6 ? 0 : TAMA.sel + 1;
  else if (TAMA.sel < 0) TAMA.sel = 0;
  else tamaUsar(TAMA.sel);
  tamaPintar();
}
const tamaSprPet = () => TAMA_SPR[TAMA_SPRPET[TAMA.p.per]];
function tamaSpr(c, linhas, larg, x0, y0, p, espelha) {
  const g = p >= 4 ? 1 : 0;
  for (let y = 0; y < linhas.length; y++) { const l = linhas[y]; if (!l) continue;
    for (let x = 0; x < larg; x++) if ((l >> (larg - 1 - x)) & 1) c.fillRect(x0 + (espelha ? larg - 1 - x : x) * p, y0 + y * p, p - g, p - g); }
}
// desenha a tela do bichinho num canvas de w x h (mesma arte do relógio)
function tamaDesenhar(c, w, h) {
  if (!TAMA.p) tamaCarregar();
  const p0 = TAMA.p, cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2, agora = Math.floor(Date.now() / 1000);
  c.fillStyle = TAMA_CASCA; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f27bae'; c.beginPath(); c.arc(cx - r * .55, cy - r * .62, r * .1, 0, 7); c.fill();
  const lw = Math.round(r * 1.36), lh = Math.round(r * 1.1), lx = cx - lw / 2, ly = cy - lh / 2;
  const chama = tamaChamando() && TAMA.q % 4 < 2;
  const arred = (x, y, ww, hh, rr, cor) => { c.fillStyle = cor; c.beginPath(); c.roundRect(x, y, ww, hh, rr); c.fill(); };
  arred(lx - 6, ly - 6, lw + 12, lh + 12, 16, chama ? '#ffe14d' : '#7a1f48');
  arred(lx, ly, lw, lh, 10, TAMA_LCD);
  const ip = Math.max(2, Math.floor(lw / 76)), faixa = ip * 11, areaH = lh - 2 * faixa;
  const p = Math.max(2, Math.floor(Math.min(lw / 34, areaH / 17))), ay = ly + faixa + (areaH - 16 * p) / 2;
  for (let i = 0; i < 8; i++) {
    const col = i % 4, lin = i < 4 ? 0 : 1, pad = lw / 14, ix = lx + pad + (lw - 2 * pad - 8 * ip) * col / 3, iy = lin === 0 ? ly + ip * 2 : ly + lh - ip * 10;
    c.fillStyle = (i === 7 ? chama : i === TAMA.sel) ? TAMA_PIX : TAMA_OFF;
    tamaSpr(c, TAMA_SPR[TAMA_ICONES[i]], 8, ix, iy, ip, false);
    if (i === TAMA.sel && i !== 7) c.fillRect(ix, lin === 0 ? iy + ip * 9 : iy - ip - 2, ip * 8, 2);
  }
  c.fillStyle = TAMA_PIX;
  const fonte = Math.max(9, Math.round(p * 2.2)), yTopo = ly + faixa - fonte, yRodape = ly + lh - faixa - fonte * 0.7;
  const txt = (t, x, y, al) => { c.font = `${fonte}px Roboto, Arial, sans-serif`; c.textAlign = al || 'center'; c.textBaseline = 'middle'; c.fillText(t, x, y); };
  const quadro = TAMA.q % 2, meio = Math.max(2, Math.floor(p / 2));
  if (p0.per === 12) {
    tamaSpr(c, TAMA_SPR.FANTASMA, 16, cx - 14 * p, ay - (Math.floor(TAMA.q / 4) % 2) * p, p, false);
    tamaSpr(c, TAMA_SPR.TUMBA, 16, cx + p, ay, p, false);
    txt('START: NOVO OVO', cx, yRodape); return;
  }
  if (TAMA.tela === 'status') {
    txt(['IDADE ' + Math.floor(p0.idade / 1440), 'FOME', 'FELIZ', 'DISCIPLINA', TAMA_NOMES[p0.per]][TAMA.sub], cx, ay + 3 * p);
    if (TAMA.sub === 0) txt('PESO ' + p0.peso + 'g', cx, ay + 11 * p);
    else if (TAMA.sub === 3) txt(p0.disc + '%', cx, ay + 11 * p);
    else if (TAMA.sub === 4) txt(p0.somLig === 1 ? 'SOM: SIM' : 'SOM: NAO', cx, ay + 11 * p);
    else { const n = TAMA.sub === 1 ? p0.fome : p0.feliz, hp = Math.max(2, Math.floor(p * 3 / 4)); for (let k = 0; k < 4; k++) tamaSpr(c, k < n ? TAMA_SPR.CORACAO : TAMA_SPR.CORACAO_V, 8, cx - 16 * p + k * 8 * p + 2 * p, ay + 8 * p, hp, false); }
    txt((TAMA.sub + 1) + '/5', cx, yTopo); return;
  }
  if (TAMA.tela === 'comer') { txt((TAMA.sub === 0 ? '> ' : '  ') + 'REFEIÇÃO', cx, ay + 4 * p); txt((TAMA.sub === 1 ? '> ' : '  ') + 'DOCE', cx, ay + 12 * p); return; }
  if (p0.luz === 0) { c.fillStyle = TAMA_PIX; c.fillRect(lx + 4, ay - p, lw - 8, 18 * p); if (tamaDormindo(agora)) { c.fillStyle = TAMA_LCD; tamaSpr(c, TAMA_SPR.ZZZ, 8, cx + 6 * p, ay + (Math.floor(TAMA.q / 4) % 2) * p, p, false); } return; }
  if (TAMA.tela === 'jogo') {
    const lado = TAMA.mostra > 0 ? TAMA.lado : 0;
    tamaSpr(c, tamaSprPet(), 16, cx - 8 * p + lado * 6 * p, ay, p, lado < 0);
    txt(TAMA.rod + '/5', lx + 8, yTopo, 'left');
    txt(TAMA.mostra > 0 ? (TAMA.escolha === TAMA.lado ? 'ACERTOU!' : 'ERROU') : '↑ ESQ   ↓ DIR', cx, yRodape);
    return;
  }
  if (TAMA.tela === 'anim') {
    if (TAMA.anim === 'comida' || TAMA.anim === 'doce') {
      const etapa = Math.floor((12 - TAMA.animQ) / 4), linhas = TAMA_SPR[TAMA.anim === 'comida' ? 'COMIDA' : 'DOCE'].map((l, k) => k < etapa * 3 ? 0 : l);
      tamaSpr(c, linhas, 8, cx - 16 * p, ay + 8 * p, p, false); tamaSpr(c, tamaSprPet(), 16, cx - 6 * p, ay + quadro * p, p, true);
    } else if (TAMA.anim === 'limpar') {
      const lx2 = (12 - TAMA.animQ) * 3; tamaSpr(c, tamaSprPet(), 16, cx - 16 * p, ay, p, false);
      for (let yy = 0; yy < 16; yy++) c.fillRect(cx - 16 * p + lx2 * p, ay + yy * p, p - 1, p - 1);
    } else if (TAMA.anim === 'remedio') { tamaSpr(c, tamaSprPet(), 16, cx - 4 * p, ay, p, false); tamaSpr(c, TAMA_SPR.I_REMEDIO, 8, cx - 16 * p + quadro * p, ay + 4 * p, p, true); }
    else if (TAMA.anim === 'feliz') { tamaSpr(c, tamaSprPet(), 16, cx - 8 * p, ay + (quadro === 0 ? p : -p), p, false); if (!quadro) { tamaSpr(c, TAMA_SPR.CORACAO, 8, cx + 8 * p, ay - p, meio, false); tamaSpr(c, TAMA_SPR.CORACAO, 8, cx - 12 * p, ay, meio, false); } }
    else if (TAMA.anim === 'bronca') { tamaSpr(c, tamaSprPet(), 16, cx - 8 * p + (quadro === 0 ? -p : p), ay, p, quadro === 1); tamaSpr(c, TAMA_SPR.I_ATENCAO, 8, cx + 9 * p, ay, meio, false); }
    else if (TAMA.anim === 'dorme') { tamaSpr(c, tamaSprPet(), 16, cx - 12 * p, ay, p, false); tamaSpr(c, TAMA_SPR.ZZZ, 8, cx + 5 * p, ay - quadro * p, p, false); }
    else tamaSpr(c, tamaSprPet(), 16, cx - 8 * p, ay, p, quadro === 1);
    if (TAMA.animTxt) { c.fillStyle = TAMA_PIX; txt(TAMA.animTxt, cx, yTopo); }
    return;
  }
  if (p0.per === 0) {
    tamaSpr(c, TAMA_SPR.EGG, 16, cx - 8 * p + (Math.floor(TAMA.q / 4) % 2 ? p : -p), ay, p, false);
    const falta = Math.max(0, 300 - (agora - p0.nasc));
    txt(Math.floor(falta / 60) + ':' + String(falta % 60).padStart(2, '0'), lx + lw - 8, yTopo, 'right');

  } else if (tamaDormindo(agora)) {
    tamaSpr(c, tamaSprPet(), 16, cx - 12 * p, ay, p, false); tamaSpr(c, TAMA_SPR.ZZZ, 8, cx + 5 * p, ay - (Math.floor(TAMA.q / 4) % 2) * p, p, false);
  } else {
    tamaSpr(c, tamaSprPet(), 16, cx - 16 * p + TAMA.posX * p, ay + (Math.floor(TAMA.q / 4) % 2) * p / 2, p, TAMA.dirX < 0);
    if (p0.doente === 1 && TAMA.q % 8 < 5) tamaSpr(c, TAMA_SPR.CAVEIRA, 8, cx - 16 * p, ay - p, meio, false);
    if (p0.birra === 1 && TAMA.q % 4 < 2) tamaSpr(c, TAMA_SPR.I_ATENCAO, 8, cx + 11 * p, ay - p, meio, false);
  }
  for (let k = 0; k < p0.coco; k++) tamaSpr(c, TAMA_SPR.COCO, 8, cx + 16 * p - 8 * p * (Math.floor(k / 2) + 1) + ((Math.floor(TAMA.q / 4) + k) % 2) * meio, ay + (k % 2 === 0 ? 8 : 0) * p, p, false);
}
function tamaPintar() { const cv = document.querySelector('#tamaCv'); if (cv) { const c = cv.getContext('2d'); tamaDesenhar(c, cv.width, cv.height); } else if (typeof SIM === 'object' && SIM.app === 'tama' && SIM.canvas) simDesenhar(); }
async function renderTama() {
  tamaCarregar(); tamaSimular();
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('tama')}
  <section class="w"><header class="w-top"><span class="w-ico">🥚</span><span class="w-tit">Bichinho Virtual</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   <canvas id="tamaCv" width="360" height="360" style="width:min(300px,80vw);height:auto;border-radius:50%;box-shadow:0 0 40px #e84a8a33;touch-action:pan-y;cursor:pointer"></canvas>
   <div class="chips"><button class="chip" data-tamabt="cima">▲ Cima</button><button class="chip" data-tamabt="start">● START</button><button class="chip" data-tamabt="baixo">▼ Baixo</button><button class="chip" data-tamabt="back">↩ Voltar</button></div>
   <div class="mini" style="text-align:center;max-width:520px">Como nos bichinhos de 1996: <b>1 dia real = 1 ano de vida</b>. O ovo choca em 5 minutos, vira bebê (1 hora), criança (até 3 anos), adolescente (até 6 anos) e então adulto.<br>
   <b>Qual adulto ele vira depende de você.</b> Erro de cuidado é deixar fome ou felicidade em zero por 15 minutos, ou a luz acesa na hora de dormir. Erro de disciplina é não dar bronca quando ele chama de birra (chamar com os corações cheios). Cuidado impecável dá o <b>Gatinho</b>; descuido leva ao <b>Robozinho</b>, <b>Mascarado</b>, <b>Patinho</b>, <b>Minhoca</b> ou <b>Gosminha</b>. Existe um <b>secreto</b>: chegue ao Mascarado com disciplina 0% e cuide bem até os 10 anos.<br>
   Cocô acumulado (4) adoece, e a <b>caveira não toca alarme</b> — fique de olho. O remédio precisa de <b>2 doses</b>. Ele morre de fome (12 h), de doença (24 h) ou de velhice, e quanto mais erros, menos tempo de vida. <b>O tempo corre mesmo com a página fechada</b>, inclusive enquanto ele dorme: sumir por um dia inteiro mata o bichinho.<br>
   Ícones: 🍴 comer (refeição ou doce) · 💡 luz · ⚽ brincar (5 rodadas de esquerda/direita, tira 1 g) · 💉 remédio · 🦆 limpar · 😠 bronca · 📊 status (idade, peso, corações, disciplina, nome e som) · ❗ atenção.<br>
   O bichinho do site e o do relógio são separados.</div>
   <div class="chips"><button class="chip" id="tamaZera">🥚 Começar um ovo novo</button></div>
  </div></section>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="tamaApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="tamaModelo" list="tamaModelos" value="Forerunner® 165 (fr165)" autocomplete="off" required><datalist id="tamaModelos"></datalist></div>
   <div class="chips"><button class="btn" id="tamaGera">⬇ Baixar Bichinho</button></div>
   <div class="mini" id="tamaProg"></div></form></div>
  ${tabbar('app')}</div>`;
  clearInterval(TAMA.anim2); clearInterval(SIM.tamaTimer); TAMA.anim2 = setInterval(tamaTique, 250); tamaPintar();
  document.querySelectorAll('[data-tamabt]').forEach(b => b.onclick = () => tamaBotao(b.dataset.tamabt));
  $('#tamaZera').onclick = () => { tamaNovoOvo(); TAMA.tela = 'principal'; TAMA.sel = -1; tamaSom([1568, 80, 2093, 160]); tamaPintar(); };
  const cv = $('#tamaCv'); cv.onclick = () => tamaBotao('start');
  let y0 = null; cv.ontouchstart = e => { y0 = e.touches[0].clientY; }; cv.ontouchend = e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) > 30) { e.preventDefault(); tamaBotao(dy > 0 ? 'cima' : 'baixo'); } };
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#tamaModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(x => n(x) === q)); };
  $('#tamaApp').onsubmit = e => e.preventDefault();
  $('#tamaGera').onclick = async e => {
    e.preventDefault(); const m = achar($('#tamaModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bt = $('#tamaGera'); bt.disabled = true; $('#tamaProg').textContent = '⚙️ Compilando (cerca de 30 s)…';
    try {
      const a = await api('tama_app', { modelo: m.id });
      const esperar = async (n = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#tamaProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bt.disabled = false; return; }
        if (s.status === 'erro' || n > 90) { $('#tamaProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); bt.disabled = false; return; }
        setTimeout(() => esperar(n + 1), 2000); };
      esperar();
    } catch (x) { $('#tamaProg').textContent = '❌ ' + x.message; bt.disabled = false; }
  };
}
