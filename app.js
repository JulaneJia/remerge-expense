'use strict';

// ── Access Gate ────────────────────────────────────────────────────────────
// To change the access code: run this in browser console to get the new hash:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourcode'))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
// Then replace ACCESS_CODE_HASH below.
//
// Default code: remerge2026
const ACCESS_CODE_HASH = 'b0c4669e2f1b5c35607cc17a41614d5e4ed2a04a3cbff52e3b40e9376e3dc8f7';
const ACCESS_SESSION_KEY = 'remerge_access_ok';

async function hashCode(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function checkAccessCode() {
  const input = document.getElementById('gate-input').value.trim();
  const errEl = document.getElementById('gate-error');
  if (!input) { errEl.textContent = 'Please enter the access code'; return; }
  const hash = await hashCode(input);
  if (hash === ACCESS_CODE_HASH) {
    sessionStorage.setItem(ACCESS_SESSION_KEY, '1');
    document.getElementById('access-gate').style.display = 'none';
  } else {
    errEl.textContent = 'Incorrect code, please try again';
    document.getElementById('gate-input').value = '';
    document.getElementById('gate-input').focus();
  }
}

function showAccessGate() {
  const gate = document.getElementById('access-gate');
  gate.style.display = 'flex';
  setTimeout(() => document.getElementById('gate-input').focus(), 100);
  // Allow Enter key to submit
  document.getElementById('gate-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkAccessCode();
  });
}

function checkGateOnLoad() {
  if (!sessionStorage.getItem(ACCESS_SESSION_KEY)) showAccessGate();
}

// ── Constants ──────────────────────────────────────────────────────────────

const DB_NAME = 'remerge_expense';
const DB_VERSION = 1;
const STORE = 'expenses';
const SETTINGS_STORE = 'settings';
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:8000' : '';

const CATEGORIES = {
  "Client Entertainment - food and drinks": [],
  "Employees": [
    "Educational conferences and events (e.g. tickets)",
    "Team events/lunches",
    "Gifts for employees",
    "Phone & internet",
    "Training / educational expenses"
  ],
  "General": [
    "Magazines / books / literature",
    "Office-IT approved hardware purchases",
    "Postage"
  ],
  "Marketing": [
    "Client gifts",
    "Other expenses",
    "Conference and event expenses (e.g. tickets)",
    "Promotional expenses"
  ],
  "Office": [
    "Food and drinks (e.g. office fruits)",
    "Maintenance operating premises",
    "Operating supplies (e.g. kitchen accessories)",
    "Stationery & equipment (anything related to workplace)"
  ],
  "Recruitment": ["Welcome lunch", "Lunch interview"],
  "Subscriptions - LinkedIn": [],
  "Regular_Travel": [
    "Accomodation / hotel",
    "Daily allowance",
    "Other travel expenses (visa etc.)",
    "Transportation (airfare, bus, train, taxi)"
  ],
  "STA_Travel": [
    "Accomodation / hotel",
    "Daily allowance",
    "Other travel expenses (visa etc.)",
    "Transportation (airfare, bus, train, taxi)"
  ],
  "Offsite_Travel": [
    "Accomodation / hotel",
    "Daily allowance",
    "Other travel expenses (visa etc.)",
    "Transportation (airfare, bus, train, taxi)"
  ]
};

const CAT_ICONS = {
  "Client Entertainment - food and drinks": { icon: "🍽️", cls: "cat-food" },
  "Employees": { icon: "👤", cls: "cat-employee" },
  "General": { icon: "📦", cls: "cat-general" },
  "Marketing": { icon: "📢", cls: "cat-marketing" },
  "Office": { icon: "🏢", cls: "cat-office" },
  "Recruitment": { icon: "🤝", cls: "cat-recruit" },
  "Subscriptions - LinkedIn": { icon: "💼", cls: "cat-employee" },
  "Regular_Travel": { icon: "✈️", cls: "cat-travel" },
  "STA_Travel": { icon: "🌍", cls: "cat-travel" },
  "Offsite_Travel": { icon: "🏨", cls: "cat-travel" },
};

const INVOICE_TYPES = ["电子", "纸质", "截图", "无需发票"];

// ── IndexedDB ──────────────────────────────────────────────────────────────

let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('synced', 'synced');
      }
      if (!d.objectStoreNames.contains(SETTINGS_STORE)) {
        d.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function txStore(mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function dbGetAll() {
  return new Promise((resolve, reject) => {
    const req = txStore().getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function dbPut(item) {
  return new Promise((resolve, reject) => {
    const req = txStore('readwrite').put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const req = txStore('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function dbGetSetting(key) {
  return new Promise(resolve => {
    const req = db.transaction(SETTINGS_STORE).objectStore(SETTINGS_STORE).get(key);
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => resolve(null);
  });
}

function dbSetSetting(key, value) {
  return new Promise(resolve => {
    const req = db.transaction(SETTINGS_STORE, 'readwrite').objectStore(SETTINGS_STORE).put({ key, value });
    req.onsuccess = () => resolve();
  });
}

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  currentMonth: new Date().toISOString().slice(0, 7), // "2026-02"
  expenses: [],
  editingId: null,
  photos: [],         // [{dataUrl, name}] for current form
  token: null,
  user: null,
};

// ── Auth ───────────────────────────────────────────────────────────────────

async function apiCall(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API_BASE + path, opts);
  if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
  return res.json();
}

async function login(email, password) {
  const data = await apiCall('POST', '/auth/login', { email, password });
  state.token = data.token;
  state.user = data.user;
  await dbSetSetting('token', data.token);
  await dbSetSetting('user', JSON.stringify(data.user));
}

async function register(email, password, name) {
  const data = await apiCall('POST', '/auth/register', { email, password, name });
  state.token = data.token;
  state.user = data.user;
  await dbSetSetting('token', data.token);
  await dbSetSetting('user', JSON.stringify(data.user));
}

async function tryRestoreSession() {
  state.token = await dbGetSetting('token');
  const userStr = await dbGetSetting('user');
  if (userStr) state.user = JSON.parse(userStr);
}

// ── Sync ───────────────────────────────────────────────────────────────────

async function syncToServer() {
  if (!state.token) return;
  try {
    const all = await dbGetAll();
    const unsynced = all.filter(e => !e.synced);
    if (!unsynced.length) return;
    await apiCall('POST', '/expenses/sync', { expenses: unsynced });
    for (const e of unsynced) {
      await dbPut({ ...e, synced: true });
    }
    showToast(`已同步 ${unsynced.length} 条记录`);
  } catch {
    // silent — will sync next time
  }
}

async function pullFromServer() {
  if (!state.token) return;
  try {
    const data = await apiCall('GET', '/expenses');
    for (const e of data.expenses) {
      await dbPut({ ...e, synced: true });
    }
  } catch {
    // silent
  }
}

// ── Data helpers ───────────────────────────────────────────────────────────

async function loadExpenses() {
  state.expenses = await dbGetAll();
}

function expensesForMonth(ym) {
  return state.expenses
    .filter(e => e.date.startsWith(ym))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function monthTotal(ym) {
  return expensesForMonth(ym).reduce((s, e) => s + Number(e.amount), 0);
}

function formatAmount(n) {
  return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m)-1]} ${y}`;
}

function formatDateLabel(d) {
  const dt = new Date(d + 'T00:00:00');
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return `${d} ${days[dt.getDay()]}`;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Render: Home ───────────────────────────────────────────────────────────

function renderHome() {
  const ym = state.currentMonth;
  const items = expensesForMonth(ym);
  const total = monthTotal(ym);

  const el = document.getElementById('page-home');

  // Summary card
  const invoiceCount = items.filter(e => e.invoiceType && e.invoiceType !== '无需发票').length;
  el.querySelector('.summary-amount').textContent = formatAmount(total);
  el.querySelector('.summary-sub').textContent = `${items.length} expenses · ${invoiceCount} invoices attached`;

  // Stats
  const cats = [...new Set(items.map(e => e.category))].length;
  el.querySelector('[data-stat="items"]').textContent = items.length;
  el.querySelector('[data-stat="cats"]').textContent = cats;
  el.querySelector('[data-stat="top"]').textContent =
    items.length ? formatAmount(Math.max(...items.map(e => e.amount))) : '¥0';

  // List
  const list = el.querySelector('.expense-list');
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>No expenses for ${formatMonthLabel(ym)}<br>Tap + to add one</p>
      </div>`;
    return;
  }

  // Group by date
  const byDate = {};
  for (const e of items) {
    (byDate[e.date] = byDate[e.date] || []).push(e);
  }

  list.innerHTML = Object.entries(byDate).map(([date, exps]) => `
    <div class="expense-group-date">${formatDateLabel(date)}</div>
    ${exps.map(e => renderExpenseItem(e)).join('')}
  `).join('');

  list.querySelectorAll('.expense-item').forEach(el => {
    el.addEventListener('click', () => openEditDrawer(el.dataset.id));
  });
}

function renderExpenseItem(e) {
  const { icon, cls } = CAT_ICONS[e.category] || { icon: '💰', cls: 'cat-general' };
  const typeLine = e.type ? `<span>${e.category} · ${e.type}</span>` : `<span>${e.category}</span>`;
  const badge = e.invoiceType
    ? `<span class="invoice-badge badge-${e.invoiceType}">${e.invoiceType}</span>` : '';
  return `
    <div class="expense-item" data-id="${e.id}">
      <div class="expense-icon ${cls}">${icon}</div>
      <div class="expense-main">
        <div class="expense-desc">${e.description || '(no description)'}</div>
        <div class="expense-meta">${typeLine}</div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">${formatAmount(e.amount)}</div>
        ${badge}
      </div>
    </div>`;
}

// ── Render: Export ─────────────────────────────────────────────────────────

function renderExport() {
  const ym = state.currentMonth;
  const items = expensesForMonth(ym);
  const el = document.getElementById('page-export');
  el.querySelector('[data-export-month]').textContent = formatMonthLabel(ym);
  el.querySelector('[data-export-count]').textContent = items.length;
  el.querySelector('[data-export-total]').textContent = formatAmount(monthTotal(ym));
}

// ── Render: Settings ───────────────────────────────────────────────────────

function renderSettings() {
  const el = document.getElementById('page-settings');
  if (state.user) {
    el.querySelector('[data-user-name]').textContent = state.user.name;
    el.querySelector('[data-user-email]').textContent = state.user.email;
    el.querySelector('[data-auth-section]').style.display = 'none';
    el.querySelector('[data-account-section]').style.display = 'block';
  } else {
    el.querySelector('[data-auth-section]').style.display = 'block';
    el.querySelector('[data-account-section]').style.display = 'none';
  }
}

// ── Form: Add/Edit Drawer ──────────────────────────────────────────────────

function openAddDrawer() {
  state.editingId = null;
  state.photos = [];
  const form = document.getElementById('expense-form');
  form.reset();
  document.getElementById('form-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('form-category').value = '';
  updateTypeDropdown('');
  renderPillGroup('', null);
  renderPhotoPreviews();
  document.getElementById('drawer-title').textContent = 'Add Expense';
  document.getElementById('btn-delete').style.display = 'none';
  document.getElementById('overlay').classList.add('open');
}

function openEditDrawer(id) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  state.editingId = id;
  state.photos = e.photos ? [...e.photos] : [];

  document.getElementById('form-date').value = e.date;
  document.getElementById('form-category').value = e.category;
  updateTypeDropdown(e.category);
  document.getElementById('form-type').value = e.type || '';
  document.getElementById('form-description').value = e.description || '';
  document.getElementById('form-amount').value = e.amount;
  document.getElementById('form-notes').value = e.notes || '';

  renderPillGroup(e.invoiceType || '', null);
  renderPhotoPreviews();

  document.getElementById('drawer-title').textContent = 'Edit Expense';
  document.getElementById('btn-delete').style.display = 'block';
  document.getElementById('overlay').classList.add('open');
}

function closeDrawer() {
  document.getElementById('overlay').classList.remove('open');
}

function updateTypeDropdown(category) {
  const types = CATEGORIES[category] || [];
  const sel = document.getElementById('form-type');
  const group = document.getElementById('type-group');
  if (!types.length) {
    group.style.display = 'none';
    sel.value = '';
    return;
  }
  group.style.display = 'block';
  sel.innerHTML = `<option value="">Select type…</option>` +
    types.map(t => `<option value="${t}">${t}</option>`).join('');
}

function renderPillGroup(selected, container) {
  const el = container || document.getElementById('invoice-pills');
  el.innerHTML = INVOICE_TYPES.map(t => `
    <button type="button" class="pill ${t === selected ? 'selected' : ''}" data-val="${t}">${t}</button>
  `).join('');
  el.querySelectorAll('.pill').forEach(p => {
    p.addEventListener('click', () => {
      el.querySelectorAll('.pill').forEach(x => x.classList.remove('selected'));
      p.classList.add('selected');
    });
  });
}

function getSelectedInvoiceType() {
  const sel = document.querySelector('#invoice-pills .pill.selected');
  return sel ? sel.dataset.val : '';
}

function renderPhotoPreviews() {
  const grid = document.getElementById('photo-preview-grid');
  if (!state.photos.length) { grid.innerHTML = ''; return; }
  grid.innerHTML = state.photos.map((p, i) => `
    <div class="photo-thumb">
      <img src="${p.dataUrl}" alt="receipt ${i+1}">
      <button class="photo-thumb-del" data-i="${i}">×</button>
    </div>`).join('');
  grid.querySelectorAll('.photo-thumb-del').forEach(b => {
    b.addEventListener('click', () => {
      state.photos.splice(Number(b.dataset.i), 1);
      renderPhotoPreviews();
    });
  });
}

async function saveExpense() {
  const date = document.getElementById('form-date').value;
  const category = document.getElementById('form-category').value;
  const type = document.getElementById('form-type').value;
  const description = document.getElementById('form-description').value.trim();
  const amount = parseFloat(document.getElementById('form-amount').value);
  const notes = document.getElementById('form-notes').value.trim();
  const invoiceType = getSelectedInvoiceType();

  if (!date || !category || !amount || isNaN(amount)) {
    showToast('Please fill date, category, and amount');
    return;
  }

  const expense = {
    id: state.editingId || uuid(),
    date,
    category,
    type: type || null,
    description,
    amount,
    currency: 'RMB',
    invoiceType,
    notes,
    photos: state.photos,
    synced: false,
    createdAt: state.editingId
      ? state.expenses.find(e => e.id === state.editingId)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await dbPut(expense);
  await loadExpenses();
  closeDrawer();
  renderHome();
  renderExport();
  syncToServer();
  showToast(state.editingId ? 'Updated' : 'Saved');
}

async function deleteExpense() {
  if (!state.editingId) return;
  if (!confirm('Delete this expense?')) return;
  await dbDelete(state.editingId);
  await loadExpenses();
  closeDrawer();
  renderHome();
  renderExport();
  syncToServer();
  showToast('Deleted');
}

// ── Export ─────────────────────────────────────────────────────────────────

async function exportJSON() {
  const ym = state.currentMonth;
  const items = expensesForMonth(ym);
  const payload = {
    month: ym,
    exportedAt: new Date().toISOString(),
    employeeName: "Julane Jia",
    costCenter: "Sales",
    currency: "RMB",
    expenses: items.map((e, i) => ({
      receiptNo: i + 1,
      date: e.date,
      category: e.category,
      type: e.type || '',
      description: e.description || '',
      amount: e.amount,
      currency: e.currency,
      invoiceType: e.invoiceType || '',
      notes: e.notes || '',
      photos: e.photos ? e.photos.length : 0,
    })),
    total: monthTotal(ym),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expense_${ym}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('JSON exported');
}

async function exportPhotos() {
  const ym = state.currentMonth;
  const items = expensesForMonth(ym);
  const photos = [];
  items.forEach((e, i) => {
    if (e.photos) {
      e.photos.forEach((p, j) => {
        photos.push({ name: `receipt_${i+1}_${j+1}.jpg`, dataUrl: p.dataUrl });
      });
    }
  });

  if (!photos.length) { showToast('No photos to export'); return; }

  // Download each photo
  for (const p of photos) {
    const a = document.createElement('a');
    a.href = p.dataUrl;
    a.download = p.name;
    a.click();
    await new Promise(r => setTimeout(r, 100));
  }
  showToast(`${photos.length} photos downloaded`);
}

// ── Month navigation ───────────────────────────────────────────────────────

function changeMonth(delta) {
  const [y, m] = state.currentMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  document.querySelectorAll('[data-month-label]').forEach(el => {
    el.textContent = formatMonthLabel(state.currentMonth);
  });
  renderHome();
  renderExport();
}

// ── Toast ──────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ── Navigation ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${tab}`).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'export') renderExport();
  if (tab === 'settings') renderSettings();
}

// ── Auth modal ─────────────────────────────────────────────────────────────

function openAuthModal(mode) {
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.add('open');
  overlay.querySelector('[data-auth-mode]').dataset.authMode = mode;
  overlay.querySelector('.drawer-title').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  overlay.querySelector('[data-auth-name-group]').style.display = mode === 'register' ? 'block' : 'none';
  overlay.querySelector('.auth-error').textContent = '';
  overlay.querySelector('#auth-form').reset();

  overlay.querySelector('[data-auth-switch]').innerHTML = mode === 'login'
    ? `No account? <a id="auth-mode-switch">Register</a>`
    : `Have an account? <a id="auth-mode-switch">Sign in</a>`;
  document.getElementById('auth-mode-switch').addEventListener('click', () => {
    openAuthModal(mode === 'login' ? 'register' : 'login');
  });
}

async function submitAuth() {
  const overlay = document.getElementById('auth-overlay');
  const mode = overlay.querySelector('[data-auth-mode]').dataset.authMode;
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const errEl = overlay.querySelector('.auth-error');

  try {
    if (mode === 'login') {
      await login(email, password);
    } else {
      await register(email, password, name);
    }
    overlay.classList.remove('open');
    renderSettings();
    showToast(mode === 'login' ? 'Signed in' : 'Account created');
    await pullFromServer();
    await loadExpenses();
    renderHome();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function signOut() {
  state.token = null;
  state.user = null;
  await dbSetSetting('token', null);
  await dbSetSetting('user', null);
  renderSettings();
  showToast('Signed out');
}

// ── Photo input ────────────────────────────────────────────────────────────

function handlePhotoInput(files) {
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = e => {
      state.photos.push({ dataUrl: e.target.result, name: file.name });
      renderPhotoPreviews();
    };
    reader.readAsDataURL(file);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  checkGateOnLoad();
  await openDB();
  await tryRestoreSession();
  await loadExpenses();

  // Month labels
  document.querySelectorAll('[data-month-label]').forEach(el => {
    el.textContent = formatMonthLabel(state.currentMonth);
  });

  renderHome();

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // FAB
  document.getElementById('fab').addEventListener('click', openAddDrawer);

  // Month prev/next
  document.querySelectorAll('[data-month-prev]').forEach(b =>
    b.addEventListener('click', () => changeMonth(-1)));
  document.querySelectorAll('[data-month-next]').forEach(b =>
    b.addEventListener('click', () => changeMonth(1)));

  // Category dropdown
  document.getElementById('form-category').addEventListener('change', e => {
    updateTypeDropdown(e.target.value);
  });

  // Drawer close
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('overlay')) closeDrawer();
  });
  document.getElementById('btn-drawer-close').addEventListener('click', closeDrawer);

  // Save / delete
  document.getElementById('btn-save').addEventListener('click', saveExpense);
  document.getElementById('btn-delete').addEventListener('click', deleteExpense);

  // Photo input
  document.getElementById('photo-input').addEventListener('change', e => {
    handlePhotoInput(e.target.files);
    e.target.value = '';
  });
  document.getElementById('photo-area').addEventListener('click', () => {
    document.getElementById('photo-input').click();
  });

  // Export buttons
  document.getElementById('btn-export-json').addEventListener('click', exportJSON);
  document.getElementById('btn-export-photos').addEventListener('click', exportPhotos);

  // Auth
  document.getElementById('btn-sign-in').addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-register').addEventListener('click', () => openAuthModal('register'));
  document.getElementById('btn-sign-out').addEventListener('click', signOut);
  document.getElementById('auth-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('auth-overlay'))
      document.getElementById('auth-overlay').classList.remove('open');
  });
  document.getElementById('btn-auth-close').addEventListener('click', () => {
    document.getElementById('auth-overlay').classList.remove('open');
  });
  document.getElementById('btn-auth-submit').addEventListener('click', submitAuth);

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Sync on load
  if (state.token) {
    pullFromServer().then(() => loadExpenses()).then(() => renderHome());
  }
}

document.addEventListener('DOMContentLoaded', init);
