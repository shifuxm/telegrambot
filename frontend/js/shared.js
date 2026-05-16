// ── TELEGRAM ─────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

function getTid() {
  const uid = tg?.initDataUnsafe?.user?.id;
  if (uid) return uid.toString();
  try {
    const raw = tg?.initData || '';
    if (raw) {
      const u = JSON.parse(decodeURIComponent(new URLSearchParams(raw).get('user') || '{}'));
      if (u.id) return u.id.toString();
    }
  } catch(e) {}
  return null;
}

// ── API ───────────────────────────────────────────────────────
async function api(method, path, body) {
  const tid = getTid();
  const headers = { 'Content-Type': 'application/json' };
  if (tid) headers['x-telegram-id'] = tid;
  const r = await fetch('/api' + path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Xatolik');
  return d;
}
const G = p      => api('GET', p);
const P = (p, b) => api('POST', p, b);
const U = (p, b) => api('PUT', p, b);
const D = p      => api('DELETE', p);

// ── HELPERS ───────────────────────────────────────────────────
function fmt(n)   { return Number(n).toLocaleString('ru-RU') + " so'm"; }
function nowMonth() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; }
function todayStr() { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; }

const MNS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentyabr','Oktyabr','Noyabr','Dekabr'];
function mLabel(my) {
  if (!my) return '';
  const [y, m] = my.split('-');
  return MNS[parseInt(m) - 1] + ' ' + y;
}
function sixMonths() {
  const now = new Date(), res = [];
  for (let i = -2; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    res.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  return res;
}

// ── AVATAR COLORS ─────────────────────────────────────────────
const AV_COLORS = ['#3B5BFF','#7C3AED','#F59E0B','#10B981','#0EA5E9','#EC4899','#EF4444','#14B8A6'];
function avBg(name) {
  const idx = Math.abs([...(name||'A')].reduce((a,c) => a + c.charCodeAt(0), 0)) % AV_COLORS.length;
  return AV_COLORS[idx];
}
function avInitials(fn, ln) { return ((fn||'?')[0] + (ln||'?')[0]).toUpperCase(); }
function avHtml(fn, ln, size = 44) {
  const r = Math.round(size * .36);
  return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:${avBg(fn+ln)};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*.36)}px;font-weight:800;color:#fff;flex-shrink:0">${avInitials(fn,ln)}</div>`;
}
function faCircle(icon, bgColor, iconColor, size = 44) {
  const r = Math.round(size * .32);
  return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:${bgColor};display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="${icon}" style="font-size:${Math.round(size*.4)}px;color:${iconColor}"></i></div>`;
}

// ── TOAST ─────────────────────────────────────────────────────
let _toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  const cfg = {
    success: { bg:'linear-gradient(135deg,#10B981,#059669)', icon:'fa-solid fa-circle-check' },
    error:   { bg:'linear-gradient(135deg,#EF4444,#DC2626)', icon:'fa-solid fa-circle-xmark' },
    warn:    { bg:'linear-gradient(135deg,#F59E0B,#D97706)', icon:'fa-solid fa-triangle-exclamation' },
    info:    { bg:'linear-gradient(135deg,#3B5BFF,#2541CC)', icon:'fa-solid fa-circle-info' },
  };
  const c = cfg[type] || cfg.info;
  el.style.cssText = `background:${c.bg};color:#fff;display:flex;align-items:center;gap:10px;position:fixed;bottom:90px;left:50%;transform:translateX(-50%);padding:13px 22px;border-radius:26px;font-size:14px;font-weight:700;z-index:9999;white-space:nowrap;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.2);font-family:'Nunito',sans-serif`;
  el.innerHTML = `<i class="${c.icon}" style="font-size:18px"></i><span>${msg}</span>`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2800);
}

// ── MODAL ─────────────────────────────────────────────────────
function openModal(title, html) {
  closeModal();
  const d = document.createElement('div');
  d.className = 'modal-ov'; d.id = 'modal';
  d.innerHTML = `<div class="modal-sh">
    <div class="modal-hd"></div>
    <div class="modal-tl">
      <div class="modal-tt">${title}</div>
      <button class="modal-cl" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-bd">${html}</div>
  </div>`;
  d.addEventListener('click', e => { if (e.target === d) closeModal(); });
  document.getElementById('modals').appendChild(d);
}
function closeModal() { document.getElementById('modal')?.remove(); }

// ── LOADING ───────────────────────────────────────────────────
function ldHtml() {
  return `<div style="display:flex;justify-content:center;padding:60px 20px"><div class="spinner"></div></div>`;
}
function emHtml(msg, ico = '📭') {
  return `<div class="empty"><div class="empty-ico">${ico}</div><div class="empty-txt">${msg}</div></div>`;
}

// ── PHONE LINK ────────────────────────────────────────────────
function phoneRow(label, phone) {
  if (!phone) return '';
  return `<a href="tel:${phone}" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1.5px solid var(--bdr2);text-decoration:none">
    <span style="color:var(--tx2);font-size:14px;font-weight:600">${label}</span>
    <span style="display:flex;align-items:center;gap:10px">
      <span style="font-weight:800;color:var(--p);font-size:15px">${phone}</span>
      <span style="width:34px;height:34px;border-radius:50%;background:var(--p);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px"><i class="fa-solid fa-phone"></i></span>
    </span>
  </a>`;
}
