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
  try { const j = await apiGet('eu'); if (j.logado) { S.usuario = j.usuario; S.metas = j.metas; S.pessoas = j.pessoas || []; S.vendo = j.vendo; S.euId = j.eu_id; iniciarApp(); } else renderLogin(); }
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
    try { const j = await api(registro ? 'registrar' : 'login', f); S.usuario = j.usuario; const eu = await apiGet('eu'); S.metas = eu.metas; S.pessoas = eu.pessoas || []; S.vendo = eu.vendo; S.euId = eu.eu_id; iniciarApp(); } catch (x) { toast(x.message); }
  };
}

/* ---------- navegação ---------- */
/* ---------- rotas web: cada tela tem endereço próprio (#/tela/arg) — refresh e "voltar" mantêm o lugar ---------- */
const TITULOS = { inicio: 'Meu dia', atividades: 'Atividades', atividade: 'Atividade', mapa: 'Mapa', gravar: 'Gravar', saude: 'Saúde', app: 'Apps', mais: 'Mais', perfil: 'Perfil',
  estatisticas: 'Desempenho', relatorios: 'Relatórios', treinos: 'Treinos', metrica: 'Histórico', dispositivo: 'Relógio', depressao: 'Depressão' };
const TELAS = () => ({ inicio: renderInicio, atividades: renderAtividades, gravar: renderGravar, saude: renderSaude, perfil: renderPerfil, atividade: renderAtividadeDetalhe, estatisticas: renderEstatisticas,
  treinos: renderTreinos, metrica: renderMetricaHistorico, mapa: renderMapa, app: renderApp, dispositivo: renderDispositivo, relatorios: renderRelatorios, mais: renderMais, depressao: renderDepressao });
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
  // ícones de linha dos apps e da aba Depressão (substituem emojis no menu/seletor)
  depressao: svg('<path d="M15.5 20.5V18c2-1 3.5-3.1 3.5-5.7A6.5 6.5 0 0 0 6.1 9.4c-.3 1.5-1.1 2.3-1.7 3.2-.3.5-.2 1 .3 1.2l1.3.5V17a2 2 0 0 0 2 2h1.5"/><path d="M7.6 11h1.2l.9-1.9 1.4 3.4 1-1.5H14"/>'),
  rastreador: svg('<path d="M12 21s6.5-5.6 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.3" r="2.4"/>'),
  walkie: svg('<rect x="6.5" y="8.5" width="9" height="12.5" rx="2"/><path d="M12.5 8.5V5l4-1.2v3.4"/><path d="M14 12h2M14 15h1.5"/><circle cx="10" cy="13" r="1.6"/>'),
  mimei: svg('<path d="M4 11c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5zM4 14.2h16M5 17.5h14a3 3 0 0 1-3 2.5H8a3 3 0 0 1-3-2.5z"/>'),
  ben10: svg('<circle cx="12" cy="12" r="4"/><path d="M12 8V4.5M12 19.5V16M8 12H4.5M19.5 12H16"/><path d="M7 3.5h10M7 20.5h10"/>'),
  tama: svg('<path d="M12 3c3 0 5.5 5 5.5 9a5.5 5.5 0 0 1-11 0c0-4 2.5-9 5.5-9z"/><circle cx="10" cy="12" r=".7" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r=".7" fill="currentColor" stroke="none"/>'),
  forca: svg('<path d="M4 9v6M6.5 7.5v9M17.5 7.5v9M20 9v6M6.5 12h11"/>'),
  painel: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M7.5 13h4M7.5 16h7"/>'),
  locais: svg('<path d="M5 16.5V13l1.7-4.1a2 2 0 0 1 1.85-1.2h6.9a2 2 0 0 1 1.85 1.2L19 13v3.5"/><path d="M4 13h16"/><circle cx="7.6" cy="16.6" r="1.4"/><circle cx="16.4" cy="16.6" r="1.4"/>'),
  traccar: svg('<circle cx="12" cy="12" r="2"/><path d="M8.2 15.8a5.7 5.7 0 0 1 0-7.6M15.8 8.2a5.7 5.7 0 0 1 0 7.6M5.6 18.4a9.2 9.2 0 0 1 0-12.8M18.4 5.6a9.2 9.2 0 0 1 0 12.8"/>'),
  sim: svg('<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>'),
  onibus: svg('<rect x="5" y="3.5" width="14" height="15" rx="3"/><path d="M5 11h14M8 7h8M7.5 18.5v2M16.5 18.5v2"/><circle cx="8.5" cy="14.5" r="1"/><circle cx="15.5" cy="14.5" r="1"/>'),
  gasolina: svg('<path d="M5 20.5V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5v15M3.5 20.5h12M7 7h5v3.5H7z"/><path d="M14 13h1.5a1.5 1.5 0 0 1 1.5 1.5v2.5a1.5 1.5 0 0 0 3 0V9.5L17 6.5"/>'),
  // ícones de ação (substituem emojis nos botões só-ícone)
  add: svg('<path d="M12 5v14M5 12h14"/>'),
  lixo: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  editar: svg('<path d="M4 20h4.5L20 8.5 15.5 4 4 15.5z"/><path d="M14 5.5L18.5 10"/>'),
  enviar: svg('<path d="M4.5 12L20 4.5l-4 15-3.4-5.6z"/><path d="M12.6 13.9L20 4.5"/>'),
  sino: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  micro: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6"/>'),
  copiar: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5"/>'),
  alvo: svg('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  antena: svg('<path d="M12 11.5V21M8.6 9.4a5 5 0 0 1 6.8 0M6.2 7a8.5 8.5 0 0 1 11.6 0"/><circle cx="12" cy="10.4" r="1.3" fill="currentColor" stroke="none"/>'),
  baixar: svg('<path d="M12 4v10M8 10.5l4 4 4-4M5 19h14"/>'),
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
// aba Casal: os dois relógios lado a lado (cada coluna só com os dados de uma pessoa)
async function renderCasal() {
  const PER = periodoAtual(), pc = PER.tipo === 'dia' ? { de: somaDias(PER.ate, -29), ate: PER.ate } : { de: PER.de, ate: PER.ate };
  const j = await apiGet('casal', pc).catch(() => null);
  if (!j || !j.ok) { $('#dash').innerHTML = '<div class="vazio">Sem conexão</div>'; return; }
  const P = j.pessoas, n = v => v == null ? '--' : fmtNum(Math.round(v));
  const linha = (rot, f) => `<tr><th>${rot}</th>${P.map(p => `<td>${f(p)}</td>`).join('')}</tr>`;
  const km = m => (m / 1000).toFixed(1).replace('.', ',') + ' km';
  $('#dash').innerHTML = `<section class="w"><div class="w-corpo"><table class="casal"><thead><tr><th></th>${P.map(p => `<th>${esc(p.nome)}<div class="mini">${esc(p.relogio?.nome || '')}</div></th>`).join('')}</tr></thead><tbody>
    <tr class="sec"><th colspan="${P.length + 1}">${j.ate === hojeISO() ? 'HOJE' : 'DIA ' + fmtDataCurta(j.ate)}</th></tr>
    ${linha('Passos', p => n(p.hoje.passos))}
    ${linha('Calorias ativas', p => n(p.hoje.calorias_ativas) + ' kcal')}
    ${linha('Min. intensidade', p => n(p.hoje.minutos_intensidade))}
    ${linha('Body Battery', p => n(p.hoje.energia))}
    ${linha('Estresse', p => n(p.hoje.stress))}
    ${linha('FC repouso', p => n(p.hoje.fc_repouso) + ' bpm')}
    ${linha('Sono', p => p.hoje.sono ? horasMin(p.hoje.sono) + (p.hoje.sono_extra?.deitou ? `<div class="mini">${p.hoje.sono_extra.deitou}–${p.hoje.sono_extra.acordou}</div>` : '') : '--')}
    ${linha('SpO2', p => p.hoje.spo2 ? n(p.hoje.spo2) + '%' : '--')}
    <tr class="sec"><th colspan="${P.length + 1}">PERÍODO · ${fmtDataCurta(j.de)} a ${fmtDataCurta(j.ate)}</th></tr>
    ${linha('Atividades', p => p.semana.n)}
    ${linha('Distância', p => km(+p.semana.d))}
    ${linha('Tempo', p => fmtTempo(+p.semana.t))}
    ${linha('Última atividade', p => p.ultima ? `${esc(p.ultima.nome)}<div class="mini">${fmtData(p.ultima.inicio)}</div>` : '--')}
    <tr class="sec"><th colspan="${P.length + 1}">RELÓGIO</th></tr>
    ${linha('Ativado em', p => p.relogio?.registrado ? new Date(p.relogio.registrado * 1000).toLocaleDateString('pt-BR') : '--')}
    ${linha('Tempo de vida', p => p.relogio?.registrado ? tempoDeVida(p.relogio.registrado) : '--')}
    ${linha('1ª ativação conhecida', p => p.relogio?.primeira ? new Date(p.relogio.primeira * 1000).toLocaleDateString('pt-BR') : '--')}
    ${linha('Vida desde a 1ª ativação', p => p.relogio?.primeira ? tempoDeVida(p.relogio.primeira) : '--')}
    ${linha('Firmware', p => esc(p.relogio?.firmware || '--'))}
    ${linha('Sincronizado', p => p.ultimo_sync ? fmtData(p.ultimo_sync) : '--')}
  </tbody></table><div class="mini" style="margin-top:8px">A Garmin não informa data de fabricação nem o primeiro liga do aparelho — a data mais antiga disponível é o registro na conta.</div></div></section><div id="casalGraf"></div>`;
  graficosCasal(j);
}
const horasMin = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const COR_P = ['#1c9ddc', '#f0506e']; // validado (CVD/contraste) nos temas claro e escuro
// barras lado a lado: uma cor por pessoa
function grafDuplo(cv, grupos, labels, fmt) {
  const c = cv.getContext('2d'), W = cv.width = cv.clientWidth * 2, H = cv.height = cv.clientHeight * 2; c.clearRect(0, 0, W, H);
  const mx = Math.max(1, ...grupos.flat().map(v => +v || 0)), n = labels.length, gap = W / n, bw = gap * 0.8 / grupos.length;
  grupos.forEach((vals, k) => vals.forEach((v, i) => { const h = (+v || 0) / mx * (H - 60), x = i * gap + gap * 0.1 + k * bw; c.fillStyle = COR_P[k]; c.beginPath(); c.roundRect(x, H - 34 - h, bw - 3, Math.max(h, 1), 5); c.fill(); }));
  c.fillStyle = '#9aa0a6'; c.font = '19px sans-serif'; c.textAlign = 'center';
  labels.forEach((l, i) => { if (n <= 12 || i % Math.ceil(n / 12) === 0) c.fillText(l, i * gap + gap / 2, H - 8); });
  c.textAlign = 'left'; c.fillText(fmt ? fmt(mx) : Math.round(mx), 4, 20);
}
function graficosCasal(j) {
  const P = j.pessoas, nomes = P.map(p => p.nome.split(' ')[0]);
  const dias = listaDias(j.de, j.ate), rotPer = `${j.dias} dias`, rotAg = { dia: 'por dia', semana: 'por semana', mes: 'por mês' }[j.agrup];
  const rotDia = dias.map(d => d.slice(8) + '/' + d.slice(5, 7));
  const legenda = `<div class="mini centro">${P.map((p, k) => `<span style="color:${COR_P[k]}">■</span> ${esc(nomes[k])}`).join(' &nbsp; ')}</div>`;
  const media = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const soma = a => a.reduce((x, y) => x + (y || 0), 0);
  const fmtV = (v, u) => v == null ? '--' : (Math.abs(v) >= 100 ? fmtNum(Math.round(v)) : (Math.round(v * 10) / 10).toString().replace('.', ',')) + (u || '');
  const vence = (vals, maior) => { const ok = vals.filter(v => v != null); if (ok.length < 2 || vals[0] === vals[1]) return -1; return (maior ? vals[0] > vals[1] : vals[0] < vals[1]) ? 0 : 1; };
  const placar = [0, 0]; const blocos = [];
  // métricas diárias (30 dias)
  const MET = [['passos', 'Passos', '', 'media', true], ['calorias_ativas', 'Calorias ativas', ' kcal', 'media', true], ['minutos_intensidade', 'Minutos de intensidade', ' min', 'media', true],
    ['sono', 'Sono', ' h', 'media', true], ['energia', 'Body Battery', '', 'media', true], ['stress', 'Estresse médio', '', 'media', false], ['fc_repouso', 'FC em repouso', ' bpm', 'media', false],
    ['andares', 'Andares subidos', '', 'media', true], ['spo2', 'Oxigenação (SpO2)', '%', 'media', true], ['agua', 'Água', ' ml', 'media', true], ['peso', 'Peso', ' kg', 'media', null]];
  MET.forEach(([t, tit, u, ag, maior], idx) => {
    const series = P.map(p => dias.map(d => p.serie?.[d]?.[t] ?? null));
    if (!series.flat().some(v => v != null)) return;
    const res = series.map(v => ag === 'soma' ? soma(v) : media(v)); const w = maior == null ? -1 : vence(res, maior); if (w >= 0) placar[w]++;
    blocos.push(widget({ ico: '📈', cor: '#c9ced6', titulo: `${tit} · ${rotPer}`, corpo: `<div class="casal-res">${P.map((p, k) => `<div${w === k ? ' class="ganhou"' : ''}><b style="color:${COR_P[k]}">${fmtV(res[k], u)}</b><span class="mini">${esc(nomes[k])} · ${ag === 'soma' ? 'total' : 'média/dia'}${w === k ? ' 🏆' : ''}</span></div>`).join('')}</div><canvas class="graf" id="cg${idx}"></canvas>${legenda}` }));
    blocos._f = blocos._f || []; blocos._f.push(() => grafLinha($('#cg' + idx), series.map((v, k) => ({ v, cor: COR_P[k] })), { fmt: v => fmtV(v) }));
  });
  // FC de hoje por hora
  if (P.some(p => p.fc_hora?.some(v => v != null))) {
    blocos.push(widget({ ico: ICO.coracao, cor: '#f0506e', titulo: `Frequência cardíaca de ${j.ate === hojeISO() ? 'hoje' : fmtDataCurta(j.ate)} (média por hora)`, corpo: `<canvas class="graf" id="cgFc"></canvas><div class="mini centro">0h → 23h</div>${legenda}` }));
    blocos._f.push(() => grafLinha($('#cgFc'), P.map((p, k) => ({ v: p.fc_hora, cor: COR_P[k] }))));
  }
  // semanas: distância, tempo, calorias, nº de atividades
  [['d', `Distância ${rotAg}`, m => (m / 1000).toFixed(0) + ' km', 1], ['t', `Tempo de treino ${rotAg}`, s => fmtTempo(s), 1], ['c', `Calorias de treino ${rotAg}`, v => fmtNum(Math.round(v)), 1], ['n', `Atividades ${rotAg}`, v => Math.round(v), 1]].forEach(([k, tit, f], i) => {
    const g = P.map(p => j.grupos.map(s => +(p.grupos?.[s.k]?.[k] || 0)));
    const tot = g.map(soma), w = vence(tot, true); if (w >= 0) placar[w]++;
    blocos.push(widget({ ico: '📊', cor: '#1fa3e3', titulo: `${tit} · ${rotPer}`, corpo: `<div class="casal-res">${P.map((p, q) => `<div${w === q ? ' class="ganhou"' : ''}><b style="color:${COR_P[q]}">${f(tot[q])}</b><span class="mini">${esc(nomes[q])} · total${w === q ? ' 🏆' : ''}</span></div>`).join('')}</div><canvas class="graf" id="cs${i}"></canvas>${legenda}` }));
    blocos._f.push(() => grafDuplo($('#cs' + i), g, j.grupos.map(s => s.rot), f));
  });
  // esportes (30 dias)
  const tipos = [...new Set(P.flatMap(p => (p.por_tipo || []).map(x => x.tipo)))];
  if (tipos.length) {
    const g = P.map(p => tipos.map(t => +((p.por_tipo || []).find(x => x.tipo === t)?.t || 0) / 60));
    blocos.push(widget({ ico: ICO.atividades, cor: '#3ddc84', titulo: `Minutos por esporte · ${rotPer}`, corpo: `<canvas class="graf" id="cgTipo"></canvas>${legenda}<table class="casal">${tipos.map((t, i) => `<tr><th>${esc(ESPORTES[t]?.n || t)}</th>${P.map((p, k) => { const r = (p.por_tipo || []).find(x => x.tipo === t); return `<td>${r ? `${r.n}× · ${(+r.d / 1000).toFixed(1).replace('.', ',')} km` : '--'}</td>`; }).join('')}</tr>`).join('')}</table>` }));
    blocos._f.push(() => grafDuplo($('#cgTipo'), g, tipos.map(t => (ESPORTES[t]?.n || t).slice(0, 8)), v => Math.round(v) + ' min'));
  }
  // horário preferido de treino
  if (P.some(p => p.horarios?.some(Boolean))) {
    blocos.push(widget({ ico: '🕒', cor: '#f5c23b', titulo: `Horário dos treinos · ${rotPer}`, corpo: `<canvas class="graf" id="cgHora"></canvas>${legenda}` }));
    blocos._f.push(() => grafDuplo($('#cgHora'), P.map(p => p.horarios), [...Array(24)].map((_, h) => h + 'h')));
  }
  // recordes e totais
  const TOT = [['n', 'Atividades (total)', v => fmtNum(+v), true], ['d', 'Distância total', v => (v / 1000).toFixed(1).replace('.', ',') + ' km', true], ['t', 'Tempo total', v => fmtTempo(+v), true], ['c', 'Calorias em treinos', v => fmtNum(Math.round(v)) + ' kcal', true], ['maior', 'Maior distância', v => (v / 1000).toFixed(2).replace('.', ',') + ' km', true], ['fc', 'FC média nos treinos', v => Math.round(v) + ' bpm', null], ['ritmo', 'Melhor ritmo', v => `${Math.floor(v)}:${String(Math.round(v % 1 * 60)).padStart(2, '0')} /km`, false]];
  blocos.push(widget({ ico: ICO.medalha, cor: '#f5c23b', titulo: `Totais e recordes · ${rotPer}`, corpo: `<table class="casal"><tr><th></th>${P.map((p, k) => `<th style="color:${COR_P[k]}">${esc(nomes[k])}</th>`).join('')}</tr>${TOT.map(([k, tit, f, maior]) => { const v = P.map(p => p.total?.[k] != null ? +p.total[k] : null); const w = maior == null ? -1 : vence(v, maior); if (w >= 0) placar[w]++; return `<tr><th>${tit}</th>${v.map((x, q) => `<td>${x != null && x ? f(x) : '--'}${w === q ? ' 🏆' : ''}</td>`).join('')}</tr>`; }).join('')}</table>` }));
  const pl = widget({ ico: '🏆', cor: '#f5c23b', titulo: 'Placar do casal', corpo: `<div class="casal-res">${P.map((p, k) => `<div${placar[k] > placar[1 - k] ? ' class="ganhou"' : ''}><b style="color:${COR_P[k]};font-size:34px">${placar[k]}</b><span class="mini">${esc(nomes[k])}</span></div>`).join('')}</div><div class="mini centro">vitórias nas comparações abaixo (${fmtDataCurta(j.de)} a ${fmtDataCurta(j.ate)})</div>` });
  $('#casalGraf').innerHTML = pl + blocos.join('');
  (blocos._f || []).forEach(f => f());
}
/* ---------- filtro de período da tela inicial (dia, semana, mês, meses, ano, personalizado) ---------- */
const PERIODOS = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['meses3', '3 meses'], ['meses6', '6 meses'], ['ano', 'Ano'], ['custom', 'Personalizado']];
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return hojeISO(d); };
const fmtDataCurta = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}${iso.slice(0, 4) !== String(new Date().getFullYear()) ? '/' + iso.slice(2, 4) : ''}` : '--';
function listaDias(de, ate) { const r = []; for (let d = de; d <= ate && r.length < 3700; d = somaDias(d, 1)) r.push(d); return r; }
function periodoAtual() {
  const p = S.per || (S.per = store.get('periodo', { tipo: 'dia' }) || { tipo: 'dia' }), hoje = hojeISO();
  if (!PERIODOS.some(x => x[0] === p.tipo)) p.tipo = 'dia';
  const volta = { semana: 6, mes: 29, meses3: 89, meses6: 179, ano: 364 }[p.tipo];
  if (p.tipo === 'dia') { const dia = p.dia && p.dia <= hoje ? p.dia : hoje; return { tipo: 'dia', de: dia, ate: dia }; }
  if (p.tipo === 'custom') { let de = p.de || somaDias(hoje, -29), ate = p.ate || hoje; if (de > ate) [de, ate] = [ate, de]; return { tipo: 'custom', de, ate }; }
  return { tipo: p.tipo, de: somaDias(hoje, -volta), ate: hoje };
}
function salvarPeriodo(p) { S.per = p; store.set('periodo', p); }
function periodoRotulo() {
  const P = periodoAtual();
  if (P.tipo === 'dia') return P.ate === hojeISO() ? new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : new Date(P.ate + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${fmtDataCurta(P.de)} a ${fmtDataCurta(P.ate)} · ${listaDias(P.de, P.ate).length} dias`;
}
function barraPeriodo() {
  const P = periodoAtual();
  return `<div class="periodos">${PERIODOS.map(([k, n]) => `<button class="per-bt${P.tipo === k ? ' on' : ''}" data-per="${k}">${n}</button>`).join('')}</div>
    ${P.tipo === 'dia' ? `<div class="per-nav"><button class="per-seta" data-dia="-1">‹</button><input type="date" id="perDia" value="${P.ate}" max="${hojeISO()}"><button class="per-seta" data-dia="1"${P.ate >= hojeISO() ? ' disabled' : ''}>›</button></div>` : ''}
    ${P.tipo === 'custom' ? `<form class="per-nav" id="perCustom"><input type="date" name="de" value="${P.de}" max="${hojeISO()}"><span class="mini">até</span><input type="date" name="ate" value="${P.ate}" max="${hojeISO()}"><button class="btn peq">Aplicar</button></form>` : ''}`;
}
function ligarPeriodo() {
  document.querySelectorAll('.per-bt').forEach(b => b.onclick = () => { const p = { ...(S.per || {}), tipo: b.dataset.per }; if (p.tipo === 'dia') p.dia = hojeISO(); salvarPeriodo(p); renderInicio(); });
  document.querySelectorAll('.per-seta').forEach(b => b.onclick = () => { const P = periodoAtual(); const dia = somaDias(P.ate, +b.dataset.dia); if (dia > hojeISO()) return; salvarPeriodo({ ...S.per, tipo: 'dia', dia }); renderInicio(); });
  const di = $('#perDia'); if (di) di.onchange = () => { if (di.value) { salvarPeriodo({ ...S.per, tipo: 'dia', dia: di.value > hojeISO() ? hojeISO() : di.value }); renderInicio(); } };
  const fc = $('#perCustom'); if (fc) fc.onsubmit = e => { e.preventDefault(); const f = Object.fromEntries(new FormData(fc)); if (!f.de || !f.ate) return toast('Escolha as duas datas'); salvarPeriodo({ ...S.per, tipo: 'custom', de: f.de, ate: f.ate }); renderInicio(); };
}
// aba da pessoa em períodos maiores que um dia: resumo + gráficos do período
async function renderPeriodoPessoa(PER) {
  const j = await apiGet('periodo', { de: PER.de, ate: PER.ate }).catch(() => null);
  if (!j || !j.ok) { $('#dash').innerHTML = '<div class="vazio"><div class="i">📡</div>Sem conexão</div>'; return; }
  if (j.usuario) S.usuario = j.usuario;
  const dias = listaDias(j.de, j.ate), rotAg = { dia: 'por dia', semana: 'por semana', mes: 'por mês' }[j.agrup], t = j.total || {};
  const fmtV = (v, u) => v == null ? '--' : (Math.abs(v) >= 100 ? fmtNum(Math.round(v)) : (Math.round(v * 10) / 10).toString().replace('.', ',')) + (u || '');
  const km = m => ((+m || 0) / 1000).toFixed(1).replace('.', ',') + ' km';
  const blocos = [], fs = [];
  blocos.push(widget({ ico: ICO.atividades, cor: '#3ddc84', titulo: `Resumo · ${fmtDataCurta(j.de)} a ${fmtDataCurta(j.ate)}`, corpo: kv([['ATIVIDADES', fmtNum(+t.n || 0)], ['DISTÂNCIA', km(t.d)], ['TEMPO', fmtTempo(+t.t || 0)], ['CALORIAS DE TREINO', fmtNum(Math.round(+t.c || 0)) + ' kcal'], ['MAIOR DISTÂNCIA', t.maior ? km(t.maior) : '--'], ['FC MÉDIA NOS TREINOS', t.fc ? Math.round(t.fc) + ' bpm' : '--']]) }));
  const MET = [['passos', 'Passos', '', '#1fa3e3', 1], ['calorias_ativas', 'Calorias ativas', ' kcal', '#ff8a00', 1], ['minutos_intensidade', 'Minutos de intensidade', ' min', '#3ddc84', 1], ['sono', 'Sono', ' h', '#8a6cff', 0],
    ['energia', 'Body Battery', '', '#3cc7a8', 0], ['stress', 'Estresse', '', '#f5c23b', 0], ['fc_repouso', 'FC em repouso', ' bpm', '#f0506e', 0], ['andares', 'Andares', '', '#c9ced6', 1], ['spo2', 'SpO2', '%', '#00a0df', 0], ['agua', 'Água', ' ml', '#00a0df', 1], ['peso', 'Peso', ' kg', '#c9ced6', 0]];
  MET.forEach(([k, tit, u, cor, somar], i) => {
    const v = dias.map(d => j.serie?.[d]?.[k] ?? null), ok = v.filter(x => x != null); if (!ok.length) return;
    const tot = ok.reduce((a, b) => a + b, 0), med = tot / ok.length;
    blocos.push(widget({ ico: '📈', cor, titulo: tit, corpo: kv([...(somar ? [['TOTAL', fmtV(tot, u)]] : []), ['MÉDIA/DIA', fmtV(med, u)], ['MÍN', fmtV(Math.min(...ok), u)], ['MÁX', fmtV(Math.max(...ok), u)], ['DIAS COM DADOS', `${ok.length}/${dias.length}`]]) + `<canvas class="graf" id="pg${i}"></canvas>` }));
    fs.push(() => grafLinha($('#pg' + i), [{ v, cor, area: true }], { fmt: x => fmtV(x) }));
  });
  if (j.grupos.length > 1 && +t.n) [['d', 'Distância', m => (m / 1000).toFixed(1).replace('.', ',') + ' km', '#00a0df'], ['t', 'Tempo de treino', x => fmtTempo(x), '#3ddc84'], ['n', 'Atividades', x => Math.round(x), '#f5c23b']].forEach(([k, tit, f, cor], i) => {
    const vals = j.grupos.map(g => +(((j.g || {})[g.k] || {})[k] || 0));
    blocos.push(widget({ ico: '📊', cor, titulo: `${tit} ${rotAg}`, corpo: `<canvas class="graf" id="pb${i}"></canvas><div class="mini centro">total: ${f(vals.reduce((a, b) => a + b, 0))}</div>` }));
    fs.push(() => grafBarras($('#pb' + i), vals, cor, 0, j.grupos.map(g => g.rot).map((r, q, a) => a.length <= 12 || q % Math.ceil(a.length / 12) === 0 ? r : '')));
  });
  if (j.por_tipo?.length) blocos.push(widget({ ico: '🏅', cor: '#3ddc84', titulo: 'Por esporte', corpo: `<table class="casal">${j.por_tipo.map(r => `<tr><th>${(ESPORTES[r.tipo] || ESPORTES.outro).i} ${esc(ESPORTES[r.tipo]?.n || r.tipo)}</th><td>${r.n}×</td><td>${km(r.d)}</td><td>${fmtTempo(+r.t)}</td></tr>`).join('')}</table>` }));
  if (j.atividades?.length) blocos.push(widget({ ico: ICO.atividades, cor: '#1fa3e3', titulo: `Atividades (${j.atividades.length}${j.atividades.length >= 60 ? '+' : ''})`, corpo: `<table class="casal">${j.atividades.map(a => `<tr class="click" data-tela="atividade" data-arg="${a.id}"><th>${(ESPORTES[a.tipo] || ESPORTES.outro).i} ${esc(a.nome)}<div class="mini">${fmtData(a.inicio)}</div></th><td>${+a.distancia_m ? km(a.distancia_m) : '--'}</td><td>${fmtTempo(+a.duracao_s)}</td></tr>`).join('')}</table>` }));
  if (blocos.length === 1 && !+t.n) blocos.push('<div class="vazio"><div class="i">📭</div>Nenhum dado neste período</div>');
  $('#dash').innerHTML = blocos.join('');
  fs.forEach(f => f());
}
// troca entre os relógios/pessoas que este login pode ver (ex.: Alex FR165 / Jeovana FR55)
function seletorPessoa() {
  if (!S.pessoas || S.pessoas.length < 2) return '';
  const rel = { 1: 'FR165', 3: 'FR55' };
  return `<div class="pessoas">${S.pessoas.map(p => `<button class="pessoa-bt${+p.id === +S.vendo && !S.casal ? ' on' : ''}" data-id="${p.id}">${esc(p.nome)}${rel[p.id] ? ` <small>${rel[p.id]}</small>` : ''}</button>`).join('')}<button class="pessoa-bt${S.casal ? ' on' : ''}" data-id="casal">💑 Casal</button></div>${+S.vendo !== +S.euId && !S.casal ? `<div class="pessoa-aviso">👀 Vendo os dados de ${esc(S.usuario.nome)} — só leitura</div>` : ''}`;
}
/* ---------- BEM-ESTAR / HUMOR automático (estimativa pelos dados do relógio) ---------- */
const HUMORES = { otimo: ['😄', 'Ótimo', '#3ddc84'], bem: ['🙂', 'Bem', '#8bd450'], normal: ['😐', 'Normal', '#f5c23b'], baixo: ['🙁', 'Pra baixo', '#ff8a00'], dificil: ['😢', 'Dia difícil', '#ff4d4f'] };
async function bemEstarBloco(PER) {
  const box = $('#bemEstar'); if (!box) return;
  const de = PER.tipo === 'dia' ? somaDias(PER.ate, -29) : PER.de, ate = PER.ate;
  const j = await apiGet(S.casal ? 'bem_estar_casal' : 'bem_estar', { de, ate }).catch(() => null);
  if (!j || !j.ok || !$('#bemEstar')) return;
  const dias = listaDias(j.de, j.ate), P = j.pessoas;
  const doDia = (p, d) => p.dias.find(x => x.data === d);
  const cartao = (p, k) => {
    const r = PER.tipo === 'dia' ? doDia(p, ate) : null, vals = p.dias.filter(x => x.indice != null);
    const med = vals.length ? Math.round(vals.reduce((a, x) => a + x.indice, 0) / vals.length) : null;
    const ind = r ? r.indice : med, hk = r ? r.humor : (ind == null ? null : ind >= 70 ? 'otimo' : ind >= 58 ? 'bem' : ind >= 42 ? 'normal' : ind >= 30 ? 'baixo' : 'dificil');
    const H = HUMORES[hk] || ['🤔', 'Sem dados', '#9aa0a6'];
    const cont = {}; p.dias.forEach(x => x.humor && (cont[x.humor] = (cont[x.humor] || 0) + 1));
    return `<div class="be-p"><div class="be-top"><span class="be-emo">${H[0]}</span><div><div class="be-nome">${P.length > 1 ? esc(p.nome.split(' ')[0]) + ' · ' : ''}<b style="color:${H[2]}">${H[1]}</b></div>
      <div class="mini">${ind != null ? `índice ${ind}/100` : 'sem dados suficientes'}${r ? ` · ${r.humor_manual ? 'corrigido por você' : 'automático'} · confiança ${r.confianca ?? '--'}%` : PER.tipo !== 'dia' ? ' · média do período' : ''}</div></div></div>
      ${r?.motivos?.length ? `<ul class="be-mot">${r.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      ${PER.tipo !== 'dia' ? `<div class="be-cont">${Object.keys(HUMORES).map(h => `<span title="${HUMORES[h][1]}">${HUMORES[h][0]} ${cont[h] || 0}</span>`).join('')}</div>` : ''}
      ${PER.tipo === 'dia' && !S.casal && +S.vendo === +S.euId ? `<div class="be-corr"><span class="mini">Errou? Toque como você está:</span>${Object.keys(HUMORES).map(h => `<button data-humor="${h}" class="${r?.humor_manual === h ? 'on' : ''}" title="${HUMORES[h][1]}">${HUMORES[h][0]}</button>`).join('')}${r?.humor_manual ? '<button data-humor="" title="Voltar ao automático">↺</button>' : ''}</div>` : ''}</div>`;
  };
  box.innerHTML = widget({ ico: '💭', cor: '#b28cff', titulo: PER.tipo === 'dia' ? 'Bem-estar e humor' : 'Bem-estar e humor no período',
    corpo: `${S.casal ? `<div class="be-casal">${P.map(cartao).join('')}</div>` : cartao(P[0], 0)}
      <canvas class="graf" id="gBem"></canvas><div class="mini centro">${P.length > 1 ? P.map((p, k) => `<span style="color:${COR_P[k]}">■</span> ${esc(p.nome.split(' ')[0])}`).join(' &nbsp; ') + ' · ' : ''}índice ${PER.tipo === 'dia' ? 'dos últimos 30 dias' : 'no período'} (0–100)</div>
      <div class="mini" style="margin-top:6px">Estimativa pelos dados do relógio (sono, HRV, estresse, Body Battery, FC e movimento), comparada com o normal de cada pessoa. Não mede emoção — é um sinal para perguntar como a pessoa está.</div>` });
  grafLinha($('#gBem'), P.map((p, k) => ({ v: dias.map(d => doDia(p, d)?.indice ?? null), cor: P.length > 1 ? COR_P[k] : '#b28cff', area: P.length === 1 })), { min: 0, max: 100 });
  box.querySelectorAll('[data-humor]').forEach(b => b.onclick = async () => { try { await api('humor_salvar', { data: ate, humor: b.dataset.humor }); toast(b.dataset.humor ? 'Humor anotado — isso ajuda a calibrar' : 'Voltou para o automático'); bemEstarBloco(PER); } catch (x) { toast(x.message); } });
}
async function renderInicio(silencioso) {
  if (!(silencioso === true && $('#dash'))) app.innerHTML = `<div class="tela tela-dia">
    <div class="barra-topo">
      <button class="bt-ico" data-tela="relatorios" title="Relatórios">${ICO.relatorios}</button>
      <button class="avatar" data-tela="perfil" title="Perfil">${esc((S.usuario.nome || '?')[0].toUpperCase())}</button>
      <button class="relogio-bt" data-tela="dispositivo" title="Relógio"><span id="dotRelogio" class="dot"></span>${ICO.relogio}</button>
      <button class="bt-ico" id="btSync" title="Sincronizar">${ICO.sync}</button>
    </div>
    ${seletorPessoa()}${barraPeriodo()}<div class="dia-sub"><span>${periodoRotulo()}</span><button class="link" data-tela="estatisticas">DESEMPENHO ›</button></div>
    <div id="bemEstar"></div><div id="casalVivo" class="casal-vivo"></div><div id="dash"><div class="w"><div class="w-corpo"><div class="mini centro">Carregando…</div></div></div></div>${tabbar('inicio')}</div>`;
  document.querySelectorAll('.pessoa-bt').forEach(b => b.onclick = async () => { S.casal = b.dataset.id === 'casal'; try { const j = await api('ver_como', { id: S.casal ? S.euId : +b.dataset.id }); S.usuario = j.usuario; S.metas = j.metas; S.pessoas = j.pessoas; S.vendo = j.vendo; S.euId = j.eu_id; store.del('dash'); renderInicio(); } catch (x) { toast(x.message); } });
  $('#btSync').onclick = async e => { e.currentTarget.classList.add('girando'); try { await api('sincronizar_agora', {}); toast('Sincronizando com a Garmin…'); } catch (x) { toast(x.message); } setTimeout(() => $('#btSync')?.classList.remove('girando'), 2500); };
  ligarPeriodo();
  bemEstarBloco(periodoAtual());
  CasalVivo.iniciar();
  if (S.casal) return renderCasal();
  const PER = periodoAtual();
  if (PER.tipo !== 'dia') return renderPeriodoPessoa(PER);
  const ehHoje = PER.ate === hojeISO();
  let d; try { d = await apiGet('dashboard', ehHoje ? {} : { data: PER.ate }); S.dash = d; if (ehHoje) store.set('dash', d); } catch { d = ehHoje ? store.get('dash') : null; }
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
  if (+S.euId === 1) extras.splice(3, 0, ['depressao', 'Depressão', '🧠']); // aba privada (só Alequizão) — visível também na barra lateral do desktop
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
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Atividades</h1><div class="acoes"><button class="ico-btn" id="bImp" title="Importar GPX" aria-label="Importar GPX">${ICO.baixar}</button><button class="ico-btn" id="bMan" title="Adicionar manual" aria-label="Adicionar manual">${ICO.add}</button></div></div>
  <div class="chips"><span class="chip ${!filtro ? 'ativo' : ''}" data-f="">Todas</span>${Object.entries(ESPORTES).slice(0, 8).map(([k, v]) => `<span class="chip ${filtro === k ? 'ativo' : ''}" data-f="${k}">${v.i} ${v.n}</span>`).join('')}</div><div id="lst" class="card"><div class="mini centro">Carregando…</div></div>${tabbar('atividades')}</div>`;
  document.querySelectorAll('.chip[data-f]').forEach(c => c.onclick = () => renderAtividades(c.dataset.f));
  $('#bImp').onclick = importarGPX; $('#bMan').onclick = atividadeManual;
  let j; try { j = await apiGet('atividades_listar', { tipo: filtro, limite: 100 }); store.set('atv_' + filtro, j.itens); } catch { j = { itens: store.get('atv_' + filtro, []) }; }
  const pend = store.get('pendentes', []);
  if (!j.itens.length && !pend.length) { $('#lst').innerHTML = '<div class="vazio"><div class="i">🏃</div>Nenhuma atividade ainda.<br><br><button class="btn peq" data-tela="gravar">Gravar agora</button></div>'; return; }
  $('#lst').className = 'card lista';
  $('#lst').innerHTML = pend.map(a => `<div class="item"><div class="ic">⏳</div><div class="info"><b>${esc(a.nome)}</b><span>Aguardando sincronização</span></div><div class="dir"><b>${fmtDist(a.distancia_m)}</b>${fmtTempo(a.duracao_s)}</div></div>`).join('') +
    j.itens.map(a => `<div class="item" data-tela="atividade" data-arg="${a.id}"><div class="ic">${ESPORTES[a.tipo]?.i || '⭐'}</div><div class="info"><b>${esc(a.nome)}</b><span>${fmtData(a.inicio)}${a.fc_media ? ' · ❤️ ' + a.fc_media : ''}${a.rua_inicio ? ' · 📍 ' + esc(a.rua_inicio) : ''}</span></div><div class="dir"><b>${a.distancia_m > 0 ? fmtDist(a.distancia_m) : fmtNum(a.calorias) + ' kcal'}</b>${fmtTempo(a.duracao_s)}${a.ritmo_medio && a.tipo !== 'ciclismo' ? ' · ' + fmtRitmo(a.ritmo_medio) : a.velocidade_media && a.tipo === 'ciclismo' ? ' · ' + (+a.velocidade_media).toFixed(1) + ' km/h' : ''}</div></div>`).join('');
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
  $('#det').innerHTML = `<div class="card"><div style="display:flex;gap:12px;align-items:center"><div class="ic" style="font-size:34px">${est.i}</div><div style="flex:1"><div style="font-size:19px;font-weight:700" id="dNome">${esc(a.nome)}</div><div class="mini">${fmtData(a.inicio)} · ${est.n}${a.clima ? ' · ' + esc(a.clima) : ''}</div>${a.ruas && (a.ruas.inicio?.rua || a.ruas.fim?.rua) ? `<div class="mini">📍 ${esc(a.ruas.inicio?.rua || a.ruas.fim?.rua)}${a.ruas.fim?.rua && a.ruas.fim.rua !== a.ruas.inicio?.rua ? ' → ' + esc(a.ruas.fim.rua) : ''}</div>` : ''}</div><button class="ico-btn" id="bEd" title="Editar" aria-label="Editar">${ICO.editar}</button></div></div>
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
    // "Gravar aqui inicia no relógio": enfileira o comando; o app Rastreador (aberto) começa a gravar em até ~30s
    if (store.get('gravarRelogio', true)) api('gravar_remoto', { sport: tipo }).then(() => toast('▶ Enviado ao relógio — abra o app Rastreador para gravar lá também', 3500)).catch(() => { });
  },
  retomar() { const s = store.get('gravando'); if (!s) return false; this.a = s; this.pausado = true; this.ultimoPt = null; this.render(); this.ligarGPS(); this.ligarTimer(); toast('Atividade recuperada — toque em ▶ para continuar'); return true; },
  persistir() { store.set('gravando', this.a); },
  atualizarRua() {
    const p = this.a.pontos.filter(x => x.lat); if (!p.length) return;
    const u = p[p.length - 1];
    apiGet('rua', { lat: u.lat, lon: u.lon }).then(r => { const el = $('#ruaAtual'); if (el && r && r.rua) el.textContent = '📍 ' + r.rua + (r.bairro ? ' · ' + r.bairro : ''); }).catch(() => { });
  },
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
    ${gps ? '<div class="mini centro" id="ruaAtual" style="padding-bottom:4px;opacity:.85"></div>' : ''}
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
      if (g && (this.a.duracao_s === 3 || this.a.duracao_s % 30 === 0)) this.atualizarRua();
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
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="inicio">‹</button><h1>Treinos</h1></div><button class="ico-btn" id="bNovo" title="Novo" aria-label="Novo">${ICO.add}</button></div><div id="tr"></div>${tabbar('inicio')}</div>`;
  const j = await apiGet('treinos');
  $('#tr').innerHTML = j.itens.length ? `<div class="card lista">${j.itens.map(t => `<div class="item"><div class="ic">${t.concluido ? '✅' : ESPORTES[t.tipo]?.i || '📋'}</div><div class="info"><b>${esc(t.nome)}</b><span>${t.agendado ? new Date(t.agendado + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) + ' · ' : ''}${t.etapas.map(e => e.tipo + ' ' + e.valor + (e.unidade || '')).join(' → ')}</span></div><button class="btn peq ${t.concluido ? 'sec' : ''}" data-id="${t.id}" data-c="${t.concluido ? 0 : 1}">${t.concluido ? 'Reabrir' : 'Concluir'}</button><button class="ico-btn" data-del="${t.id}" title="Excluir" aria-label="Excluir">${ICO.lixo}</button></div>`).join('')}</div>` : '<div class="vazio"><div class="i">📋</div>Nenhum treino planejado.<br>Crie treinos com etapas (aquecimento, intervalos, recuperação).</div>';
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
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Mapa</h1><div class="acoes"><button class="ico-btn" id="mLive" title="Adicionar link do LiveTrack" aria-label="Adicionar link do LiveTrack">${ICO.antena}</button><button class="ico-btn" id="mCentro" title="Centralizar" aria-label="Centralizar">${ICO.alvo}</button></div></div>
  ${seletorPessoa()}<div id="mCasal"></div>
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
    if (S.casal) return carregarCasal();
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
  // aba Casal: as duas pessoas no mesmo mapa, cada uma com sua cor
  async function carregarCasal() {
    let j; try { j = await apiGet('mapa_casal'); } catch { mapaTimer = setTimeout(carregar, 30000); return; }
    Object.values(grupos).forEach(g => g.clearLayers());
    const pos = [];
    j.pessoas.forEach((p, k) => {
      const cor = COR_P[k], ini = esc((p.nome || '?')[0]);
      p.rotas.forEach(r => L.polyline(r.ll, { color: cor, weight: 3, opacity: .5 }).bindPopup(`<b>${esc(p.nome)}</b> · ${esc(r.nome)}<br>${fmtData(r.inicio)} · ${fmtDist(r.distancia_m)}`).addTo(grupos.rotas));
      if (p.trilha24h.length > 1) L.polyline(p.trilha24h.map(x => [x.lat, x.lon]), { color: cor, weight: 4, dashArray: '6 6' }).addTo(grupos.t24);
      if (p.live_pontos.length) L.polyline(p.live_pontos.map(x => [x.lat, x.lon]), { color: cor, weight: 5 }).addTo(grupos.live);
      if (p.atual) {
        const ic = L.divIcon({ className: '', html: `<div class="pino-relogio" style="background:${cor};color:#fff;font-weight:600">${ini}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
        L.marker([p.atual.lat, p.atual.lon], { icon: ic }).bindPopup(`<b>${esc(p.nome)}</b><br>${esc(p.atual.fonte)}<br>${tempoAtras(p.atual.ts)}`).addTo(grupos.atual);
        pos.push([p.atual.lat, p.atual.lon]);
      }
    });
    if (primeira && pos.length) pos.length > 1 ? mapa.fitBounds(pos, { padding: [60, 60], maxZoom: 16 }) : mapa.setView(pos[0], 15);
    primeira = false; atual = j.pessoas.find(p => p.atual)?.atual || null;
    const P = j.pessoas.filter(p => p.atual), dist = P.length === 2 ? distM(P[0].atual, P[1].atual) : null;
    $('#mPos').innerHTML = j.pessoas.map((p, k) => `<div style="margin-bottom:8px"><b style="color:${COR_P[k]}">● ${esc(p.nome)}</b><br>${p.atual ? `${tempoAtras(p.atual.ts)} · ${esc(p.atual.fonte)}<br><a href="https://www.google.com/maps?q=${p.atual.lat},${p.atual.lon}" target="_blank">${p.atual.lat.toFixed(5)}, ${p.atual.lon.toFixed(5)}</a>` : 'sem posição'}</div>`).join('');
    $('#mRel').innerHTML = (dist != null ? `📏 Distância entre vocês: <b style="color:#fff">${dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1).replace('.', ',') + ' km'}</b><br><span class="mini">pelas últimas posições conhecidas</span><br>` : '')
      + j.pessoas.map((p, k) => `<span style="color:${COR_P[k]}">■</span> ${esc(p.nome.split(' ')[0])}: ${p.rotas.length} rotas`).join(' · ');
    mapaTimer = setTimeout(carregar, alternado(20000, 40000));
  }
  const distM = (a, b) => { const R = 6371000, r = x => x * Math.PI / 180, dl = r(b.lat - a.lat), dn = r(b.lon - a.lon); const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  document.querySelectorAll('.pessoa-bt').forEach(b => b.onclick = async () => { S.casal = b.dataset.id === 'casal'; try { const j = await api('ver_como', { id: S.casal ? S.euId : +b.dataset.id }); S.usuario = j.usuario; S.vendo = j.vendo; S.euId = j.eu_id; S.pessoas = j.pessoas; renderMapa(); } catch (x) { toast(x.message); } });
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
          if (mudou && livre && (['inicio', 'saude', 'atividades', 'estatisticas', 'relatorios', 'metrica', 'dispositivo'].includes(S.tela) || (S.tela === 'app' && !/^(sim|walkie)/.test(String(S.arg || ''))))) {
            const y = window.scrollY;
            if (S.tela === 'inicio') await renderInicio(true);
            else { if (S.tela === 'saude') S.dash = await apiGet('dashboard').catch(() => S.dash); await TELAS()[S.tela](S.arg); }
            const fc = $('#dash') || $('.tela'); if (fc) { fc.classList.remove('flash-upd'); void fc.offsetWidth; fc.classList.add('flash-upd'); setTimeout(() => fc.classList.remove('flash-upd'), 1100); } // feedback AJAX
            requestAnimationFrame(() => window.scrollTo(0, y));
          }
        }
      } catch { }
    }
    this.timer = setTimeout(() => this.ciclo(), 15000 + Math.random() * 10000);
  }
};
setInterval(() => AoVivo.pintar(), 5000);

/* ---------- CASAL AO VIVO: quem está em atividade agora (atualiza via AJAX) ---------- */
const CasalVivo = {
  timer: null,
  parar() { clearTimeout(this.timer); this.timer = null; },
  iniciar() { this.parar(); if (S.pessoas && S.pessoas.length > 1) this.ciclo(); }, // só faz sentido com parceiro para ver
  async ciclo() {
    clearTimeout(this.timer);
    const box = $('#casalVivo');
    if (!box) return this.parar(); // saiu da tela início
    if (!document.hidden && S.usuario && S.online) {
      try {
        const j = await apiGet('casal_ativos');
        const ativos = (j?.pessoas || []).filter(p => p.ativo);
        box.innerHTML = ativos.map(p => {
          const quando = p.ha == null ? '' : p.ha < 60 ? 'agora mesmo' : 'há ' + Math.round(p.ha / 60) + ' min';
          const vel = p.vel_kmh ? ('' + p.vel_kmh).replace('.', ',') + ' km/h' : null;
          return widget({ ico: '🔴', cor: '#ff4d4f', titulo: `${esc(p.nome.split(' ')[0])} está em atividade agora`, tela: 'mapa', classe: 'vivo', corpo:
            kv([p.rua && ['LOCAL', '📍 ' + esc(p.rua) + (p.bairro ? ' · ' + esc(p.bairro) : '')], p.fc && ['FREQUÊNCIA', p.fc + ' bpm'], vel && ['VELOCIDADE', vel], p.passos != null && ['PASSOS HOJE', fmtNum(p.passos)], p.body_battery != null && ['BODY BATTERY', p.body_battery], ['FONTE', p.fonte + (quando ? ' · ' + quando : '')]])
            + '<div class="mini" style="margin-top:6px">Toque para acompanhar no mapa ao vivo</div>' });
        }).join('');
      } catch { }
    }
    this.timer = setTimeout(() => this.ciclo(), 12000);
  }
};

/* a11y: nomes acessíveis automáticos para botões só-ícone (título -> aria-label; voltar/avançar) */
function a11yLabels() {
  document.querySelectorAll('button[title]:not([aria-label]),a[title]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.getAttribute('title')));
  document.querySelectorAll('.ico-btn:not([aria-label]):not([title])').forEach(b => { const t = (b.textContent || '').trim(); const m = { '‹': 'Voltar', '←': 'Voltar', '›': 'Avançar', '+': 'Adicionar' }; if (m[t]) b.setAttribute('aria-label', m[t]); });
}
let a11yRAF = 0;
try { new MutationObserver(() => { if (a11yRAF) return; a11yRAF = requestAnimationFrame(() => { a11yRAF = 0; a11yLabels(); }); }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { }


/* ---------- ABA APP: TRACCAR CLIENTE ---------- */
async function renderTraccar() {
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('traccar')}
  <div class="card"><h3>🛰️ Traccar Cliente — versão 2.0.0</h3>
   <div class="mini" style="margin-bottom:10px">Cliente Traccar para o relógio, com as mesmas funções do app oficial do Android.
   Envia a posição pelo protocolo OsmAnd e você configura tudo no relógio ou pelos ajustes do app no <b>Garmin Connect</b> do celular.</div>
   <div class="lista">
     <div class="item"><div class="ic">🆔</div><div class="info"><b>Identificador do device</b><span>Digite no relógio; o device é criado no Traccar na hora.</span></div></div>
     <div class="item"><div class="ic">🌐</div><div class="info"><b>Endereço do servidor</b><span>Padrão http://179.199.136.173:5055 — pode apontar para outro Traccar.</span></div></div>
     <div class="item"><div class="ic">⏱️</div><div class="info"><b>Frequência</b><span>10 s, 15 s, 30 s, 1, 2 ou 5 min com o app aberto.</span></div></div>
     <div class="item"><div class="ic">📏</div><div class="info"><b>Filtro de distância</b><span>Só envia depois de andar 10 a 500 m. 0 desliga.</span></div></div>
     <div class="item"><div class="ic">🧭</div><div class="info"><b>Filtro de ângulo</b><span>Só envia ao mudar 15° a 90° de direção. 0 desliga.</span></div></div>
     <div class="item"><div class="ic">🎯</div><div class="info"><b>Precisão</b><span>Alta, média ou baixa — troca consumo de bateria por exatidão.</span></div></div>
     <div class="item"><div class="ic">📴</div><div class="info"><b>Guardar offline</b><span>Até 120 posições na fila, reenviadas sozinhas quando a rede volta.</span></div></div>
     <div class="item"><div class="ic">📋</div><div class="info"><b>Status</b><span>Log dos últimos 30 eventos com hora, igual à tela de status do Android.</span></div></div>
     <div class="item"><div class="ic">🌙</div><div class="info"><b>Com o app fechado</b><span>Envia a cada 5 min — é o limite do sistema da Garmin, não do app.</span></div></div>
   </div>
   <div style="margin-top:12px"><a class="btn" href="app/TraccarCliente.prg" download>⬇ Baixar TraccarCliente.prg</a></div>
   <div class="mini" style="margin-top:8px">Para instalar: ligue o relógio no computador e copie o arquivo para a pasta <b>GARMIN/APPS</b>. Compilado para Forerunner® 165 / 165 Music.</div>
  </div>
  <div class="card"><h3>Testar sem o relógio</h3>
   <div class="mini" style="margin-bottom:10px">O app roda no Simulador do site com as mesmas telas, ajustes, filtros e tela de Status.</div>
   <a class="btn peq" href="#/app/sim-fr165-traccar">🖥️ Abrir no Simulador</a>
   <a class="btn peq" href="http://179.199.136.173:8082" target="_blank" rel="noopener">🗺️ Abrir o Traccar</a>
  </div>${tabbar('app')}</div>`;
}

/* ---------- ABA APP: gerar o app do relógio com dispositivo próprio ---------- */
const slugDevice = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
let appTimer = null;
async function renderApp(arg) {
  clearTimeout(appTimer); clearTimeout(WK.timer);
  if (arg === 'walkie') return renderWalkie();
  if (arg === 'mimei') return renderMimei();
  if (arg === 'ben10') return renderBen10();
  if (arg === 'tama') return renderTama();
  if (arg === 'locais') return renderLocais();
  if (arg === 'painel') return renderPainel();
  if (arg === 'sono') return renderSono();
  if (arg === 'forca') return renderForca();
  if (arg === 'gasolina') return renderGasolina();
  if (arg === 'onibus') return renderOnibus();
  if (arg === 'traccar') return renderTraccar();
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
    $('#aLista').innerHTML = j.itens.length ? `<div class="lista">${j.itens.map(a => `<div class="item"><div class="ic">⌚</div><div class="info"><b>${esc(a.nome)}</b><span>${a.tipo === 'walkie' ? '📻 Walkie-Talkie · ' + esc(a.canal || '') : a.tipo === 'locais' ? '🚗 Meus Locais' : a.tipo === 'tama' ? '🥚 Bichinho' : a.tipo === 'mimei' ? '🍺 ME MIMEI' : (a.tipo === 'ben10' || a.tipo === 'omnitrix') ? '⌚ ' + esc(a.nome) : '📍 ' + esc(a.device)} · ${esc(a.modelo)} · ${a.status === 'pronto' ? (a.envios ? a.envios + ' envios · último ' + fmtData(a.ultimo) : 'ainda sem envios') : a.status === 'erro' ? '❌ ' + esc(a.erro || 'erro') : '⚙️ ' + a.status}</span></div>${a.status === 'pronto' && !String(a.modelo).startsWith('loja') ? `<a class="btn peq" href="api.php?acao=app_baixar&id=${a.id}">⬇</a>` : String(a.modelo).startsWith('loja') ? '<span class="mini">🏪 loja</span>' : ''}<button class="ico-btn" data-rm="${a.id}" title="Excluir" aria-label="Excluir">${ICO.lixo}</button></div>`).join('')}</div>` : 'Nenhum app gerado ainda';
    $('#aLista').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (confirm('Excluir este app? O relógio com ele instalado para de enviar.')) { await api('app_excluir', { id: +b.dataset.rm }); carregarApps(); } });
    appTimer = setTimeout(carregarApps, 20000);
  }
  carregarApps();
}

/* ---------- RELÓGIO: dados completos do aparelho conectado ---------- */
const RECURSOS_PT = { hasOpticalHeartRate: 'Frequência cardíaca no pulso', bluetoothLowEnergyDevice: 'Bluetooth', wifi: 'Wi-Fi', appSupport: 'Apps Connect IQ', liveTrackCapable: 'LiveTrack', gpsRouteCapable: 'Rotas com GPS', bodyBatteryCapable: 'Body Battery', sleepCapable: 'Sono', stressCapable: 'Estresse', pulseOxCapable: 'Oximetria (SpO2)', hrvStatusCapable: 'Status de HRV', trainingReadinessCapable: 'Prontidão para treino', trainingStatusCapable: 'Status de treino', vo2MaxRunCapable: 'VO2 máx corrida', vo2MaxBikeCapable: 'VO2 máx ciclismo', racePredictorCapable: 'Previsão de provas', respirationCapable: 'Respiração', incidentDetectionCapable: 'Detecção de incidentes', musicCapable: 'Música', paymentCapable: 'Garmin Pay', workoutCapable: 'Treinos', trainingPlanCapable: 'Planos de treino', coursesCapable: 'Percursos', morningReportCapable: 'Relatório matinal', sleepScoreCapable: 'Pontuação do sono', enduranceScoreCapable: 'Pontuação de resistência', hillScoreCapable: 'Pontuação de subida', recoveryTimeCapable: 'Tempo de recuperação', runningPowerCapable: 'Potência de corrida', intensityMinutesCapable: 'Minutos de intensidade', floorsClimbedCapable: 'Andares', hydrationCapable: 'Hidratação', menstrualCycleCapable: 'Ciclo menstrual', badgesCapable: 'Medalhas', firmwareUpdateCapable: 'Atualização de firmware', findMyPhoneCapable: 'Encontrar celular' };
// tempo desde a ativação do relógio na conta Garmin (ex.: "1 mês e 20 dias")
function tempoDeVida(t) {
  const dias = Math.max(0, Math.floor((Date.now() / 1000 - t) / 86400));
  if (dias < 1) return 'ativado hoje';
  const a = Math.floor(dias / 365), m = Math.floor(dias % 365 / 30), d = dias % 365 % 30;
  const p = (n, s, pl) => n ? `${n} ${n > 1 ? pl : s}` : '';
  return [p(a, 'ano', 'anos'), p(m, 'mês', 'meses'), p(d, 'dia', 'dias')].filter(Boolean).join(' e ').replace(/ e (?=.* e )/, ', ') + ` (${dias} dias)`;
}
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
    ${kv([['CONTA GARMIN', statusInteg], ['ÚLTIMA SINCRONIZAÇÃO', j.integracao.ultimo_sync ? fmtData(j.integracao.ultimo_sync) : '--'], ['RELÓGIO → GARMIN', d?.ultimo_upload ? dt(d.ultimo_upload) : '--'], ['FIRMWARE', d?.firmware || '--'], ['Nº DE SÉRIE', d?.serie || '--'], ['ATIVADO EM', d?.registrado ? new Date(d.registrado * 1000).toLocaleDateString('pt-BR') : '--'], ['TEMPO DE VIDA', d?.registrado ? tempoDeVida(d.registrado) : '--'], ['PRIMEIRA ATIVAÇÃO CONHECIDA', d?.primeira ? new Date(d.primeira * 1000).toLocaleDateString('pt-BR') : '--'], ['VIDA DESDE A 1ª ATIVAÇÃO', d?.primeira ? tempoDeVida(d.primeira) : '--']])}<div class="mini" style="margin-top:6px">A Garmin não informa data de fabricação nem o primeiro liga do aparelho — a data mais antiga disponível é o registro na conta.</div></div></section>
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
const segApps = ativo => (setTimeout(pintarLojas, 0), '') + `<div id="lojaLinks"></div><div class="seg seg-apps"><button class="${ativo === 'rastreador' ? 'ativo' : ''}" data-tela="app">${ICO.rastreador} Rastreador</button><button class="${ativo === 'walkie' ? 'ativo' : ''}" data-tela="app" data-arg="walkie">${ICO.walkie} Walkie-Talkie</button><button class="${ativo === 'mimei' ? 'ativo' : ''}" data-tela="app" data-arg="mimei">${ICO.mimei} ME MIMEI</button><button class="${ativo === 'ben10' ? 'ativo' : ''}" data-tela="app" data-arg="ben10">${ICO.ben10} Ben 10</button><button class="${ativo === 'tama' ? 'ativo' : ''}" data-tela="app" data-arg="tama">${ICO.tama} Bichinho</button><button class="${ativo === 'locais' ? 'ativo' : ''}" data-tela="app" data-arg="locais">${ICO.locais} Meus Locais</button><button class="${ativo === 'sono' ? 'ativo' : ''}" data-tela="app" data-arg="sono">${ICO.sono} Sono</button><button class="${ativo === 'painel' ? 'ativo' : ''}" data-tela="app" data-arg="painel">${ICO.painel} Painel Total</button><button class="${ativo === 'forca' ? 'ativo' : ''}" data-tela="app" data-arg="forca">${ICO.forca} Força</button><button class="${ativo === 'gasolina' ? 'ativo' : ''}" data-tela="app" data-arg="gasolina">${ICO.gasolina} Gasolina Perto</button><button class="${ativo === 'onibus' ? 'ativo' : ''}" data-tela="app" data-arg="onibus">${ICO.onibus} Próximo Ônibus</button><button class="${ativo === 'traccar' ? 'ativo' : ''}" data-tela="app" data-arg="traccar">${ICO.traccar} Traccar</button><button class="${ativo === 'sim' ? 'ativo' : ''}" data-tela="app" data-arg="sim">${ICO.sim} Simulador</button></div>`;
const WK = { canal: null, ultimo: 0, timer: null, canais: [] };
async function renderWalkie() {
  clearTimeout(WK.timer);
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1><div class="acoes"><button class="ico-btn" id="wkPush" title="Notificações no celular e no relógio" aria-label="Notificações">${ICO.sino}</button></div></div>${segApps('walkie')}
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
   <form class="enviar" id="wkForm"><input id="wkTexto" maxlength="120" placeholder="Mensagem para os relógios" autocomplete="off"><button type="button" class="ico-btn" id="wkMic" title="Falar (vira texto)" aria-label="Falar">${ICO.micro}</button><button class="ico-btn enviar-bt" title="Enviar" aria-label="Enviar">${ICO.enviar}</button></form>
   <div class="linha" style="margin-top:10px"><button class="btn laranja peq" id="wkAtencao">📣 Chamar atenção (10 s)</button><button class="btn perigo peq" id="wkSos">🆘 SOS</button></div></div></section>
  ${widget({ ico: '⚡', cor: '#f5c23b', titulo: 'Mensagens rápidas do relógio', corpo: `<div class="mini" style="margin-bottom:8px">${c.dono ? 'Aparecem no botão START do relógio de todos do canal (até 15, com até 30 letras). O relógio atualiza sozinho.' : 'Só quem criou o canal pode alterar.'}</div><div id="wkFrases"></div>${c.dono ? `<form class="enviar" id="wkFraseForm" style="margin-top:10px"><input id="wkFraseNova" maxlength="30" placeholder="Nova mensagem rápida"><button class="ico-btn enviar-bt" title="Adicionar" aria-label="Adicionar">${ICO.add}</button></form>` : ''}` })}
  ${widget({ ico: '⌚', cor: '#1fa3e3', titulo: 'Instalar no relógio', corpo: `<div class="mini" style="margin-bottom:10px">Gere o app com o seu nome. No relógio aparecem TODOS os seus canais (o primeiro é o principal; troque em START → Canais). Cada pessoa gera o dela.</div>
    <form id="wkApp"><div class="campo"><label>Seu nome no walkie-talkie</label><input name="nome" maxlength="20" required placeholder="Ex.: Alex" value="${esc((S.usuario.nome || '').split(' ')[0])}"></div>
    <div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="wkModelo" list="wkModelos" value="Forerunner® 165 (fr165)" required autocomplete="off"><datalist id="wkModelos"></datalist><div class="mini" id="wkModeloInfo"></div></div>
    <button class="btn" id="wkAppBt">⬇ Gerar e baixar Walkie-Talkie</button></form><div id="wkProg" class="mini" style="margin-top:10px"></div>` })}
  ${c.dono ? widget({ ico: '🔗', cor: '#8b7cf6', titulo: 'Integração (Lembretes e outros sistemas)', corpo: `<div class="mini" style="margin-bottom:8px">Com esta chave, o <b>Lembretes</b> (alequizao.com/lembretes) manda avisos direto para os relógios deste canal: cole-a na ficha do contato, no campo “Chave do Walkie-Talkie”. Não compartilhe em público — quem tem a chave consegue enviar mensagens.</div><div class="enviar"><input id="wkChave" readonly value="${esc(c.chave_api || '')}"><button type="button" class="ico-btn" id="wkCopiar" title="Copiar" aria-label="Copiar">${ICO.copiar}</button><button type="button" class="ico-btn" id="wkNovaChave" title="Gerar nova chave" aria-label="Gerar nova chave">${ICO.sync}</button></div>` }) : ''}
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
  if (+S.euId === 1) setTimeout(mimeiStatsAdmin, 0); // 1.16.0: estatísticas do app da loja (só admin)
  const r = j.resumo, fmt = n => (Math.round(n * 10) / 10).toString().replace('.', ',');
  // sabores: agrupa lanches com o mesmo "grupo" num bloco só, na posição do primeiro
  const blocos = [], porGrupo = {}; j.lanches.forEach((l, i) => { l._i = i; if (!l.grupo) return blocos.push({ l }); const k = l.grupo.toLowerCase(); if (!porGrupo[k]) blocos.push(porGrupo[k] = { grupo: l.grupo, itens: [] }); porGrupo[k].itens.push(l); });
  blocos.forEach((b, i) => { if (b.itens && b.itens.length === 1) blocos[i] = { l: b.itens[0] }; });
  const semAc = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const abertos = window.MIMEI_ABERTOS || (window.MIMEI_ABERTOS = new Set());
  const cardLanche = (l, titulo) => `<div class="mimei-card ${l.zero || r.saldo >= l.kcal ? 'cabe' : 'nao-cabe'}"><img decoding="async" src="${esc(l.icone || '')}" alt="" loading="lazy" width="46" height="46" onerror="this.style.visibility='hidden'">${l.zero ? '<b aria-label="zero, livre" style="font-size:1.05em">ZERO<span class="x"> · livre</span></b>' : `<b aria-label="cabem ${fmt(Math.max(0, r.saldo / l.kcal))}">${fmt(Math.max(0, r.saldo / l.kcal))}<span class="x">×</span></b>`}<span>${esc(titulo)}</span><small>${l.kcal} kcal${l.porcao ? ' · ' + esc(l.porcao) : ''}</small><button class="btn sec peq" data-comi="${l.id}" aria-label="Comi 1 ${esc(l.nome)}">Comi 1</button></div>`;
  const itemLanche = (l, titulo) => `<div class="item mimei-item" data-id="${l.id}" data-busca="${esc(semAc(`${l.nome} ${l.grupo || ''} ${l.sabor || ''}`))}"><span class="mimei-arrasta" aria-hidden="true" title="Arraste para reordenar">⠿</span><img loading="lazy" decoding="async" class="mimei-ic" width="42" height="42" src="${esc(l.icone || '')}" alt="" onerror="this.style.visibility='hidden'"><div class="info"><b>${esc(titulo)}</b><span>${l.kcal} kcal${l.zero ? ' · ZERO (livre)' : ''}${l.porcao ? ' · ' + esc(l.porcao) : ''}</span></div><button class="ico-btn" data-sobe="${l.id}" title="Subir" aria-label="Subir ${esc(l.nome)}">↑</button><button class="ico-btn" data-edita="${l.id}" title="Editar" aria-label="Editar ${esc(l.nome)}">✎</button><button class="ico-btn" data-apaga="${l.id}" title="Apagar" aria-label="Apagar ${esc(l.nome)}">🗑</button></div>`;
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
     <div class="chips mimei-chips" id="mmChips" role="toolbar" aria-label="Filtrar por tipo">${[['', 'Todos', j.lanches.length], ['*cabe', 'Cabem hoje', j.lanches.filter(l => !l.zero && r.saldo >= l.kcal).length], ...grupos.map(b => [b.grupo, b.grupo, b.itens.length])].map(([k, n, c]) => `<button type="button" class="chip ${filtro.g === k ? 'ativo' : ''}" data-filtro="${esc(k)}" aria-pressed="${filtro.g === k}">${esc(n)} <i>${c}</i></button>`).join('')}</div>
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
    const kMin = b => Math.min(...(b.itens.some(l => !l.zero) ? b.itens.filter(l => !l.zero) : b.itens).map(l => l.kcal)) || 1; // 1.17.0: zero fora da conversão
    if (!q && !g) { html = blocos.map(b => b.itens ? `<details class="mimei-grupo"${abertos.has(b.grupo) ? ' open' : ''} data-grupo="${esc(b.grupo)}"><summary class="mimei-card ${r.saldo >= kMin(b) ? 'cabe' : 'nao-cabe'}"><img decoding="async" src="${esc(b.itens[0].icone || '')}" alt="" loading="lazy" width="46" height="46" onerror="this.style.visibility='hidden'"><b>${fmt(Math.max(0, r.saldo / kMin(b)))}<span class="x">×</span></b><span>${esc(b.grupo)} · ${b.itens.length} sabores</span><small>${Math.min(...b.itens.map(l => l.kcal))}–${Math.max(...b.itens.map(l => l.kcal))} kcal</small><span class="btn sec peq" aria-hidden="true">Sabores ▾</span></summary><div class="mimei-grade">${b.itens.map(l => cardLanche(l, l.sabor)).join('')}</div></details>` : cardLanche(b.l, b.l.nome)).join(''); n = null; }
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

/* ---------- DEPRESSÃO: análise privada dos sinais de humor de Alex e Jeovana (só Alequizão) ---------- */
// atualização automática (AJAX): o índice é recalculado no servidor a cada 5 min (bem_estar.py) — a tela busca de novo sozinha
// a cada 5 min, ao voltar para o app e na virada do dia; só redesenha se os dados mudarem
const DEP = { assin: '', timer: null, req: 0, per: store.get('depPer', 'mes'), off: 0, j: null, P: null, graf: {} };
const DEP_PER = { dia: ['Dia', 1], semana: ['Semana', 7], quinzena: ['Quinzena', 15], mes: ['Mês', 30], ano: ['Ano', 365], tudo: ['Tudo', 0] };
if (!DEP_PER[DEP.per]) DEP.per = 'mes';
const DEP_FAT = { sono_h: ['Sono', 'h'], sono_score: ['Qualidade do sono', ''], hrv: ['HRV da noite', ' ms'], stress_med: ['Estresse médio', ''], stress_alto_min: ['Tempo em estresse alto', ' min'],
  bb_max: ['Body Battery máx.', ''], fc_rep: ['FC em repouso', ' bpm'], passos: ['Passos', ''], intensidade: ['Minutos de intensidade', ' min'] };
const DEP_NIVEL = [['Baixo', '#3ddc84', '✓', 'Sinais majoritariamente positivos no período.'], ['Atenção', '#f5c23b', '!', 'Oscilações e alguns dias puxados para baixo. Vale observar e conversar.'],
  ['Elevado', '#ff4d4f', '⚠', 'Muitos dias para baixo e índice baixo. Sinal para cuidar — se persistir por semanas, buscar apoio profissional.']];
const DEP_NOME = { 1: 'Alex' }, DEP_REL = { 1: 'FR165', 3: 'FR55' };
const depNeg = h => h === 'baixo' || h === 'dificil';
const depHumor = i => i == null ? null : i >= 70 ? 'otimo' : i >= 58 ? 'bem' : i >= 42 ? 'normal' : i >= 30 ? 'baixo' : 'dificil';
const depDM = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const depFmt = (v, u = '') => { if (v == null || !isFinite(v)) return '--'; if (u === 'h') { const m = Math.round(v * 60); return `${Math.floor(m / 60)}h${pad(m % 60)}`; } return (Math.abs(v) >= 1000 ? fmtNum(v) : (Math.round(v * 10) / 10).toString().replace('.', ',')) + u; };
const depMed = a => { const v = a.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

function renderDepressao() {
  if (+S.euId !== 1) return navegar('inicio'); // aba privada — só o dono a vê
  app.innerHTML = `<div class="tela"><div class="topo"><div style="display:flex;align-items:center;gap:10px"><button class="ico-btn" data-tela="mais">‹</button><h1>Depressão</h1></div></div>
  <div class="seg dep-seg" role="tablist" aria-label="Período">${Object.entries(DEP_PER).map(([k, [n]]) => `<button data-dper="${k}" class="${DEP.per === k ? 'ativo' : ''}">${n}</button>`).join('')}</div>
  <div class="dep-nav"><button class="ico-btn" id="depAnt" aria-label="Período anterior">‹</button><b id="depRot"></b><button class="ico-btn" id="depProx" aria-label="Próximo período">›</button></div>
  <div class="mini centro" id="depAt"></div>
  <div id="dep"><div class="card"><div class="mini centro">Analisando os sinais de Alex e Jeovana…</div></div></div>${tabbar('mais')}</div>`;
  document.querySelectorAll('[data-dper]').forEach(b => b.onclick = () => { DEP.per = b.dataset.dper; DEP.off = 0; store.set('depPer', DEP.per); document.querySelectorAll('[data-dper]').forEach(x => x.classList.toggle('ativo', x === b)); depMontar(true); });
  $('#depAnt').onclick = () => { DEP.off++; depMontar(true); };
  $('#depProx').onclick = () => { if (DEP.off > 0) { DEP.off--; depMontar(true); } };
  depMontar(true);
}
function depAgendar() {
  clearInterval(DEP.timer);
  DEP.timer = setInterval(() => $('#dep') ? depMontar() : clearInterval(DEP.timer), 5 * 60 * 1000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('#dep')) depMontar(); });
window.addEventListener('resize', () => { clearTimeout(DEP.rz); DEP.rz = setTimeout(() => $('#dep') && depDesenhar(), 150); });
function depPeriodo() {
  const hoje = hojeISO(), n = DEP_PER[DEP.per][1];
  if (!n) return { de: '2025-01-01', ate: hoje, n: 0 };
  const ate = somaDias(hoje, -DEP.off * n);
  return { de: somaDias(ate, -(n - 1)), ate, n };
}
function depRotulo(P) {
  if (!P.n) return 'Todo o período';
  if (P.n === 1) { const d = new Date(P.ate + 'T12:00:00'), s = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }); return P.ate === hojeISO() ? 'Hoje · ' + s : s[0].toUpperCase() + s.slice(1); }
  return `${depDM(P.de)}${P.de.slice(0, 4) !== P.ate.slice(0, 4) ? '/' + P.de.slice(0, 4) : ''} – ${depDM(P.ate)}/${P.ate.slice(0, 4)}`;
}
async function depMontar(forcar) {
  const box = $('#dep'); if (!box) return;
  if (forcar) { DEP.assin = ''; depAgendar(); }
  const P = depPeriodo(), req = ++DEP.req, agora = new Date(), hora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  $('#depRot').textContent = depRotulo(P); $('#depProx').disabled = DEP.off === 0; $('#depAnt').disabled = !P.n;
  if (forcar && DEP.j) box.classList.add('dep-carr');
  // busca também o período anterior (comparação) e 30 dias de contexto para o filtro "Dia"
  let j; try { j = await apiGet('bem_estar_casal', { de: P.n ? somaDias(P.de, -Math.max(P.n, 30)) : P.de, ate: P.ate }); } catch { j = null; }
  if (req !== DEP.req || box !== $('#dep')) return; // filtro mudou ou saiu da tela enquanto carregava
  box.classList.remove('dep-carr');
  const at = $('#depAt');
  if (!j?.ok) { if (DEP.assin) at.textContent = 'Sem conexão · mostrando a última leitura · tentando de novo em 5 min'; else box.innerHTML = '<div class="card"><div class="mini centro">Não foi possível carregar agora. Tentando de novo em 5 min…</div></div>'; return; }
  const assin = DEP.per + DEP.off + hojeISO() + JSON.stringify(j.pessoas);
  at.innerHTML = `🔄 Atualizado às ${hora} · atualiza sozinho`;
  if (assin === DEP.assin) return;
  DEP.assin = assin; DEP.j = j; DEP.P = P;
  depPintar();
}
function depStats(a) {
  if (!a.length) return null;
  const media = Math.round(a.reduce((s, x) => s + x.indice, 0) / a.length);
  const cont = {}; a.forEach(x => x.humor && (cont[x.humor] = (cont[x.humor] || 0) + 1));
  const neg = (cont.baixo || 0) + (cont.dificil || 0), pctNeg = Math.round(100 * neg / a.length);
  let seq = 0, maxSeq = 0; a.forEach(x => depNeg(x.humor) ? (seq++, maxSeq = Math.max(maxSeq, seq)) : seq = 0);
  const nivel = a.length < 3 ? null : media >= 60 && pctNeg < 20 && maxSeq < 3 ? 0 : media >= 45 && pctNeg < 45 && maxSeq < 5 ? 1 : 2;
  const ord = [...a].sort((x, y) => x.indice - y.indice);
  return { n: a.length, media, cont, neg, pctNeg, maxSeq, nivel, pior: ord[0], melhor: ord[ord.length - 1] };
}
function depPintar() {
  const box = $('#dep'), { j, P } = DEP; if (!box || !j) return;
  const hoje = hojeISO(), dia = P.n === 1, cmpN = dia ? 7 : P.n;
  const pes = j.pessoas.map((p, k) => {
    const todos = p.dias.filter(x => x.indice != null);
    const per = todos.filter(x => x.data >= P.de && x.data <= P.ate);
    const ant = cmpN ? todos.filter(x => x.data >= somaDias(P.de, -cmpN) && x.data < P.de) : [];
    return { id: +p.id, k, cor: COR_P[k] || '#9aa0a6', nome: esc(DEP_NOME[p.id] || (p.nome || '').split(' ')[0]), todos, per, ant, ultimo: todos.length ? todos[todos.length - 1].data : null, st: depStats(per), stA: depStats(ant), porDia: Object.fromEntries(p.dias.map(x => [x.data, x])) };
  });
  // eixo dos gráficos: o período; no filtro "Dia", os 30 dias até ele; em "Tudo", desde o primeiro dado
  const prim = pes.map(q => q.todos.find(x => x.data >= (P.n ? P.de : '0'))?.data).filter(Boolean).sort()[0];
  const ini = !P.n ? (prim || somaDias(hoje, -29)) : dia ? somaDias(P.ate, -29) : P.n >= 365 && prim && prim > P.de ? prim : P.de; // no Ano, o eixo começa no primeiro dado
  const dias = listaDias(ini, P.ate), longo = dias.length > 60;
  if (!pes.some(q => q.todos.some(x => x.data >= ini))) { box.innerHTML = '<div class="card"><div class="vazio"><div class="i">🧠</div>Sem dados de bem-estar neste período.<br><br>Escolha outro período ou sincronize os relógios.</div></div>'; return; }
  const leg = extra => `<div class="dep-leg">${pes.map(q => `<span><i style="background:${q.cor}"></i>${q.nome}${extra ? ' · ' + extra(q) : ''}</span>`).join('')}</div>`;
  const tipH = (q, x) => { const h = HUMORES[x?.humor]; return `<div><i style="background:${q.cor}"></i>${q.nome} <b>${x?.indice ?? '--'}</b> ${h ? h[0] + ' ' + h[1] : '<span style="color:var(--txt3)">sem dados</span>'}</div>`; };
  DEP.graf = {};
  // 1) índice de bem-estar dos dois
  DEP.graf.ind = { dias, zonas: true, min: 0, max: 100, marca: dia ? P.ate : null, media7: longo, aria: 'Índice de bem-estar diário de Alex e Jeovana',
    series: pes.map(q => ({ cor: q.cor, v: dias.map(d => q.porDia[d]?.indice ?? null) })), tip: i => pes.map(q => tipH(q, q.porDia[dias[i]])).join('') };
  // 2) fatores ao longo do tempo (pequenos múltiplos, um eixo por fator)
  const fatKeys = Object.keys(DEP_FAT).filter(f => pes.some(q => dias.some(d => q.porDia[d]?.fatores?.[f]?.v != null)));
  fatKeys.forEach(f => { const u = DEP_FAT[f][1]; DEP.graf['f_' + f] = { dias, marca: dia ? P.ate : null, media7: longo, fmt: v => depFmt(u === 'h' ? v : Math.round(v), u), aria: DEP_FAT[f][0] + ' de Alex e Jeovana',
    series: pes.map(q => ({ cor: q.cor, v: dias.map(d => q.porDia[d]?.fatores?.[f]?.v ?? null) })),
    tip: i => pes.map(q => { const x = q.porDia[dias[i]]?.fatores?.[f]; return `<div><i style="background:${q.cor}"></i>${q.nome} <b>${depFmt(x?.v, u)}</b>${x ? ` <span style="color:var(--txt2)">(normal ${depFmt(x.normal, u)})</span>` : ''}</div>`; }).join('') }; });

  const cartao = q => {
    const st = q.st, semDados = q.ultimo && q.ultimo < somaDias(hoje, -1) && P.ate >= q.ultimo;
    const aviso = semDados ? `<div class="dep-aviso">⚠️ Sem dados do relógio desde ${depDM(q.ultimo)}. Abra o Garmin Connect no celular${q.id === 1 ? '' : ' da ' + q.nome} para sincronizar.</div>` : '';
    const topo = `<div class="dep-p-top"><span class="dep-p-nome"><i class="dep-dot"></i>${q.nome}</span><small class="mini">${DEP_REL[q.id] || ''}</small></div>`;
    if (dia) {
      const r = q.porDia[P.ate], H = HUMORES[r?.humor], med = q.stA?.media;
      if (!r || r.indice == null) return `<div class="dep-p" style="--c:${q.cor}">${topo}<div class="mini">Sem dados neste dia.</div>${aviso}</div>`;
      const dif = med != null ? r.indice - med : null;
      return `<div class="dep-p" style="--c:${q.cor}">${topo}
        <div class="dep-gauge"><div class="dep-emo">${H?.[0] || '🤔'}</div><div><div class="dep-nivel" style="color:${H?.[2] || 'var(--txt)'}">${H?.[1] || 'Sem dados'}</div>
        <div class="mini">índice <b>${r.indice}</b>/100${dif != null ? ` · ${dif > 0 ? '+' : ''}${dif} vs média dos 7 dias anteriores` : ''}</div><div class="mini">${r.humor_manual ? 'humor corrigido à mão' : 'automático'} · confiança ${r.confianca ?? '--'}%</div></div></div>
        ${r.motivos?.length ? `<ul class="be-mot">${r.motivos.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}${aviso}</div>`;
    }
    if (!st) return `<div class="dep-p" style="--c:${q.cor}">${topo}<div class="mini">Sem dados neste período.</div>${aviso}</div>`;
    const N = st.nivel == null ? null : DEP_NIVEL[st.nivel], H = HUMORES[depHumor(st.media)], tend = q.stA ? st.media - q.stA.media : null;
    const setaT = tend == null ? '' : tend > 3 ? `<span style="color:#3ddc84">↑ +${tend} vs período anterior</span>` : tend < -3 ? `<span style="color:#ff4d4f">↓ ${tend} vs período anterior</span>` : '<span>→ estável vs período anterior</span>';
    return `<div class="dep-p" style="--c:${q.cor}">${topo}
      <div class="dep-gauge"><div class="dep-emo">${H?.[0] || '🤔'}</div><div>${N ? `<span class="dep-tag" style="color:${N[1]}">${N[2]} ${N[0]}</span>` : '<span class="mini">poucos dias para avaliar</span>'}
      <div class="mini" style="margin-top:4px">índice médio <b>${st.media}</b>/100</div><div class="mini">${setaT}</div></div></div>
      ${N ? `<div class="mini" style="margin:8px 0 4px">${N[3]}</div>` : ''}
      ${kv([['Dias com dados', `${st.n}${P.n ? ' de ' + P.n : ''}`], ['Dias pra baixo / difíceis', `${st.neg} (${st.pctNeg}%)`], ['Maior sequência ruim', st.maxSeq + (st.maxSeq === 1 ? ' dia' : ' dias')],
        ['Melhor dia', `${depDM(st.melhor.data)} · ${st.melhor.indice} ${HUMORES[st.melhor.humor]?.[0] || ''}`], ['Pior dia', `${depDM(st.pior.data)} · ${st.pior.indice} ${HUMORES[st.pior.humor]?.[0] || ''}`]])}${aviso}</div>`;
  };

  // calendário de humor (uma linha por pessoa)
  const grande = dias.length <= 31;
  const cal = `${pes.map(q => `<div class="dep-cal-l"><span class="dep-cal-n"><i class="dep-dot" style="--c:${q.cor}"></i>${q.nome}</span><div class="dep-cal${grande ? ' g' : ''}">${dias.map(d => {
    const x = q.porDia[d], h = HUMORES[x?.humor], t = `${q.nome} · ${depDM(d)} · ${h ? h[1] + ' · índice ' + x.indice : 'sem dados'}`;
    return `<b class="${h ? '' : 'vz'}${dia && d === P.ate ? ' sel' : ''}" style="${h ? 'background:' + h[2] : ''}" title="${t}" data-t="${t}">${grande ? +d.slice(8) : ''}</b>`; }).join('')}</div></div>`).join('')}
    <div class="dep-leg">${Object.values(HUMORES).map(h => `<span><i style="background:${h[2]}"></i>${h[0]} ${h[1]}</span>`).join('')}<span><i class="vz"></i>sem dados</span></div>`;

  // distribuição do humor no período
  const dist = dia ? '' : widget({ ico: '🥧', cor: '#b28cff', titulo: 'Como foram os dias', corpo: `${pes.map(q => { const st = q.st; if (!st) return `<div class="dep-cal-l"><span class="dep-cal-n"><i class="dep-dot" style="--c:${q.cor}"></i>${q.nome}</span><span class="mini">sem dados</span></div>`;
    return `<div class="dep-cal-l" style="align-items:center"><span class="dep-cal-n"><i class="dep-dot" style="--c:${q.cor}"></i>${q.nome}</span><div class="dep-dist">${Object.keys(HUMORES).filter(h => st.cont[h]).map(h => { const pc = 100 * st.cont[h] / st.n;
      return `<span style="flex:${st.cont[h]};background:${HUMORES[h][2]}" title="${HUMORES[h][1]}: ${st.cont[h]} dia(s) · ${Math.round(pc)}%">${pc >= 12 ? HUMORES[h][0] + ' ' + st.cont[h] : ''}</span>`; }).join('')}</div></div>`; }).join('')}
    <div class="dep-leg">${Object.values(HUMORES).map(h => `<span><i style="background:${h[2]}"></i>${h[0]} ${h[1]}</span>`).join('')}</div>` });

  // fatores comparados ao normal de cada um (média do z no período; + = melhor que o normal)
  const zMed = (q, f) => depMed(q.per.map(x => x.fatores?.[f]?.z ?? null));
  const fatPer = Object.keys(DEP_FAT).filter(f => pes.some(q => zMed(q, f) != null));
  const diverg = fatPer.length ? widget({ ico: '⚖️', cor: '#1c9ddc', titulo: dia ? 'Fatores do dia vs o normal de cada um' : 'Fatores vs o normal de cada um', corpo: `${leg()}
    <div class="dep-div-eixo"><span>← pior que o normal</span><span>melhor →</span></div>
    ${fatPer.map(f => `<div class="dep-div-r"><span>${DEP_FAT[f][0]}</span><div class="dep-div-bs">${pes.map(q => { const z = zMed(q, f); if (z == null) return `<div class="dep-div-t" title="${q.nome}: sem este dado"><div class="dep-div-tr"></div><em>--</em></div>`; const w = Math.min(50, Math.abs(z) / 2.5 * 50);
      return `<div class="dep-div-t" title="${q.nome}: ${z >= 0 ? '+' : ''}${depFmt(z)}"><div class="dep-div-tr"><i style="--c:${q.cor};${z >= 0 ? 'left' : 'right'}:50%;width:${Math.max(w, 1)}%"></i></div><em>${z >= 0 ? '+' : ''}${depFmt(z)}</em></div>`; }).join('')}</div></div>`).join('')}
    <div class="mini" style="margin-top:6px">Cada barra mostra o quanto o fator ficou acima ou abaixo do <b>normal da própria pessoa</b> (nos 30 dias anteriores). Em estresse e FC, “melhor” quer dizer mais baixo.</div>` }) : '';

  // sincronia do casal
  let sinc = '';
  if (pes.length > 1) {
    const [a, b] = pes, faixa = dia ? dias : listaDias(P.n ? P.de : ini, P.ate);
    const par = faixa.map(d => [a.porDia[d], b.porDia[d]]).filter(([x, y]) => x?.indice != null && y?.indice != null);
    if (dia) {
      const x = a.porDia[P.ate], y = b.porDia[P.ate];
      if (x?.indice != null && y?.indice != null) sinc = widget({ ico: '💑', cor: '#f0506e', titulo: 'O casal neste dia', corpo: `<div class="mini">${depNeg(x.humor) && depNeg(y.humor) ? 'Os dois estavam para baixo neste dia — um bom dia para desacelerar juntos.' : depNeg(x.humor) || depNeg(y.humor) ? `${depNeg(x.humor) ? a.nome : b.nome} estava mais para baixo — um dia para ${depNeg(x.humor) ? b.nome : a.nome} dar apoio.` : 'Nenhum dos dois ficou para baixo neste dia.'}</div>` });
    } else if (par.length >= 3) {
      const juntos = par.filter(([x, y]) => depNeg(x.humor) && depNeg(y.humor)).length, apoio = par.filter(([x, y]) => depNeg(x.humor) !== depNeg(y.humor)).length;
      let r = null;
      if (par.length >= 5) { const xs = par.map(p => p[0].indice), ys = par.map(p => p[1].indice), mx = depMed(xs), my = depMed(ys); const sxy = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0), sx = Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0)), sy = Math.sqrt(ys.reduce((s, v) => s + (v - my) ** 2, 0)); r = sx && sy ? sxy / sx / sy : null; }
      const frR = r == null ? 'Poucos dias em comum para medir se os humores andam juntos.' : r >= .5 ? 'Os humores de vocês <b>andam juntos</b>: quando um piora, o outro costuma piorar também.' : r >= .2 ? 'Os humores de vocês têm <b>alguma relação</b>.' : r > -.2 ? 'Os humores de vocês são <b>independentes</b> no período.' : 'Os humores de vocês andam <b>em direções opostas</b>: quando um está mal, o outro costuma estar bem.';
      sinc = widget({ ico: '💑', cor: '#f0506e', titulo: 'Sincronia do casal', corpo: `<div class="mini">${frR}${r != null ? ` <span style="color:var(--txt3)">(correlação ${depFmt(r)})</span>` : ''}</div>
        <div class="dep-sinc"><div><b>${par.length}</b><span class="mini">dias com dados dos dois</span></div><div><b>${juntos}</b><span class="mini">dias ruins juntos</span></div><div><b>${apoio}</b><span class="mini">dias em que só um estava mal</span></div></div>` });
    }
  }

  // o que mais puxou para baixo (motivos dos dias ruins)
  const dri = { estresse: ['😰', 'Estresse alto'], sono: ['😴', 'Sono ruim'], bateria: ['🔋', 'Body Battery baixa'], hrv: ['💓', 'HRV baixa'], fc: ['❤️', 'FC de repouso alta'], parado: ['🪑', 'Pouca atividade'] };
  const motivos = q => { const c = {}; q.per.filter(x => depNeg(x.humor)).forEach(x => (x.motivos || []).filter(m => ('' + m).startsWith('⚠')).forEach(m => { const s = ('' + m).toLowerCase();
    const k = s.includes('estresse') ? 'estresse' : s.includes('sono') || s.includes('dormiu') ? 'sono' : s.includes('body battery') ? 'bateria' : s.includes('hrv') ? 'hrv' : s.includes('fc em repouso') ? 'fc' : s.includes('passos') || s.includes('intensidade') ? 'parado' : null; if (k) c[k] = (c[k] || 0) + 1; }));
    return Object.entries(c).sort((x, y) => y[1] - x[1]); };
  const mots = pes.map(q => [q, motivos(q)]);
  const motW = dia || !mots.some(([, m]) => m.length) ? '' : widget({ ico: '⚠️', cor: '#ff8a00', titulo: 'O que mais puxou para baixo', corpo: `<div class="dep-mot">${mots.map(([q, m]) => `<div><div class="dep-p-nome" style="--c:${q.cor};font-size:14px;margin-bottom:8px"><i class="dep-dot"></i>${q.nome}</div>${m.length ? `<div class="dep-dri">${m.map(([k, n]) => `<div class="dep-dri-i"><span>${dri[k][0]}</span><b>${dri[k][1]}</b><i>${n}×</i></div>`).join('')}</div>` : '<div class="mini">Nenhum dia ruim no período 🎉</div>'}</div>`).join('')}</div><div class="mini" style="margin-top:8px">Quantas vezes cada fator apareceu como motivo nos dias para baixo ou difíceis.</div>` });

  // tabela (acessível / conferência)
  const linhasTab = [...(dia ? [P.ate] : listaDias(P.n ? P.de : ini, P.ate))].reverse().slice(0, 400);
  const tab = `<details class="dep-det"><summary>Ver tabela dia a dia</summary><div class="dep-tabw"><table class="dep-tab"><thead><tr><th>Data</th>${pes.map(q => `<th><i class="dep-dot" style="--c:${q.cor}"></i> ${q.nome}</th>`).join('')}</tr></thead><tbody>${linhasTab.map(d => `<tr><td>${depDM(d)}/${d.slice(2, 4)}</td>${pes.map(q => { const x = q.porDia[d], h = HUMORES[x?.humor]; return `<td>${x?.indice != null ? `${h?.[0] || ''} ${x.indice} <span class="mini">${h?.[1] || ''}</span>` : '<span class="mini">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div></details>`;

  box.innerHTML = `
  ${widget({ ico: ICO.depressao, cor: '#b28cff', titulo: dia ? 'Como cada um estava' : 'Sinal de alerta emocional', corpo: `<div class="dep-pessoas">${pes.map(cartao).join('')}</div>` })}
  ${widget({ ico: '📈', cor: '#b28cff', titulo: 'Índice de bem-estar' + (dia ? ' · 30 dias até o dia' : ''), corpo: `${leg(q => q.st ? 'média ' + q.st.media : dia && q.porDia[P.ate]?.indice != null ? 'no dia ' + q.porDia[P.ate].indice : 'sem dados')}
    <div class="dep-graf" data-g="ind" style="height:230px"></div>
    <div class="mini" style="margin-top:6px">0–100 comparado com o normal de cada pessoa. ${longo ? 'Linha forte = média móvel de 7 dias; linha fraca = cada dia. ' : ''}Toque ou passe o dedo no gráfico para ver cada dia.</div>` })}
  ${widget({ ico: '📅', cor: '#b28cff', titulo: 'Calendário de humor' + (dia ? ' · 30 dias' : ''), corpo: cal })}
  ${dist}${sinc}${diverg}
  ${fatKeys.length ? widget({ ico: '🩺', cor: '#3ddc84', titulo: 'Sinais do relógio ao longo do tempo', corpo: `${leg()}<div class="dep-sms">${fatKeys.map(f => { const u = DEP_FAT[f][1];
      return `<div><div class="dep-sm-t">${DEP_FAT[f][0]}<span>${pes.map(q => `${q.nome} ${depFmt(depMed((dia ? [q.porDia[P.ate]] : q.per).map(x => x?.fatores?.[f]?.v ?? null)), u)}`).join(' · ')}${dia ? '' : ' (média)'}</span></div><div class="dep-graf" data-g="f_${f}" style="height:120px"></div></div>`; }).join('')}</div>` }) : ''}
  ${motW}
  ${widget({ ico: '🗒️', cor: '#9aa0a6', titulo: 'Dados', corpo: tab })}
  ${widget({ ico: '💙', cor: '#3ddc84', titulo: 'Importante', corpo: `
    <div class="mini">Isto é uma <b>estimativa pelos dados do relógio</b> (sono, HRV, estresse, Body Battery, FC e movimento). <b>Não é diagnóstico de depressão</b> — só um médico ou psicólogo pode avaliar isso. Serve como um sinal para vocês se observarem e conversarem sobre como estão se sentindo.</div>
    <div class="mini" style="margin-top:8px">Se a tristeza, o desânimo ou a falta de sono persistirem por duas semanas ou mais, procurem um profissional. No Brasil, o <b>CVV</b> atende 24h, de graça e em sigilo: ligue <a href="tel:188">188</a> ou acesse <a href="https://cvv.org.br" target="_blank" rel="noopener">cvv.org.br</a>.</div>
    <div class="mini" style="margin-top:8px;color:var(--txt3)">🔒 Aba privada — visível só para você.</div>` })}`;
  box.querySelectorAll('.dep-cal b[data-t]').forEach(b => b.onclick = () => toast(b.dataset.t));
  depDesenhar();
}
// gráficos de linha em SVG com dica (tooltip) e linha-guia ao passar o dedo/mouse
function depDesenhar() { document.querySelectorAll('.dep-graf[data-g]').forEach(el => { const g = DEP.graf[el.dataset.g]; if (g) depSvg(el, g); }); }
function depSvg(el, g) {
  const W = el.clientWidth || 300, H = el.clientHeight || 160, L = g.zonas ? 70 : 40, R = 10, T = 8, B = 20, n = g.dias.length;
  const vals = g.series.flatMap(s => s.v).filter(v => v != null && isFinite(v));
  if (!vals.length) { el.innerHTML = '<div class="mini centro" style="padding-top:40px">Sem dados no período</div>'; return; }
  let mn = g.min ?? Math.min(...vals), mx = g.max ?? Math.max(...vals);
  if (g.min == null) { const f = (mx - mn) * .12 || Math.abs(mx) * .1 || 1; mn -= f; mx += f; }
  const x = i => L + (n === 1 ? (W - L - R) / 2 : i / (n - 1) * (W - L - R)), y = v => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  const fmt = g.fmt || (v => Math.round(v));
  let s = '';
  if (g.zonas) {
    [30, 42, 58, 70].forEach(v => s += `<line class="grade" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`);
    [[85, 'otimo'], [64, 'bem'], [50, 'normal'], [36, 'baixo'], [15, 'dificil']].forEach(([v, h]) => s += `<text x="0" y="${y(v) + 3.5}">${HUMORES[h][0]} ${HUMORES[h][1]}</text>`);
  } else [mn + (mx - mn) * .1, (mn + mx) / 2, mx - (mx - mn) * .1].forEach(v => s += `<line class="grade" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3.5}" text-anchor="end">${fmt(v)}</text>`);
  const rot = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  rot.forEach((i, k) => s += `<text x="${x(i)}" y="${H - 4}" text-anchor="${n === 1 ? 'middle' : k === 0 ? 'start' : k === rot.length - 1 ? 'end' : 'middle'}">${depDM(g.dias[i])}</text>`);
  if (g.marca) { const i = g.dias.indexOf(g.marca); if (i >= 0) s += `<line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}" stroke="var(--txt2)" stroke-dasharray="3 3"/>`; }
  const caminho = v => { let d = '', dentro = false; v.forEach((a, i) => { if (a == null || !isFinite(a)) { dentro = false; return; } d += `${dentro ? 'L' : 'M'}${x(i).toFixed(1)},${y(a).toFixed(1)}`; dentro = true; }); return d; };
  const m7 = v => v.map((_, i) => { const w = v.slice(Math.max(0, i - 6), i + 1).filter(a => a != null); return w.length >= 3 ? w.reduce((p, q) => p + q, 0) / w.length : null; });
  g.series.forEach(se => {
    if (g.media7) s += `<path d="${caminho(se.v)}" fill="none" stroke="${se.cor}" stroke-width="1.5" stroke-opacity=".35" stroke-linejoin="round"/><path d="${caminho(m7(se.v))}" fill="none" stroke="${se.cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    else s += `<path d="${caminho(se.v)}" fill="none" stroke="${se.cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    se.v.forEach((a, i) => { if (a == null) return; const so = (se.v[i - 1] == null) && (se.v[i + 1] == null); if (!g.media7 && (n <= 45 || so)) s += `<circle cx="${x(i)}" cy="${y(a)}" r="${n <= 15 ? 4 : 3}" fill="${se.cor}" stroke="var(--card)" stroke-width="2"/>`; });
  });
  el.innerHTML = `<svg width="${W}" height="${H}" role="img" aria-label="${g.aria || ''}">${s}<line class="dep-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--txt2)" stroke-width="1" visibility="hidden"/><g class="dep-pts"></g></svg><div class="dep-tip" hidden></div>`;
  const cross = el.querySelector('.dep-cross'), pts = el.querySelector('.dep-pts'), tip = el.querySelector('.dep-tip');
  const mostrar = e => {
    const r = el.getBoundingClientRect(), px = e.clientX - r.left;
    const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round((px - L) / (W - L - R) * (n - 1)))), cx = x(i);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    pts.innerHTML = g.series.map(se => se.v[i] == null ? '' : `<circle cx="${cx}" cy="${y(se.v[i])}" r="5" fill="${se.cor}" stroke="var(--card)" stroke-width="2"/>`).join('');
    const d = new Date(g.dias[i] + 'T12:00:00');
    tip.innerHTML = `<div class="t">${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</div>${g.tip(i)}`; tip.hidden = false;
    const tw = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(W - tw, cx > W / 2 ? cx - tw - 12 : cx + 12)) + 'px';
  };
  el.onpointermove = mostrar; el.onpointerdown = mostrar;
  el.onpointerleave = () => { cross.setAttribute('visibility', 'hidden'); pts.innerHTML = ''; tip.hidden = true; };
}

/* ---------- MAIS: menu organizado ---------- */
function renderMais() {
  const u = S.usuario || {};
  const grupos = [
    ['Seus dados', [['perfil', ICO.perfilUser, 'Perfil e metas', 'Dados pessoais, metas diárias e zonas de FC'], ['perfil', ICO.sync, 'Integrações', 'Garmin, Strava e sincronização', 'integracoes'], ['dispositivo', ICO.relogio, 'Relógio', 'Bateria, sensores e recursos do aparelho']]],
    ['Análises', [['relatorios', ICO.relatorios, 'Relatórios', 'Forma × fadiga, risco de lesão, sono, correlações'], ['estatisticas', ICO.barras, 'Desempenho', 'Totais, recordes e medalhas'], ['treinos', ICO.semana, 'Treinos e calendário', 'Planeje e marque treinos concluídos']]],
    ['Apps do relógio', [['app', ICO.rastreador, 'Rastreador', 'GPS, bateria e FC ao vivo no Traccar'], ['app', ICO.walkie, 'Walkie-Talkie', 'Canais, mensagens rápidas e SOS', 'walkie'], ['app', ICO.mimei, 'ME MIMEI', 'Quantos lanches cabem nas calorias do dia', 'mimei'], ['app', ICO.ben10, 'Omnitrix Ben 10', 'Escolha o alien girando o Omnitrix', 'ben10'], ['app', ICO.tama, 'Bichinho Virtual', 'Cuide do bichinho: ovo, fome, cocô e sono', 'tama'], ['app', ICO.forca, 'Força', 'Treino de musculação com contagem de repetições', 'forca'], ['app', ICO.sono, 'Sono', 'A sua noite no pulso, 100% offline', 'sono'], ['app', ICO.painel, 'Painel Total', 'Mostrador com tudo na tela: hora, FC, passos, clima e mais', 'painel'], ['app', ICO.gasolina, 'Gasolina Perto', 'Os postos mais baratos perto de você, com seta até lá', 'gasolina'], ['app', ICO.onibus, 'Próximo Ônibus', 'Em quantos minutos o ônibus chega no seu ponto', 'onibus']]],
  ];
  if (+S.euId === 1) grupos[1][1].push(['depressao', ICO.depressao, 'Depressão', 'Humor, estresse e sono de Alex e Jeovana']); // aba privada (só Alequizão)
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
  rastreador: { ativo: true, leitura: null, estado: '' },
  traccar: { ativo: false, nome: null, url: 'http://179.199.136.173:5055', intervalo: 30, distancia: 0, angulo: 0, precisao: 0,
    buffer: true, enviados: 0, fila: 0, gps: 'sem sinal', estado: 'MENU > Identificador', log: [], status: null }, sobre: null };
async function renderSimulador(arg) {
  const [modeloArg, appArg] = String(arg || '').split('-').slice(1);
  if (appArg) SIM.app = appArg;
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('sim')}
  <section class="w"><header class="w-top"><span class="w-ico">🖥️</span><span class="w-tit">Simulador do relógio</span></header><div class="w-corpo">
    <div class="sim-apps">${[['mimei', '🍺', 'ME MIMEI'], ['walkie', '📻', 'Walkie-Talkie'], ['rastreador', '📍', 'Rastreador'], ['tama', '🥚', 'Bichinho'], ['omnitrix', '🟢', 'Omnitrix'], ['locais', '🚗', 'Meus Locais'], ['sono', '🌙', 'Sono'], ['painel', '📊', 'Painel Total'], ['forca', '🏋️', 'Força'], ['gasolina', '⛽', 'Gasolina Perto'], ['onibus', '🚌', 'Próximo Ônibus'], ['traccar', '🛰️', 'Traccar']].map(([k, i, n]) => `<button class="chip ${SIM.app === k ? 'ativo' : ''}" data-simapp="${k}">${i} ${n}</button>`).join('')}</div>
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
  clearInterval(SIM.trTimer); SIM.traccar.status = null;
  if (SIM.app === 'traccar' && SIM.traccar.ativo) { SIM.traccar.ativo = false; simTraccarLigar(); }
  const dicas = { mimei: 'Deslize ou use ↑ ↓ ← → para trocar de lanche; START (Enter) abre "Comi" e "Desfazer". Ações valem de verdade.',
    walkie: 'Você conta como um relógio próprio: abra o simulador em outra conta (ex.: jeovana) para conversar. START abre mensagens rápidas, escrever, chamar atenção, SOS e canais.',
    omnitrix: 'START (Enter) abre o Omnitrix, ↑ ↓ giram entre os 59 aliens e START transforma. É o mesmo Omnitrix da aba Ben 10.',
    tama: 'Cuide do bichinho: ↑ ↓ escolhem o ícone, START (Enter) usa, VOLTAR (Esc) cancela. É o mesmo bichinho da aba Bichinho.',
    locais: 'Salve onde deixou o carro, a moto, o pet ou as chaves e volte pela seta. START abre, ↑ ↓ andam na lista e trocam bússola/informações/mapa, MENU abre as ações. Tudo offline.',
    painel: 'Mostrador (watch face) com hora grande, data, frequência cardíaca com zona, calorias, bateria, passos, distância, andares, subida, estresse, minutos de intensidade, Body Battery, clima, GPS, nascer e pôr do sol, notificações e alarmes — tudo na mesma tela.',
    sono: 'Mostra a sua última noite de sono com estágios, hipnograma, frequência cardíaca, respiração, HRV, estresse, Body Battery e as últimas 7 noites. ↑ ↓ trocam de página e START atualiza pelo servidor.',
    forca: 'Treino de musculação que o FR55 não tem de fábrica: conta as repetições pelo acelerômetro, separa as séries, controla o descanso e grava a atividade em FIT para o Garmin Connect. START começa e fecha a série, ↑ ↓ corrigem a contagem, MENU (segurar UP) abre o menu do treino e VOLTAR (Esc) pausa.',
    gasolina: 'Os 5 postos mais baratos perto de você, com preço real da SEFAZ-AL. ↑ ↓ andam entre os postos, START (Enter) abre a seta até o posto, MENU (segurar UP) troca o combustível ou atualiza, VOLTAR (Esc) volta. Posição: o GPS do navegador se já estiver liberado; senão, um ponto fixo em Maceió.',
    onibus: 'Em quantos minutos chega o próximo ônibus no seu ponto favorito, com dados reais (ao vivo pelo GPS dos ônibus ou a tabela programada de hoje). ↑ ↓ trocam de favorito, START (Enter) ou MENU (segurar UP) abrem as opções (atualizar, perto de mim, alerta 2 min, principal, remover, sincronizar), VOLTAR (Esc) volta. Favoritos: os do painel (aba Próximo Ônibus) + os salvos aqui pelo "Perto de mim".',
    traccar: 'Cliente Traccar com as mesmas funções do app do Android: MENU (segurar UP) abre identificador, servidor, frequência, distância, ângulo, precisão, guardar offline e a tela de Status. START liga e para o serviço. Fechado, o relógio envia a cada 5 min (limite da Garmin).',
    rastreador: 'Mostra a última leitura real do seu relógio. O simulador não envia posição nem bateria (para não criar dados falsos). MENU (segurar UP) abre Sobre. Versão 1.0.1: com o app fechado, envia bateria e saúde a cada 5 min e só manda posição quando há GPS novo.' };
  $('#simDica') && ($('#simDica').textContent = dicas[SIM.app]);
  if (SIM.app === 'sono') { await sonoCarregar(); }
  if (SIM.app === 'painel') { await painelCarregar(); }
  if (SIM.app === 'gasolina') { GAS.tela = 'lista'; GAS.menu = -1; gasBuscar(); }
  if (SIM.app === 'onibus') { ONI.modo = 0; ONI.p = null; ONI.carregado = false; oniAnimar(); oniAtualizar(); }
  clearInterval(SIM.forcaTimer); if (SIM.app === 'forca') { forcaIniciar(); SIM.forcaTimer = setInterval(() => { if (SIM.app === 'forca' && SIM.canvas) { forcaTique(); simDesenhar(); } else clearInterval(SIM.forcaTimer); }, 1000); }
  if (SIM.app === 'mimei') await simMimeiDados();
  if (SIM.app === 'walkie') await simWalkieIniciar();
  if (SIM.app === 'rastreador') await simRastreadorDados();
  clearInterval(SIM.b10Timer);
  clearInterval(B10.anim); B10.anim = null;
  if (SIM.app === 'omnitrix') {
    if (!B10.aliens.length) { try { B10.aliens = await fetch('app/ben10/aliens.json?v=2').then(x => x.json()); } catch (e) { } }
    SIM.b10Timer = setInterval(() => { if (SIM.app === 'omnitrix' && SIM.canvas) { b10Tique(); simDesenhar(); } else clearInterval(SIM.b10Timer); }, 50);
  }
  clearInterval(SIM.locTimer); if (SIM.app === 'locais') { locIniciar(); SIM.locTimer = setInterval(() => { if (SIM.app === 'locais' && SIM.canvas) { locTique(); simDesenhar(); } else clearInterval(SIM.locTimer); }, 1000); }
  clearInterval(SIM.tamaTimer); clearInterval(TAMA.anim2); TAMA.anim2 = null; if (SIM.app === 'tama') { tamaCarregar(); tamaSimular(); SIM.tamaTimer = setInterval(() => { if (SIM.app === 'tama' && SIM.canvas) tamaTique(); else clearInterval(SIM.tamaTimer); }, 250); }
  simDesenhar();
}
/* ---- ME MIMEI 1.16.0: estatísticas (só admin) ---- */
function mimeiStatsAdmin() {
  const mm = $('#mm'); if (!mm || $('#mmStats')) return;
  const s = document.createElement('section'); s.className = 'w'; s.id = 'mmStats';
  s.innerHTML = `<header class="w-top"><span class="w-ico" aria-hidden="true">📊</span><span class="w-tit">ME MIMEI — estatísticas da loja (admin)</span></header><div class="w-corpo"><button class="btn sec peq" id="mmStatsBt">Carregar estatísticas</button><div id="mmStatsC"></div></div>`;
  mm.appendChild(s);
  $('#mmStatsBt').onclick = async () => {
    const c = $('#mmStatsC'); c.textContent = 'Carregando…';
    const j = await apiGet('mimei_stats').catch(x => ({ ok: false, erro: x.message })); if (!j.ok) { c.textContent = j.erro || 'Falhou'; return; }
    const tab = (t, l, k = 'k') => `<h4 style="margin:12px 0 4px">${t}</h4>${l.length ? `<div class="lista">${l.map(x => `<div class="item"><div class="info"><b>${esc(x[k] ?? '?')}</b></div><span class="mini">${x.n}${x.qtd ? ' · ' + String(x.qtd).replace('.', ',') + ' un.' : ''}</span></div>`).join('')}</div>` : '<p class="mini">Sem dados</p>'}`;
    const mx = Math.max(1, ...j.ativos.map(a => +a.n));
    c.innerHTML = `<p class="mini">${j.total} relógios no total · ${j.ativos7} ativos nos últimos 7 dias · ${j.pares} pares de amigos</p>
      <h4 style="margin:12px 0 4px">Relógios ativos por dia (30 dias)</h4>${j.ativos.length ? `<div style="display:flex;align-items:flex-end;gap:2px;height:80px" role="img" aria-label="Relógios ativos por dia">${j.ativos.map(a => `<i title="${a.d}: ${a.n}" style="flex:1;background:var(--azul,#2563eb);height:${Math.max(4, a.n / mx * 100)}%;border-radius:2px"></i>`).join('')}</div>` : '<p class="mini">Sem dados</p>'}
      ${tab('Lanches mais registrados', j.lanches, 'nome')}${tab('Registrado por', j.origens)}${tab('Países', j.paises)}${tab('Idiomas', j.idiomas)}${tab('Versões do app', j.versoes)}${tab('Modelos', j.modelos)}`;
  };
}
/* ---- ME MIMEI ---- */
async function simMimeiDados() {
  const j = await apiGet('mimei_estado').catch(() => null); if (!j?.ok) return;
  const r = j.resumo; j.lanches.forEach(l => l.pode = l.kcal > 0 && !l.zero ? Math.round(r.saldo / l.kcal * 10) / 10 : 0); // 1.17.0: zero fora da conversão
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
  if (SIM.app === 'traccar' && SIM.traccar.status) { const T = SIM.traccar;
    if (t === 'next') T.status.deslocamento++; else if (t === 'prev') T.status.deslocamento = Math.max(0, T.status.deslocamento - 1);
    else if (t === 'back') T.status = null; else if (t === 'start') { T.log = []; }
    return simDesenhar(); }
  if (SIM.app === 'traccar' && (t === 'menu' || (t === 'start' && !SIM.traccar.nome))) { simMenuTraccar(); return simDesenhar(); }
  if (SIM.app === 'rastreador' && t === 'menu') { SIM.sobre = { app: 'Rastreador Alequizão', versao: '1.0.1', deslocamento: 0 }; return simDesenhar(); }
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
  if (SIM.app === 'sono') { sonoBotao(t); return simDesenhar(); }
  if (SIM.app === 'forca') { forcaBotao(t); return simDesenhar(); }
  if (SIM.app === 'gasolina') { gasBotao(t); return simDesenhar(); }
  if (SIM.app === 'onibus') { oniBotao(t); return simDesenhar(); }
  if (SIM.app === 'locais') { locBotao(t); return; }
  if (SIM.app === 'tama') { tamaBotao({ start: 'start', back: 'back', prev: 'cima', next: 'baixo', menu: 'start' }[t] || 'start'); return simDesenhar(); }
  if (SIM.app === 'traccar' && t === 'start') { simTraccarLigar(); return simDesenhar(); }
  if (SIM.app === 'rastreador' && t === 'start') { SIM.rastreador.ativo = !SIM.rastreador.ativo; }
  simDesenhar();
}
function simToque(yTela) {
  if (SIM.app === 'gasolina') return gasToque(yTela, SIM.dev.tela.height);
  if (SIM.app === 'onibus') { oniToque(yTela, SIM.dev.tela.height); return simDesenhar(); }
  if (SIM.app === 'locais') return simTecla('start');
  if (!SIM.menu) { if (SIM.app !== 'rastreador') simTecla('start'); return; }
  const m = SIM.menu, alt = SIM.dev.tela.height / 5, i = Math.floor((yTela - alt) / alt) + m.topo;
  if (i >= 0 && i < m.itens.length) { m.i = i; simEscolher(m.itens[i]); }
}
function simMenuMimei() {
  const M = SIM.mimei, l = M.dados.lanches[M.sel], r = M.dados.resumo;
  const itens = [{ t: 'Comi 1', s: l.porcao || `${l.kcal} kcal`, q: 1 }, { t: 'Comi meia', s: `${Math.round(l.kcal / 2)} kcal`, q: 0.5 }, { t: 'Comi 2', s: `${l.kcal * 2} kcal`, q: 2 }];
  if (r.ultimo) itens.push({ t: 'Desfazer ultimo', s: r.ultimo, a: 'desfazer' });
  itens.push({ t: 'Sequencia', s: 'dias dentro do saldo', a: 'mm_info' }, { t: 'Conquistas', s: 'veja em /garmin/meu', a: 'mm_info' }, { t: 'Amigos', s: 'parear em /garmin/meu', a: 'mm_info' }, { t: 'Atualizar', s: 'v1.17.0', a: 'atualizar' }, { t: 'Sobre', s: 'desenvolvedor', a: 'sobre' });
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
  if (it.a === 'sobre') { const apps = { mimei: ['ME MIMEI', '1.17.0'], walkie: ['Walkie-Talkie', '2.3.2'], traccar: ['Traccar Cliente', '2.0.0'], rastreador: ['Rastreador Alequizão', '1.0.1'] };
    const a = apps[SIM.app] || ['Walkie-Talkie', '2.3.2']; SIM.sobre = { app: a[0], versao: a[1], deslocamento: 0 }; return simDesenhar(); }
  if (SIM.app === 'traccar') {
    const T = SIM.traccar, giro = (lista, v) => lista[(lista.indexOf(v) + 1) % lista.length];
    if (it.a === 'tr_nome') { const n = prompt('Identificador do device no Traccar:', T.nome || ''); if (n && n.trim()) { T.nome = n.trim(); T.estado = 'Device criado no Traccar (simulado)'; trAnotar(T, 'Device criado'); } return simDesenhar(); }
    if (it.a === 'tr_url') { const u = prompt('Endereco do servidor:', T.url); if (u && u.trim()) { T.url = u.trim(); T.estado = 'Servidor salvo'; trAnotar(T, 'Servidor: ' + T.url); } return simDesenhar(); }
    if (it.a === 'tr_int') { T.intervalo = giro(TR_INTERVALO, T.intervalo); if (T.ativo) { T.ativo = false; simTraccarLigar(); } simMenuTraccar(); return simDesenhar(); }
    if (it.a === 'tr_dist') { T.distancia = giro(TR_DISTANCIA, T.distancia); simMenuTraccar(); return simDesenhar(); }
    if (it.a === 'tr_ang') { T.angulo = giro(TR_ANGULO, T.angulo); simMenuTraccar(); return simDesenhar(); }
    if (it.a === 'tr_prec') { T.precisao = (T.precisao + 1) % 3; simMenuTraccar(); return simDesenhar(); }
    if (it.a === 'tr_buf') { T.buffer = !T.buffer; simMenuTraccar(); return simDesenhar(); }
    if (it.a === 'tr_ligar') { simTraccarLigar(); return simDesenhar(); }
    if (it.a === 'tr_status') { T.status = { deslocamento: 0 }; return simDesenhar(); }
    if (it.a === 'tr_fila') { T.fila = 0; simMenuTraccar(); return simDesenhar(); }
    return simDesenhar();
  }
  if (SIM.app === 'mimei') {
    if (it.a === 'mm_info') { SIM.mimei.estado = it.s; return simDesenhar(); }
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
  else if (SIM.app === 'painel') painelDesenhar(c, w, h, redondo, fonte, cor);
  else if (SIM.app === 'sono') sonoDesenhar(c, w, h, redondo, fonte, cor);
  else if (SIM.app === 'forca') forcaDesenhar(c, w, h, redondo, fonte, cor);
  else if (SIM.app === 'gasolina') gasDesenhar(c, w, h, d.tipo !== 'amoled', fonte);
  else if (SIM.app === 'onibus') oniDesenhar(c, w, h, d.tipo !== 'amoled', fonte);
  else if (SIM.app === 'locais') locDesenhar(c, w, h, redondo, fonte, cor);
  else if (SIM.app === 'mimei') simDesenharMimei(c, w, h, redondo, fonte, cor);
  else if (SIM.app === 'walkie' && typeof simDesenharWalkie === 'function') { const W = SIM.walkie, pos = W.canais.findIndex(x => x.id == W.canal);
    simDesenharWalkie(c, w, h, redondo, fonte, cor, { canal: W.nomeCanal || 'Walkie-Talkie', posCanal: pos + 1, totalCanais: W.canais.length, mensagens: W.mensagens, deslocamento: W.desloc, estado: W.estado, atualizacao: false, aviso: W.cfg?.aviso || '' }); }
  else if (SIM.app === 'traccar') { SIM.traccar.status ? simDesenharTraccarStatus(c, w, h, redondo, fonte, cor, SIM.traccar) : simDesenharTraccar(c, w, h, redondo, fonte, cor, SIM.traccar); }
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
  const numTxt = l.zero ? 'ZERO' : fmt(l.pode) + 'x', kcalTxt = String(l.kcal), rotCabem = l.zero ? 'livre' : 'cabem';
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
      for (const f of fontesLado) { c.font = f.css; const a = Math.max(c.measureText(numTxt).width, c.measureText(kcalTxt).width); c.font = fT.css; const b = Math.max(c.measureText(rotCabem).width, c.measureText('kcal').width);
        fLado = f; precisa = Math.max(a, b); if (precisa <= (larg - tam) / 2 - 6) break; }
      let t2 = tam; if (precisa > (larg - t2) / 2 - 6) t2 = Math.max(16, Math.floor(larg - 2 * precisa - 12));
      const ic = M.icones[l.id];
      if (ic) { const s = Math.min(t2 / ic.width, t2 / ic.height); c.drawImage(ic, cx - ic.width * s / 2, y + (tam - ic.height * s) / 2, ic.width * s, ic.height * s); }
      else { c.fillStyle = cor(0x2A2A2C); c.beginPath(); c.arc(cx, y + tam / 2, t2 / 2, 0, Math.PI * 2); c.fill(); }
      const yL = y + (tam - fLado.h - fT.h) / 2, xE = cx - t2 / 2 - 6 - precisa / 2, xD = cx + t2 / 2 + 6 + precisa / 2;
      simTexto(c, numTxt, xE, yL, fLado, cor(0xF5C23B)); simTexto(c, rotCabem, xE, yL + fLado.h, fT, cor(0x9A9AA0));
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

/* ---- RASTREADOR ALEQUIZÃO 1.0.1 (espelha PrincipalView.mc de /opt/ciq/loja/rastreador-1.0.1) ---- */
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
    ['fechado: bateria e saúde a cada 5 min', ['xtiny'], cor(0x6A6A70)],
  ], h * (redondo ? 0.07 : 0.03), h * (redondo ? 0.94 : 0.97));
}


/* ---- TRACCAR CLIENTE 2.0 (espelha PrincipalView.mc de /opt/ciq/traccar) ---- */
const TR_INTERVALO = [10, 15, 30, 60, 120, 300], TR_DISTANCIA = [0, 10, 25, 50, 100, 250, 500], TR_ANGULO = [0, 15, 30, 45, 90], TR_PRECISAO = ['alta', 'media', 'baixa'];
const trTempo = s => (s % 60 === 0 && s >= 60) ? `${s / 60} min` : `${s} s`;
function trFiltros(T) { let t = trTempo(T.intervalo); if (T.distancia > 0) t += ` · ${T.distancia} m`; if (T.angulo > 0) t += ` · ${T.angulo}°`; return t; }
function trAnotar(T, txt, ok = true) { T.log.push({ t: new Date(), s: txt, ok }); if (T.log.length > 30) T.log.shift(); }
function simDesenharTraccar(c, w, h, redondo, fonte, cor, T) {
  const { pilha } = simLayoutHelpers(c, w, h, redondo, fonte);
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  let linha = `Enviados: ${T.enviados}`;
  if (T.fila > 0) linha += ` · fila ${T.fila}`;
  if (T.ultimoEnvio) linha += ` · ${T.ultimoEnvio}${T.ultimoOk ? ' ok' : ' x'}`;
  pilha([
    [T.ativo ? 'AO VIVO' : 'PARADO', ['xtiny'], T.ativo ? cor(0x3DDC84) : cor(0x1FA3E3)],
    [T.nome || 'sem device', ['medium', 'small', 'tiny', 'xtiny'], '#fff'],
    [`GPS: ${T.gps} · ${trFiltros(T)}`, ['xtiny'], cor(0xAAAAAA)],
    [linha, ['xtiny'], cor(0xAAAAAA)],
    [T.estado || '', ['xtiny'], cor(0xAAAAAA)],
    ['fechado: envia a cada 5 min', ['xtiny'], cor(0x6A6A70)],
  ], h * (redondo ? 0.07 : 0.03), h * (redondo ? 0.94 : 0.97));
}
/* tela de Status: mesma rolagem do StatusView.mc */
function simDesenharTraccarStatus(c, w, h, redondo, fonte, cor, T) {
  const { medir, altura, desenhar } = simLayoutHelpers(c, w, h, redondo, fonte);
  const cx = w / 2, fh = fonte('xtiny').h, x = ['xtiny'];
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const l = [['Status', cor(0xF5C23B)], [`${T.ativo ? 'servico ligado' : 'servico parado'} · fila ${T.fila}`, cor(0x9A9AA0)]];
  for (let i = T.log.length - 1; i >= 0; i--) l.push([`${hm(T.log[i].t)} ${T.log[i].s}`, T.log[i].ok ? cor(0xCCCCCC) : cor(0xE8604C)]);
  if (!T.log.length) l.push(['sem eventos ainda', cor(0x6A6A70)]);
  const desl = Math.max(0, Math.min(T.status?.deslocamento || 0, l.length - 1));
  const yIni = h * (redondo ? 0.1 : 0.04), yFim = h * (redondo ? 0.9 : 0.96), esp = fh * 0.15;
  const seta = (t, y) => { c.font = fonte('xtiny').css; c.fillStyle = cor(0x6A6A70); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(t, cx, y); };
  let y = yIni; if (desl > 0) { seta('^', y); y += fh; }
  let i = desl;
  for (; i < l.length; i++) {
    const m = medir(l[i][0], x, y), alt = altura(m), reserva = i < l.length - 1 ? fh : 0;
    if (y + alt + reserva > yFim && i > desl) break;
    desenhar(m, cx, y, l[i][1]); y += alt + esp;
  }
  if (i < l.length) seta('v', yFim - fh);
}
function simMenuTraccar() {
  const T = SIM.traccar;
  SIM.menu = { titulo: 'Traccar', i: 0, topo: 0, itens: [
    { t: 'Identificador', s: T.nome || 'toque para digitar', a: 'tr_nome' },
    { t: 'Servidor', s: T.url, a: 'tr_url' },
    { t: 'Frequencia', s: trTempo(T.intervalo), a: 'tr_int' },
    { t: 'Distancia', s: T.distancia === 0 ? 'desligado' : `${T.distancia} m`, a: 'tr_dist' },
    { t: 'Angulo', s: T.angulo === 0 ? 'desligado' : `${T.angulo}°`, a: 'tr_ang' },
    { t: 'Precisao', s: TR_PRECISAO[T.precisao], a: 'tr_prec' },
    { t: 'Guardar offline', s: T.buffer ? 'ligado' : 'desligado', a: 'tr_buf' },
    { t: T.ativo ? 'Parar servico' : 'Iniciar servico', s: T.ativo ? 'rastreando' : 'parado', a: 'tr_ligar' },
    { t: 'Status', s: `${T.log.length} eventos`, a: 'tr_status' },
    { t: 'Limpar fila', s: `${T.fila} guardadas`, a: 'tr_fila' },
    { t: 'Sobre', s: 'desenvolvedor', a: 'sobre' },
  ] };
}
function simTraccarLigar() {
  const T = SIM.traccar;
  if (!T.nome) { T.estado = 'Defina o identificador'; return simMenuTraccar(); }
  T.ativo = !T.ativo;
  clearInterval(SIM.trTimer);
  trAnotar(T, T.ativo ? 'Servico ligado' : 'Servico parado');
  if (!T.ativo) { T.estado = 'Parado · fechado envia a cada 5 min'; T.gps = 'sem sinal'; return; }
  T.estado = 'Buscando GPS...';
  SIM.trTimer = setInterval(() => {
    if (SIM.app !== 'traccar' || !SIM.canvas || !T.ativo) { clearInterval(SIM.trTimer); return; }
    T.gps = 'bom';
    if (T.distancia > 0 && Math.random() < 0.35) { T.estado = 'Parado · filtro de distancia'; return simDesenhar(); }
    if (T.angulo > 0 && Math.random() < 0.2) { T.estado = 'Parado · filtro de angulo'; return simDesenhar(); }
    T.enviados++;
    const d = new Date(); T.ultimoEnvio = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    T.ultimoOk = true; T.estado = `Ao vivo · ${trFiltros(T)} (simulado)`; trAnotar(T, 'Enviado');
    simDesenhar();
  }, Math.max(2, T.intervalo) * 1000);
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
/* ================= MEUS LOCAIS — réplica das telas do MeusLocaisApp.mc ================= */
const LOC = {
  cores: { fundo: 0x000000, texto: 0xFFFFFF, fraco: 0x9A9A9A, azul: 0x00A9E0, azulEsc: 0x00557A, verde: 0x00C853, vermelho: 0xE53935, amarelo: 0xFFC107, linha: 0x262626, cartao: 0x141414, mapa: 0x0E1720, grade: 0x1F3446 },
  TIPOS: ['Carro', 'Moto', 'Pet', 'Chaves', 'Celular', 'Fones', 'Objeto', 'Outro'],
  base: { lat: -9.6670, lon: -35.7160 },
  locais: [], tela: 'inicio', sel: 0, topo: 0, tipo: 0, quadro: 0,
  gps: { lat: -9.6670, lon: -35.7160, prec: 40, bons: 0, ok: true },
  heading: 0, alvo: null, seta: 0, dist: null, distSuave: null, hist: [], ref: null, tend: 0,
  pagina: 0, chegou: false, andando: 1, rolagem: 0, menu: null, trilha: []
};
const locNorm = a => { let x = a - Math.floor(a / 360) * 360; return x < 0 ? x + 360 : (x >= 360 ? 0 : x); };
const locDif = (a, b) => { const d = locNorm(locNorm(b) - locNorm(a)); return d > 180 ? d - 360 : d; };
const locInterp = (a, b, f) => locNorm(locNorm(a) + locDif(a, b) * f);
function locDist(la1, lo1, la2, lo2) { const R = 6371008.8, r = Math.PI / 180, f1 = la1 * r, f2 = la2 * r, df = f2 - f1, dl = (lo2 - lo1) * r;
  const s = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)); }
function locBear(la1, lo1, la2, lo2) { const r = Math.PI / 180, f1 = la1 * r, f2 = la2 * r, dl = (lo2 - lo1) * r;
  return locNorm(Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) / r); }
function locFmt(m) { if (m == null || !isFinite(m) || m < 0) return '--'; if (m < 1000) return Math.floor(m) + ' m';
  const km = m / 1000; return km < 10 ? km.toFixed(2) + ' km' : (km < 100 ? km.toFixed(1) + ' km' : Math.round(km) + ' km'); }
function locPonto(la, lo, m, g) { const a = g * Math.PI / 180; return [la + m * Math.cos(a) / 111320, lo + m * Math.sin(a) / (111320 * Math.cos(la * Math.PI / 180))]; }
function locRosa(g) { return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.floor((locNorm(g) + 22.5) / 45) % 8]; }

function locSemear() {
  if (LOC.locais.length) return;
  const d = [[0, 120, 45], [1, 340, 200], [3, 12, 300], [4, 8, 90], [5, 65, 180]];
  LOC.locais = d.map(([t, m, g], i) => { const p = locPonto(LOC.base.lat, LOC.base.lon, m, g);
    return { id: i + 1, nome: LOC.TIPOS[t], tipo: t, lat: p[0], lon: p[1], ts: Date.now() / 1000 - 3600 * (i + 1), prec: 4 + i, ultDist: m, maxDist: m * 1.4 }; });
}
function locIniciar() { locSemear(); LOC.tela = 'inicio'; LOC.quadro = 0; LOC.gps = { lat: LOC.base.lat, lon: LOC.base.lon, prec: 40, bons: 0, ok: true }; LOC.menu = null; }

function locTique() {
  LOC.quadro++;
  // aquisição de GPS
  if (LOC.tela === 'gps') { LOC.gps.prec = Math.max(4, LOC.gps.prec - 6); if (LOC.gps.prec <= 20) LOC.gps.bons = Math.min(9, LOC.gps.bons + 1); }
  // navegação: anda em direção ao destino (ou se afasta)
  if (LOC.tela === 'nav' && LOC.alvo && LOC.andando) {
    const b = locBear(LOC.gps.lat, LOC.gps.lon, LOC.alvo.lat, LOC.alvo.lon);
    const p = locPonto(LOC.gps.lat, LOC.gps.lon, 2.2 * LOC.andando, LOC.andando > 0 ? b : b + 180);
    LOC.gps.lat = p[0]; LOC.gps.lon = p[1];
    LOC.heading = locInterp(LOC.heading, b, 0.12);
    const n = LOC.trilha.length; if (!n || locDist(LOC.trilha[n - 1][0], LOC.trilha[n - 1][1], p[0], p[1]) > 5) { LOC.trilha.push([p[0], p[1]]); if (LOC.trilha.length > 30) LOC.trilha.shift(); }
  }
  if (LOC.alvo) locNavAtualizar();
  LOC.locais.forEach(l => { l.ultDist = locDist(LOC.gps.lat, LOC.gps.lon, l.lat, l.lon); if (l.ultDist > l.maxDist) l.maxDist = l.ultDist; });
}
function locNavAtualizar() {
  const d = locDist(LOC.gps.lat, LOC.gps.lon, LOC.alvo.lat, LOC.alvo.lon);
  const b = locBear(LOC.gps.lat, LOC.gps.lon, LOC.alvo.lat, LOC.alvo.lon);
  LOC.dist = d; LOC.distSuave = LOC.distSuave == null ? d : LOC.distSuave + (d - LOC.distSuave) * 0.35;
  LOC.seta = locInterp(LOC.seta, locNorm(b - LOC.heading), 0.25); LOC.bearing = b;
  LOC.hist.push(d); if (LOC.hist.length > 5) LOC.hist.shift();
  const med = LOC.hist.reduce((a, x) => a + x, 0) / LOC.hist.length;
  if (LOC.ref == null) LOC.ref = med;
  else if (med - LOC.ref <= -8) { LOC.tend = 1; LOC.ref = med; }
  else if (med - LOC.ref >= 8) { LOC.tend = 2; LOC.ref = med; }
  else if (LOC.hist.length >= 5 && Math.max(...LOC.hist.map(x => Math.abs(x - med))) < 8) LOC.tend = 0;
  if (LOC.distSuave <= 10 && !LOC.chegou) { LOC.chegou = true; simVibrar(1); }
  if (LOC.distSuave > 20) LOC.chegou = false;
}

/* ---------------- botões ---------------- */
function locBotao(t) {
  const L = LOC;
  if (L.menu) { const m = L.menu;
    if (t === 'next') m.i = (m.i + 1) % m.itens.length; else if (t === 'prev') m.i = (m.i - 1 + m.itens.length) % m.itens.length;
    else if (t === 'back') L.menu = null; else if (t === 'start' || t === 'menu') { const it = m.itens[m.i]; L.menu = null; locAcao(it); }
    return simDesenhar(); }
  switch (L.tela) {
    case 'inicio': if (t === 'start' || t === 'menu') { L.tela = L.locais.length ? 'lista' : 'lista'; L.sel = 0; } break;
    case 'lista': {
      const n = L.locais.length;
      if (t === 'next') { L.sel = (L.sel + 1) % (n + 1); } else if (t === 'prev') { L.sel = (L.sel - 1 + n + 1) % (n + 1); }
      else if (t === 'start') { if (L.sel >= n) { L.tela = 'tipo'; L.tipo = 0; } else locAbrirNav(L.locais[L.sel]); }
      else if (t === 'menu') { if (L.sel < n) { L.alvo = L.locais[L.sel]; L.tela = 'detalhe'; L.rolagem = 0; } }
      else if (t === 'back') L.tela = 'inicio';
      if (L.sel < L.topo) L.topo = L.sel; if (L.sel >= L.topo + 5) L.topo = L.sel - 4; if (L.topo < 0) L.topo = 0;
      break; }
    case 'tipo':
      if (t === 'next') L.tipo = (L.tipo + 1) % 8; else if (t === 'prev') L.tipo = (L.tipo + 7) % 8;
      else if (t === 'start') { L.tela = 'gps'; L.gps.prec = 40; L.gps.bons = 0; }
      else if (t === 'back') L.tela = 'lista';
      break;
    case 'gps':
      if (t === 'start' && locPodeSalvar()) { const p = locPonto(L.gps.lat, L.gps.lon, 3, Math.random() * 360);
        L.novo = { id: Date.now(), nome: LOC.TIPOS[L.tipo], tipo: L.tipo, lat: p[0], lon: p[1], ts: Date.now() / 1000, prec: L.gps.prec, ultDist: 0, maxDist: 0 };
        L.locais.push(L.novo); L.tela = 'salvo'; simVibrar(1); }
      else if (t === 'back') L.tela = 'tipo';
      break;
    case 'salvo': L.tela = 'lista'; L.sel = L.locais.length - 1; break;
    case 'nav':
      if (L.chegou && (t === 'start' || t === 'back')) { L.chegou = false; L.tela = 'lista'; L.alvo = null; break; }
      if (t === 'next') L.pagina = (L.pagina + 1) % 3; else if (t === 'prev') L.pagina = (L.pagina + 2) % 3;
      else if (t === 'start' || t === 'menu') locMenuAcoes();
      else if (t === 'back') { L.tela = 'lista'; L.alvo = null; }
      break;
    case 'detalhe':
      if (t === 'next') L.rolagem = Math.min(1, L.rolagem + 1); else if (t === 'prev') L.rolagem = Math.max(0, L.rolagem - 1);
      else if (t === 'start' || t === 'menu') locMenuAcoes();
      else if (t === 'back') L.tela = 'lista';
      break;
    case 'excluir':
      if (t === 'next' || t === 'prev') L.confirma = !L.confirma;
      else if (t === 'start') { if (L.confirma) { LOC.locais = LOC.locais.filter(x => x !== L.alvo); L.alvo = null; L.sel = 0; } L.tela = 'lista'; }
      else if (t === 'back') L.tela = 'detalhe';
      break;
    case 'renomear':
      if (t === 'next') L.rnSel = (L.rnSel + 1) % L.rnLista.length; else if (t === 'prev') L.rnSel = (L.rnSel - 1 + L.rnLista.length) % L.rnLista.length;
      else if (t === 'start') { L.alvo.nome = L.rnLista[L.rnSel]; L.tela = 'detalhe'; }
      else if (t === 'back') L.tela = 'detalhe';
      break;
  }
  simDesenhar();
}
function locPodeSalvar() { return LOC.gps.ok && LOC.gps.prec <= 20 && LOC.gps.bons >= 3; }
function locAbrirNav(l) { LOC.alvo = l; LOC.tela = 'nav'; LOC.pagina = 0; LOC.dist = LOC.distSuave = null; LOC.hist = []; LOC.ref = null; LOC.tend = 0; LOC.chegou = false; LOC.trilha = []; LOC.andando = 1; locNavAtualizar(); }
function locMenuAcoes() { LOC.menu = { titulo: LOC.alvo ? LOC.alvo.nome : 'Ações', i: 0, itens: ['Navegar', 'Mapa', 'Renomear', 'Excluir', LOC.andando > 0 ? 'Simular: afastar' : 'Simular: aproximar', 'Sobre'] }; }
function locAcao(it) {
  const L = LOC;
  if (it === 'Navegar') { locAbrirNav(L.alvo); }
  else if (it === 'Mapa') { locAbrirNav(L.alvo); L.pagina = 2; }
  else if (it === 'Renomear') { const b = LOC.TIPOS[L.alvo.tipo]; L.rnLista = [b, b + ' do trabalho', b + ' do shopping', b + ' de casa', 'Porta da casa', 'Estacionamento', 'Garagem']; L.rnSel = 0; L.tela = 'renomear'; }
  else if (it === 'Excluir') { L.confirma = false; L.tela = 'excluir'; }
  else if (it.indexOf('Simular') === 0) { L.andando = -L.andando; }
  else if (it === 'Sobre') { SIM.sobre = { app: 'Meus Locais', versao: '1.0.0', deslocamento: 0 }; }
}

/* ---------------- ícones vetoriais (mesmo desenho do IconManager.mc) ---------------- */
function locIcone(c, tipo, cx, cy, s, cor) {
  c.save(); c.fillStyle = cor; c.strokeStyle = cor; c.lineCap = 'round'; c.lineJoin = 'round';
  const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); };
  const furo = () => { c.fillStyle = '#000'; };
  if (tipo === 0) { const w = s, x = cx - w / 2, yC = cy - s * 0.02, hC = s * 0.30;
    rr(x + w * 0.20, cy - s * 0.30, w * 0.60, s * 0.30, s * 0.10); rr(x, yC, w, hC, s * 0.12);
    c.beginPath(); c.arc(x + w * 0.24, yC + hC, s * 0.12, 0, 7); c.arc(x + w * 0.76, yC + hC, s * 0.12, 0, 7); c.fill(); }
  else if (tipo === 1) { const r = s * 0.20, y = cy + s * 0.18, xe = cx - s * 0.30, xd = cx + s * 0.30;
    c.lineWidth = s * 0.09 + 1; c.beginPath(); c.arc(xe, y, r, 0, 7); c.stroke(); c.beginPath(); c.arc(xd, y, r, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(xe, y); c.lineTo(cx - s * 0.05, cy - s * 0.10); c.lineTo(xd, y); c.moveTo(cx - s * 0.05, cy - s * 0.10); c.lineTo(cx + s * 0.22, cy - s * 0.22); c.lineTo(cx + s * 0.38, cy - s * 0.30); c.stroke();
    rr(cx - s * 0.26, cy - s * 0.22, s * 0.28, s * 0.10, s * 0.04); }
  else if (tipo === 2) { c.beginPath(); c.moveTo(cx - s * .34, cy - s * .34); c.lineTo(cx - s * .10, cy - s * .16); c.lineTo(cx - s * .30, cy + s * .04); c.closePath();
    c.moveTo(cx + s * .34, cy - s * .34); c.lineTo(cx + s * .10, cy - s * .16); c.lineTo(cx + s * .30, cy + s * .04); c.closePath(); c.fill();
    c.beginPath(); c.arc(cx, cy, s * 0.26, 0, 7); c.fill(); rr(cx - s * .12, cy + s * .12, s * .24, s * .20, s * .08);
    furo(); c.beginPath(); c.arc(cx - s * .10, cy - s * .04, s * .045, 0, 7); c.arc(cx + s * .10, cy - s * .04, s * .045, 0, 7); c.arc(cx, cy + s * .20, s * .05, 0, 7); c.fill(); }
  else if (tipo === 3) { const r = s * 0.18, xa = cx - s * 0.22; c.lineWidth = s * 0.10 + 1; c.beginPath(); c.arc(xa, cy, r, 0, 7); c.stroke();
    c.fillRect(xa + r, cy - s * .05, s * .44, s * .10); c.fillRect(cx + s * .10, cy + s * .05, s * .07, s * .14); c.fillRect(cx + s * .26, cy + s * .05, s * .07, s * .14); }
  else if (tipo === 4) { const w = s * .50, hh = s * .80; rr(cx - w / 2, cy - hh / 2, w, hh, s * .10);
    furo(); c.beginPath(); c.roundRect(cx - w / 2 + s * .05, cy - hh / 2 + s * .10, w - s * .10, hh - s * .22, s * .04); c.fill(); }
  else if (tipo === 5) { c.lineWidth = s * 0.10 + 1; c.beginPath(); c.arc(cx, cy + s * .02, s * .32, Math.PI * 1.11, Math.PI * 1.89); c.stroke();
    rr(cx - s * .40, cy, s * .16, s * .34, s * .07); rr(cx + s * .24, cy, s * .16, s * .34, s * .07); }
  else if (tipo === 6) { const w = s * .76, hh = s * .60; rr(cx - w / 2, cy - hh / 2, w, hh, s * .06);
    furo(); c.fillRect(cx - s * .06, cy - hh / 2, s * .12, hh); c.fillRect(cx - w / 2, cy - s * .05, w, s * .08); }
  else { const r = s * .26, top = cy - s * .16; c.beginPath(); c.arc(cx, top, r, 0, 7); c.fill();
    c.beginPath(); c.moveTo(cx - r * .72, top + r * .62); c.lineTo(cx + r * .72, top + r * .62); c.lineTo(cx, cy + s * .40); c.closePath(); c.fill();
    furo(); c.beginPath(); c.arc(cx, top, r * .38, 0, 7); c.fill(); }
  c.restore();
}
function locCerto(c, cx, cy, s, cor) { c.save(); c.strokeStyle = cor; c.lineWidth = s * 0.13 + 2; c.lineCap = 'round'; c.beginPath();
  c.moveTo(cx - s * .30, cy + s * .02); c.lineTo(cx - s * .06, cy + s * .26); c.lineTo(cx + s * .34, cy - s * .26); c.stroke(); c.restore(); }
function locAntena(c, cx, cy, s, cor) { c.save(); c.strokeStyle = cor; c.fillStyle = cor; c.lineWidth = s * .07 + 1;
  [0.20, 0.34, 0.48].forEach(f => { c.beginPath(); c.arc(cx, cy + s * .22, s * f, Math.PI * 1.25, Math.PI * 1.75); c.stroke(); });
  c.beginPath(); c.arc(cx, cy + s * .22, s * .07, 0, 7); c.fill(); c.restore(); }
function locSeta(c, cx, cy, raio, graus, cor, borda) {
  const a = (locNorm(graus) - 90) * Math.PI / 180, co = Math.cos(a), se = Math.sin(a);
  const pts = [[raio, 0], [-raio * .55, raio * .72], [-raio * .18, 0], [-raio * .55, -raio * .72]].map(([x, y]) => [cx + x * co - y * se, cy + x * se + y * co]);
  c.save(); c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
  c.fillStyle = cor; c.fill(); if (borda) { c.strokeStyle = borda; c.lineWidth = 2; c.stroke(); } c.restore();
}

/* ---------------- desenho das telas ---------------- */
function locDesenhar(c, w, h, redondo, fonte, cor) {
  const L = LOC, C = L.cores, cx = w / 2, CO = x => cor(x);
  const txt = (t, x, y, f, cc, al = 'center') => { c.font = f.css; c.fillStyle = cc; c.textAlign = al; c.textBaseline = 'top'; c.fillText(t, x, y); };
  const corda = (y1, y2) => simCorda(w, h, redondo, y1, y2);
  const fT = fonte('tiny'), fX = fonte('xtiny'), fS = fonte('small'), fM = fonte('medium');
  const botao = (y, texto, cc, corTexto, f0) => { const ff = f0 || fT; c.font = ff.css; const bh = h * .115, bw = Math.min(c.measureText(texto).width + h * .18, corda(y, y + bh));
    c.fillStyle = cc; c.beginPath(); c.roundRect(cx - bw / 2, y, bw, bh, bh / 2); c.fill(); txt(texto, cx, y + (bh - ff.h) / 2, ff, corTexto); };
  c.font = fT.css;

  if (SIM.sobre) return;
  if (L.menu) return locMenu(c, w, h, redondo, fonte, cor);

  switch (L.tela) {
    case 'inicio': {
      locIcone(c, 7, cx, h * .26, h * .20, CO(C.azul));
      txt('Meus Locais', cx, h * .44, fM, CO(C.texto));
      const ls = simQuebrar(c, 'Tudo que importa, sempre por perto.', fX, corda(h * .58, h * .72));
      ls.forEach((l, i) => txt(l, cx, h * .60 + i * fX.h, fX, CO(C.fraco)));
      txt('Toque para abrir', cx, h * .84, fX, CO(C.azul));
      return; }
    case 'lista': {
      if (!L.locais.length) {
        locIcone(c, 7, cx, h * .25, h * .18, CO(C.azul));
        txt('Nenhum local salvo', cx, h * .42, fS, CO(C.texto));
        txt('Marque onde deixou', cx, h * .54, fX, CO(C.fraco)); txt('algo importante.', cx, h * .54 + fX.h, fX, CO(C.fraco));
        botao(h * .78, '+ MARCAR LOCAL', CO(C.azul), CO(C.fundo), fX); return; }
      txt('Meus Locais', cx, h * .09, fT, CO(C.texto));
      c.fillStyle = CO(C.linha); c.fillRect(w * .22, h * .175, w * .56, 2);
      const alt = h * .138; let y = h * .185; const n = L.locais.length;
      for (let i = L.topo; i < Math.min(L.topo + 5, n + 1); i++) {
        if (y + alt > h * .97) break;
        const larg = corda(y + 2, y + alt - 2), x = cx - larg / 2, hL = alt - 4, sel = i === L.sel;
        if (i < n) {
          const d = L.locais[i];
          if (sel) { c.fillStyle = CO(C.azul); c.beginPath(); c.roundRect(x, y + 2, larg, hL, hL / 3); c.fill(); }
          const ct = sel ? CO(C.fundo) : CO(C.texto), cd = sel ? CO(C.fundo) : CO(C.fraco), s = hL * .62;
          locIcone(c, d.tipo, x + s * .72, y + 2 + hL / 2, s, ct);
          const dist = locFmt(d.ultDist);
          txt(dist, x + larg - s * .35, y + 2 + (hL - fX.h) / 2, fX, cd, 'right');
          c.font = fX.css; const wd = c.measureText(dist).width;
          const xN = x + s * 1.35, largN = Math.max(20, x + larg - s * .45 - wd - xN - 6);
          let f = fS; c.font = fS.css; if (c.measureText(d.nome).width > largN) f = fT; c.font = f.css; if (c.measureText(d.nome).width > largN) f = fX;
          txt(d.nome, xN, y + 2 + (hL - f.h) / 2, f, ct, 'left');
        } else {
          c.fillStyle = sel ? CO(C.azul) : CO(C.cartao); c.beginPath(); c.roundRect(x, y + 2, larg, hL, hL / 3); c.fill();
          txt('+ Novo Local', cx, y + 2 + (hL - fX.h) / 2, fX, sel ? CO(C.fundo) : CO(C.texto));
        }
        y += alt;
      }
      if (n + 1 > 5) { const tY = h * .20, tH = h * .62; c.fillStyle = CO(C.linha); c.beginPath(); c.roundRect(w - 8, tY, 4, tH, 2); c.fill();
        const bh = Math.max(14, tH * 5 / (n + 1)), by = tY + (tH - bh) * (L.topo / Math.max(1, n + 1 - 5));
        c.fillStyle = CO(C.azul); c.beginPath(); c.roundRect(w - 8, by, 4, bh, 2); c.fill(); }
      return; }
    case 'tipo': {
      txt('Marcar Local', cx, h * .09, fT, CO(C.texto));
      c.fillStyle = CO(C.linha); c.fillRect(w * .22, h * .175, w * .56, 2);
      const alt = h * .138; let y = h * .185; const topo = Math.max(0, Math.min(L.tipo - 2, 3));
      for (let i = topo; i < Math.min(topo + 5, 8); i++) {
        const larg = corda(y + 2, y + alt - 2), x = cx - larg / 2, hL = alt - 4, sel = i === L.tipo;
        if (sel) { c.fillStyle = CO(C.azul); c.beginPath(); c.roundRect(x, y + 2, larg, hL, hL / 3); c.fill(); }
        const ct = sel ? CO(C.fundo) : CO(C.texto), s = hL * .62;
        locIcone(c, i, x + s * .72, y + 2 + hL / 2, s, ct);
        txt(LOC.TIPOS[i], x + s * 1.35, y + 2 + (hL - fS.h) / 2, fS, ct, 'left');
        y += alt;
      }
      return; }
    case 'gps': {
      locIcone(c, L.tipo, cx, h * .19, h * .15, CO(C.azul));
      txt(LOC.TIPOS[L.tipo], cx, h * .28, fM, CO(C.texto));
      const pronto = locPodeSalvar();
      txt(pronto ? 'Localização pronta' : (L.gps.prec > 20 ? 'Aguardando maior precisão...' : 'Obtendo localização...'), cx, h * .43, fT, CO(C.fraco));
      const lb = corda(h * .545, h * .58) * .86, yb = h * .545, hb = h * .035;
      let pct = L.gps.prec > 20 ? 45 : (L.gps.prec > 10 ? 75 : 90); pct = Math.min(100, pct + L.gps.bons * 4);
      c.fillStyle = CO(C.linha); c.beginPath(); c.roundRect(cx - lb / 2, yb, lb, hb, hb / 2); c.fill();
      c.fillStyle = pronto ? CO(C.verde) : CO(C.azul); c.beginPath(); c.roundRect(cx - lb / 2, yb, Math.max(hb, lb * pct / 100), hb, hb / 2); c.fill();
      txt('Precisão: ±' + Math.round(L.gps.prec) + ' m', cx, h * .62, fT, L.gps.prec > 20 ? CO(C.amarelo) : (L.gps.prec <= 10 ? CO(C.verde) : CO(C.texto)));
      c.font = fT.css; botao(h * .755, 'Salvar', pronto ? CO(C.azul) : CO(C.linha), pronto ? CO(C.fundo) : CO(C.fraco));
      return; }
    case 'salvo': {
      const r = h * .095; c.fillStyle = CO(C.verde); c.beginPath(); c.arc(cx, h * .19, r, 0, 7); c.fill();
      locCerto(c, cx, h * .19, r * 1.25, CO(C.fundo));
      txt(L.novo.nome, cx, h * .30, fM, CO(C.texto));
      txt('Local salvo!', cx, h * .415, fT, CO(C.verde));
      const dt = new Date(L.novo.ts * 1000);
      txt(dt.toLocaleDateString('pt-BR') + ' ' + dt.toTimeString().slice(0, 5), cx, h * .505, fX, CO(C.fraco));
      txt(L.novo.lat.toFixed(4) + ', ' + L.novo.lon.toFixed(4), cx, h * .575, fX, CO(C.texto));
      txt('Precisão ±' + Math.round(L.novo.prec) + ' m', cx, h * .645, fX, CO(C.fraco));
      c.font = fT.css; botao(h * .755, 'OK', CO(C.cartao), CO(C.texto));
      return; }
    case 'nav': return locNav(c, w, h, redondo, fonte, cor);
    case 'detalhe': {
      locCabecalho(c, w, h, fonte, cor, L.alvo);
      const empilhado = (() => { c.font = fonte('xtiny').css; return c.measureText(L.alvo.nome).width > simCorda(w, h, true, h * .12, h * .12) - h * .085 * 2.2; })();
      const itens = [['Salvo em', new Date(L.alvo.ts * 1000).toLocaleDateString('pt-BR') + ' ' + new Date(L.alvo.ts * 1000).toTimeString().slice(0, 5)],
        ['Distância atual', locFmt(L.alvo.ultDist)], ['Distância máxima', locFmt(L.alvo.maxDist)],
        ['Precisão ao salvar', '±' + Math.round(L.alvo.prec) + ' m'], ['Coordenadas', L.alvo.lat.toFixed(4) + ', ' + L.alvo.lon.toFixed(4)]];
      let y = empilhado ? h * .255 : h * .20; const alt = h * .145; const vis = empilhado ? 3 : 4;
      L.rolagem = Math.max(0, Math.min(L.rolagem, itens.length - vis));
      for (let i = L.rolagem; i < Math.min(itens.length, L.rolagem + vis); i++) {
        const larg = corda(y, y + alt), x = cx - larg / 2;
        txt(itens[i][0], x, y, fX, CO(C.fraco), 'left');
        c.font = fT.css; const f = c.measureText(itens[i][1]).width > larg ? fX : fT;
        txt(itens[i][1], x, y + fX.h - 2, f, CO(C.texto), 'left'); y += alt;
      }
      txt('START: ações', cx, h * .87, fX, CO(C.azul));
      return; }
    case 'excluir': {
      txt('Excluir local?', cx, h * .22, fS, CO(C.texto));
      txt(L.alvo.nome, cx, h * .34, fT, CO(C.fraco));
      [['Cancelar', h * .50, !L.confirma], ['Excluir', h * .68, L.confirma]].forEach(([t2, y, sel]) => {
        const bh = h * .13, bw = Math.min(corda(y, y + bh), w * .7);
        c.fillStyle = sel ? (t2 === 'Excluir' ? CO(C.vermelho) : CO(C.azul)) : CO(C.cartao);
        c.beginPath(); c.roundRect(cx - bw / 2, y, bw, bh, bh / 2); c.fill();
        txt(t2, cx, y + (bh - fT.h) / 2, fT, sel ? CO(C.fundo) : CO(C.texto)); });
      return; }
    case 'renomear': {
      txt('Renomear', cx, h * .09, fT, CO(C.texto));
      const alt = h * .138; let y = h * .185; const topo = Math.max(0, Math.min(L.rnSel - 2, L.rnLista.length - 5));
      for (let i = topo; i < Math.min(topo + 5, L.rnLista.length); i++) {
        const larg = corda(y + 2, y + alt - 2), x = cx - larg / 2, hL = alt - 4, sel = i === L.rnSel;
        if (sel) { c.fillStyle = CO(C.azul); c.beginPath(); c.roundRect(x, y + 2, larg, hL, hL / 3); c.fill(); }
        c.font = fT.css; const f = c.measureText(L.rnLista[i]).width > larg - 20 ? fX : fT;
        txt(L.rnLista[i], cx, y + 2 + (hL - f.h) / 2, f, sel ? CO(C.fundo) : CO(C.texto)); y += alt; }
      return; }
  }
}
function locCabecalho(c, w, h, fonte, cor, d) {
  const C = LOC.cores, cx = w / 2, fX = fonte('xtiny'), s = h * .085;
  c.font = fX.css; const tw = c.measureText(d.nome).width;
  const largMax = simCorda(w, h, true, h * .13, h * .13) - s * 2.2;
  c.textBaseline = 'top';
  if (tw > largMax) {   // nome longo: icone em cima, nome embaixo (nunca abrevia)
    locIcone(c, d.tipo, cx, h * .10, s, cor(C.azul));
    c.fillStyle = cor(C.texto); c.textAlign = 'center'; c.fillText(d.nome, cx, h * .145);
    return;
  }
  const x0 = cx - (tw + s * 1.25) / 2;
  locIcone(c, d.tipo, x0 + s * .5, h * .115, s, cor(C.azul));
  c.fillStyle = cor(C.texto); c.textAlign = 'left'; c.fillText(d.nome, x0 + s * 1.25, h * .115 - fX.h / 2);
}
function locNav(c, w, h, redondo, fonte, cor) {
  const L = LOC, C = L.cores, cx = w / 2, CO = x => cor(x);
  const fX = fonte('xtiny'), fT = fonte('tiny'), fS = fonte('small'), fM = fonte('medium'), fH = fonte('numberHot') || fonte('large');
  const txt = (t, x, y, f, cc, al = 'center') => { c.font = f.css; c.fillStyle = cc; c.textAlign = al; c.textBaseline = 'top'; c.fillText(t, x, y); };
  const corProx = L.distSuave <= 100 ? CO(C.verde) : (L.distSuave <= 500 ? CO(C.azul) : CO(C.texto));

  if (L.chegou) {
    const r = h * .105; c.fillStyle = CO(C.verde); c.beginPath(); c.arc(cx, h * .22, r, 0, 7); c.fill();
    locCerto(c, cx, h * .22, r * 1.25, CO(C.fundo));
    txt(L.alvo.nome, cx, h * .40, fM, CO(C.verde));
    txt('Você chegou!', cx, h * .53, fS, CO(C.verde));
    const m = Math.round(L.distSuave); txt(m + (m === 1 ? ' metro' : ' metros'), cx, h * .64, fT, CO(C.texto));
    const bh = h * .115, bw = h * .34; c.fillStyle = CO(C.cartao); c.beginPath(); c.roundRect(cx - bw / 2, h * .755, bw, bh, bh / 2); c.fill();
    txt('OK', cx, h * .755 + (bh - fT.h) / 2, fT, CO(C.texto)); return;
  }
  locCabecalho(c, w, h, fonte, cor, L.alvo);

  if (L.pagina === 0) {
    const cy = h * .50, raio = h * .285;
    c.strokeStyle = CO(C.linha); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, raio, 0, 7); c.stroke();
    for (let i = 0; i < 24; i++) { const ang = locNorm(i * 15 - L.heading) - 90, a = ang * Math.PI / 180, g = i % 6 === 0;
      const r1 = raio - (g ? raio * .13 : raio * .07); c.strokeStyle = g ? CO(C.fraco) : CO(C.linha); c.lineWidth = g ? 2 : 1;
      c.beginPath(); c.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); c.lineTo(cx + raio * Math.cos(a), cy + raio * Math.sin(a)); c.stroke(); }
    ['N', 'L', 'S', 'O'].forEach((le, j) => { const a = (locNorm(j * 90 - L.heading) - 90) * Math.PI / 180, rr = raio - raio * .26;
      txt(le, cx + rr * Math.cos(a), cy + rr * Math.sin(a) - fX.h / 2, fX, j === 0 ? CO(C.vermelho) : CO(C.fraco)); });
    locSeta(c, cx, cy - raio * .12, raio * .60, L.seta, CO(C.azul), CO(C.fundo));
    txt(locFmt(L.distSuave), cx, cy + raio + h * .015, fM, corProx);
    return;
  }
  if (L.pagina === 1) {
    const num = locFmt(L.distSuave).split(' ')[0], un = locFmt(L.distSuave).split(' ')[1] || '';
    c.font = fH.css; const lw = c.measureText(num).width; c.font = fT.css; const lu = c.measureText(' ' + un).width;
    const x0 = cx - (lw + lu) / 2;
    txt(num, x0, h * .24, fH, corProx, 'left');
    txt(' ' + un, x0 + lw, h * .24 + fH.h - fT.h - 6, fT, CO(C.fraco), 'left');
    const tend = ['Estável', 'Aproximando', 'Afastando'][L.tend], cT = [CO(C.fraco), CO(C.verde), CO(C.vermelho)][L.tend];
    c.font = fT.css; const tw = c.measureText(tend).width, s = h * .055, xs = cx - (tw + s * 1.4) / 2, ys = h * .58 + fT.h / 2;
    c.fillStyle = cT;
    if (L.tend) { const sg = L.tend === 1 ? 1 : -1; c.beginPath(); c.moveTo(xs + s * .5, ys + sg * s * .5); c.lineTo(xs + s * .5 - s * .36, ys - sg * s * .15); c.lineTo(xs + s * .5 + s * .36, ys - sg * s * .15); c.closePath(); c.fill();
      c.fillRect(xs + s * .5 - s * .12, L.tend === 1 ? ys - s * .5 : ys - s * .15, s * .24, s * .5); }
    else { c.beginPath(); c.arc(xs + s * .5, ys, s * .16, 0, 7); c.fill(); }
    txt(tend, xs + s * 1.4, h * .58, fT, cT, 'left');
    txt(locRosa(L.bearing) + ' ' + Math.round(L.bearing) + '°', cx, h * .70, fS, CO(C.texto));
    txt(L.distSuave <= 100 ? 'Muito perto' : (L.distSuave <= 500 ? 'Está por perto' : 'Precisão ±' + Math.round(LOC.gps.prec) + ' m'),
        cx, h * .87, fX, L.distSuave <= 100 ? CO(C.verde) : (L.distSuave <= 500 ? CO(C.azul) : CO(C.fraco)));
    return;
  }
  // mapa
  const cy = h * .55, raio = h * .33;
  c.fillStyle = CO(C.mapa); c.beginPath(); c.arc(cx, cy, raio, 0, 7); c.fill();
  c.strokeStyle = CO(C.linha); c.lineWidth = 2; c.stroke();
  const alcance = Math.max(25, L.distSuave / .70), escala = raio / alcance, giro = L.heading;
  const proj = (la, lo) => { const dLat = (la - L.gps.lat) * 111320, dLon = (lo - L.gps.lon) * 111320 * Math.cos(L.gps.lat * Math.PI / 180);
    const a = -giro * Math.PI / 180, x = dLon * Math.cos(a) - dLat * Math.sin(a), y = dLon * Math.sin(a) + dLat * Math.cos(a);
    let px = cx + x * escala, py = cy - y * escala; const dx = px - cx, dy = py - cy, r = Math.hypot(dx, dy), lim = raio * .88;
    if (r > lim) { px = cx + dx * lim / r; py = cy + dy * lim / r; } return [px, py]; };
  // aneis de distancia + eixos (o FR165 nao tem cartografia)
  [alcance / 3, alcance * 2 / 3].forEach(a => { const r = a * escala; if (r < 6 || r > raio) return;
    c.strokeStyle = CO(C.grade); c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke();
    c.font = fX.css; c.fillStyle = CO(C.fraco); c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(locFmt(a), cx - r * .707 + 2, cy + r * .707 - fX.h / 2); });
  c.strokeStyle = CO(C.grade); c.lineWidth = 1;
  for (let j = 0; j < 4; j++) { const a = (locNorm(j * 90 - giro) - 90) * Math.PI / 180;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + raio * .94 * Math.cos(a), cy + raio * .94 * Math.sin(a)); c.stroke(); }
  { const an = (locNorm(-giro) - 90) * Math.PI / 180, rn = raio - raio * .10;
    txt('N', cx + rn * Math.cos(an), cy + rn * Math.sin(an) - fX.h / 2, fX, CO(C.vermelho)); }
  if (L.trilha.length > 1) { c.strokeStyle = CO(C.azulEsc); c.lineWidth = 3; c.beginPath();
    L.trilha.forEach((p, i) => { const [x, y] = proj(p[0], p[1]); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
  const [dx2, dy2] = proj(L.alvo.lat, L.alvo.lon);
  c.strokeStyle = CO(C.azul); c.lineWidth = 3; c.setLineDash([7, 6]); c.beginPath(); c.moveTo(cx, cy); c.lineTo(dx2, dy2); c.stroke(); c.setLineDash([]);
  locIcone(c, L.alvo.tipo, dx2, dy2 - h * .011, h * .075, CO(C.azul));
  c.fillStyle = CO(C.azulEsc); c.beginPath(); c.arc(cx, cy, h * .030, 0, 7); c.fill();
  c.fillStyle = CO(C.azul); c.beginPath(); c.arc(cx, cy, h * .018, 0, 7); c.fill();
  txt(locFmt(L.distSuave), cx, h * .865, fS, corProx);
}
function locMenu(c, w, h, redondo, fonte, cor) {
  const C = LOC.cores, m = LOC.menu, cx = w / 2, fT = fonte('tiny'), fX = fonte('xtiny');
  const txt = (t, x, y, f, cc) => { c.font = f.css; c.fillStyle = cc; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(t, x, y); };
  txt(m.titulo, cx, h * .07, fX, cor(C.fraco));
  const alt = h * .15, topo = Math.max(0, Math.min(m.i - 2, m.itens.length - 4));
  let y = h * .17;
  for (let i = topo; i < Math.min(topo + 4, m.itens.length); i++) {
    const larg = simCorda(w, h, redondo, y + 2, y + alt - 2), sel = i === m.i;
    if (sel) { c.fillStyle = cor(C.azul); c.beginPath(); c.roundRect(cx - larg / 2, y + 2, larg, alt - 4, (alt - 4) / 3); c.fill(); }
    c.font = fT.css; const f = c.measureText(m.itens[i]).width > larg - 16 ? fX : fT;
    txt(m.itens[i], cx, y + 2 + (alt - 4 - f.h) / 2, f, sel ? cor(C.fundo) : cor(C.texto)); y += alt;
  }
}

/* ---- aba "Meus Locais" (prévia interativa + gerar o app) ---- */
let LOCTIMER = null;
function locFonte(h) { const esc = h / 390; const tab = { xtiny: 26, tiny: 30.1, small: 38.3, medium: 45.2, large: 52, numberMild: 75.3, numberMedium: 93.1, numberHot: 112.3 };
  return nome => { const px = (tab[nome] || 30) * esc; return { css: `400 ${px}px Roboto, Arial, sans-serif`, h: Math.round(px * 1.17) }; }; }
function locPintar() {
  const cv = $('#locCv'); if (!cv) { clearInterval(LOCTIMER); LOCTIMER = null; return; }
  const dpr = window.devicePixelRatio || 1, lado = 360;
  cv.width = lado * dpr; cv.height = lado * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.save(); c.beginPath(); c.arc(lado / 2, lado / 2, lado / 2, 0, 7); c.clip();
  c.fillStyle = '#000'; c.fillRect(0, 0, lado, lado);
  locDesenhar(c, lado, lado, true, locFonte(lado), x => '#' + x.toString(16).padStart(6, '0'));
  c.restore();
}
async function renderLocais() {
  locIniciar();
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('locais')}
  <section class="w"><header class="w-top"><span class="w-ico">🚗</span><span class="w-tit">Meus Locais</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   <canvas id="locCv" style="width:min(300px,80vw);height:auto;aspect-ratio:1;border-radius:50%;box-shadow:0 0 40px #00a9e033;touch-action:pan-y;cursor:pointer"></canvas>
   <div class="chips"><button class="chip" data-locbt="prev">▲ Cima</button><button class="chip" data-locbt="start">● START</button><button class="chip" data-locbt="next">▼ Baixo</button><button class="chip" data-locbt="menu">≡ Menu</button><button class="chip" data-locbt="back">↩ Voltar</button></div>
   <div class="mini" style="text-align:center;max-width:560px">Salve onde você deixou o <b>carro, a moto, o pet, as chaves, o celular, os fones</b> ou qualquer coisa — e volte até lá com uma <b>seta de bússola</b>, distância em tempo real e mini-mapa. Funciona <b>100% offline</b>: sem internet, sem servidor, sem celular.<br>
   Na prévia: <b>START</b> abre/confirma, <b>▲▼</b> andam na lista, <b>≡ Menu</b> abre as ações do local (Navegar, Mapa, Renomear, Excluir e simular afastar/aproximar) e <b>↩</b> volta. Na navegação, <b>▲▼</b> trocam entre <b>bússola → informações → mapa</b>.</div>
  </div></section>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="locApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="locModelo" list="locModelos" value="Forerunner® 165 (fr165)" autocomplete="off" required><datalist id="locModelos"></datalist></div>
   <div class="chips"><button class="btn" id="locGera">⬇ Baixar Meus Locais</button></div>
   <div class="mini" id="locProg"></div></form></div>
  <div class="card"><h3>Como instalar e usar</h3><div class="mini">1) Conecte o relógio no computador pelo cabo USB.<br>2) Copie o <b>.prg</b> baixado para a pasta <b>GARMIN/APPS</b>.<br>3) Desconecte. No relógio: <b>START</b> → <b>Adicionar</b> → <b>Meus Locais</b>.<br>4) Abra, escolha <b>+ Novo Local</b>, o tipo (carro, moto, pet…), espere a precisão do GPS ficar boa e toque em <b>Salvar</b>.<br>5) Para voltar: abra o app, escolha o local e siga a seta. Ela aponta para o destino, a distância atualiza sozinha e o relógio <b>vibra</b> quando você está a 25 m e ao chegar (10 m).<br><b>Permissão:</b> só GPS. O app não usa internet nem o celular.</div></div>
  ${tabbar('app')}</div>`;
  clearInterval(LOCTIMER); LOCTIMER = setInterval(() => { locTique(); locPintar(); }, 1000); locPintar();
  document.querySelectorAll('[data-locbt]').forEach(b => b.onclick = () => { locBotao(b.dataset.locbt); locPintar(); });
  const cv = $('#locCv'); cv.onclick = () => { locBotao('start'); locPintar(); };
  let y0 = null; cv.ontouchstart = e => { y0 = e.touches[0].clientY; };
  cv.ontouchend = e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) > 30) { e.preventDefault(); locBotao(dy > 0 ? 'prev' : 'next'); locPintar(); } };
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#locModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(x => n(x) === q)); };
  $('#locApp').onsubmit = e => e.preventDefault();
  $('#locGera').onclick = async e => {
    e.preventDefault(); const m = achar($('#locModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bt = $('#locGera'); bt.disabled = true; $('#locProg').textContent = '⚙️ Compilando (cerca de 30 s)…';
    try {
      const a = await api('locais_app', { modelo: m.id });
      const esperar = async (n = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#locProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bt.disabled = false; return; }
        if (s.status === 'erro' || n > 90) { $('#locProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); bt.disabled = false; return; }
        setTimeout(() => esperar(n + 1), 2000); };
      esperar();
    } catch (x) { $('#locProg').textContent = '❌ ' + x.message; bt.disabled = false; }
  };
}

/* ================= app "Sono" (prévia interativa + gerar o app do relógio) ================= */
const SONO = { dados: null, pagina: 0, erro: null, carregando: false, timer: null };
const SONO_PAGS = ['BOM DIA', 'PONTUAÇÃO', 'FATORES', 'ESTÁGIOS', 'A NOITE', 'CORAÇÃO', 'ESTRESSE', 'ENERGIA', 'HISTÓRICO', 'SOBRE'];
const SONO_COR = { prof: 0x0000ff, leve: 0x00ffff, rem: 0xff00ff, acor: 0xff0000, ok: 0x00ff00, aten: 0xffff00, txt: 0xffffff, cinza: 0xaaaaaa, linha: 0x555555 };

async function sonoCarregar() {
  if (SONO.carregando) return; SONO.carregando = true; SONO.erro = null;
  try {
    const j = await apiGet('sono', { dias: 8 });
    const n = (j.noites || [])[0] || null;
    SONO.dados = n ? { n, h: (j.noites || []).slice(1).map(x => ({ d: x.d.slice(5), tot: x.tot, prof: x.prof, leve: x.leve, rem: x.rem, acor: x.acor, score: x.score })) } : null;
    if (!n) SONO.erro = 'Sem noite registrada ainda. Sincronize o relógio com o Garmin Connect.';
  } catch (e) { SONO.erro = e.message; }
  SONO.carregando = false;
}
function sonoBotao(t) {
  if (t === 'next') SONO.pagina = (SONO.pagina + 1) % SONO_PAGS.length;
  else if (t === 'prev') SONO.pagina = (SONO.pagina + SONO_PAGS.length - 1) % SONO_PAGS.length;
  else if (t === 'start') sonoCarregar().then(() => { sonoPintar(); if (typeof simDesenhar === 'function' && SIM && SIM.app === 'sono') simDesenhar(); });
}
const sonoDur = s => s == null ? '--' : (Math.floor(s / 3600) > 0 ? Math.floor(s / 3600) + 'h' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') : Math.round(s / 60) + 'min');
const sonoPct = (p, t) => (!t || p == null) ? '--' : Math.round(p * 100 / t) + '%';
const sonoDia = d => !d ? '' : (d.length >= 10 ? d.slice(8, 10) + '/' + d.slice(5, 7) : d.length === 5 ? d.slice(3, 5) + '/' + d.slice(0, 2) : d);
const sonoQual = q => ({ EXCELLENT: 'excelente', GOOD: 'bom', FAIR: 'razoável', POOR: 'ruim' }[q] || (q || '').toLowerCase());
// Mesma conta do app no relógio (Analise.mc): o FR55 não recebe pontuação da Garmin.
const sonoFaixa = (v, ini, fim, pts) => (v >= ini && v <= fim) ? pts : Math.max(0, pts * (1 - (v < ini ? ini - v : v - fim) / Math.max(1, (fim - ini) * 1.4)));
function sonoNota(n) {
  if (!n || !n.tot) return null;
  if (n.score != null) return n.score;
  const t = n.tot;
  let p = sonoFaixa(t * 100 / 28800, 92, 115, 45) + sonoFaixa((n.prof || 0) * 100 / t, 16, 33, 15)
        + sonoFaixa((n.rem || 0) * 100 / t, 21, 31, 15) + sonoFaixa((n.acor || 0) * 100 / (t + (n.acor || 0)), 0, 6, 15)
        + (n.est != null ? sonoFaixa(n.est, 0, 18, 10) : 7);
  return Math.max(0, Math.min(100, Math.round(p)));
}
function sonoFatores(n) {
  if (!n || !n.tot) return [];
  const t = n.tot;
  return [['Duração', sonoFaixa(t * 100 / 28800, 92, 115, 45), 45],
          ['Profundo', sonoFaixa((n.prof || 0) * 100 / t, 16, 33, 15), 15],
          ['REM', sonoFaixa((n.rem || 0) * 100 / t, 21, 31, 15), 15],
          ['Despertares', sonoFaixa((n.acor || 0) * 100 / (t + (n.acor || 0)), 0, 6, 15), 15],
          ['Estresse', n.est != null ? sonoFaixa(n.est, 0, 18, 10) : 7, 10]];
}
const sonoQualFator = (p, mx) => { const f = p * 100 / mx; return f >= 80 ? 'Bom' : f >= 50 ? 'Razoável' : 'Ruim'; };
const sonoCorFator = q => q === 'Bom' ? SONO_COR.ok : q === 'Razoável' ? SONO_COR.aten : SONO_COR.acor;
const sonoQualN = s => s == null ? '--' : s >= 90 ? 'Excelente' : s >= 80 ? 'Bom' : s >= 60 ? 'Razoável' : 'Ruim';
const sonoSaudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
function sonoRecado(n) {
  const h = new Date().getHours(), nt = sonoNota(n);
  if (h >= 18) return 'Hora de desacelerar para dormir bem.';
  if (nt >= 80) return 'Noite boa! Aproveite o dia.';
  if (nt >= 60) return 'Deu para descansar. Tente dormir mais cedo.';
  if (n && n.tot < 21600) return 'Você dormiu pouco. Pegue leve hoje.';
  return 'Sono agitado. Evite esforço pesado.';
}
const sonoCorScore = s => s == null ? SONO_COR.cinza : s >= 80 ? SONO_COR.ok : s >= 60 ? SONO_COR.aten : SONO_COR.acor;
const sonoCorEst = i => i === 0 ? SONO_COR.prof : i === 2 ? SONO_COR.rem : i === 3 ? SONO_COR.acor : SONO_COR.leve;

function sonoDesenhar(c, w, h, redondo, fonte, cor) {
  const corda = y => simCorda(w, h, redondo, y, y) || w * 0.92;
  const txt = (y, t, fontes, cr, just) => {
    const l = corda(y);
    let f = fonte(fontes[fontes.length - 1]);
    for (const nome of fontes) { const ff = fonte(nome); c.font = ff.css; if (c.measureText(t).width <= l) { f = ff; break; } }
    c.font = f.css; c.fillStyle = cor(cr); c.textBaseline = 'middle';
    c.textAlign = just || 'center'; c.fillText(t, just === 'left' ? (w - l) / 2 : just === 'right' ? (w + l) / 2 : w / 2, y);
    c.textAlign = 'left'; return f.h;
  };
  const barra = (x, y, bw, bh, partes, total) => {
    c.fillStyle = cor(SONO_COR.linha); c.fillRect(x, y, bw, bh);
    let px = x;
    partes.forEach(([v, cr]) => { if (!v) return; const pw = v * bw / total; c.fillStyle = cor(cr); c.fillRect(px, y, pw + .8, bh); px += pw; });
  };
  const linha = (x, y, gw, gh, serie, cr) => {
    if (!serie || serie.length < 2) return;
    const mn = Math.min(...serie), mx = Math.max(...serie) === mn ? mn + 1 : Math.max(...serie);
    c.strokeStyle = cor(SONO_COR.linha); c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + gh); c.lineTo(x + gw, y + gh); c.stroke();
    c.strokeStyle = cor(cr); c.lineWidth = 2; c.beginPath();
    serie.forEach((v, i) => { const px = x + i * gw / (serie.length - 1), py = y + gh - (v - mn) * gh / (mx - mn); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.stroke(); c.lineWidth = 1;
  };
  const n = SONO.dados && SONO.dados.n;
  if (!n) {
    txt(h * .14, 'SONO', ['xtiny'], SONO_COR.leve);
    const t = SONO.carregando ? 'Buscando o seu sono...' : (SONO.erro || 'Aperte START para buscar');
    const f = fonte('xtiny'); c.font = f.css;
    const pal = t.split(' '); const linhas = []; let at = '';
    pal.forEach(p => { const teste = at ? at + ' ' + p : p; if (c.measureText(teste).width <= corda(h / 2)) at = teste; else { if (at) linhas.push(at); at = p; } });
    if (at) linhas.push(at);
    linhas.forEach((l, i) => txt(h / 2 - (linhas.length - 1) * f.h / 2 + i * f.h, l, ['xtiny'], SONO_COR.txt));
    return;
  }
  txt(h * .13, SONO_PAGS[SONO.pagina], ['xtiny'], SONO_COR.leve);
  const p = SONO.pagina, nota = sonoNota(n);
  const arco = (y, raio, valor) => {          // arco da pontuação, igual ao do relógio
    c.lineWidth = Math.max(4, h * .045); c.lineCap = 'butt';
    c.strokeStyle = cor(SONO_COR.linha); c.beginPath(); c.arc(w / 2, y, raio, Math.PI * .83, Math.PI * .17, false); c.stroke();
    if (valor > 0) { c.strokeStyle = cor(sonoCorScore(valor)); c.beginPath();
      c.arc(w / 2, y, raio, Math.PI * .83, Math.PI * (.83 + 1.34 * valor / 100), false); c.stroke(); }
    c.lineWidth = 1;
  };
  const quebra = (y, t, cr, larg) => {        // texto em várias linhas
    const f = fonte('xtiny'); c.font = f.css;
    const pal = t.split(' '); const ls = []; let at = '';
    pal.forEach(x => { const q = at ? at + ' ' + x : x; if (c.measureText(q).width <= (larg || corda(y))) at = q; else { if (at) ls.push(at); at = x; } });
    if (at) ls.push(at);
    ls.forEach((l, i) => txt(y + i * f.h, l, ['xtiny'], cr));
    return ls.length * f.h;
  };
  if (p === 0) {
    txt(h * .26, sonoSaudacao(), ['small', 'xtiny'], SONO_COR.leve);
    txt(h * .44, nota == null ? '--' : String(nota), ['numberMedium', 'numberMild', 'large'], sonoCorScore(nota));
    txt(h * .62, sonoDur(n.tot) + ' de sono', ['small', 'xtiny'], SONO_COR.txt);
    if (n.bb != null) txt(h * .72, 'Body Battery ' + (n.bb >= 0 ? '+' : '') + n.bb, ['xtiny'], SONO_COR.ok);
    quebra(h * .79, sonoRecado(n), SONO_COR.cinza, corda(h * .79) * .92);
  } else if (p === 1) {
    arco(h * .54, Math.min(w, h) * .33, nota || 0);   // centro mais baixo: não encosta no título
    txt(h * .45, nota == null ? '--' : String(nota), ['numberMedium', 'numberMild', 'large'], SONO_COR.txt);
    txt(h * .61, sonoQualN(nota), ['small', 'xtiny'], sonoCorScore(nota));
    txt(h * .72, sonoDur(n.tot), ['small', 'xtiny'], SONO_COR.txt);
    txt(h * .82, n.ini + ' - ' + n.fim, ['xtiny'], SONO_COR.leve);
    txt(h * .90, sonoDia(n.d) + (n.score == null ? ' (calculada)' : ''), ['xtiny'], SONO_COR.cinza);
  } else if (p === 2) {
    const fs = sonoFatores(n);
    fs.forEach((f, i) => {
      const yy = h * .26 + i * h * .125, ll = corda(yy), x = (w - ll) / 2, q = sonoQualFator(f[1], f[2]);
      c.font = fonte('xtiny').css; c.textBaseline = 'middle';
      c.fillStyle = cor(SONO_COR.txt); c.textAlign = 'left'; c.fillText(f[0], x, yy);
      c.fillStyle = cor(sonoCorFator(q)); c.textAlign = 'right'; c.fillText(q, x + ll, yy); c.textAlign = 'left';
      const bw = ll * f[1] / f[2];
      c.fillStyle = cor(sonoCorFator(q)); c.fillRect(x, yy + h * .042, bw, h * .014);
      c.fillStyle = cor(SONO_COR.linha); c.fillRect(x + bw, yy + h * .042, ll - bw, h * .014);
    });
  } else if (p === 3) {
    const l = corda(h * .24); barra((w - l) / 2, h * .24, l, h * .07, [[n.prof, SONO_COR.prof], [n.leve, SONO_COR.leve], [n.rem, SONO_COR.rem], [n.acor, SONO_COR.acor]], n.tot);
    [['Profundo', n.prof, SONO_COR.prof], ['Leve', n.leve, SONO_COR.leve], ['REM', n.rem, SONO_COR.rem], ['Acordado', n.acor, SONO_COR.acor]].forEach((it, i) => {
      const yy = h * .38 + i * h * .135, ll = corda(yy), x = (w - ll) / 2;
      c.fillStyle = cor(it[2]); c.fillRect(x, yy - h * .025, h * .05, h * .05);
      c.font = fonte('xtiny').css; c.fillStyle = cor(SONO_COR.txt); c.textBaseline = 'middle';
      c.textAlign = 'left'; c.fillText(it[0], x + h * .07, yy);
      c.textAlign = 'right'; c.fillText(sonoDur(it[1]) + '  ' + sonoPct(it[1], n.tot), x + ll, yy); c.textAlign = 'left';
    });
  } else if (p === 4) {
    const lv = n.lvl || [];
    if (!lv.length) return txt(h / 2, 'Sem detalhe da noite', ['xtiny'], SONO_COR.cinza), undefined;
    const fimN = Math.max(...lv.map(x => x[0] + x[1])) || 1;
    const yT = h * .26, alt = h * .44, l = corda(h * .5), x0 = (w - l) / 2, faixa = alt / 4, ordem = [3, 2, 1, 0];
    c.strokeStyle = cor(SONO_COR.linha);
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x0, yT + k * faixa); c.lineTo(x0 + l, yT + k * faixa); c.stroke(); }
    lv.forEach(x => { const pos = ordem.indexOf(x[2] > 3 ? 1 : x[2]); c.fillStyle = cor(sonoCorEst(x[2])); c.fillRect(x0 + x[0] * l / fimN, yT + (pos < 0 ? 2 : pos) * faixa + 1, Math.max(1.5, x[1] * l / fimN), faixa - 2); });
    c.font = fonte('xtiny').css; c.fillStyle = cor(SONO_COR.txt); c.textBaseline = 'middle';
    const lr = corda(yT + alt + h * .05), xr = (w - lr) / 2;
    c.textAlign = 'left'; c.fillText(n.ini, xr, yT + alt + h * .05);
    c.textAlign = 'right'; c.fillText(n.fim, xr + lr, yT + alt + h * .05); c.textAlign = 'left';
    txt(h * .86, n.acn ? n.acn + 'x acordado' : sonoDur(n.tot) + ' dormindo', ['xtiny'], SONO_COR.cinza);
  } else if (p === 5) {
    const l = corda(h * .36); linha((w - l) / 2, h * .26, l, h * .20, n.s_fc, SONO_COR.acor);
    txt(h * .56, 'FC ' + (n.fc_min ?? '--') + '-' + (n.fc_max ?? '--') + ' bpm', ['small', 'xtiny'], SONO_COR.txt);
    txt(h * .68, 'média ' + (n.fc_med ?? '--'), ['xtiny'], SONO_COR.cinza);
    txt(h * .79, 'Repouso ' + (n.fcr ?? '--') + ' bpm', ['xtiny'], SONO_COR.leve);
  } else if (p === 6) {
    const l = corda(h * .42); linha((w - l) / 2, h * .28, l, h * .24, n.s_est, SONO_COR.aten);
    txt(h * .62, 'Estresse médio ' + (n.est ?? '--'), ['small', 'xtiny'], SONO_COR.aten);
    txt(h * .76, 'quanto menor, melhor', ['xtiny'], SONO_COR.cinza);
  } else if (p === 7) {
    const l = corda(h * .36); linha((w - l) / 2, h * .26, l, h * .20, n.s_bb, SONO_COR.ok);
    txt(h * .58, (n.bb == null ? '--' : (n.bb >= 0 ? '+' : '') + n.bb), ['numberMild', 'large', 'small'], SONO_COR.ok);
    txt(h * .76, 'recarga da noite', ['xtiny'], SONO_COR.txt);
    txt(h * .86, 'Body Battery', ['xtiny'], SONO_COR.cinza);
  } else if (p === 8) {
    const lista = [{ d: sonoDia(n.d), tot: n.tot, prof: n.prof, leve: n.leve, rem: n.rem, acor: n.acor }].concat(SONO.dados.h || []);
    const mx = Math.max(1, ...lista.map(x => x.tot || 0)), soma = lista.reduce((a, x) => a + (x.tot || 0), 0);
    const base = h * .72, altMax = h * .42, l = corda(h * .55), x0 = (w - l) / 2, passo = l / lista.length, bw = passo * .66;
    lista.slice().reverse().forEach((it, i) => {
      const t = it.tot || 0, alt = t * altMax / mx, x = x0 + i * passo + (passo - bw) / 2;
      let py = base - alt;
      c.fillStyle = cor(SONO_COR.linha); c.fillRect(x, base - alt, bw, alt);
      [[it.prof, SONO_COR.prof], [it.leve, SONO_COR.leve], [it.rem, SONO_COR.rem], [it.acor, SONO_COR.acor]].forEach(([v, cr]) => {
        if (!v || !t) return; const ph = v * alt / t; c.fillStyle = cor(cr); c.fillRect(x, py, bw, ph + .8); py += ph;
      });
    });
    c.strokeStyle = cor(SONO_COR.cinza); c.beginPath(); c.moveTo(x0, base); c.lineTo(x0 + l, base); c.stroke();
    txt(h * .80, 'média ' + sonoDur(Math.round(soma / lista.length)) + ' por noite', ['small', 'xtiny'], SONO_COR.txt);
    txt(h * .88, lista.length + ' noites no relógio', ['xtiny'], SONO_COR.cinza);
  } else {
    txt(h * .24, 'Sono 1.0.0', ['small', 'xtiny'], SONO_COR.leve);
    ['100% offline', 'Desenvolvedor', 'Alequizao', '@alequizao', 'alequizao.dev@gmail.com', 'github.com/alequizao'].forEach((t, i) =>
      txt(h * .36 + i * h * .10, t, ['xtiny'], i === 1 ? SONO_COR.leve : SONO_COR.txt));
  }
  // pontinhos de página
  const r = 3, esp = r * 3, y = h - h * .06 - r, xx = w / 2 - (SONO_PAGS.length - 1) * esp / 2;
  for (let i = 0; i < SONO_PAGS.length; i++) { c.fillStyle = cor(i === SONO.pagina ? SONO_COR.txt : SONO_COR.linha); c.beginPath(); c.arc(xx + i * esp, y, i === SONO.pagina ? r : r - 1, 0, 7); c.fill(); }
}

function sonoFonte(h) {
  const escala = h / 390, tab = { xtiny: 26, tiny: 30.1, small: 38.3, medium: 45.2, large: 52, numberMild: 75.3, numberMedium: 93.1, numberHot: 112.3 };
  return nome => { const px = (tab[nome] || 30) * escala; return { css: `400 ${px}px Roboto, Arial, sans-serif`, h: Math.round(px * 1.17) }; };
}
function sonoPintar() {
  const cv = $('#sonoCv'); if (!cv) { clearInterval(SONO.timer); SONO.timer = null; return; }
  const dpr = window.devicePixelRatio || 1, lado = 360;
  cv.width = lado * dpr; cv.height = lado * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.save(); c.beginPath(); c.arc(lado / 2, lado / 2, lado / 2, 0, 7); c.clip();
  c.fillStyle = '#000'; c.fillRect(0, 0, lado, lado);
  sonoDesenhar(c, lado, lado, true, sonoFonte(lado), x => '#' + x.toString(16).padStart(6, '0'));
  c.restore();
}
async function renderSono() {
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('sono')}
  <section class="w"><header class="w-top"><span class="w-ico">🌙</span><span class="w-tit">Sono</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   <canvas id="sonoCv" style="width:min(300px,80vw);height:auto;aspect-ratio:1;border-radius:50%;box-shadow:0 0 40px #00a9e033;touch-action:pan-y;cursor:pointer"></canvas>
   <div class="chips"><button class="chip" data-sonobt="prev">▲ Cima</button><button class="chip" data-sonobt="start">● START</button><button class="chip" data-sonobt="next">▼ Baixo</button></div>
   <div class="mini" style="text-align:center;max-width:560px">O <b>Forerunner 55</b> registra o sono, mas <b>não mostra nada disso no relógio</b> — e não tem pontuação de sono. Este app traz a noite inteira para o pulso e <b>funciona 100% offline</b>: sem internet, sem celular e sem servidor. O próprio relógio lê a frequência cardíaca, o estresse e o Body Battery que ele já guarda, descobre a janela em que você dormiu, estima os estágios e <b>calcula a pontuação</b>.<br>São 9 telas: <b>Relatório matinal (Bom dia)</b>, pontuação, estágios, hipnograma da noite, frequência cardíaca, estresse, Body Battery, <b>histórico das últimas 30 noites guardado no relógio</b> e Sobre.<br>Acima está a prévia. <b>▲▼</b> trocam de página e <b>START</b> atualiza.</div>
  </div></section>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="sonoApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="sonoModelo" list="sonoModelos" value="Forerunner® 55 (fr55)" autocomplete="off" required><datalist id="sonoModelos"></datalist></div>
   <div class="chips"><button class="btn" id="sonoGera">⬇ Baixar o app Sono</button></div>
   <div class="mini" id="sonoProg"></div></form>
   <div class="mini" style="margin-top:8px">Já compilados: <a href="app/Sono-fr55.prg">Forerunner 55</a> · <a href="app/Sono-fr165.prg">Forerunner 165</a></div></div>
  <div class="card"><h3>Como instalar pelo cabo USB</h3><div class="mini">1) Baixe o <b>.prg</b> acima (ele já sai com o código da sua conta).<br>2) Ligue o relógio no computador com o <b>cabo USB</b> e espere aparecer a unidade <b>GARMIN</b>.<br>3) Copie o arquivo <b>Sono.prg</b> para a pasta <b>GARMIN/APPS</b> (no Mac, <b>GARMIN/APPS</b> dentro do volume do relógio).<br>4) Ejete e desconecte o cabo. O relógio reinicia a lista de apps sozinho.<br>5) No relógio: <b>START</b> → <b>Aplicativos</b> (ou Adicionar) → <b>Sono</b>.<br>6) Abra o app: ele analisa sozinho, na hora. <b>Não precisa de internet, de celular nem do Garmin Connect.</b><br><b>Permissões:</b> histórico de sensores e perfil do usuário — tudo lido de dentro do relógio. O app não usa GPS e não manda nada para lugar nenhum; o histórico das 30 noites fica guardado no próprio relógio.</div></div>
  ${tabbar('app')}</div>`;
  document.querySelectorAll('[data-sonobt]').forEach(b => b.onclick = () => { sonoBotao(b.dataset.sonobt); sonoPintar(); });
  const cv = $('#sonoCv'); cv.onclick = () => { sonoBotao('next'); sonoPintar(); };
  let y0 = null; cv.ontouchstart = e => { y0 = e.touches[0].clientY; };
  cv.ontouchend = e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) > 30) { e.preventDefault(); sonoBotao(dy > 0 ? 'prev' : 'next'); sonoPintar(); } };
  sonoPintar();
  if (!SONO.dados) { await sonoCarregar(); sonoPintar(); }
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#sonoModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(x => n(x) === q)); };
  $('#sonoApp').onsubmit = e => e.preventDefault();
  $('#sonoGera').onclick = async e => {
    e.preventDefault(); const m = achar($('#sonoModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bt = $('#sonoGera'); bt.disabled = true; $('#sonoProg').textContent = '⚙️ Compilando (cerca de 30 s)…';
    try {
      const a = await api('sono_app', { modelo: m.id });
      const esperar = async (k = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#sonoProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS pelo cabo USB. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bt.disabled = false; return; }
        if (s.status === 'erro' || k > 90) { $('#sonoProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); bt.disabled = false; return; }
        setTimeout(() => esperar(k + 1), 2000); };
      esperar();
    } catch (x) { $('#sonoProg').textContent = '❌ ' + x.message; bt.disabled = false; }
  };
}
/* ---- App Força (treino de força): prévia interativa e simulador ---- */
const FORCA = {
  ex: 0, peso: 20, descanso: 90, auto: true,
  estado: 'inicio',      // inicio | serie | descanso | pausado | resumo | menu
  reps: 0, serie: 0, totalReps: 0, volume: 0, seg: 0, resta: 0, fc: 92,
  menu: null, mi: 0, timer: null, ritmo: 0
};
const FORCA_EX = ['Supino reto', 'Supino inclinado', 'Crucifixo', 'Desenvolvimento', 'Elevação lateral', 'Remada', 'Puxada alta', 'Barra fixa', 'Rosca bíceps', 'Tríceps', 'Agachamento', 'Leg press', 'Afundo', 'Levantamento terra', 'Panturrilha', 'Abdominal', 'Flexão de braço', 'Prancha', 'Livre'];
const forcaTempo = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };

function forcaIniciar() {
  Object.assign(FORCA, { estado: 'inicio', reps: 0, serie: 0, totalReps: 0, volume: 0, seg: 0, resta: 0, menu: null, mi: 0, ritmo: 0 });
}
function forcaTique() {
  const F = FORCA;
  if (F.estado === 'serie') {
    F.seg++; F.ritmo++;
    if (F.ritmo >= 2) { F.ritmo = 0; F.reps++; }          // repetição a cada 2 s (o relógio conta pelo acelerômetro)
    F.fc = Math.min(160, F.fc + 2);
    if (F.auto && F.reps >= 12) forcaFechar();            // série automática
  } else if (F.estado === 'descanso') {
    F.seg++; F.resta--; F.fc = Math.max(80, F.fc - 2);
    if (F.resta <= 0) { F.estado = 'serie'; F.reps = 0; F.ritmo = 0; }
  } else if (F.estado === 'pausado') { F.fc = Math.max(75, F.fc - 1); }
}
function forcaFechar() {
  const F = FORCA;
  if (F.reps > 0) { F.serie++; F.totalReps += F.reps; F.volume += F.reps * F.peso; }
  F.reps = 0; F.resta = F.descanso; F.estado = 'descanso';
}
function forcaMenuTreino() {
  FORCA.menu = ['Voltar ao treino', 'Trocar exercício', 'Peso ' + FORCA.peso + ' kg', 'Descanso ' + FORCA.descanso + ' s', 'Salvar e encerrar', 'Descartar treino']; FORCA.mi = 0;
}
function forcaBotao(t) {
  const F = FORCA;
  if (F.menu) {
    if (t === 'next') F.mi = (F.mi + 1) % F.menu.length;
    else if (t === 'prev') F.mi = (F.mi - 1 + F.menu.length) % F.menu.length;
    else if (t === 'back') F.menu = null;
    else if (t === 'start') {
      const it = F.menu[F.mi];
      if (it.startsWith('Trocar')) F.ex = (F.ex + 1) % FORCA_EX.length;
      else if (it.startsWith('Peso')) F.peso += 5;
      else if (it.startsWith('Descanso')) F.descanso = F.descanso >= 180 ? 30 : F.descanso + 30;
      else if (it.startsWith('Salvar') || it.startsWith('Descartar')) { if (F.reps > 0) forcaFechar(); F.salvou = it.startsWith('Salvar'); F.estado = 'resumo'; F.menu = null; return; }
      if (it.startsWith('Voltar')) F.menu = null; else forcaMenuTreino();
    }
    return;
  }
  if (F.estado === 'inicio') {
    if (t === 'start') { forcaIniciar(); F.estado = 'serie'; F.fc = 95; }
    else if (t === 'menu') forcaMenuTreino();
    else if (t === 'next') F.ex = (F.ex + 1) % FORCA_EX.length;
    else if (t === 'prev') F.ex = (F.ex - 1 + FORCA_EX.length) % FORCA_EX.length;
    return;
  }
  if (F.estado === 'resumo') { if (t === 'start' || t === 'back') forcaIniciar(); return; }
  if (t === 'start') {
    if (F.estado === 'serie') forcaFechar();
    else if (F.estado === 'descanso') { F.estado = 'serie'; F.reps = 0; F.ritmo = 0; }
    else if (F.estado === 'pausado') F.estado = 'serie';
  } else if (t === 'menu') forcaMenuTreino();
  else if (t === 'back') { if (F.estado === 'pausado') forcaMenuTreino(); else F.estado = 'pausado'; }
  else if (t === 'next' || t === 'prev') {
    const d = t === 'prev' ? 1 : -1;
    if (F.estado === 'descanso') F.resta = Math.max(1, F.resta + d * 15); else F.reps = Math.max(0, F.reps + d);
  }
}
/* réplica do onUpdate do app (Telas.mc): mesmas cores da paleta de 8 cores do FR55 */
function forcaDesenhar(c, w, h, redondo, fonte, cor) {
  const F = FORCA, g = w > 260;
  const fx = fonte('xtiny'), fm = fonte('medium'), fnum = fonte('numberHot') || fonte('numberMedium');
  const CIANO = '#00ffff', BRANCO = '#ffffff', VERDE = '#00ff00', AMARELO = '#ffff00', VERMELHO = '#ff0000', AZUL = '#0000ff';
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);

  if (F.menu) {
    simTexto(c, 'Treino', w / 2, g ? 24 : 14, fx, CIANO);
    const alt = g ? 40 : 30, y0 = (g ? 60 : 42);
    F.menu.forEach((it, i) => {
      const y = y0 + i * alt;
      if (i === F.mi) { c.fillStyle = '#0000ff'; c.fillRect(w * 0.06, y - 3, w * 0.88, alt - 6); }
      simTexto(c, it, w / 2, y, fx, i === F.mi ? BRANCO : '#00ffff');
    });
    return;
  }
  if (F.estado === 'inicio') {
    simTexto(c, 'FORÇA', w / 2, g ? 34 : 22, g ? fm : fonte('small'), CIANO);
    simTexto(c, FORCA_EX[F.ex], w / 2, g ? 76 : 54, fx, BRANCO);
    simTexto(c, F.peso + ' kg · descanso ' + F.descanso + 's', w / 2, g ? 102 : 76, fx, AMARELO);
    simTexto(c, 'START para começar', w / 2, h - (g ? 64 : 48), fx, VERDE);
    simTexto(c, 'MENU = opções', w / 2, h - (g ? 42 : 30), fx, BRANCO);
    return;
  }
  if (F.estado === 'resumo') {
    simTexto(c, F.salvou ? 'Treino salvo' : 'Treino descartado', w / 2, g ? 28 : 16, fx, F.salvou ? VERDE : VERMELHO);
    const linhas = [['Séries', F.serie], ['Repetições', F.totalReps], ['Volume', F.volume + ' kg'], ['Tempo', forcaTempo(F.seg)]];
    const dy = g ? 30 : 24, y0 = g ? 62 : 42;
    linhas.forEach((l, i) => { simTexto(c, l[0], w / 2 - 6, y0 + i * dy, fx, AZUL, 'right'); simTexto(c, String(l[1]), w / 2 + 6, y0 + i * dy, fx, BRANCO, 'left'); });
    simTexto(c, 'START volta ao início', w / 2, h - (g ? 40 : 28), fx, AMARELO);
    return;
  }
  // treino
  simTexto(c, FORCA_EX[F.ex], w / 2, g ? 24 : 14, fx, CIANO);
  simTexto(c, 'Série ' + (F.serie + 1) + ' · ' + F.peso + ' kg', w / 2, g ? 48 : 34, fx, BRANCO);
  if (F.estado === 'descanso') {
    const pct = F.descanso > 0 ? F.resta / F.descanso : 0;
    c.lineWidth = 6; c.strokeStyle = AZUL; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 5, 0, Math.PI * 2); c.stroke();
    if (pct > 0) { c.strokeStyle = AMARELO; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); c.stroke(); }
    c.textBaseline = 'middle'; c.font = fnum.css; c.fillStyle = AMARELO; c.textAlign = 'center';
    c.fillText(forcaTempo(F.resta), w / 2, h / 2); c.textBaseline = 'top';
    simTexto(c, 'DESCANSO', w / 2, h / 2 + (g ? 44 : 32), fx, BRANCO);
  } else if (F.estado === 'pausado') {
    c.textBaseline = 'middle'; c.font = fm.css; c.fillStyle = VERMELHO; c.textAlign = 'center';
    c.fillText('PAUSADO', w / 2, h / 2); c.textBaseline = 'top';
    simTexto(c, 'START retoma', w / 2, h / 2 + (g ? 40 : 28), fx, BRANCO);
  } else {
    c.textBaseline = 'middle'; c.font = fnum.css; c.fillStyle = VERDE; c.textAlign = 'center';
    c.fillText(String(F.reps), w / 2, h / 2); c.textBaseline = 'top';
    simTexto(c, 'repetições', w / 2, h / 2 + (g ? 48 : 34), fx, BRANCO);
  }
  const yb = h - (g ? 44 : 32), dx = g ? 68 : 52;
  simTexto(c, String(F.fc), w / 2 - dx, yb, fx, VERMELHO);
  simTexto(c, forcaTempo(F.seg), w / 2, yb, fx, BRANCO);
  simTexto(c, String(F.totalReps), w / 2 + dx, yb, fx, CIANO);
}
/* prévia da aba (fora do simulador) */
function forcaPintar() {
  const cv = $('#forcaCv'); if (!cv) { clearInterval(FORCA.timer); FORCA.timer = null; return; }
  const dpr = window.devicePixelRatio || 1, lado = 360;
  cv.width = lado * dpr; cv.height = lado * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.save(); c.beginPath(); c.arc(lado / 2, lado / 2, lado / 2, 0, 7); c.clip();
  const fonte = n => { const px = { xtiny: 23, small: 29, medium: 35, numberHot: 86, numberMedium: 76 }[n] || 22; return { css: `${n.startsWith('number') ? 700 : 400} ${px}px Roboto, Arial, sans-serif`, h: Math.round(px * 1.17) }; };
  forcaDesenhar(c, lado, lado, true, fonte, x => '#' + x.toString(16).padStart(6, '0'));
  c.restore();
}
async function renderForca() {
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('forca')}
  <section class="w"><header class="w-top"><span class="w-ico">🏋️</span><span class="w-tit">Força — treino de musculação</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   <canvas id="forcaCv" style="width:min(300px,80vw);height:auto;aspect-ratio:1;border-radius:50%;box-shadow:0 0 40px #00a9e033;touch-action:pan-y;cursor:pointer"></canvas>
   <div class="chips"><button class="chip" data-forcabt="prev">▲ Cima</button><button class="chip" data-forcabt="start">● START</button><button class="chip" data-forcabt="next">▼ Baixo</button><button class="chip" data-forcabt="menu">☰ MENU</button><button class="chip" data-forcabt="back">↩ VOLTAR</button></div>
   <div class="mini" style="text-align:center;max-width:560px">O <b>Forerunner 165</b> tem o perfil <b>Treino de força</b>; o <b>Forerunner 55 não tem</b>. Este app traz o mesmo treino para o FR55 e <b>funciona 100% offline</b>.<br>Ele <b>conta as repetições sozinho</b> pelo acelerômetro do relógio, separa as <b>séries</b>, começa o <b>descanso</b> com anel e vibração, mostra <b>frequência cardíaca, tempo e total de repetições</b>, e grava a atividade em <b>FIT</b> — ela aparece no <b>Garmin Connect como Treino de força</b>, com repetições e peso em cada série.<br>Guarda ainda os <b>20 últimos treinos no próprio relógio</b>.<br>Acima está a prévia: <b>START</b> começa e fecha a série, <b>▲▼</b> corrigem as repetições, <b>MENU</b> abre o menu do treino e <b>VOLTAR</b> pausa.</div>
  </div></section>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="forcaApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="forcaModelo" list="forcaModelos" value="Forerunner® 55 (fr55)" autocomplete="off" required><datalist id="forcaModelos"></datalist></div>
   <div class="chips"><button class="btn" id="forcaGera">⬇ Baixar o app Força</button></div>
   <div class="mini" id="forcaProg"></div></form>
   <div class="mini" style="margin-top:8px">Já compilados: <a href="app/Forca-fr55.prg">Forerunner 55</a> · <a href="app/Forca-fr165.prg">Forerunner 165</a></div></div>
  <div class="card"><h3>Como usar no relógio</h3><div class="mini"><b>START</b> começa o treino e, a cada série, <b>fecha a série</b> e inicia o descanso (o relógio vibra duas vezes).<br>Com a <b>série automática</b> ligada, basta parar de se mexer por 8 segundos que ele fecha a série sozinho.<br><b>▲ ▼</b> corrigem a contagem (ou aumentam/diminuem 15 s no descanso). <b>MENU</b> (segurar UP) troca o exercício, muda o peso, as repetições, o descanso e encerra salvando ou descartando. <b>VOLTAR</b> pausa.<br>São 19 exercícios prontos (supino, agachamento, terra, rosca, tríceps, barra, abdominal, prancha…) e a sensibilidade da contagem tem 3 níveis.</div></div>
  <div class="card"><h3>Como instalar pelo cabo USB</h3><div class="mini">1) Baixe o <b>.prg</b> acima.<br>2) Ligue o relógio no computador com o <b>cabo USB</b> e espere aparecer a unidade <b>GARMIN</b>.<br>3) Copie o arquivo <b>Forca.prg</b> para a pasta <b>GARMIN/APPS</b>.<br>4) Ejete e desconecte o cabo.<br>5) No relógio: <b>START</b> → <b>Aplicativos</b> → <b>Força</b>.<br><b>Permissões:</b> sensores (acelerômetro, para contar as repetições), gravação de atividade em FIT e perfil do usuário. O app não usa GPS e não manda nada para servidor nenhum — o treino vai para o Garmin Connect pela sincronização normal do relógio.</div></div>
  ${tabbar('app')}</div>`;
  document.querySelectorAll('[data-forcabt]').forEach(b => b.onclick = () => { forcaBotao(b.dataset.forcabt); forcaPintar(); });
  const cv = $('#forcaCv'); cv.onclick = () => { forcaBotao('start'); forcaPintar(); };
  forcaIniciar(); forcaPintar();
  clearInterval(FORCA.timer);
  FORCA.timer = setInterval(() => { if (!$('#forcaCv')) { clearInterval(FORCA.timer); FORCA.timer = null; return; } forcaTique(); forcaPintar(); }, 1000);
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#forcaModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(x => n(x) === q)); };
  $('#forcaApp').onsubmit = e => e.preventDefault();
  $('#forcaGera').onclick = async e => {
    e.preventDefault(); const m = achar($('#forcaModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bt = $('#forcaGera'); bt.disabled = true; $('#forcaProg').textContent = '⚙️ Compilando (cerca de 30 s)…';
    try {
      const a = await api('forca_app', { modelo: m.id });
      const esperar = async (k = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#forcaProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS pelo cabo USB. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bt.disabled = false; return; }
        if (s.status === 'erro' || k > 90) { $('#forcaProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); bt.disabled = false; return; }
        setTimeout(() => esperar(k + 1), 2000); };
      esperar();
    } catch (x) { $('#forcaProg').textContent = '❌ ' + x.message; bt.disabled = false; }
  };
}

/* ================= app "Gasolina Perto" (réplica em canvas do GasolinaApp.mc + gerar o app do relógio) =================
 * Gasolina Perto · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * Mesmas telas, cores e teclas do app do relógio (Tela.mc / Detalhe.mc), com dados reais de /gasolina/api/perto.
 * Posição: o GPS do navegador só é usado se você já tiver liberado; senão, um ponto fixo de Maceió (avisado na tela). */
const GAS_COMB = ['Gasolina comum', 'Gas. aditivada', 'Álcool', 'Diesel comum', 'Diesel aditiv.', 'GNV'];
const GAS_PADRAO = { lat: -9.6498, lon: -35.7089, nome: 'Maceió (Ponta Verde)' };
const GAS = { c: 1, p: null, t: 0, r: 5, sel: 0, menu: -1, busca: 0, err: null, lat: null, lon: null, origem: '', ini: 0,
  aviso: null, avisoAte: 0, tela: 'lista', timer: null, prev: 'fr165', trAte: 0, trDir: 0, cheg: -1 };
try { const c = +localStorage.getItem('gas_c'); if (c >= 1 && c <= 6) GAS.c = c; } catch (e) { }
/* tokens do visual premium (iguais a cores() em GasolinaApp.mc): AMOLED = verde-combustível + escala de preço + 3 cinzas; MIP = 8 cores puras */
const GAS_COR = {
  amoled: { ac: '#2ed18a', am: '#ffb547', rd: '#ff6f61', tx: '#ffffff', t2: '#aeb4b0', t3: '#6b726e', ln: '#232826', card: '#131816' },
  mip: { ac: '#00ff00', am: '#ffff00', rd: '#ff0000', tx: '#ffffff', t2: '#ffffff', t3: '#ffffff', ln: '#0000ff', card: '#000000' } };
const gasVirg = s => s.replace('.', ',');
const gasPreco = v => gasVirg((+v).toFixed(3));
const gasKm = k => { k = +k; return k < 1 ? Math.floor(k * 100) * 10 + ' m' : gasVirg(k.toFixed(k < 10 ? 1 : 0)) + ' km'; };
const gasHa = t => { const d = Math.floor(Date.now() / 1000) - t; return d < 60 ? 'agora' : d < 3600 ? `há ${Math.floor(d / 60)} min` : d < 86400 ? `há ${Math.floor(d / 3600)} h` : `há ${Math.floor(d / 86400)} d`; };
const gasRumo = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, f1 = la1 * r, f2 = la2 * r, dl = (lo2 - lo1) * r;
  const b = Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) / r; return b < 0 ? b + 360 : b; };
const gasDist = (la1, lo1, la2, lo2) => { const r = Math.PI / 180, a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2; return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); };
const gasCardeal = b => ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.floor((b + 22.5) / 45) % 8];
/* diferença para o selecionado ("+R$ 0,02") e cor semântica do preço (escala relativa, mínimo R$ 0,10) — iguais a dif()/corPreco() do .mc */
const gasDif = (v, ref) => { let d = +v - +ref, s = '+'; if (d < 0) { d = -d; s = '-'; } return d < 0.0005 ? 'mesmo preço' : s + 'R$ ' + gasVirg(d.toFixed(d < 0.0095 ? 3 : 2)); };
const gasCorPreco = (v, K) => { const l = GAS.p.map(x => +x[1]), lo = Math.min(...l), hi = Math.max(...l), t = (+v - lo) / (hi - lo > 0.1 ? hi - lo : 0.1); return t < 0.34 ? K.ac : t < 0.67 ? K.am : K.rd; };
function gasErroRede(st) { return !st ? ['Sem internet', 'O celular não\nrespondeu a tempo'] : st === 400 ? ['Posição inválida', 'Espere o GPS e\ntente de novo'] : st >= 500 ? ['Servidor fora', `Tente daqui a\npouco (${st})`] : [`Falhou (${st})`, 'Tente de novo']; }
function gasAviso(t) { GAS.aviso = t; GAS.avisoAte = Date.now() + 1600; gasAnimar(); }
function gasTrans(d) { GAS.trDir = d; GAS.trAte = Date.now() + 220; gasAnimar(); }   // slide curto, igual a trans() do .mc
function gasVibrar() { try { navigator.vibrate?.(60); } catch (e) { } const cv = SIM.canvas && SIM.app === 'gasolina' ? SIM.canvas : $('#gasCv'); if (cv) { cv.classList.add('sim-vibra'); setTimeout(() => cv.classList.remove('sim-vibra'), 250); } }
/* busca: GPS (do navegador, se já liberado) → preços */
async function gasPosicao(pedir) {
  let ok = false;
  try { if (!pedir && navigator.permissions) ok = (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'; } catch (e) { }
  if (pedir || ok) {
    const pos = await new Promise(res => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => res(p), () => res(null), { timeout: 8000, maximumAge: 120000 }) : res(null));
    if (pos) { GAS.lat = pos.coords.latitude; GAS.lon = pos.coords.longitude; GAS.origem = 'seu GPS'; return; }
    if (pedir) toast('Localização negada — usando Maceió');
  }
  if (GAS.lat == null || GAS.origem !== 'seu GPS') { GAS.lat = GAS_PADRAO.lat; GAS.lon = GAS_PADRAO.lon; GAS.origem = GAS_PADRAO.nome; }
}
async function gasBuscar(pedirGps) {
  if (GAS.busca === 2) return;
  GAS.err = null; GAS.busca = 1; GAS.ini = Date.now(); gasAnimar();
  await gasPosicao(pedirGps);
  await new Promise(r => setTimeout(r, 900));            // deixa ver o anel enchendo (no relógio o GPS leva segundos)
  GAS.busca = 2; GAS.ini = Date.now(); const c = GAS.c; gasAnimar();
  let st = 0, j = null;
  try { const r = await fetch(`/gasolina/api/perto?lat=${GAS.lat.toFixed(5)}&lon=${GAS.lon.toFixed(5)}&c=${c}&n=5`); st = r.status; if (r.ok) j = await r.json(); } catch (e) { st = 0; }
  await new Promise(r => setTimeout(r, 500));
  GAS.busca = 0;
  if (c !== GAS.c) return gasBuscar();                    // trocou de combustível no meio
  if (j && Array.isArray(j.p)) {
    GAS.p = j.p; GAS.r = Math.round(j.r || 5); GAS.t = Math.floor(Date.now() / 1000); GAS.sel = 0;
    if (!j.p.length) GAS.err = ['Sem postos', `Nenhum preço num raio\nde ${GAS.r} km`, 0]; else { gasVibrar(); gasTrans(1); }
  } else GAS.err = gasErroRede(st);
  gasPintarTudo();
}
/* um só ritmo, como o Motor.pulso() do relógio: 40 ms enquanto anima (busca, slide, confirmação); parado não redesenha */
function gasAnimar() {
  gasPintarTudo();
  if (GAS.timer) return;
  GAS.timer = setInterval(() => {
    const vivo = $('#gasCv') || (SIM.canvas && SIM.app === 'gasolina' && $('#simCanvas'));
    if (!vivo) { clearInterval(GAS.timer); GAS.timer = null; return; }
    gasPintarTudo();
    if (!GAS.busca && !GAS.aviso && Date.now() > GAS.trAte) { clearInterval(GAS.timer); GAS.timer = null; }
  }, 40);
}
function gasPintarTudo() { if ($('#gasCv')) gasPintar(); if (SIM.canvas && SIM.app === 'gasolina' && $('#simCanvas')) simDesenhar(); }
/* teclas: as mesmas do TelaDelegate / DetalheDelegate */
function gasBotao(t) {
  const G = GAS, n = G.p ? G.p.length : 0, d = t === 'next' ? 1 : -1;
  if (G.tela === 'detalhe') {
    if ((t === 'next' || t === 'prev') && n) { G.sel = (G.sel + d + n) % n; gasTrans(d); } else if (t === 'back') G.tela = 'lista';
    return gasPintarTudo();
  }
  if (G.menu >= 0) {
    if (t === 'next' || t === 'prev') { G.menu = (G.menu + d + 7) % 7; gasTrans(d); } else if (t === 'back') { G.menu = -1; gasTrans(-1); } else if (t === 'start') gasEscolher();
    return gasPintarTudo();
  }
  if (t === 'menu') { G.menu = G.c; gasTrans(1); }
  else if ((t === 'next' || t === 'prev') && n) { G.sel = (G.sel + d + n) % n; gasTrans(d); }
  else if (t === 'start') { if (n) G.tela = 'detalhe'; else if (!G.busca) gasBuscar(); }
  gasPintarTudo();
}
function gasToque(y, H) {   // onTap do relógio (FR165)
  const G = GAS;
  if (G.tela === 'detalhe') return;
  if (G.menu >= 0) { const hR = Math.floor(H * 14 / 100), dy = y - (H / 2 + H * 3 / 100); const j = G.menu + (dy >= 0 ? Math.floor((dy + hR / 2) / hR) : -Math.floor((hR / 2 - dy) / hR));
    if (j >= 0 && j <= 6) { G.menu = j; gasEscolher(); } return gasPintarTudo(); }
  if (G.p?.length) { if (y < H * 0.30) return gasBotao('prev'); if (y > H * 0.75) return gasBotao('next'); }
  gasBotao('start');
}
function gasEscolher() {
  const G = GAS, m = G.menu; G.menu = -1; gasVibrar();
  if (m === 0) { gasAviso('Atualizando'); return gasBuscar(); }
  if (m !== G.c) { G.c = m; G.sel = 0; G.p = null; G.err = null; try { localStorage.setItem('gas_c', m); } catch (e) { } }
  gasAviso(GAS_COMB[m - 1]); gasBuscar();
}
/* ---- desenho (réplica fiel do onUpdate de Tela.mc e Detalhe.mc e das funções de desenho de GasolinaApp.mc) ---- */
function gasDesenhar(c, W, H, mip, fonte) {
  const K = GAS_COR[mip ? 'mip' : 'amoled'], G = GAS, g = W > 260, agora = Date.now(), xt = fonte('xtiny'), P = Math.floor;
  const larg = (t, f) => { c.font = f.css; return c.measureText(t).width; };
  const tx = (t, x, y, f, cor, al = 'center', base = 'middle') => { c.font = f.css; c.fillStyle = cor; c.textAlign = al; c.textBaseline = base;
    const ls = String(t).split('\n'), lh = f.h; ls.forEach((l, i) => c.fillText(l, x, y + (i - (ls.length - 1) / 2) * lh)); };
  const corda = y => { const r = W / 2, d = r * r - (y - r) ** 2; return d > 0 ? 2 * Math.sqrt(d) : 0; };
  const txt = (y, t, f, f2, cor) => { const h = f.h / 2; if (larg(t, f) > corda(y > W / 2 ? y + h : y - h) * 0.88) f = f2; tx(t, W / 2, y, f, cor); };
  const rr = (x, y, w, h, r, cor) => { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); c.fillStyle = cor; c.fill(); };
  const circ = (x, y, r, cor, pen) => { c.beginPath(); c.arc(x, y, r, 0, 7); if (pen) { c.strokeStyle = cor; c.lineWidth = pen; c.stroke(); } else { c.fillStyle = cor; c.fill(); } };
  const arcoH = (cx, cy, r, gi, gf, cor, pen) => { c.beginPath(); c.arc(cx, cy, r, -gi * Math.PI / 180, -gf * Math.PI / 180, false); c.strokeStyle = cor; c.lineWidth = pen; c.stroke(); };   // ARC_CLOCKWISE
  const linha = (x1, y1, x2, y2, cor, pen) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = cor; c.lineWidth = pen; c.lineCap = 'round'; c.stroke(); };
  const poli = (pts, cor) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = cor; c.fill(); };
  const check = (x, y, s, cor, pen) => { c.beginPath(); c.moveTo(x - s, y); c.lineTo(x - s / 3, y + s * 2 / 3); c.lineTo(x + s, y - s * 2 / 3); c.strokeStyle = cor; c.lineWidth = pen; c.lineCap = 'round'; c.stroke(); };
  const bomba = (x, y, s, cor, visor) => { const w = P(s * 6 / 10), t = P(s / 8) + 1;
    rr(x, y, w, s, t, cor); c.fillStyle = cor; c.fillRect(x + w, y + s * 6 / 10, s / 4, t); c.fillRect(x + w + s / 4 - t, y + s / 4, t, s * 4 / 10); c.fillRect(x + w + s / 10, y + s / 10, s / 4, s / 5);
    c.fillStyle = visor; c.fillRect(x + s / 10, y + s / 7, w - s / 5, s / 4); };
  const desl = amp => { const k = G.trAte - agora; return k <= 0 ? 0 : G.trDir * amp * k * k / 48400; };
  const cab = t => { const s = g ? 20 : 11, e = g ? 9 : 4, x = P((W - larg(t, xt) - s - e) / 2), y = P(W * 15 / 100);
    bomba(x, y - s / 2, s, K.ac, '#000'); tx(t, x + s + e, y, xt, K.t2, 'left'); };
  const anel = (i, n) => { const cc = W / 2, r = cc - (g ? 5 : 3), pen = g ? 4 : 3; if (!mip) circ(cc, cc, r, K.ln, pen);   // trilho só no AMOLED
    if (G.busca) { const e = agora - G.ini, f = G.busca === 1 ? 2 + 43 * e / (e + 6000) : 50 + 45 * e / (e + 2500); arcoH(cc, cc, r, 90, Math.trunc(450 - f * 3.6) % 360, K.ac, pen); }
    else if (n > 1) { const s = P(64 / n), a = 32 - i * s; arcoH(cc, cc, r, (a + 360) % 360, (a - s + 360) % 360, K.ac, pen); } };
  // preço: "R$" cinza + número grande (fonte numérica) na cor semântica, vírgula desenhada, tudo na mesma linha de base
  const preco = (cx, y, v, f, fr, cor) => { const [a, b] = (+v).toFixed(3).split('.'), yb = y - f.h / 2 + f.h * 0.79;
    const cw = P(f.h / 7) + 2, wr = larg('R$ ', fr), wa = larg(a, f), x = cx - (wr + wa + cw + larg(b, f)) / 2, d = P(f.h / 16) + 1, xc = x + wr + wa + cw / 2;
    tx('R$ ', x, yb, fr, K.t3, 'left', 'alphabetic'); tx(a, x + wr, yb, f, cor, 'left', 'alphabetic');
    circ(xc, yb - d, d, cor); poli([[xc + d, yb - d], [xc - d / 2, yb + d * 2], [xc - d, yb + d * 2], [xc, yb - d]], cor);
    tx(b, x + wr + wa + cw, yb, f, cor, 'left', 'alphabetic'); };
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const n = G.p ? G.p.length : 0;

  if (G.tela === 'detalhe' && n) {
    if (G.sel >= n) G.sel = 0;
    const p = G.p[G.sel], o = desl(g ? 30 : 14);
    anel(G.sel, n); cab(GAS_COMB[G.c - 1]);
    txt(P(H * 26 / 100) + o, p[0], fonte(g ? 'small' : 'tiny'), g ? fonte('tiny') : xt, K.tx);
    // rosa-dos-ventos (o navegador não tem bússola: igual ao relógio parado, norte para cima)
    const cx = W / 2, cy = P(H * 47 / 100), r = P(H * 15 / 100), n0 = 0;
    let km = +p[2], t = 'sem GPS';
    circ(cx, cy, r, K.ln, g ? 2 : 1);
    for (let k = 1; k < 12; k++) { const a = (k * 30 - n0) * Math.PI / 180, s = Math.sin(a), co = Math.cos(a), l = r - 3 - (k % 3 === 0 ? P(r / 6) : P(r / 12));
      linha(cx + s * l, cy - co * l, cx + s * (r - 3), cy - co * (r - 3), K.t3, g ? 2 : 1); }
    const q = P(r / 7) + 1; poli([[cx, cy - (r - 2)], [cx - q, cy - (r - 3 * q)], [cx + q, cy - (r - 3 * q)]], K.tx);   // norte
    if (G.lat != null) {
      km = gasDist(G.lat, G.lon, p[3], p[4]);
      let f = +p[2]; f = f > 0.05 ? 1 - km / f : 0;
      if (f > 0.02) arcoH(cx, cy, r, 90, Math.trunc(450 - f * 360) % 360, K.ac, g ? 4 : 3);
      if (km < 0.05) { circ(cx, cy, r * 0.45, K.ac); check(cx, cy, P(r / 5), '#000', g ? 5 : 3); t = 'Você chegou'; if (G.cheg !== G.sel) { G.cheg = G.sel; gasVibrar(); } }
      else { if (km > 0.1 && G.cheg === G.sel) G.cheg = -1;
        const b = gasRumo(G.lat, G.lon, p[3], p[4]); t = 'fica a ' + gasCardeal(b);
        const R = P(r * 58 / 100), a = (b - n0) * Math.PI / 180, s = Math.sin(a), co = Math.cos(a);
        poli([[0, -R], [R * 0.45, R * 0.65], [0, R * 0.35], [-R * 0.45, R * 0.65]].map(([x, y]) => [cx + x * co - y * s, cy + x * s + y * co]), K.ac); }
    } else tx('?', cx, cy, fonte('medium'), K.t3);
    preco(cx, P(H * 685 / 1000) + o, p[1], fonte(g ? 'large' : 'numberMild'), g ? fonte('tiny') : xt, gasCorPreco(p[1], K));
    txt(P(H * 805 / 1000), gasKm(km) + ' · ' + t, xt, xt, km < 0.05 && G.lat != null ? K.ac : K.tx);
    txt(P(H * 885 / 1000), 'preço ' + gasHa(p[5]), xt, xt, K.t3);
  } else if (G.menu >= 0) {
    const hR = P(H * 14 / 100), o = desl(hR / 2);
    anel(G.menu, 7); cab('Combustível');
    for (let j = G.menu - 2; j <= G.menu + 2; j++) {
      if (j < 0 || j > 6) continue;
      const y = H / 2 + (j - G.menu) * hR + P(H * 3 / 100) + o, t = j === 0 ? 'Atualizar agora' : GAS_COMB[j - 1];
      let f = xt, cor = j === G.c ? K.ac : Math.abs(j - G.menu) > 1 ? K.t3 : K.t2;
      if (j === G.menu) { const x0 = P(W * 12 / 100); rr(x0, y - hR / 2 + 3, W - 2 * x0, hR - 6, (hR - 6) / 2, K.card); rr(x0 + (g ? 14 : 7), y - hR / 5, g ? 5 : 3, hR * 2 / 5, 2, K.ac); f = fonte('tiny'); cor = K.tx; }
      tx(t, W / 2, y, f, cor);
      if (j === G.c) { const s = g ? 7 : 4; check((W + larg(t, f)) / 2 + s + (g ? 8 : 4), y, s, K.ac, g ? 3 : 2); }   // ✓ à direita do atual
    }
  } else {
    anel(G.sel, n); cab(GAS_COMB[G.c - 1]);
    if (n) {
      if (G.sel >= n) G.sel = 0;
      const p = G.p[G.sel];
      const viz = (y, q) => { let nome = q[0].length > 11 ? q[0].slice(0, 10).replace(/ $/, '') + '.' : q[0]; nome += '  '; const d = gasDif(q[1], p[1]), w = larg(nome, xt), x = (W - w - larg(d, xt)) / 2;
        tx(nome, x, y, xt, K.t3, 'left'); tx(d, x + w, y, xt, K.t2, 'left'); };
      if (G.sel === 0) txt(P(H * 27 / 100), 'MAIS BARATO', xt, xt, K.ac); else viz(P(H * 27 / 100), G.p[G.sel - 1]);
      if (G.sel < n - 1) viz(P(H * 785 / 1000), G.p[G.sel + 1]);
      // cartão: fundo sutil (sem borda) + barra verde de destaque
      const x0 = P(W * 9 / 100), yC = P(H * 33 / 100), wC = W - 2 * x0, hC = P(H * 40 / 100);
      rr(x0, yC, wC, hC, g ? 22 : 11, K.card); rr(x0 + (g ? 12 : 6), yC + P(hC * 28 / 100), g ? 5 : 3, P(hC * 44 / 100), 2, K.ac);
      const y = yC + desl(g ? 34 : 16);
      let f = fonte(g ? 'small' : 'tiny'); if (larg(p[0], f) > wC - (g ? 56 : 28)) f = g ? fonte('tiny') : xt;
      tx(p[0], W / 2, y + P(hC * 19 / 100), f, K.tx);
      preco(W / 2, y + P(hC * 50 / 100), p[1], fonte('numberMild'), g ? fonte('tiny') : xt, gasCorPreco(p[1], K));
      tx(gasKm(p[2]) + ' · ' + p[6], W / 2, y + P(hC * 87 / 100), xt, K.t2);
      let rod = gasHa(G.t), cr = K.t3;
      if (G.r > 5) rod += ` · raio ${G.r} km`;
      if (G.busca === 1) { rod = 'Buscando GPS'; cr = K.t2; } else if (G.busca === 2) { rod = 'Atualizando'; cr = K.t2; } else if (G.err) { rod = G.err[0]; cr = K.rd; }
      txt(P(H * 885 / 1000), rod, xt, xt, cr);
    } else if (G.err && !G.busca) {   // erro (ícone vermelho) ou vazio (ícone cinza) + tentar de novo
      const cx = W / 2, cy = P(H * 34 / 100), r = g ? 30 : 15, vazio = G.err.length > 2, cor = vazio ? K.t2 : K.rd;
      circ(cx, cy, r, cor, g ? 4 : 2);
      if (vazio) bomba(cx - P(r * 4 / 10), cy - P(r / 2), r, cor, '#000');
      else { rr(cx - P(r / 10), cy - P(r * 55 / 100), P(r / 5) + 1, P(r * 65 / 100), 2, cor); circ(cx, cy + P(r * 45 / 100), P(r / 10) + 1, cor); }
      txt(P(H * 535 / 1000), G.err[0], fonte(g ? 'medium' : 'small'), fonte(g ? 'small' : 'tiny'), K.tx);
      tx(G.err[1], cx, P(H * 675 / 1000), xt, K.t2);
      const t = 'Tentar de novo', e = g ? 18 : 10, x = P((W - larg(t, xt) - e) / 2), y = P(H * 845 / 1000);
      circ(x + P(e / 3), y, P(e / 3), K.ac); tx(t, x + e, y, xt, K.ac, 'left');
    } else {   // carregando: bomba no centro; o anel da borda mostra o progresso
      const s = g ? 54 : 28;
      bomba(W / 2 - P(s * 45 / 100), P(H * 40 / 100) - s / 2, s, K.ac, G.busca === 2 ? K.am : '#000');
      txt(P(H * 60 / 100), G.busca === 2 ? 'Consultando preços' : 'Buscando GPS', fonte(g ? 'small' : 'tiny'), g ? fonte('tiny') : xt, K.tx);
      txt(P(H * 69 / 100), G.busca === 1 ? `${Math.floor((agora - G.ini) / 1000)} s · céu aberto ajuda` : 'pelo celular', xt, xt, K.t3);
    }
  }
  if (G.aviso) {   // confirmação: pílula verde com ✓ que cresce (150 ms), fica e some encolhendo (200 ms)
    if (agora > G.avisoAte) G.aviso = null;
    else { const q = G.avisoAte - agora; let k = 1600 - q; k = k < 150 ? k * 100 / 150 : 100; if (q < 200) k = q / 2;
      const f = g ? fonte('tiny') : xt, h = f.h + 6, w = larg(G.aviso, f) + h + 14, y = P(H * 80 / 100 - h / 2), wk = h + (w - h) * k / 100, x = (W - wk) / 2;
      rr(x - 6, y - 3, wk + 12, h + 6, h / 2 + 3, '#000'); rr(x, y, wk, h, h / 2, K.ac);
      if (k >= 90) { const cx = x + h / 2 + 3, cy = y + h / 2; c.beginPath(); c.moveTo(cx - h / 5, cy); c.lineTo(cx - h / 14, cy + h / 6); c.lineTo(cx + h / 4, cy - h / 5); c.strokeStyle = '#000'; c.lineWidth = h > 30 ? 4 : 2; c.lineCap = 'butt'; c.stroke();
        tx(G.aviso, x + h + 4, cy, f, '#000', 'left'); } }
  }
}
/* prévia da aba (fora do simulador): tela do FR165 (390 px, AMOLED) ou do FR55 (208 px, MIP) em tamanho real de pixels */
const GAS_FONTES = { fr165: { xtiny: 26, tiny: 30.1, small: 38.3, medium: 45.2, large: 52, numberMild: 75.3, peso: 400 }, fr55: { xtiny: 13, tiny: 15, small: 17, medium: 20, large: 20, numberMild: 20, peso: 700 } };
function gasPintar() {
  const cv = $('#gasCv'); if (!cv) return;
  const m = GAS.prev, lado = m === 'fr55' ? 208 : 390, F = GAS_FONTES[m], dpr = window.devicePixelRatio || 1, esc2 = (m === 'fr55' ? 360 / 208 : 360 / 390) * dpr;
  cv.width = 360 * dpr; cv.height = 360 * dpr;
  const c = cv.getContext('2d'); c.setTransform(esc2, 0, 0, esc2, 0, 0); c.imageSmoothingEnabled = m !== 'fr55';
  c.save(); c.beginPath(); c.arc(lado / 2, lado / 2, lado / 2, 0, 7); c.clip();
  gasDesenhar(c, lado, lado, m === 'fr55', n => ({ css: `${F.peso} ${F[n] || F.xtiny}px Roboto, Arial, sans-serif`, h: Math.round((F[n] || F.xtiny) * 1.17) }));
  c.restore();
}
async function renderGasolina() {
  GAS.tela = 'lista'; GAS.menu = -1;
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('gasolina')}
  <section class="w gas-w"><header class="w-top"><span class="w-ico gas-ico">${ICO.gasolina}</span><span class="w-tit">Gasolina Perto — o posto mais barato perto de você</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   <div class="chips"><button class="chip ${GAS.prev === 'fr165' ? 'ativo' : ''}" data-gasprev="fr165">Forerunner 165 (AMOLED)</button><button class="chip ${GAS.prev === 'fr55' ? 'ativo' : ''}" data-gasprev="fr55">Forerunner 55 (MIP)</button></div>
   <canvas id="gasCv" style="width:min(300px,80vw);height:auto;aspect-ratio:1;border-radius:50%;box-shadow:0 0 44px #2ed18a26;touch-action:pan-y;cursor:pointer"></canvas>
   <div class="chips"><button class="chip" data-gasbt="prev">▲ Cima</button><button class="chip" data-gasbt="start">● START</button><button class="chip" data-gasbt="next">▼ Baixo</button><button class="chip" data-gasbt="menu">☰ MENU</button><button class="chip" data-gasbt="back">↩ VOLTAR</button><button class="chip" id="gasGps">📍 Usar minha localização</button></div>
   <div class="mini" id="gasOrigem" style="text-align:center"></div>
   <div class="mini" style="text-align:center;max-width:560px">Mostra os <b>5 postos mais baratos perto de você</b> em Maceió e região, com <b>preço, distância e há quanto tempo o preço foi informado</b>. Ao abrir um posto, uma <b>seta aponta para ele</b> (pela bússola ou pelo rumo do GPS andando; parado, mostra a direção: N, NE, L…). Troque entre <b>gasolina comum, aditivada, álcool, diesel e GNV</b> no MENU — o relógio lembra a última escolha.<br>
   Os preços são <b>reais</b>, da SEFAZ-AL (programa Economiza Alagoas), atualizados de hora em hora em <a href="/gasolina/" target="_blank" rel="noopener">alequizao.com/gasolina</a>. Sem dado, o app diz que não tem — nada inventado.</div>
  </div></section>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="gasApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="gasModelo" list="gasModelos" value="Forerunner® 165 (fr165)" autocomplete="off" required><datalist id="gasModelos"></datalist></div>
   <div class="chips"><button class="btn" id="gasGera">⬇ Baixar o Gasolina Perto</button></div>
   <div class="mini" id="gasProg"></div></form>
   <div class="mini" style="margin-top:8px">Já compilados: <a href="app/GasolinaPerto-fr165.prg" download>Forerunner 165</a> · <a href="app/GasolinaPerto-fr165m.prg" download>Forerunner 165 Music</a> · <a href="app/GasolinaPerto-fr55.prg" download>Forerunner 55</a></div></div>
  <div class="card"><h3>Como usar no relógio</h3><div class="mini">Ao abrir, o <b>anel da borda vai enchendo</b>: primeiro o GPS, depois a consulta dos preços pelo celular. Chegou a lista, o relógio vibra e o anel vira o <b>indicador de posição</b> (à direita).<br><b>▲ ▼</b> (ou deslizar) andam entre os postos — o selecionado fica no cartão, com o <b>preço grande colorido</b> (verde = mais barato, âmbar = no meio, vermelho = mais caro do grupo); os vizinhos mostram só a <b>diferença</b> (ex.: +R$ 0,02). <b>START</b> (ou tocar no cartão) abre o posto com a <b>rosa-dos-ventos e a seta</b>; o anel verde em volta mostra quanto do caminho já foi feito e, a menos de 50 m, aparece <b>Você chegou</b> com vibração. Lá, ▲ ▼ passam para o próximo posto sem voltar.<br><b>MENU</b> (segurar UP) troca o combustível ou atualiza agora. No rodapé aparece <b>há quanto tempo</b> a lista foi consultada (e o raio, se precisou ampliar além de 5 km — vai até 40 km quando há poucos postos).<br>Sem GPS, sem celular ou sem postos, a tela diz o motivo e <b>START tenta de novo</b>.<br><b>Glance</b> (FR165): mostra o menor preço da última consulta e há quanto tempo. O FR55 não aceita glance em apps.</div></div>
  <div class="card"><h3>Como instalar pelo cabo USB</h3><div class="mini">1) Baixe o <b>.prg</b> do seu modelo acima.<br>2) Ligue o relógio no computador com o <b>cabo USB</b> e espere aparecer a unidade <b>GARMIN</b>.<br>3) Copie o arquivo para a pasta <b>GARMIN/APPS</b>.<br>4) Ejete e desconecte o cabo.<br>5) No relógio: <b>START</b> → <b>Aplicativos</b> (ou ▲▼ na lista de apps) → <b>Gasolina Perto</b>.<br><b>Permissões:</b> GPS (sua posição, usada só para calcular a distância — não é gravada), comunicação (consulta pelo celular pareado, que precisa estar com o Garmin Connect aberto em segundo plano) e sensores (bússola, se o relógio tiver).</div></div>
  ${tabbar('app')}</div>`;
  const pinta = () => gasPintar();
  document.querySelectorAll('[data-gasbt]').forEach(b => b.onclick = () => { gasBotao(b.dataset.gasbt); pinta(); });
  document.querySelectorAll('[data-gasprev]').forEach(b => b.onclick = () => { GAS.prev = b.dataset.gasprev; document.querySelectorAll('[data-gasprev]').forEach(x => x.classList.toggle('ativo', x === b)); pinta(); });
  const cv = $('#gasCv');
  cv.onclick = e => { const r = cv.getBoundingClientRect(); gasToque((e.clientY - r.top) / r.height * 100, 100); pinta(); };
  let y0 = null; cv.ontouchstart = e => { y0 = e.touches[0].clientY; };
  cv.ontouchend = e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) > 30) { e.preventDefault(); gasBotao(dy > 0 ? 'prev' : 'next'); } };
  const origem = () => { const o = $('#gasOrigem'); if (o) o.textContent = GAS.lat != null ? `Posição da prévia: ${GAS.origem}${GAS.origem === GAS_PADRAO.nome ? ' (ponto fixo — toque em "Usar minha localização")' : ''}` : ''; };
  $('#gasGps').onclick = async () => { GAS.origem = ''; await gasBuscar(true); origem(); };
  pinta(); gasBuscar().then(origem);
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#gasModelos') && ($('#gasModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join('')); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(x => n(x) === q)); };
  $('#gasApp').onsubmit = e => e.preventDefault();
  $('#gasGera').onclick = async e => {
    e.preventDefault(); const m = achar($('#gasModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bt = $('#gasGera'); bt.disabled = true; $('#gasProg').textContent = '⚙️ Compilando (cerca de 30 s)…';
    try {
      const a = await api('gasolina_app', { modelo: m.id });
      const esperar = async (k = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#gasProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS pelo cabo USB. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bt.disabled = false; return; }
        if (s.status === 'erro' || k > 90) { $('#gasProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); bt.disabled = false; return; }
        setTimeout(() => esperar(k + 1), 2000); };
      esperar();
    } catch (x) { $('#gasProg').textContent = '❌ ' + x.message; bt.disabled = false; }
  };
}

/* ================= app "Próximo Ônibus" (réplica em canvas do OnibusApp.mc/Tela.mc + favoritos + gerar o app do relógio) =================
 * Próximo Ônibus · Desenvolvido por Alequizao <alequizao.dev@gmail.com>
 * Mesmas telas, cores e teclas do app do relógio, com dados reais de /agendamentos/relogio_onibus.php
 * (ao vivo = GPS dos ônibus pelo CittaMobi; programado = tabela de hoje da parada). Favoritos: os do painel
 * (os mesmos que o app gerado aqui sincroniza) + os salvos no "Perto de mim" do simulador (ficam só neste navegador). */
const ONI_API = '/agendamentos/relogio_onibus.php';
const ONI_PADRAO = { lat: -9.6670, lon: -35.7160, nome: 'Maceió (Pajuçara)' };
const ONI = { f: [], d: null, t: 0, sel: 0, modo: 0, menu: 0, busca: 0, err: null, p: null, psel: 0, al: false, alOk: 0, faixa: 0,
  aviso: null, avisoAte: 0, lat: null, lon: null, origem: '', ini: 0, timer: null, timerP: 0, seg: 0, rit: 0, sl: -9999, sd: 1, prev: 'fr165', min: -1, pedido: '', carregado: false, painel: [] };
try { ONI.al = localStorage.getItem('oni_al') === '1'; } catch (e) { }
/* tokens da paleta premium (iguais ao cores() do OnibusApp.mc): um amarelo de destaque, azul frio, cinzas em níveis */
const ONI_COR = {
  amoled: { am: '#f2c14e', amE: '#4a3b17', az: '#8db3e2', tx: '#ffffff', c2: '#a3a9b2', c3: '#5f666f', c4: '#1b1e23', tri: '#2a2e35', ok: '#5bd68a', err: '#ff6b5e', lin: ['#f2c14e', '#6ccfa8', '#9aa8f5', '#f09a7a'] },
  mip: { am: '#ffff00', amE: '#555500', az: '#55aaff', tx: '#ffffff', c2: '#aaaaaa', c3: '#aaaaaa', c4: '#000055', tri: '#555555', ok: '#55ff55', err: '#ff5555', lin: ['#ffff00', '#55ffaa', '#55aaff', '#ffaa55'] } };
const ONI_FONTES = { fr165: { xtiny: 26, tiny: 30.1, small: 38.3, medium: 45.2, large: 52, numberMedium: 93.1, numberHot: 112.3, peso: 400 },
  fr55: { xtiny: 13, tiny: 15, small: 17, medium: 20, large: 20, numberMedium: 44, numberHot: 50, peso: 700 } };
const oniAgora = () => Math.floor(Date.now() / 1000);
const oniHa = t => { const d = oniAgora() - t; return d < 60 ? 'agora' : d < 3600 ? `há ${Math.floor(d / 60)} min` : d < 86400 ? `há ${Math.floor(d / 3600)} h` : `há ${Math.floor(d / 86400)} d`; };
const oniMin = e => { const d = e - oniAgora(); return d <= 0 ? 0 : Math.floor(d / 60); };
const oniHora = e => new Date(e * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Maceio' });
const oniFuturas = ch => ch.filter(e => e > oniAgora() - 60);
const oniM = m => m < 1000 ? `${m} m` : `${(Math.floor(m / 100) / 10).toFixed(1).replace('.', ',')} km`;
const oniIdx = (l, id, stop) => l.findIndex(x => x[0] === id && x[1] === stop);
function oniItensMenu() {   // [ícone, texto] — igual ao itensMenu() do Tela.mc
  const m = [[0, 'Atualizar'], [1, 'Perto de mim'], [2, 'Alerta 2 min']];
  if (ONI.f.length && ONI.sel > 0) m.push([3, 'Tornar principal']);
  if (ONI.f.length) m.push([4, 'Remover']);
  m.push([5, 'Sincronizar']);
  return m;
}
const oniCorLinha = cod => { cod = String(cod); const d = cod.length >= 3 ? cod.charCodeAt(cod.length - 3) - 48 : 0; return ONI_COR.amoled.lin[d >= 0 && d <= 9 ? d % 4 : 0]; };   // selo por grupo (centena % 4), igual a corLinha() do .mc
function oniJanela(n) { const k = Math.min(n, 4); let tp = ONI.menu - 1; if (tp > n - k) tp = n - k; if (tp < 0) tp = 0; return [k, tp]; }   // até 5 itens, bloco centrado
function oniErroRede(st) { return !st ? ['Sem internet', 'O celular não\nrespondeu a tempo'] : st === 400 ? ['Sem linha/ponto', 'Favorito inválido:\nremova no MENU'] : st >= 500 ? ['Fonte fora', `Horários indisponíveis\nagora (${st})`] : [`Falhou (${st})`, 'Tente de novo']; }
function oniAviso(t) { ONI.aviso = t; ONI.avisoAte = Date.now() + 1600; oniPintarTudo(); }
function oniVibrar(forte) { try { navigator.vibrate?.(forte ? [500, 250, 500, 250, 700] : 60); } catch (e) { }
  const cv = SIM.canvas && SIM.app === 'onibus' ? SIM.canvas : $('#oniCv'); if (cv) { cv.classList.add('sim-vibra'); setTimeout(() => cv.classList.remove('sim-vibra'), forte ? 1500 : 250); } }
/* favoritos: painel (origem 1) + os salvos no simulador (origem 0, localStorage) — igual ao aoSync do relógio */
function oniLocais() { try { return JSON.parse(localStorage.getItem('oni_f') || '[]').filter(x => Array.isArray(x) && x.length >= 6); } catch (e) { return []; } }
function oniGuardarLocais() { try { localStorage.setItem('oni_f', JSON.stringify(ONI.f.filter(x => x[5] !== 1))); } catch (e) { } }
async function oniSincronizar() {
  let painel = ONI.painel;
  try { const j = await api('onibus_favs_ler'); painel = j.favs || []; ONI.painel = painel; } catch (e) { }
  let ox = []; try { ox = JSON.parse(localStorage.getItem('oni_x') || '[]'); } catch (e) { }   // do painel, mas removidos no "relógio"
  const n = painel.filter(x => !ox.includes(`${x.id}.${x.stop}`)).slice(0, 4).map(x => [x.id, x.stop, x.cod, x.destino, x.ponto, 1]);
  for (const x of oniLocais()) if (n.length < 4 && oniIdx(n, x[0], x[1]) < 0) n.push(x);
  const mudou = n.length !== ONI.f.length || n.some(x => oniIdx(ONI.f, x[0], x[1]) < 0);   // mesma lista em outra ordem: mantém a ordem
  if (mudou) { ONI.f = n; ONI.d = null; ONI.sel = 0; }
  ONI.carregado = true;
}
async function oniAtualizar(sync) {
  ONI.err = null;
  if (ONI.busca === 2) return;
  if (sync || !ONI.carregado) { ONI.busca = 2; oniAnimar(); await oniSincronizar(); }
  if (!ONI.f.length) { ONI.busca = 0; return oniPintarTudo(); }
  ONI.busca = 2; oniAnimar();
  const s = ONI.f.map(x => `${x[0]}.${x[1]}`).join(','); ONI.pedido = s;
  let st = 0, j = null;
  try { const r = await fetch(`${ONI_API}?a=prox&f=${encodeURIComponent(s)}`, { cache: 'no-store' }); st = r.status; if (r.ok) j = await r.json(); } catch (e) { st = 0; }
  await new Promise(r => setTimeout(r, 350));            // deixa ver o "Consultando horários..." (no relógio passa pelo celular)
  ONI.busca = 0;
  if (ONI.f.map(x => `${x[0]}.${x[1]}`).join(',') !== s) return oniAtualizar();   // favoritos mudaram no meio
  if (j && Array.isArray(j.f) && j.f.length === ONI.f.length) {
    const agora = oniAgora();
    j.f.forEach((it, i) => { it[4] = it[4].map(sg => agora + sg); if (it[3] >= 0) { ONI.f[i][2] = it[0]; ONI.f[i][3] = it[1]; ONI.f[i][4] = it[2]; } });
    ONI.d = j.f; ONI.t = agora; oniVibrar(false);
  } else ONI.err = oniErroRede(st);
  oniPintarTudo();
}
async function oniPosicao(pedir) {
  let ok = false;
  try { if (!pedir && navigator.permissions) ok = (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'; } catch (e) { }
  if (pedir || ok) {
    const pos = await new Promise(res => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => res(p), () => res(null), { timeout: 8000, maximumAge: 120000 }) : res(null));
    if (pos) { ONI.lat = pos.coords.latitude; ONI.lon = pos.coords.longitude; ONI.origem = 'seu GPS'; return; }
    if (pedir) toast('Localização negada — usando Maceió');
  }
  if (ONI.lat == null || ONI.origem !== 'seu GPS') { ONI.lat = ONI_PADRAO.lat; ONI.lon = ONI_PADRAO.lon; ONI.origem = ONI_PADRAO.nome; }
}
async function oniPerto(pedirGps) {
  if (ONI.busca === 2) return;
  ONI.err = null; ONI.p = null; ONI.psel = 0; ONI.busca = 1; ONI.ini = Date.now(); oniAnimar();
  await oniPosicao(pedirGps);
  await new Promise(r => setTimeout(r, 600));
  ONI.busca = 2; oniAnimar();
  let st = 0, j = null;
  try { const r = await fetch(`${ONI_API}?a=perto&lat=${ONI.lat.toFixed(5)}&lon=${ONI.lon.toFixed(5)}`, { cache: 'no-store' }); st = r.status; if (r.ok) j = await r.json(); } catch (e) { st = 0; }
  await new Promise(r => setTimeout(r, 300));
  ONI.busca = 0;
  if (j && Array.isArray(j.p)) {
    const l = []; j.p.forEach(p => p[2].forEach(x => { if (l.length < 16) l.push([x[0], x[1], x[2], x[3], p[0], p[1]]); }));
    ONI.p = l; ONI.psel = 0;
    if (!l.length) ONI.err = ['Nada perto', 'Nenhum ponto a 1,5 km\ncom local conhecido']; else oniVibrar(false);
  } else ONI.err = oniErroRede(st);
  oniPintarTudo();
}
/* ritmo de redesenho igual ao Tela.mc: a tela pede (ONI.rit) 0 = 1 por minuto · 1 = 1 por segundo · 2 = 250 ms · 3 = 50 ms (animação);
 * a cada ~1 s: alerta 2 min, atualização automática e virada do minuto */
function oniRitmo() { const p = ONI.rit >= 3 ? 50 : ONI.rit === 2 ? 250 : 1000; if (ONI.timer && ONI.timerP === p) return; clearInterval(ONI.timer); ONI.timerP = p; ONI.timer = setInterval(oniTique, p); }
function oniTique() {
  const vivo = $('#oniCv') || (SIM.canvas && SIM.app === 'onibus' && $('#simCanvas'));
  if (!vivo) { clearInterval(ONI.timer); ONI.timer = null; return; }
  const t = Date.now(); let pede = ONI.rit >= 2;
  if (t - ONI.seg >= 900) { ONI.seg = t; oniAlerta(); oniAuto(); const m = Math.floor(t / 60000); if (m !== ONI.min || ONI.rit === 1) { ONI.min = m; pede = true; } }
  if (pede) oniPintarTudo();
}
function oniAnimar() { oniPintarTudo(); if (!ONI.timer) oniRitmo(); }
function oniAlerta() {
  if (!ONI.al || !ONI.d || ONI.sel >= ONI.d.length) return;
  const ch = oniFuturas(ONI.d[ONI.sel][4]); if (!ch.length) return;
  const d = ch[0] - oniAgora();
  if (d <= 120 && d > -30 && ONI.alOk !== ch[0]) { ONI.alOk = ch[0]; ONI.faixa = Date.now() + 8000; oniVibrar(true); oniPintarTudo(); }
}
function oniAuto() {
  if (ONI.modo !== 0 || ONI.busca || ONI.err || !ONI.d || !ONI.f.length || ONI.sel >= ONI.d.length) return;
  const idade = oniAgora() - ONI.t;
  if (idade > 300 || (idade > 60 && ONI.d[ONI.sel][3] > 0 && !oniFuturas(ONI.d[ONI.sel][4]).length)) oniAtualizar();
}
function oniPintarTudo() { if ($('#oniCv')) oniPintar(); if (SIM.canvas && SIM.app === 'onibus' && $('#simCanvas')) simDesenhar(); }
/* teclas: as mesmas do TelaDelegate */
function oniBotao(t) {
  const O = ONI;
  if (t === 'back') { if (O.modo !== 0) { O.modo = 0; O.p = null; O.err = null; if (O.busca === 1) O.busca = 0; } return oniPintarTudo(); }
  if (t === 'next' || t === 'prev') {
    const d = t === 'next' ? 1 : -1;
    if (O.modo === 1) { const n = oniItensMenu().length; O.menu = (O.menu + d + n) % n; }
    else if (O.modo === 2) { if (O.p?.length) O.psel = (O.psel + d + O.p.length) % O.p.length; }
    else if (O.f.length > 1) { O.sel = (O.sel + d + O.f.length) % O.f.length; O.alOk = 0; O.sl = Date.now(); O.sd = d; }
    return oniPintarTudo();
  }
  if (t === 'menu') { if (O.modo === 0) { O.modo = 1; O.menu = 0; } return oniPintarTudo(); }
  // start
  if (O.modo === 1) return oniEscolher();
  if (O.modo === 2) { if (O.p?.length) oniSalvar(); else if (!O.busca) oniPerto(); return oniPintarTudo(); }
  if (!O.f.length) { O.modo = 2; oniPerto(); return; }
  if (O.err && !O.busca) { O.err = null; oniAtualizar(); return; }
  O.modo = 1; O.menu = 0; oniPintarTudo();
}
function oniToque(y, H) {   // onTap do relógio (FR165)
  const O = ONI;
  if (O.modo === 1) { const [k, tp] = oniJanela(oniItensMenu().length), hR = Math.trunc(H * 14 / 100), yT = Math.trunc(H / 2 - Math.trunc(k * hR / 2));
    if (y < yT) return; const i = Math.floor((y - yT) / hR); if (i < k) { O.menu = tp + i; oniEscolher(); } return; }
  if ((O.modo === 2 && O.p?.length > 1) || (O.modo === 0 && O.f.length > 1 && O.d)) { if (y < H * 0.30) return oniBotao('prev'); if (y > H * 0.70) return oniBotao('next'); }
  oniBotao('start');
}
function oniEscolher() {
  const O = ONI, m = oniItensMenu(); if (O.menu >= m.length) O.menu = 0;
  const c = m[O.menu][0]; O.modo = 0;
  const mover = (l, i) => [l[i], ...l.slice(0, i), ...l.slice(i + 1)];
  if (c === 0) { oniAviso('Atualizando'); oniVibrar(false); O.err = null; oniAtualizar(); }
  else if (c === 1) { O.modo = 2; oniPerto(); }
  else if (c === 2) { O.al = !O.al; O.alOk = 0; O.modo = 1; try { localStorage.setItem('oni_al', O.al ? '1' : '0'); } catch (e) { } oniVibrar(false); }   // a própria chave confirma
  else if (c === 3) { O.f = mover(O.f, O.sel); if (O.d && O.sel < O.d.length) O.d = mover(O.d, O.sel); O.sel = 0; oniGuardarLocais(); oniAviso('Principal'); oniVibrar(false); }
  else if (c === 4) {
    const rem = O.f[O.sel];
    O.f = O.f.filter((x, i) => i !== O.sel); if (O.d) O.d = O.d.filter((x, i) => i !== O.sel); if (O.sel >= O.f.length) O.sel = 0; oniGuardarLocais();
    if (rem && rem[5] === 1) { try { const ox = JSON.parse(localStorage.getItem('oni_x') || '[]'); ox.push(`${rem[0]}.${rem[1]}`); localStorage.setItem('oni_x', JSON.stringify(ox.slice(-8))); } catch (e) { } }
    oniAviso('Removido'); oniVibrar(false);
  } else if (c === 5) { oniAviso('Sincronizando'); oniAtualizar(true); }
  oniPintarTudo();
}
function oniSalvar() {
  const O = ONI, p = O.p[O.psel], i = oniIdx(O.f, p[0], p[1]);
  if (i >= 0) { O.sel = i; O.modo = 0; O.p = null; return oniAviso('Já é favorito'); }
  if (O.f.length >= 4) { oniAviso('Máx. 4: remova um'); return oniVibrar(false); }
  O.f.push([p[0], p[1], p[2], p[3], p[4], 0]); if (O.d) O.d.push([p[2], p[3], p[4], 0, [], 'consultando...']);
  O.sel = O.f.length - 1; oniGuardarLocais(); O.modo = 0; O.p = null;
  oniAviso('Favorito salvo'); oniVibrar(false); oniAtualizar();
}
/* ---- desenho (réplica do onUpdate de Tela.mc + desenho comum do OnibusApp.mc; contas inteiras como no relógio) ---- */
function oniDesenhar(c, W, H, mip, fonte) {
  const K = ONI_COR[mip ? 'mip' : 'amoled'], O = ONI, g = W > 260, t = Date.now(), I = Math.trunc, P = g ? 8 : 5, fx = fonte('xtiny');
  const rit = v => { if (v > O.rit) O.rit = v; };
  O.rit = 0;
  const fh = f => f.h - 4;   // ≈ dc.getFontHeight do relógio
  const txt = (tx, x, y, f, cor, al = 'center') => { c.font = f.css; c.fillStyle = cor; c.textAlign = al; c.textBaseline = 'middle';
    const ls = String(tx).split('\n'), lh = f.h; ls.forEach((l, i) => c.fillText(l, x, y + (i - (ls.length - 1) / 2) * lh)); };
  const larg = (tx, f) => { c.font = f.css; return c.measureText(tx).width; };
  const rr = (x, y, w, h, r, cor, borda, pen) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (cor) { c.fillStyle = cor; c.fill(); } if (borda) { c.strokeStyle = borda; c.lineWidth = pen; c.stroke(); } };
  const circ = (x, y, r, cor, pen) => { c.beginPath(); c.arc(x, y, Math.max(r, 0.5), 0, 7); if (pen) { c.strokeStyle = cor; c.lineWidth = pen; c.stroke(); } else { c.fillStyle = cor; c.fill(); } };
  const arco = (cx, cy, r, gi, gf, cor, pen) => { c.beginPath(); c.arc(cx, cy, r, -gi * Math.PI / 180, -gf * Math.PI / 180, true); c.strokeStyle = cor; c.lineWidth = pen; c.stroke(); };
  const poli = (pts, cor) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = cor; c.fill(); };
  const ret = (x, y, w, h, cor) => { c.fillStyle = cor; c.fillRect(x, y, w, h); };
  const cabe = (s, f, max) => { s = String(s); while (larg(s, f) > max && s.length > 4) s = s.slice(0, -2).replace(/[ .-]+$/, '') + '.'; return s; };
  const corLinha = cod => { const n = cod.length, d = n >= 3 ? cod.charCodeAt(n - 3) - 48 : 0; return K.lin[d >= 0 && d <= 9 ? d % 4 : 0]; };
  const onibus = (x, y, s, cor, vidro) => { const w = I(s * 8 / 10), r = I(s / 6) + 1;
    rr(x, y, w, I(s * 9 / 10), r, cor); ret(x - I(s / 12), y + I(s / 5), I(s / 12) + 1, I(s / 6), cor); ret(x + w, y + I(s / 5), I(s / 12) + 1, I(s / 6), cor);
    rr(x + I(s / 10), y + I(s / 5), w - I(s / 5), I(s * 3 / 10), I(r / 2) + 1, vidro); ret(x + I(s / 6), y + I(s / 14), w - I(s / 3), I(s / 12) + 1, vidro);
    circ(x + I(s / 5), y + I(s * 65 / 100), I(s / 14) + 1, vidro); circ(x + w - I(s / 5), y + I(s * 65 / 100), I(s / 14) + 1, vidro);
    ret(x + I(s / 10), y + I(s * 9 / 10) - 1, I(s / 6), I(s / 10) + 1, vidro); ret(x + w - I(s / 10) - I(s / 6), y + I(s * 9 / 10) - 1, I(s / 6), I(s / 10) + 1, vidro); };
  // anel do bezel: trilha + arco do topo (f = 0..1000) com pontas redondas
  const anel = (f, cor, pen) => { const cc = W / 2, r = cc - I(pen / 2) - 1; circ(cc, cc, r, K.tri, pen);
    if (f <= 0) return; if (f >= 1000) return circ(cc, cc, r, cor, pen);
    const a = 90 - I(f * 360 / 1000), ra = a * Math.PI / 180; arco(cc, cc, r, a, 90, cor, pen);
    circ(cc, cc - r, I(pen / 2), cor); circ(cc + I(r * Math.cos(ra)), cc - I(r * Math.sin(ra)), I(pen / 2), cor); };
  const giro = () => { const cc = W / 2, a = 90 - I(t / 3) % 360; rit(3); arco(cc, cc, cc - I(P / 2) - 1, a - 60, a, K.az, P); };
  // ícones vetoriais: 0 atualizar · 1 local · 2 sino · 3 estrela · 4 lixeira · 5 sincronizar
  const icone = (k, x, y, s, cor) => {
    const p = s > 8 ? 3 : 2, tt = I(s * 4 / 10) + 1, r = I(s * 7 / 10);
    if (k === 0) { arco(x, y, r, 90, 360, cor, p); poli([[x, y - r - tt], [x + tt + I(tt / 2), y - r], [x, y - r + tt]], cor); }
    else if (k === 1) { circ(x, y - I(s / 4), I(s * 6 / 10), cor); poli([[x - I(s / 2), y - I(s / 8)], [x + I(s / 2), y - I(s / 8)], [x, y + s]], cor); circ(x, y - I(s / 4), I(s / 4), '#000'); }
    else if (k === 2) { circ(x, y - I(s / 5), I(s * 6 / 10), cor); ret(x - I(s * 6 / 10), y - I(s / 5), I(s * 12 / 10) + 1, I(s * 6 / 10), cor); ret(x - I(s * 9 / 10), y + I(s * 4 / 10), I(s * 18 / 10) + 1, p, cor); circ(x, y + I(s * 8 / 10), p, cor); }
    else if (k === 3) { const v = [0, -10, 2, -3, 10, -3, 4, 1, 6, 8, 0, 4, -6, 8, -4, 1, -10, -3, -2, -3], q = []; for (let i = 0; i < 20; i += 2) q.push([x + I(v[i] * s / 10), y + I(v[i + 1] * s / 10)]); poli(q, cor); }
    else if (k === 4) { ret(x - I(s * 8 / 10), y - I(s * 6 / 10), I(s * 16 / 10) + 1, p, cor); ret(x - I(s / 4), y - I(s * 6 / 10) - p, I(s / 2) + 1, p, cor); ret(x - I(s * 6 / 10), y - I(s * 3 / 10), I(s * 12 / 10) + 1, I(s * 12 / 10), cor);
      ret(x - I(s / 4), y - I(s / 10), p - 1, I(s * 7 / 10), '#000'); ret(x + I(s / 4) - 1, y - I(s / 10), p - 1, I(s * 7 / 10), '#000'); }
    else { arco(x, y, r, 20, 160, cor, p); arco(x, y, r, 200, 340, cor, p); const xl = x - I(r * 94 / 100), yl = y - I(r * 34 / 100), xr = x + I(r * 94 / 100), yr = y + I(r * 34 / 100);
      poli([[xl - tt, yl], [xl + tt, yl], [xl, yl + tt + I(tt / 2)]], cor); poli([[xr - tt, yr], [xr + tt, yr], [xr, yr - tt - I(tt / 2)]], cor); }
  };
  const chave = (x, y, s, on) => { const w = s * 4, r = s + 1;
    if (on) { rr(x - w, y - r, w, 2 * r, r, K.am); circ(x - r, y, r - 3, '#000'); } else { rr(x - w, y - r, w, 2 * r, r, null, K.c3, 2); circ(x - w + r, y, r - 4, K.c3); } };
  const pilula = (cx, y, s, f, cor, cheio) => { const h = fh(f) + 4, w = I(larg(s, f)) + h;
    if (cheio) { rr(cx - I(w / 2), y - I(h / 2), w, h, I(h / 2), cor); txt(s, cx, y, f, '#000'); } else { rr(cx - I(w / 2), y - I(h / 2), w, h, I(h / 2), null, cor, 2); txt(s, cx, y, f, cor); } };
  const titulo = (s, ic) => { const f = fx, sz = g ? 11 : 6, y = I(H * 13 / 100), e = g ? 8 : 4, x = I((W - larg(s, f) - 2 * sz - e) / 2);
    if (ic < 0) onibus(x + I(sz / 5), y - sz, 2 * sz, K.am, '#000'); else icone(ic, x + sz, y, sz, K.az);
    txt(s, x + 2 * sz + e, y, f, K.c2, 'left'); };
  const selo = (cx, y, cod, dest, f, max) => { const pad = g ? 9 : 4, hS = fh(f) + (g ? 0 : 1), e = g ? 10 : 5, wc = I(larg(cod, f)) + 2 * pad;
    dest = cabe(dest, f, max - wc - e); const x = cx - I((wc + e + larg(dest, f)) / 2);
    rr(x, y - I(hS / 2), wc, hS, g ? 8 : 4, corLinha(cod)); txt(cod, x + I(wc / 2), y, f, '#000'); txt(dest, x + wc + e, y, f, K.tx, 'left'); };
  const carregando = (t1, t2) => {
    const cx = W / 2, s = I(W * 20 / 100), yE = I(H * 50 / 100), x0 = I(W * 22 / 100), x1 = W - x0, pas = g ? 28 : 14;
    giro(); ret(x0, yE, x1 - x0, g ? 3 : 2, K.tri);
    const off = I(t / 20) % pas;
    for (let x = x0 - off; x < x1; x += pas) { const a = Math.max(x, x0), b = Math.min(x + I(pas / 2), x1); if (b > a) ret(a, yE + (g ? 8 : 5), b - a, g ? 2 : 1, K.c3); }
    const pulo = I(t / 150) % 2 ? (g ? 2 : 1) : 0;
    onibus(cx - I(s * 4 / 10), yE - s - pulo, s, K.am, '#000');
    txt(t1, cx, I(H * 66 / 100), fonte(g ? 'tiny' : 'xtiny'), K.tx);
    txt(O.busca === 1 ? `${I((t - O.ini) / 1000)} s · céu aberto ajuda` : t2, cx, I(H * 76 / 100), fx, K.c2);
  };
  const erro = () => {
    const cx = W / 2, cy = I(H * 34 / 100), r = g ? 28 : 14;
    circ(cx, cy, r, K.err, g ? 4 : 2); rr(cx - (g ? 3 : 1), cy - I(r / 2), g ? 6 : 3, I(r * 6 / 10), g ? 3 : 1, K.err); circ(cx, cy + I(r * 45 / 100), g ? 4 : 2, K.err);
    txt(O.err[0], cx, I(H * 52 / 100), fonte(g ? 'small' : 'tiny'), K.tx);
    txt(O.err[1], cx, I(H * 65 / 100), fx, K.c2);
    pilula(cx, I(H * 80 / 100), 'Tentar de novo', fx, K.am, false);
  };
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);

  if (O.modo === 1) {   // menu: lista centrada, ícones, chave do alerta
    anel(0, 0, P);
    const m = oniItensMenu(), n = m.length; if (O.menu >= n) O.menu = 0;
    const [k, tp] = oniJanela(n), hR = I(H * 14 / 100), yT = I(H / 2 - I(k * hR / 2)), f = fonte(g ? 'tiny' : 'xtiny'), s = g ? 11 : 6;
    if (yT >= I(H * 20 / 100)) txt('Opções', W / 2, yT - I(hR / 2), fx, K.c3);
    for (let i = 0; i < k; i++) {
      const q = tp + i, y = yT + i * hR + I(hR / 2), sel = q === O.menu, cd = m[q][0], x0 = I(W * 12 / 100), xi = x0 + (g ? 30 : 15), xt = xi + s + (g ? 14 : 7);
      if (sel) rr(x0, y - I(hR / 2) + 3, W - 2 * x0, hR - 6, I((hR - 6) / 2), K.c4);
      icone(cd, xi, y, s, sel ? K.am : K.c3);
      txt(m[q][1], xt, y, f, sel ? K.tx : K.c2, 'left');
      if (cd === 2) chave(W - x0 - (g ? 12 : 6), y, s, O.al);
    }
    if (tp > 0) rr(W / 2 - 8, yT - 4, 16, 3, 1, K.c3);
    if (tp + k < n) rr(W / 2 - 8, yT + k * hR + 2, 16, 3, 1, K.c3);
  } else if (O.modo === 2) {   // perto de mim
    anel(0, 0, P); if (O.busca) giro();
    titulo('Perto de mim', 1);
    if (!O.p?.length) { if (O.err && !O.busca) erro(); else carregando(O.busca === 1 ? 'Buscando GPS' : 'Procurando pontos', 'pelo celular'); }
    else {
      const n = O.p.length; if (O.psel >= n) O.psel = 0;
      if (O.psel > 0) { const v = O.p[O.psel - 1]; txt(cabe(`${v[2]}  ${v[3]}`, fx, I(W * 60 / 100)), W / 2, I(H * 23 / 100), fx, K.c3); }
      if (O.psel < n - 1) { const v = O.p[O.psel + 1]; txt(cabe(`${v[2]}  ${v[3]}`, fx, I(W * 66 / 100)), W / 2, I(H * 79 / 100), fx, K.c3); }
      const x0 = I(W * 8 / 100), yC = I(H * 30 / 100), wC = W - 2 * x0, hC = I(H * 41 / 100), p = O.p[O.psel], ja = oniIdx(O.f, p[0], p[1]) >= 0;
      rr(x0, yC, wC, hC, g ? 22 : 11, K.c4);
      selo(W / 2, yC + I(hC * 20 / 100), String(p[2]), p[3], fonte(g ? 'tiny' : 'xtiny'), I(W * 74 / 100));
      txt(cabe(p[4], fx, I(W * 76 / 100)), W / 2, yC + I(hC * 42 / 100), fx, K.c2);
      txt(oniM(p[5]) + ' de você', W / 2, yC + I(hC * 61 / 100), fx, K.az);
      pilula(W / 2, yC + I(hC * 82 / 100), ja ? 'já é favorito' : 'START · salvar', fx, ja ? K.ok : K.am, !ja);
      txt(`${O.psel + 1} de ${n}`, W / 2, I(H * 89 / 100), fx, K.c3);
    }
  } else if (O.f.length && O.d && O.sel < O.d.length) {   // principal
    const n = O.d.length, it = O.d[O.sel], ch = oniFuturas(it[4]), fonteDado = it[3], pu = I(t / 500) % 2 === 0;
    let cheg = t < O.faixa, rem = -1, f = 0, cor = K.am, pen = P;
    if (fonteDado > 0 && ch.length) { rem = ch[0] - oniAgora(); if (rem < 60) cheg = true; if (rem > 900) { f = 1000; cor = K.amE; } else { f = I(rem * 1000 / 900); rit(1); } }
    if (cheg || (rem >= 0 && rem <= 120)) { rit(2); if (pu) pen = P + (g ? 4 : 2); }
    if (cheg) { f = 1000; cor = K.am; }
    anel(f, cor, pen); if (O.busca) giro();
    const e = t - O.sl; let cx = W / 2;
    if (e < 240) { const k = 240 - e; cx += I(I(I(O.sd * I(W / 3) * k / 240) * k) / 240); rit(3); }
    selo(cx, I(H * 19 / 100), String(it[0]), it[1], fonte(g ? 'tiny' : 'xtiny'), I(W * 72 / 100));
    txt(cabe(it[2], fx, I(W * 74 / 100)), cx, I(H * 28 / 100), fx, K.c2);
    if (cheg) { txt('CHEGANDO', cx, I(H * 49 / 100), fonte(g ? 'medium' : 'small'), K.am); txt('vá para o ponto', cx, I(H * 59 / 100), fx, K.c2); }
    else if (fonteDado <= 0 || !ch.length) {
      txt(fonteDado < 0 ? 'Sem linha/ponto' : 'Sem previsão', cx, I(H * 49 / 100), fonte(g ? 'small' : 'tiny'), fonteDado < 0 ? K.err : K.tx);
      txt(fonteDado > 0 ? 'os previstos já passaram' : it[5], cx, I(H * 59 / 100), fx, K.c3);
    } else {   // até 59 min: "12 min" enorme; mais longe: "14:32"
      const m = I(rem / 60), y = I(H * 55 / 100);
      txt(m < 60 ? 'chega em' : 'chega às', cx, I(H * 35 / 100), fx, K.c3);
      const fn = fonte(m < 60 ? 'numberHot' : 'numberMedium'), fm = fonte(g ? 'small' : 'tiny'), sn = m < 60 ? String(m) : oniHora(ch[0]), wn = I(larg(sn, fn)), wm = m < 60 ? I(larg(' min', fm)) : 0, x = cx - I((wn + wm) / 2);
      txt(sn, x, y, fn, K.am, 'left'); if (m < 60) txt(' min', x + wn, y + I(fn.h / 5), fm, K.c2, 'left');
    }
    if (fonteDado > 0 && ch.length) {   // próximos horários em chips
      const sc = ch.slice(0, 3).map(oniHora), hc = fh(fx) + (g ? 4 : 2), pc = g ? 12 : 5, ec = g ? 8 : 4;
      let wt = -ec; sc.forEach(s => wt += I(larg(s, fx)) + 2 * pc + ec);
      let xc = cx - I(wt / 2); const yc = I(H * 73 / 100);
      sc.forEach((s, k) => { const wc = I(larg(s, fx)) + 2 * pc; rr(xc, yc - I(hc / 2), wc, hc, I(hc / 2), K.c4); txt(s, xc + I(wc / 2), yc, fx, k === 0 ? K.tx : K.c2); xc += wc + ec; });
    }
    let rod = 'atualizado ' + oniHa(O.t), cp = null; const rp = g ? 5 : 3;
    if (fonteDado === 1) { rod = 'ao vivo · ' + oniHa(O.t); cp = K.ok; } else if (fonteDado === 2) { rod = 'programado · ' + oniHa(O.t); cp = K.az; }
    if (O.busca === 2) { rod = 'atualizando'; cp = K.az; } else if (O.err) { rod = O.err[0] + ' · ' + oniHa(O.t); cp = K.err; }
    const yr = I(H * 83 / 100), wr = I(larg(rod, fx)); let xr = W / 2 - I((wr + 2 * rp + (g ? 8 : 4)) / 2);
    if (!cp) xr = W / 2 - I(wr / 2);
    else {
      if (fonteDado === 2 && !O.busca && !O.err) circ(xr + rp, yr, rp - 1, cp, 2); else circ(xr + rp, yr, rp, cp);
      if (fonteDado === 1 && !O.busca && !O.err) { rit(1); if (I(t / 1000) % 2 === 0) circ(xr + rp, yr, rp + (g ? 4 : 2), cp, 1); }
      xr += 2 * rp + (g ? 8 : 4);
    }
    txt(rod, xr, yr, fx, K.c2, 'left');
    const yb = I(H * 91 / 100);
    if (O.al) { const b = g ? 9 : 5, xb = W / 2 - I((larg('2 min', fx) + 2 * b + 4) / 2) + b; icone(2, xb, yb, b, K.am); txt('2 min', xb + b + 4, yb, fx, K.c2, 'left'); }
    else if (n === 1) txt('START · opções', W / 2, yb, fx, K.c3);
    if (n > 1) { const r = g ? 4 : 2, ps = g ? 16 : 9, xd = W - P - (g ? 18 : 10);
      for (let k = 0; k < n; k++) { const yd = H / 2 + I((k * 2 - (n - 1)) * ps / 2); if (k === O.sel) rr(xd - r, yd - 2 * r, 2 * r, 4 * r, r, K.am); else circ(xd, yd, r - 1, K.c3); } }
  } else {   // sem dados: vazio, erro ou consultando
    anel(0, 0, P);
    titulo(g ? 'Próximo Ônibus' : 'Próx. Ônibus', -1);
    if (!O.f.length) {
      const s = I(W * 13 / 100), cy = I(H * 34 / 100);
      circ(W / 2, cy, s, K.tri, 2); onibus(W / 2 - I(s * 4 / 10), cy - I(s / 2), s, K.az, '#000');
      txt('Nenhum favorito', W / 2, I(H * 55 / 100), fonte(g ? 'small' : 'tiny'), K.tx);
      pilula(W / 2, I(H * 68 / 100), 'START · perto de mim', fx, K.am, true);
      txt('ou escolha no painel', W / 2, I(H * 80 / 100), fx, K.c3);
    } else if (O.err && !O.busca) erro();
    else carregando('Consultando horários', 'pelo celular');
  }
  if (O.aviso) {   // confirmação: pílula com ✓ que cresce, fica e encolhe
    const r = O.avisoAte - t, e = 1600 - r;
    if (r <= 0) O.aviso = null;
    else { rit(3); let k = 100; if (e < 160) k = 60 + I(e / 4); else if (r < 160) k = 60 + I(r / 4);
      const f = fonte(g ? 'tiny' : 'xtiny'), b = g ? 8 : 4, h = fh(f) + (g ? 14 : 8), w = I(larg(O.aviso, f)) + h + (g ? 14 : 6), hk = I(h * k / 100), wk = I(w * k / 100), x = I((W - wk) / 2), y = I(H / 2 - I(hk / 2));
      ret(b + 8, I(H * 39 / 100), W - 2 * b - 16, I(H * 28 / 100), '#000'); rr(x, y, wk, hk, I(hk / 2), K.c4, K.am, 2);   // faixa preta dentro do anel + pílula
      if (k >= 100) { const cx = x + I(h / 2) + (g ? 4 : 2), cy = y + I(h / 2); c.beginPath(); c.moveTo(cx - I(h / 5), cy); c.lineTo(cx - I(h / 14), cy + I(h / 6)); c.lineTo(cx + I(h / 4), cy - I(h / 5)); c.strokeStyle = K.am; c.lineWidth = g ? 4 : 2; c.stroke();
        txt(O.aviso, x + h + (g ? 4 : 2), cy, f, K.tx, 'left'); } }
  }
  oniRitmo();
}
/* prévia da aba (fora do simulador): FR165 (390 px, AMOLED) ou FR55 (208 px, MIP) em tamanho real de pixels */
function oniPintar() {
  const cv = $('#oniCv'); if (!cv) return;
  const m = ONI.prev, lado = m === 'fr55' ? 208 : 390, F = ONI_FONTES[m], dpr = window.devicePixelRatio || 1, esc2 = (m === 'fr55' ? 360 / 208 : 360 / 390) * dpr;
  cv.width = 360 * dpr; cv.height = 360 * dpr;
  const c = cv.getContext('2d'); c.setTransform(esc2, 0, 0, esc2, 0, 0); c.imageSmoothingEnabled = m !== 'fr55';
  c.save(); c.beginPath(); c.arc(lado / 2, lado / 2, lado / 2, 0, 7); c.clip();
  oniDesenhar(c, lado, lado, m === 'fr55', n => { const px = F[n] || F.xtiny, peso = n.startsWith('number') && m === 'fr55' ? 900 : F.peso; return { css: `${peso} ${px}px Roboto, Arial, sans-serif`, h: Math.round(px * 1.17) }; });
  c.restore();
}
/* favoritos do painel: lista + busca de linha → ponto */
function oniListaPainel() {
  const el = $('#oniFavs'); if (!el) return;
  const l = ONI.painel;
  el.innerHTML = l.length ? l.map((f, i) => `<div class="oni-fav"><span class="oni-cod" style="--oni-lin:${oniCorLinha(f.cod)}">${esc(f.cod)}</span><div class="oni-fav-t"><b>${esc(f.destino)}</b><span>${esc(f.ponto)}${i === 0 ? ' · <em>principal (glance)</em>' : ''}</span></div>
    ${i > 0 ? `<button class="btn peq sec" data-onisobe="${i}" title="Tornar principal">▲</button>` : ''}<button class="btn peq sec" data-onirem="${i}" title="Remover">✕</button></div>`).join('')
    : '<div class="mini">Nenhum favorito ainda. Busque a linha abaixo e escolha o ponto onde você pega o ônibus.</div>';
  const salvar = async nova => { try { localStorage.removeItem('oni_x'); } catch (e) { } try { const j = await api('onibus_favs_salvar', { favs: nova }); ONI.painel = j.favs; oniListaPainel(); toast('Favoritos salvos ✓'); ONI.carregado = false; oniAtualizar(); } catch (x) { toast(x.message); } };
  el.querySelectorAll('[data-onirem]').forEach(b => b.onclick = () => salvar(l.filter((x, i) => i !== +b.dataset.onirem)));
  el.querySelectorAll('[data-onisobe]').forEach(b => b.onclick = () => { const i = +b.dataset.onisobe; salvar([l[i], ...l.filter((x, k) => k !== i)]); });
  const add = $('#oniAdd'); if (add) add.hidden = l.length >= 4;
}
async function renderOnibus() {
  ONI.modo = 0; ONI.p = null;
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('onibus')}
  <section class="w oni-w"><header class="w-top"><span class="w-ico oni-ico">${ICO.onibus}</span><span class="w-tit">Próximo Ônibus — quando ele chega no seu ponto</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   <div class="chips"><button class="chip ${ONI.prev === 'fr165' ? 'ativo' : ''}" data-oniprev="fr165">Forerunner 165 (AMOLED)</button><button class="chip ${ONI.prev === 'fr55' ? 'ativo' : ''}" data-oniprev="fr55">Forerunner 55 (MIP)</button></div>
   <canvas id="oniCv" style="width:min(300px,80vw);height:auto;aspect-ratio:1;border-radius:50%;box-shadow:0 0 40px #f2c14e26;touch-action:pan-y;cursor:pointer"></canvas>
   <div class="chips"><button class="chip" data-onibt="prev">▲ Cima</button><button class="chip" data-onibt="start">● START</button><button class="chip" data-onibt="next">▼ Baixo</button><button class="chip" data-onibt="menu">☰ MENU</button><button class="chip" data-onibt="back">↩ VOLTAR</button><button class="chip" id="oniGps">📍 Usar minha localização</button></div>
   <div class="mini" id="oniOrigem" style="text-align:center"></div>
   <div class="mini" style="text-align:center;max-width:560px">Mostra <b>em quantos minutos chega o próximo ônibus</b> no seu ponto favorito (Maceió e Rio Largo), com os <b>próximos horários</b>. A contagem anda sozinha a cada minuto, sem gastar internet. Com o <b>alerta de 2 min</b> ligado o relógio vibra quando o ônibus estiver chegando — e, se você fechar o app, ainda pede para abri-lo 2 min antes.<br>
   O <b>anel da borda</b> esvazia nos últimos 15 min até a chegada e pulsa nos 2 finais. <b>Ao vivo</b> (bolinha verde) é o GPS dos ônibus; <b>programado</b> (bolinha azul vazada) é a tabela de hoje daquela parada, quando nenhum ônibus está sendo rastreado. Fonte: CittaMobi (não é a SMTT). Sem dado, o app diz que não tem — nada inventado.</div>
  </div></section>
  <div class="card"><h3>Seus pontos favoritos</h3><div class="mini" style="margin-bottom:8px">Até 4. O primeiro é o <b>principal</b> (aparece na glance do FR165). O app gerado abaixo traz esta lista sozinho; no relógio você também pode salvar pontos pelo <b>Perto de mim</b>.</div>
   <div id="oniFavs"></div>
   <div id="oniAdd" style="margin-top:10px"><div class="campo"><label>Linha (número ou bairro)</label><input id="oniBusca" placeholder="ex.: 0004, Ponta Verde, Benedito Bentes" autocomplete="off"></div>
    <div id="oniLinhas" class="oni-res"></div>
    <div id="oniPonto" hidden><div class="campo"><label>Ponto onde você pega o ônibus</label><select id="oniParada"></select></div><div class="mini" id="oniInfo"></div><div class="chips" style="margin-top:6px"><button class="btn" id="oniSalvar">＋ Adicionar favorito</button></div></div></div></div>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="oniApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="oniModelo" list="oniModelos" value="Forerunner® 165 (fr165)" autocomplete="off" required><datalist id="oniModelos"></datalist></div>
   <div class="chips"><button class="btn" id="oniGera">⬇ Baixar o Próximo Ônibus</button></div>
   <div class="mini" id="oniProg"></div></form>
   <div class="mini" style="margin-top:8px">Já compilados (sem os favoritos do painel — salve pelo "Perto de mim"): <a href="app/ProximoOnibus-fr165.prg" download>Forerunner 165</a> · <a href="app/ProximoOnibus-fr165m.prg" download>Forerunner 165 Music</a> · <a href="app/ProximoOnibus-fr55.prg" download>Forerunner 55</a></div></div>
  <div class="card"><h3>Como usar no relógio</h3><div class="mini">Ao abrir aparece na hora a <b>última consulta</b> e ele atualiza pelo celular (ônibus andando na estrada = consultando). Chegou, o relógio vibra.<br><b>▲ ▼</b> (ou deslizar) trocam de favorito. No centro, <b>"chega em X min"</b> com números grandes; o <b>anel da borda</b> esvazia nos últimos 15 min e, embaixo, os próximos horários aparecem em chips. A cor do selo da linha segue o grupo (centena do número). O rodapé diz se é <b>ao vivo</b> ou <b>programado</b> e <b>há quanto tempo</b> foi atualizado; ele se atualiza sozinho a cada 5 min ou quando o ônibus da tela passa.<br><b>START</b> (ou MENU) abre as opções: <b>Atualizar agora</b>, <b>Perto de mim</b> (GPS → pontos a até 1,5 km → linhas; START salva o favorito), <b>Alerta 2 min</b> (chave liga/desliga; sininho no rodapé; vibra forte e o anel cheio pulsa com "CHEGANDO"), <b>Tornar principal</b>, <b>Remover favorito</b> e <b>Sincronizar painel</b>.<br>Sem celular, sem internet, sem linha/ponto ou com a fonte fora do ar, a tela diz o motivo e <b>START tenta de novo</b>.<br><b>Glance</b> (FR165): linha, "chega em X min" e os próximos horários do favorito principal. O FR55 não aceita glance em apps.</div></div>
  <div class="card"><h3>Como instalar pelo cabo USB</h3><div class="mini">1) Baixe o <b>.prg</b> do seu modelo acima.<br>2) Ligue o relógio no computador com o <b>cabo USB</b> e espere aparecer a unidade <b>GARMIN</b>.<br>3) Copie o arquivo para a pasta <b>GARMIN/APPS</b>.<br>4) Ejete e desconecte o cabo.<br>5) No relógio: <b>START</b> → <b>Aplicativos</b> (ou ▲▼ na lista de apps) → <b>Próximo Ônibus</b>.<br><b>Permissões:</b> GPS (só no "Perto de mim"; a posição não é gravada), comunicação (consulta pelo celular pareado, com o Garmin Connect aberto em segundo plano) e segundo plano (só para o aviso de 2 min com o app fechado — um evento agendado, sem internet).</div></div>
  ${tabbar('app')}</div>`;
  const pinta = () => oniPintar();
  document.querySelectorAll('[data-onibt]').forEach(b => b.onclick = () => { oniBotao(b.dataset.onibt); pinta(); });
  document.querySelectorAll('[data-oniprev]').forEach(b => b.onclick = () => { ONI.prev = b.dataset.oniprev; document.querySelectorAll('[data-oniprev]').forEach(x => x.classList.toggle('ativo', x === b)); pinta(); });
  const cv = $('#oniCv');
  cv.onclick = e => { const r = cv.getBoundingClientRect(); oniToque((e.clientY - r.top) / r.height * 100, 100); pinta(); };
  let y0 = null; cv.ontouchstart = e => { y0 = e.touches[0].clientY; };
  cv.ontouchend = e => { if (y0 === null) return; const dy = e.changedTouches[0].clientY - y0; y0 = null; if (Math.abs(dy) > 30) { e.preventDefault(); oniBotao(dy > 0 ? 'prev' : 'next'); } };
  const origem = () => { const o = $('#oniOrigem'); if (o) o.textContent = ONI.lat != null ? `Posição do "Perto de mim": ${ONI.origem}${ONI.origem === ONI_PADRAO.nome ? ' (ponto fixo — toque em "Usar minha localização")' : ''}` : ''; };
  $('#oniGps').onclick = async () => { ONI.origem = ''; ONI.modo = 2; await oniPerto(true); origem(); };
  pinta(); oniAnimar();
  ONI.carregado = false; oniAtualizar().then(() => { oniListaPainel(); origem(); });
  // busca de linha (debounce 300 ms, cancela a anterior) → paradas da linha escolhida
  let tmr = null, ctl = null, linha = null;
  $('#oniBusca').oninput = () => { clearTimeout(tmr); tmr = setTimeout(async () => {
    const q = $('#oniBusca').value.trim(); if (q.length < 2) { $('#oniLinhas').innerHTML = ''; return; }
    ctl?.abort(); ctl = new AbortController();
    try { const j = await fetch(`${ONI_API}?a=linhas&q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then(r => r.json());
      $('#oniLinhas').innerHTML = (j.l || []).length ? j.l.map(l => `<button class="oni-linha" data-oniid="${l.id}"><span class="oni-cod" style="--oni-lin:${oniCorLinha(l.cod)}">${esc(l.cod)}</span><span><b>${esc(l.nome)}</b><small>${esc(l.empresa)} · sentido ${esc(l.destino)}</small></span></button>`).join('') : '<div class="mini">Nenhuma linha encontrada.</div>';
      $('#oniLinhas').querySelectorAll('[data-oniid]').forEach(b => b.onclick = async () => {
        $('#oniLinhas').querySelectorAll('.oni-linha').forEach(x => x.classList.toggle('ativo', x === b));
        const p = await fetch(`${ONI_API}?a=paradas&l=${b.dataset.oniid}`).then(r => r.json()).catch(() => null);
        if (!p || !p.s) return toast('Não consegui carregar os pontos dessa linha');
        linha = { id: +b.dataset.oniid, cod: p.cod, destino: p.destino, s: p.s.filter(x => x.nome) };
        if (!linha.s.length) { $('#oniPonto').hidden = true; return toast('Essa linha está sem a lista de pontos agora'); }
        $('#oniParada').innerHTML = linha.s.map((x, i) => `<option value="${i}">${i + 1}. ${esc(x.nome.split(',').slice(0, 2).join(','))}</option>`).join('');
        $('#oniInfo').textContent = `Linha ${p.cod} sentido ${p.destino}${p.info ? ' · hoje ' + p.info : ''}`;
        $('#oniPonto').hidden = false;
      });
    } catch (e) { if (e.name !== 'AbortError') $('#oniLinhas').innerHTML = '<div class="mini">Busca indisponível agora.</div>'; }
  }, 300); };
  $('#oniSalvar').onclick = async () => {
    if (!linha) return; const s = linha.s[+$('#oniParada').value]; if (!s) return;
    if (ONI.painel.some(x => x.id === linha.id && x.stop === s.id)) return toast('Esse ponto já está nos favoritos');
    if (ONI.painel.length >= 4) return toast('Máximo de 4 favoritos');
    const bt = $('#oniSalvar'); bt.disabled = true; bt.textContent = 'Salvando…';
    try { const j = await api('onibus_favs_salvar', { favs: [...ONI.painel, { id: linha.id, stop: s.id, cod: linha.cod, destino: linha.destino, ponto: s.curto }] });
      ONI.painel = j.favs; oniListaPainel(); toast('Favorito adicionado ✓'); $('#oniPonto').hidden = true; $('#oniLinhas').innerHTML = ''; $('#oniBusca').value = ''; linha = null;
      ONI.carregado = false; oniAtualizar();
    } catch (x) { toast(x.message); }
    bt.disabled = false; bt.textContent = '＋ Adicionar favorito';
  };
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#oniModelos') && ($('#oniModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join('')); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(x => n(x) === q)); };
  $('#oniApp').onsubmit = e => e.preventDefault();
  $('#oniGera').onclick = async e => {
    e.preventDefault(); const m = achar($('#oniModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bt = $('#oniGera'); bt.disabled = true; $('#oniProg').textContent = '⚙️ Compilando com os seus favoritos (cerca de 30 s)…';
    try {
      const a = await api('onibus_app', { modelo: m.id });
      const esperar = async (k = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#oniProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS pelo cabo USB. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bt.disabled = false; return; }
        if (s.status === 'erro' || k > 90) { $('#oniProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); bt.disabled = false; return; }
        setTimeout(() => esperar(k + 1), 2000); };
      esperar();
    } catch (x) { $('#oniProg').textContent = '❌ ' + x.message; bt.disabled = false; }
  };
}

/* ================= mostrador "Painel Total" (réplica em canvas do PainelApp.mc) ================= */
const PAINEL = {
  dados: null,          // dados reais do usuário (preenchidos por painelCarregar)
  cor: '#FF0000',       // cor de destaque
  segundos: true
};
const PN_COR = { branco: '#FFFFFF', cinza: '#555555', cinzaC: '#AAAAAA', verde: '#00CC00', verdeC: '#55DD55', azul: '#00AAFF', laranja: '#FF8800', amarelo: '#FFCC00', preto: '#000000' };
const PN_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const PN_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function painelDados() {
  const d = PAINEL.dados || {};
  const ag = new Date();
  return Object.assign({
    hora: ag.getHours(), min: ag.getMinutes(), seg: ag.getSeconds(),
    dow: ag.getDay(), dia: ag.getDate(), mes: ag.getMonth(),
    fc: null, zona: 0, cal: 0, bateria: 100, passos: 0, meta: 10000,
    distancia: 0, pisos: 0, metaPisos: 10, subida: 0, estresse: null,
    intensidade: 0, metaIntensidade: 150, bodyBattery: null,
    temp: null, tmax: null, tmin: null, condicao: 'Sem previsão', chuva: false, limpo: false,
    gps: 0, nascer: '--:--', porSol: '--:--', notificacoes: 0, alarmes: 0,
    bluetooth: true, celular: true, naoPerturbe: false
  }, d);
}

function painelDesenhar(c, w, h, redondo, fonte, cor) {
  const D = painelDados();
  const k = w / 390, px = v => v * k, cx = w / 2, cy = h / 2, raio = Math.min(w, h) / 2;
  const dest = PAINEL.cor;
  const F = n => ({ css: (n >= 30 ? 700 : 600) + ' ' + px(n) + "px 'Roboto Condensed', Roboto, Arial Narrow, sans-serif", h: px(n) });
  const fx = { hora: F(42), num: F(22), min: F(14), micro: F(10) };
  const txt = (x, y, f, t, cr, just) => { c.font = f.css; c.fillStyle = cr; c.textAlign = just || 'center'; c.textBaseline = 'middle'; c.fillText(String(t), x, y); c.textAlign = 'left'; };
  const barra = (x, y, lg, al, frac, cr) => {
    frac = Math.max(0, Math.min(1, frac || 0));
    const r = al / 2;
    const rr = (bx, by, bw, bh, cc) => { c.fillStyle = cc; c.beginPath(); c.roundRect(bx, by, bw, bh, r); c.fill(); };
    rr(x, y, lg, al, PN_COR.cinza);
    if (frac > 0) rr(x, y, Math.max(al, lg * frac), al, cr);
  };

  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);

  // ---- aro de minutos ----
  const rExt = raio - px(3), rInt = raio - px(17);
  for (let i = 0; i < 60; i++) {
    const a = (i * 6 - 90) * Math.PI / 180, co = Math.cos(a), se = Math.sin(a);
    let cr = PN_COR.cinzaC, gr = px(2);
    if (i % 5 === 0) { cr = dest; gr = px(6); }
    if (i % 15 === 0) { cr = PN_COR.branco; gr = px(6); }
    if (i === D.min) { cr = PN_COR.branco; gr = px(4); }
    c.strokeStyle = cr; c.lineWidth = gr; c.beginPath();
    c.moveTo(cx + rInt * co, cy + rInt * se); c.lineTo(cx + rExt * co, cy + rExt * se); c.stroke();
  }
  const tri = (pts, cr) => { c.fillStyle = cr; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]); c.closePath(); c.fill(); };
  const t0 = px(11);
  tri([[cx - t0, cy - raio + px(20)], [cx + t0, cy - raio + px(20)], [cx, cy - raio + px(41)]], dest);
  tri([[cx - t0, cy + raio - px(20)], [cx + t0, cy + raio - px(20)], [cx, cy + raio - px(41)]], dest);

  // ---- grade ----
  c.strokeStyle = '#2A2A2A'; c.lineWidth = px(2);
  [[96, 92, 148, 70], [242, 70, 294, 92], [30, 142, 148, 142], [242, 142, 360, 142],
   [24, 186, 122, 186], [268, 186, 366, 186], [28, 238, 128, 238], [262, 238, 362, 238],
   [34, 290, 140, 290], [250, 290, 356, 290], [96, 336, 294, 336],
   [148, 106, 148, 142], [242, 106, 242, 142], [122, 186, 122, 238], [268, 186, 268, 238],
   [140, 290, 140, 336], [250, 290, 250, 336]].forEach(l => {
    c.beginPath(); c.moveTo(px(l[0]), px(l[1])); c.lineTo(px(l[2]), px(l[3])); c.stroke();
  });

  // ---- ícones ----
  const poly = (pts, cr) => { c.fillStyle = cr; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); };
  const circ = (x, y, r, cr) => { c.fillStyle = cr; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  const linha = (x1, y1, x2, y2, cr, lw) => { c.strokeStyle = cr; c.lineWidth = lw; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };

  const coracao = (x, y, t, cr) => { const r = t / 3; circ(x - r, y - r / 2, r, cr); circ(x + r, y - r / 2, r, cr); poly([[x - t / 1.15, y - r / 2], [x + t / 1.15, y - r / 2], [x, y + t / 1.1]], cr); };
  const chama = (x, y, t, cr) => { poly([[x, y - t], [x + t / 1.6, y], [x + t / 2.2, y + t / 1.2], [x - t / 2.2, y + t / 1.2], [x - t / 1.6, y - t / 8]], cr); poly([[x, y - t / 6], [x + t / 4, y + t / 2.6], [x - t / 4, y + t / 2.6]], '#000'); };
  const pilha = (x, y, lg, al, pct, cr) => {
    c.strokeStyle = cr; c.lineWidth = px(2); c.beginPath(); c.roundRect(x - lg / 2, y - al / 2, lg, al, px(3)); c.stroke();
    c.fillStyle = cr; c.fillRect(x + lg / 2, y - al / 5, px(3), al * 2 / 5);
    const interno = lg - px(6), cc = interno * pct / 100;
    if (cc > 0) c.fillRect(x - lg / 2 + px(3), y - al / 2 + px(3), cc, al - px(6));
  };
  const pegadas = (x, y, cr) => { c.fillStyle = cr; circ(x - px(4), y - px(8), px(3), cr); c.beginPath(); c.roundRect(x - px(7), y - px(4), px(6), px(10), px(3)); c.fill(); circ(x + px(5), y - px(3), px(3), cr); c.beginPath(); c.roundRect(x + px(2), y + px(1), px(6), px(9), px(3)); c.fill(); };
  const estrada = (x, y, cr) => { linha(x - px(9), y + px(10), x - px(3), y - px(10), cr, px(3)); linha(x + px(9), y + px(10), x + px(3), y - px(10), cr, px(3)); linha(x, y - px(6), x, y - px(1), cr, px(2)); linha(x, y + px(4), x, y + px(9), cr, px(2)); };
  const montanha = (x, y, t, cr) => { poly([[x - t, y + t / 1.6], [x - t / 3, y - t / 1.6], [x + t / 3, y + t / 1.6]], cr); poly([[x - t / 4, y + t / 1.6], [x + t / 2.5, y - t / 2.4], [x + t, y + t / 1.6]], cr); };
  const setaSubida = (x, y, t, cr) => { linha(x - t / 1.4, y + t / 1.4, x + t / 2, y - t / 2, cr, px(3)); poly([[x + t, y - t], [x + t, y - t / 8], [x + t / 8, y - t]], cr); };
  const boneco = (x, y, t, cr) => { circ(x, y - t / 1.8, t / 3, cr); poly([[x - t / 1.5, y + t / 1.6], [x, y - t / 6], [x + t / 1.5, y + t / 1.6]], cr); };
  const corredor = (x, y, t, cr) => { circ(x, y - t / 1.7, t / 4, cr); linha(x - t / 3, y - t / 5, x + t / 3, y, cr, px(3)); linha(x - t / 3, y - t / 5, x - t / 1.4, y + t / 4, cr, px(3)); linha(x + t / 3, y, x + t / 2.2, y + t / 1.6, cr, px(3)); linha(x + t / 3, y, x - t / 2.4, y + t / 1.5, cr, px(3)); };
  const raioIco = (x, y, t, cr) => poly([[x + t / 3, y - t], [x - t / 2.2, y + t / 6], [x - t / 12, y + t / 6], [x - t / 3, y + t], [x + t / 2.2, y - t / 5], [x + t / 12, y - t / 5]], cr);
  const pino = (x, y, t, cr) => { circ(x, y - t / 3, t / 1.6, cr); poly([[x - t / 1.9, y], [x + t / 1.9, y], [x, y + t]], cr); circ(x, y - t / 3, t / 4, '#000'); };
  const iconeClima = (x, y, t, chuva, limpo) => {
    circ(x + t / 3, y - t / 2.2, t / 2.4, PN_COR.amarelo);
    if (limpo) { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; linha(x + t / 3 + (t / 1.9) * Math.cos(a), y - t / 2.2 + (t / 1.9) * Math.sin(a), x + t / 3 + (t / 1.3) * Math.cos(a), y - t / 2.2 + (t / 1.3) * Math.sin(a), PN_COR.amarelo, px(2)); } return; }
    circ(x - t / 2.4, y + t / 6, t / 2.6, PN_COR.branco); circ(x + t / 8, y, t / 2.1, PN_COR.branco); circ(x + t / 1.6, y + t / 5, t / 3, PN_COR.branco);
    c.fillStyle = PN_COR.branco; c.fillRect(x - t / 2.4, y + t / 6, t * 1.2, t / 2.6);
    if (chuva) for (let i = 0; i < 3; i++) { const gx = x - t / 2 + i * (t / 2.2); linha(gx, y + t / 1.4, gx - t / 6, y + t * 1.1, PN_COR.azul, px(2)); }
  };
  const solHorizonte = (x, y, t, cr, nascendo) => {
    circ(x, y, t / 2.2, cr);
    c.fillStyle = '#000'; c.fillRect(x - t, y + t / 4, t * 2, t);
    linha(x - t, y + t / 3, x + t, y + t / 3, cr, px(2));
    linha(x, y - t, x, y - t / 1.5, cr, px(2));
    linha(x - t / 1.2, y - t / 2, x - t / 1.7, y - t / 3, cr, px(2));
    linha(x + t / 1.2, y - t / 2, x + t / 1.7, y - t / 3, cr, px(2));
    poly(nascendo ? [[x - t / 4, y - t / 2.6], [x + t / 4, y - t / 2.6], [x, y - t / 1.5]]
                  : [[x - t / 4, y - t / 1.5], [x + t / 4, y - t / 1.5], [x, y - t / 2.6]], cr);
  };
  const balao = (x, y, t, cr) => { c.fillStyle = cr; c.beginPath(); c.roundRect(x - t / 1.3, y - t / 1.8, t * 1.5, t, px(3)); c.fill(); poly([[x - t / 3, y + t / 2.4], [x, y + t / 2.4], [x - t / 2.4, y + t]], cr); linha(x - t / 2.6, y, x + t / 2.6, y, '#000', px(2)); };
  const despertador = (x, y, t, cr) => { c.strokeStyle = cr; c.lineWidth = px(2); c.beginPath(); c.arc(x, y, t / 1.4, 0, 7); c.stroke(); linha(x - t, y - t, x - t / 2, y - t / 1.6, cr, px(2)); linha(x + t, y - t, x + t / 2, y - t / 1.6, cr, px(2)); linha(x, y, x, y - t / 2.6, cr, px(2)); linha(x, y, x + t / 3, y + t / 4, cr, px(2)); };
  const bluetooth = (x, y, t, cr) => { linha(x, y - t, x, y + t, cr, px(2)); linha(x, y - t, x + t / 1.6, y - t / 2.4, cr, px(2)); linha(x + t / 1.6, y - t / 2.4, x - t / 1.6, y + t / 2.4, cr, px(2)); linha(x, y + t, x + t / 1.6, y + t / 2.4, cr, px(2)); linha(x + t / 1.6, y + t / 2.4, x - t / 1.6, y - t / 2.4, cr, px(2)); };
  const celular = (x, y, t, cr) => { c.strokeStyle = cr; c.lineWidth = px(2); c.beginPath(); c.roundRect(x - t / 1.8, y - t, t * 1.1, t * 2, px(3)); c.stroke(); c.fillStyle = cr; c.fillRect(x - t / 5, y + t / 1.5, t / 2.5, px(2)); };
  const lua = (x, y, t, cr) => { circ(x, y, t, cr); circ(x + t / 2.2, y - t / 2.6, t, '#000'); };

  // ---- FC ----
  coracao(cx, px(38), px(13), dest);
  txt(cx, px(70), fx.num, D.fc == null ? '--' : D.fc, PN_COR.branco);
  txt(cx, px(92), fx.micro, D.zona > 0 ? 'Z' + D.zona : 'Z-', PN_COR.branco);
  const n = 10, lgz = px(5), esp = px(2), tot = n * lgz + (n - 1) * esp, x0 = cx - tot / 2, acesos = D.zona * 2;
  for (let i = 0; i < n; i++) {
    c.fillStyle = i < acesos ? (i < 2 ? PN_COR.verde : (i < 6 ? dest : PN_COR.laranja)) : PN_COR.cinza;
    c.fillRect(x0 + i * (lgz + esp), px(102), lgz, px(7));
  }

  // ---- calorias / bateria ----
  chama(px(112), px(52), px(11), PN_COR.branco);
  txt(px(112), px(70), fx.micro, 'CAL', PN_COR.cinzaC);
  txt(px(112), px(86), fx.min, D.cal, PN_COR.branco);
  pilha(px(278), px(57), px(32), px(16), D.bateria, D.bateria <= 20 ? dest : D.bateria <= 40 ? PN_COR.amarelo : PN_COR.verde);
  txt(px(278), px(82), fx.min, D.bateria + '%', PN_COR.branco);

  // ---- passos / distância ----
  pegadas(px(56), px(108), PN_COR.branco);
  txt(px(76), px(98), fx.micro, 'PASSOS', PN_COR.cinzaC, 'left');
  txt(px(76), px(112), fx.min, D.passos, PN_COR.branco, 'left');
  txt(px(80), px(127), fx.micro, '/ ' + D.meta, PN_COR.cinzaC, 'left');
  barra(px(40), px(134), px(76), px(6), D.passos / D.meta, dest);

  estrada(px(296), px(108), PN_COR.branco);
  txt(px(352), px(98), fx.micro, 'DISTÂNCIA', PN_COR.cinzaC, 'right');
  txt(px(314), px(112), fx.min, D.distancia.toFixed(1), PN_COR.branco, 'left');
  txt(px(316), px(127), fx.micro, 'km', PN_COR.cinzaC, 'left');
  barra(px(274), px(134), px(76), px(6), D.distancia / 10, dest);

  // ---- data ----
  txt(cx, px(131), fx.min, PN_DIAS[D.dow] + ', ' + D.dia + ' de ' + PN_MESES[D.mes], PN_COR.branco);

  // ---- pisos / subida ----
  montanha(px(50), px(158), px(13), PN_COR.branco);
  txt(px(72), px(148), fx.micro, 'PISOS', PN_COR.cinzaC, 'left');
  txt(px(72), px(163), fx.min, D.pisos, PN_COR.branco, 'left');
  barra(px(40), px(172), px(58), px(6), D.pisos / D.metaPisos, dest);

  setaSubida(px(298), px(158), px(12), PN_COR.branco);
  txt(px(350), px(148), fx.micro, 'SUBIDA', PN_COR.cinzaC, 'right');
  txt(px(318), px(163), fx.min, D.subida, PN_COR.branco, 'left');
  txt(px(320), px(177), fx.micro, 'm', PN_COR.cinzaC, 'left');
  barra(px(292), px(172), px(58), px(6), D.subida / 500, dest);

  // ---- hora ----
  c.font = fx.hora.css; c.fillStyle = PN_COR.branco; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(D.hora).padStart(2, '0') + ':' + String(D.min).padStart(2, '0'), cx, px(172));
  c.textAlign = 'left'; c.textBaseline = 'top';
  if (PAINEL.segundos) txt(px(262), px(233), fx.min, String(D.seg).padStart(2, '0'), PN_COR.cinzaC);

  // ---- estresse / intensidade ----
  boneco(px(52), px(212), px(13), PN_COR.laranja);
  txt(px(74), px(196), fx.micro, 'ESTRESSE', PN_COR.cinzaC, 'left');
  txt(px(74), px(211), fx.min, D.estresse == null ? '--' : D.estresse, PN_COR.branco, 'left');
  const nivel = D.estresse == null ? -1 : (D.estresse >= 76 ? 3 : D.estresse >= 51 ? 2 : D.estresse >= 26 ? 1 : 0);
  const coresE = [PN_COR.verde, PN_COR.amarelo, PN_COR.laranja, dest];
  for (let i = 0; i < 4; i++) { c.fillStyle = i <= nivel ? coresE[i] : PN_COR.cinza; c.fillRect(px(40) + i * (px(58) / 4), px(219), px(58) / 4 - px(2), px(6)); }

  corredor(px(300), px(212), px(13), PN_COR.verdeC);
  txt(px(352), px(196), fx.micro, 'INTENSIDADE', PN_COR.cinzaC, 'right');
  txt(px(318), px(211), fx.min, D.intensidade, PN_COR.branco, 'left');
  txt(px(320), px(225), fx.micro, 'min', PN_COR.cinzaC, 'left');
  barra(px(292), px(219), px(58), px(6), D.intensidade / D.metaIntensidade, PN_COR.laranja);

  // ---- clima ----
  iconeClima(px(152), px(249), px(17), D.chuva, D.limpo);
  txt(px(176), px(247), fx.num, (D.temp == null ? '--' : D.temp) + '°', PN_COR.branco, 'left');
  tri([[px(238), px(254)], [px(250), px(254)], [px(244), px(245)]], dest);
  txt(px(256), px(246), fx.micro, (D.tmax == null ? '--' : D.tmax) + '°', PN_COR.branco, 'left');
  tri([[px(238), px(262)], [px(250), px(262)], [px(244), px(271)]], PN_COR.azul);
  txt(px(256), px(260), fx.micro, (D.tmin == null ? '--' : D.tmin) + '°', PN_COR.branco, 'left');
  txt(cx, px(274), fx.micro, D.condicao, PN_COR.branco);

  // ---- body battery / gps ----
  raioIco(px(50), px(262), px(13), PN_COR.azul);
  txt(px(70), px(249), fx.micro, 'BODY', PN_COR.cinzaC, 'left');
  txt(px(70), px(261), fx.micro, 'BATTERY', PN_COR.cinzaC, 'left');
  txt(px(70), px(274), fx.min, D.bodyBattery == null ? '--' : D.bodyBattery, PN_COR.branco, 'left');
  barra(px(44), px(282), px(58), px(6), (D.bodyBattery || 0) / 100, PN_COR.azul);

  pino(px(300), px(258), px(12), dest);
  txt(px(320), px(251), fx.micro, 'GPS', PN_COR.cinzaC, 'left');
  for (let i = 0; i < 4; i++) { const al = px(5 + i * 4); c.fillStyle = i < D.gps ? PN_COR.verdeC : PN_COR.cinza; c.fillRect(px(320) + i * px(8), px(272) - al, px(6), al); }

  // ---- sol, notificações, alarme ----
  solHorizonte(px(114), px(296), px(13), PN_COR.amarelo, true);
  txt(px(114), px(312), fx.micro, 'NASCER', PN_COR.cinzaC);
  txt(px(114), px(326), fx.min, D.nascer, PN_COR.branco);
  solHorizonte(px(276), px(296), px(13), PN_COR.laranja, false);
  txt(px(276), px(312), fx.micro, 'PÔR DO SOL', PN_COR.cinzaC);
  txt(px(276), px(326), fx.min, D.porSol, PN_COR.branco);

  balao(px(170), px(302), px(13), PN_COR.branco);
  if (D.notificacoes > 0) { circ(px(180), px(296), px(8), dest); txt(px(180), px(295), fx.micro, D.notificacoes > 9 ? '9+' : D.notificacoes, PN_COR.branco); }
  despertador(px(221), px(302), px(11), PN_COR.branco);
  txt(px(221), px(322), fx.min, D.alarmes > 0 ? D.alarmes : '--', PN_COR.branco);

  // ---- rodapé ----
  bluetooth(px(166), px(348), px(10), D.bluetooth ? PN_COR.azul : PN_COR.cinza);
  celular(px(195), px(348), px(10), D.celular ? PN_COR.branco : PN_COR.cinza);
  lua(px(224), px(348), px(8), D.naoPerturbe ? PN_COR.branco : PN_COR.cinza);
}

/* ================= mostrador "Painel Total" (prévia + gerar o app do relógio) ================= */
async function painelCarregar() {
  try {
    const d = S.dash || await api('dashboard').catch(() => null);
    const h = (d && d.hoje) || {};
    const m = S.metas || {};
    PAINEL.dados = {
      fc: S.fcAtual || h.fc || null,
      zona: h.fc ? Math.max(1, Math.min(5, Math.round(((h.fc - 60) / 130) * 5))) : 0,
      cal: Math.round(h.calorias_ativas || h.calorias || 0),
      bateria: Math.round(h.bateria_relogio != null ? h.bateria_relogio : 95),
      passos: Math.round(h.passos || 0), meta: m.passos || 10000,
      distancia: +(h.distancia_km || 0).toFixed(1),
      pisos: Math.round(h.andares || 0), metaPisos: 10,
      subida: Math.round(h.subida_m || 0),
      estresse: h.stress != null ? Math.round(h.stress) : null,
      intensidade: Math.round(h.minutos_intensidade || 0), metaIntensidade: m.minutos_intensidade || 150,
      bodyBattery: h.energia != null ? Math.round(h.energia) : null,
      notificacoes: 0, alarmes: 0, gps: 3, bluetooth: true, celular: true, naoPerturbe: false
    };
  } catch (e) { PAINEL.dados = null; }
}
function painelPintar() {
  const cv = $('#painelCv'); if (!cv) return;
  const lado = 390, dpr = window.devicePixelRatio || 1;
  cv.width = lado * dpr; cv.height = lado * dpr;
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  painelDesenhar(c, lado, lado, true, null, null);
}
async function renderPainel() {
  app.innerHTML = `<div class="tela"><div class="topo"><h1>Apps</h1></div>${segApps('painel')}
  <section class="w"><header class="w-top"><span class="w-ico">📊</span><span class="w-tit">Painel Total</span></header><div class="w-corpo" style="display:flex;flex-direction:column;align-items:center;gap:12px">
   <canvas id="painelCv" style="width:min(320px,84vw);height:auto;aspect-ratio:1;border-radius:50%;box-shadow:0 0 40px #ff000033;background:#000"></canvas>
   <div class="chips">${['Vermelho', 'Laranja', 'Azul', 'Verde', 'Amarelo', 'Branco'].map((n, i) => `<button class="chip${i ? '' : ' ativo'}" data-painelcor="${['#FF0000', '#FF8800', '#00AAFF', '#00CC00', '#FFCC00', '#FFFFFF'][i]}">${n}</button>`).join('')}</div>
   <div class="mini" style="text-align:center;max-width:580px"><b>Mostrador (watch face)</b> com tudo na mesma tela: hora grande, data, frequência cardíaca com zona, calorias, bateria, passos com meta, distância, andares, subida, estresse, minutos de intensidade, Body Battery, clima com máxima e mínima, GPS, nascer e pôr do sol, notificações, alarmes e os ícones de Bluetooth, celular e não perturbe. Os ícones são desenhados por código e as letras usam fontes próprias, bem pequenas, para caber tudo sem abreviar. A cor de destaque e os segundos são configuráveis no Garmin Connect.</div>
  </div></section>
  <div class="card"><h3>Gerar para o seu relógio</h3>
   <form id="painelApp"><div class="campo"><label>Modelo do relógio (digite ou escolha)</label><input id="painelModelo" list="painelModelos" value="Forerunner® 165 (fr165)" autocomplete="off" required><datalist id="painelModelos"></datalist></div>
   <div class="chips"><button class="btn" id="painelGera">⬇ Baixar o mostrador Painel Total</button></div>
   <div class="mini" id="painelProg"></div></form>
   <div class="mini" style="margin-top:8px">Já compilados: <a href="app/PainelTotal-fr165.prg">Forerunner 165</a> · <a href="app/PainelTotal-fr165m.prg">Forerunner 165 Music</a></div></div>
  <div class="card"><h3>Como instalar pelo cabo USB</h3><div class="mini">1) Baixe o <b>.prg</b> acima.<br>2) Ligue o relógio no computador com o <b>cabo USB</b> e espere aparecer a unidade <b>GARMIN</b>.<br>3) Copie o arquivo <b>PainelTotal.prg</b> para a pasta <b>GARMIN/APPS</b>.<br>4) Ejete e desconecte o cabo.<br>5) No relógio: segure <b>MENU</b> no mostrador → <b>Editar/Trocar mostrador</b> → escolha <b>Painel Total</b>.<br><b>Permissões:</b> posição (para nascer/pôr do sol e sinal de GPS), perfil do usuário (zonas de FC) e complicações (Body Battery). Nada é enviado para a internet.</div></div>
  ${tabbar('app')}</div>`;
  document.querySelectorAll('[data-painelcor]').forEach(b => b.onclick = () => {
    PAINEL.cor = b.dataset.painelcor;
    document.querySelectorAll('[data-painelcor]').forEach(x => x.classList.toggle('ativo', x === b));
    painelPintar();
  });
  await painelCarregar();
  painelPintar();
  let modelos = []; fetch('app/modelos.json?v=2').then(x => x.json()).catch(() => []).then(l => { modelos = l; $('#painelModelos').innerHTML = l.map(m => `<option value="${esc(m.nome)} (${m.id})">`).join(''); });
  const achar = t => { const n = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const id = (t.match(/\(([a-z0-9_]+)\)\s*$/) || [])[1], q = n(t); return modelos.find(m => m.id === id) || modelos.find(m => m.id === q) || modelos.find(m => m.nome.split('/').some(x => n(x) === q)); };
  $('#painelApp').onsubmit = e => e.preventDefault();
  $('#painelGera').onclick = async e => {
    e.preventDefault(); const m = achar($('#painelModelo').value); if (!m) return toast('Escolha o modelo do relógio');
    const bt = $('#painelGera'); bt.disabled = true; $('#painelProg').textContent = '⚙️ Compilando (cerca de 30 s)…';
    try {
      const a = await api('painel_app', { modelo: m.id });
      const esperar = async (k = 0) => { const s = await apiGet('app_status', { id: a.id });
        if (s.status === 'pronto') { $('#painelProg').innerHTML = `✅ Pronto! Copie para GARMIN/APPS pelo cabo USB. <a href="api.php?acao=app_baixar&id=${a.id}">Baixar de novo</a>`; location.href = 'api.php?acao=app_baixar&id=' + a.id; bt.disabled = false; return; }
        if (s.status === 'erro' || k > 90) { $('#painelProg').textContent = '❌ ' + (s.erro || 'Demorou demais'); bt.disabled = false; return; }
        setTimeout(() => esperar(k + 1), 2000); };
      esperar();
    } catch (x) { $('#painelProg').textContent = '❌ ' + x.message; bt.disabled = false; }
  };
}
