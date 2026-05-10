// ── Helpers ──────────────────────────────────────────────────────────────────

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayKey() { return dayKey(Date.now()); }
function dayKeyOffset(key, offset) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + offset);
  return dayKey(dt.getTime());
}
function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    num: dt.getDate(),
    name: dt.toLocaleDateString('ru-RU', { weekday: 'short' }),
  };
}

// crypto.randomUUID() requires a secure context (HTTPS) — fall back to v4 via getRandomValues.
function randomUUID() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ── API ───────────────────────────────────────────────────────────────────────

const BASE = '/api/v1';

async function apiFetch(path, opts = {}) {
  const res = await fetch(BASE + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(body || res.statusText), { status: res.status });
  }
  return res;
}

const api = {
  pages: () => apiFetch('/pages').then(r => r.json()),
  createPage: body =>
    apiFetch('/pages', { method: 'POST', body: JSON.stringify(body) }).then(r => r.json()),
  patchPage: (id, data) =>
    apiFetch(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(r => r.json()),
  deletePage: id =>
    apiFetch(`/pages/${id}`, { method: 'DELETE' }),
};

// ── State ─────────────────────────────────────────────────────────────────────

let allPages = [];
let selectedDayKey = todayKey();

// ── Status ────────────────────────────────────────────────────────────────────

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'err' : 'ok';
  setTimeout(() => { el.textContent = ''; el.className = ''; }, 3000);
}

// ── Diary ─────────────────────────────────────────────────────────────────────

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

function renderPage(p) {
  const card = document.createElement('div');
  card.className = 'page-card';
  card.dataset.id = p.id;

  const ta = document.createElement('textarea');
  ta.placeholder = 'Запись…';
  ta.value = p.content || '';

  let saveTimer = null;
  ta.addEventListener('input', () => {
    autoGrow(ta);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      api.patchPage(p.id, { content: ta.value, updatedAt: Date.now() }).catch(() => {});
    }, 1000);
  });
  card.appendChild(ta);
  requestAnimationFrame(() => autoGrow(ta));

  const meta = document.createElement('div');
  meta.className = 'page-meta';

  const date = document.createElement('span');
  date.textContent = `${fmtDate(p.createdAt)} · ${fmtTime(p.createdAt)}`;
  meta.appendChild(date);

  const del = document.createElement('button');
  del.className = 'page-delete';
  del.title = 'Удалить страницу';
  del.textContent = '×';
  del.addEventListener('click', () => deletePage(p));
  meta.appendChild(del);

  card.appendChild(meta);
  return card;
}

function renderDayNav() {
  const nav = document.getElementById('diary-nav');
  nav.innerHTML = '';
  const today = todayKey();
  for (let off = -5; off <= 5; off++) {
    const key = dayKeyOffset(selectedDayKey, off);
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    if (key === today) cell.classList.add('today');
    if (key === selectedDayKey) cell.classList.add('selected');
    cell.title = key;

    const lbl = dayLabel(key);
    const num = document.createElement('div');
    num.className = 'day-num';
    num.textContent = lbl.num;
    const name = document.createElement('div');
    name.className = 'day-name';
    name.textContent = lbl.name;
    cell.append(num, name);

    cell.addEventListener('click', () => selectDay(key));
    nav.appendChild(cell);
  }
}

function selectDay(key) {
  selectedDayKey = key;
  renderDayNav();
  renderPagesForSelectedDay();
}

function renderPagesForSelectedDay() {
  const list = document.getElementById('diary-list');
  list.innerHTML = '';
  const filtered = allPages.filter(p => dayKey(p.createdAt) === selectedDayKey);
  if (!filtered.length) {
    list.innerHTML = '<div class="hint">Нет записей за этот день. Нажмите «+ Новая страница» внизу.</div>';
    return;
  }
  filtered
    .sort((a, b) => a.position - b.position)
    .forEach(p => list.appendChild(renderPage(p)));
}

async function loadPages() {
  const list = document.getElementById('diary-list');
  list.innerHTML = '<div class="hint">Загрузка…</div>';
  try {
    allPages = await api.pages();
    renderDayNav();
    renderPagesForSelectedDay();
  } catch (e) {
    list.innerHTML = `<div class="hint err">Ошибка: ${e.message}</div>`;
  }
}

async function createPage() {
  const now = Date.now();
  const id = randomUUID();
  try {
    await api.createPage({ id, content: '', createdAt: now, updatedAt: now });
    selectedDayKey = todayKey();
    await loadPages();
    const card = document.querySelector(`.page-card[data-id="${id}"] textarea`);
    if (card) card.focus();
  } catch (e) {
    setStatus(`Ошибка ${e.status ?? ''}: ${e.message}`, true);
  }
}

async function deletePage(p) {
  const preview = (p.content || '').trim().slice(0, 40) || 'Пустая страница';
  if (!confirm(`Удалить страницу «${preview}»?`)) return;
  try {
    await api.deletePage(p.id);
    await loadPages();
  } catch (e) {
    setStatus(`Ошибка ${e.status ?? ''}: ${e.message}`, true);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('new-page-btn').addEventListener('click', createPage);

// Body class — for CSS rules that target `body.diary-on .day-cell` etc., чтобы стили
// дневника применились (см. style.css из общего LN).
document.body.classList.add('diary-on');

loadPages();
