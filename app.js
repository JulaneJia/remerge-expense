'use strict';

// ── Access Gate (shared site password) ────────────────────────────────────
// To change: echo -n "newcode" | shasum -a 256  → update hash below
const ACCESS_CODE_HASH = '56243351131982abcb5c08407f2a92d803bd883f68d162ab37ec3caca9c14b64';
const ACCESS_SESSION_KEY = 'remerge_access_ok';

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function checkAccessCode() {
  const input = document.getElementById('gate-input').value.trim();
  const errEl = document.getElementById('gate-error');
  if (!input) { errEl.textContent = 'Please enter the access code'; return; }
  const hash = await sha256(input);
  if (hash === ACCESS_CODE_HASH) {
    sessionStorage.setItem(ACCESS_SESSION_KEY, '1');
    document.getElementById('access-gate').style.display = 'none';
    checkLoginRequired();
  } else {
    errEl.textContent = 'Incorrect code, please try again';
    document.getElementById('gate-input').value = '';
    document.getElementById('gate-input').focus();
  }
}

function checkGateOnLoad() {
  if (!sessionStorage.getItem(ACCESS_SESSION_KEY)) {
    const gate = document.getElementById('access-gate');
    gate.style.display = 'flex';
    setTimeout(() => document.getElementById('gate-input').focus(), 100);
    document.getElementById('gate-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') checkAccessCode();
    });
    return false;
  }
  return true;
}

// ── Local Account System ───────────────────────────────────────────────────
// Users stored in localStorage (device-local, no server needed)
// Passwords stored as SHA-256 hashes

const LS_USERS = 'remerge_users';
const LS_SESSION = 'remerge_session';

function getUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS) || '[]'); } catch { return []; }
}

function saveUsers(users) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

function getSession() {
  try { return JSON.parse(localStorage.getItem(LS_SESSION)); } catch { return null; }
}

function saveSession(user) {
  localStorage.setItem(LS_SESSION, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(LS_SESSION);
}

// userId is deterministic from email so the same credentials work on any device.
// On a new device, login auto-creates a local profile (no "account not found" error).

async function localRegister(email, password, name) {
  const emailKey = email.toLowerCase();
  const users = getUsers();
  const existing = users.find(u => u.email === emailKey);
  if (existing) {
    // Already registered on this device — just verify password and log in
    if (existing.passwordHash !== await sha256(password)) {
      throw new Error('An account with this email already exists. Check your password.');
    }
    const session = { id: existing.id, email: existing.email, name: existing.name };
    saveSession(session);
    return session;
  }
  const id = await sha256(emailKey); // deterministic — same on every device
  const user = { id, email: emailKey, name, passwordHash: await sha256(password) };
  saveUsers([...users, user]);
  const session = { id, email: emailKey, name };
  saveSession(session);
  return session;
}

async function localLogin(email, password) {
  const emailKey = email.toLowerCase();
  const users = getUsers();
  const existing = users.find(u => u.email === emailKey);
  const id = await sha256(emailKey);
  const passwordHash = await sha256(password);

  if (existing) {
    // Known on this device — verify password
    if (existing.passwordHash !== passwordHash) throw new Error('Incorrect password');
    const session = { id: existing.id, email: existing.email, name: existing.name };
    saveSession(session);
    return session;
  }

  // First time on this device — create local profile automatically.
  // Name defaults to the part before @ ; user can update it in Settings later.
  const name = emailKey.split('@')[0];
  const user = { id, email: emailKey, name, passwordHash };
  saveUsers([...users, user]);
  const session = { id, email: emailKey, name };
  saveSession(session);
  return session;
}

// ── Login required gate ────────────────────────────────────────────────────

function checkLoginRequired() {
  const session = getSession();
  if (!session) {
    openAuthModal('login', true); // true = required (non-dismissable)
    return false;
  }
  state.user = session;
  return true;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DB_NAME = 'remerge_expense';
const DB_VERSION = 1;
const STORE = 'expenses';

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
        s.createIndex('userId', 'userId');
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

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  currentMonth: new Date().toISOString().slice(0, 7),
  expenses: [],
  editingId: null,
  photos: [],
  user: null,
};

// ── Data helpers ───────────────────────────────────────────────────────────

async function loadExpenses() {
  const all = await dbGetAll();
  // Only show expenses belonging to the current user
  state.expenses = all.filter(e => e.userId === state.user?.id);
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

  const invoiceCount = items.filter(e => e.invoiceType && e.invoiceType !== '无需发票').length;
  el.querySelector('.summary-amount').textContent = formatAmount(total);
  el.querySelector('.summary-sub').textContent = `${items.length} expenses · ${invoiceCount} invoices attached`;

  const cats = [...new Set(items.map(e => e.category))].length;
  el.querySelector('[data-stat="items"]').textContent = items.length;
  el.querySelector('[data-stat="cats"]').textContent = cats;
  el.querySelector('[data-stat="top"]').textContent =
    items.length ? formatAmount(Math.max(...items.map(e => e.amount))) : '¥0';

  const list = el.querySelector('.expense-list');
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>No expenses for ${formatMonthLabel(ym)}<br>Tap + to add one</p>
      </div>`;
    return;
  }

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
    userId: state.user.id,
    date,
    category,
    type: type || null,
    description,
    amount,
    currency: 'RMB',
    invoiceType,
    notes,
    photos: state.photos,
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
  showToast('Deleted');
}

// ── Export ─────────────────────────────────────────────────────────────────

function safeFilename(str) {
  return (str || '').replace(/[^\w\s\-]/g, '').trim().slice(0, 25).replace(/\s+/g, '_');
}

async function exportExcel() {
  const ym = state.currentMonth;
  const items = expensesForMonth(ym);
  if (!items.length) { showToast('No expenses this month'); return; }

  showToast('Generating Excel…');

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Expense list ──────────────────────────────────────────────
  const headers = ['#', 'Date', 'Category', 'Type', 'Description', 'Amount (¥)', 'Currency', 'Invoice Type', 'Notes'];
  const rows = items.map((e, i) => [
    i + 1,
    e.date,
    e.category,
    e.type || '',
    e.description || '',
    e.amount,
    e.currency || 'RMB',
    e.invoiceType || '',
    e.notes || '',
  ]);
  const total = monthTotal(ym);
  rows.push(['', '', '', '', 'TOTAL', total, '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    {wch: 4}, {wch: 12}, {wch: 36}, {wch: 36}, {wch: 45},
    {wch: 12}, {wch: 10}, {wch: 12}, {wch: 20},
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');

  // ── Sheet 2: Screenshots (photos as base64 images via HTML trick) ──────
  // SheetJS free doesn't embed images — we write a photo index sheet instead,
  // and pack the actual images into a ZIP alongside the xlsx.
  const photoItems = items.filter(e => e.photos && e.photos.length > 0);

  if (photoItems.length > 0) {
    const photoRows = [['#', 'Date', 'Description', 'Invoice Type', 'Photo Count', 'Filenames in ZIP']];
    photoItems.forEach((e, _) => {
      const recNo = items.indexOf(e) + 1;
      const names = e.photos.map((_, j) =>
        `${recNo}_${safeFilename(e.description)}${e.photos.length > 1 ? `_${j+1}` : ''}.jpg`
      ).join(', ');
      photoRows.push([recNo, e.date, e.description || '', e.invoiceType || '', e.photos.length, names]);
    });
    const wsPhotos = XLSX.utils.aoa_to_sheet(photoRows);
    wsPhotos['!cols'] = [{wch:4},{wch:12},{wch:40},{wch:14},{wch:12},{wch:50}];
    XLSX.utils.book_append_sheet(wb, wsPhotos, 'Screenshots');
  }

  // Write xlsx to blob
  const xlsxBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

  if (photoItems.length === 0) {
    // No photos — just download the xlsx directly
    const blob = new Blob([xlsxBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    _triggerDownload(blob, `expense_${ym}_${safeFilename(state.user.name)}.xlsx`);
    showToast('Excel exported');
    return;
  }

  // Photos exist — bundle xlsx + images into one ZIP
  const zip = new JSZip();
  zip.file(`expense_${ym}_${safeFilename(state.user.name)}.xlsx`, xlsxBuf);

  const imgFolder = zip.folder('receipts');
  items.forEach((e, i) => {
    if (!e.photos || !e.photos.length) return;
    const recNo = i + 1;
    e.photos.forEach((p, j) => {
      const name = `${recNo}_${safeFilename(e.description)}${e.photos.length > 1 ? `_${j+1}` : ''}.jpg`;
      const base64 = p.dataUrl.includes(',') ? p.dataUrl.split(',')[1] : p.dataUrl;
      imgFolder.file(name, base64, { base64: true });
    });
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  _triggerDownload(zipBlob, `expense_${ym}_${safeFilename(state.user.name)}.zip`);
  showToast('Excel + photos exported as ZIP');
}

async function exportPhotosZip() {
  const ym = state.currentMonth;
  const items = expensesForMonth(ym);
  const zip = new JSZip();
  let count = 0;

  items.forEach((e, i) => {
    if (!e.photos || !e.photos.length) return;
    const recNo = i + 1;
    e.photos.forEach((p, j) => {
      const name = `${recNo}_${safeFilename(e.description)}${e.photos.length > 1 ? `_${j+1}` : ''}.jpg`;
      const base64 = p.dataUrl.includes(',') ? p.dataUrl.split(',')[1] : p.dataUrl;
      zip.file(name, base64, { base64: true });
      count++;
    });
  });

  if (!count) { showToast('No photos this month'); return; }

  const blob = await zip.generateAsync({ type: 'blob' });
  _triggerDownload(blob, `receipts_${ym}.zip`);
  showToast(`${count} photos exported`);
}

function _triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

let _authRequired = false;

function openAuthModal(mode, required = false) {
  _authRequired = required;
  const overlay = document.getElementById('auth-overlay');
  overlay.classList.add('open');
  overlay.querySelector('[data-auth-mode]').dataset.authMode = mode;
  overlay.querySelector('.drawer-title').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  overlay.querySelector('[data-auth-name-group]').style.display = mode === 'register' ? 'block' : 'none';
  overlay.querySelector('.auth-error').textContent = '';
  overlay.querySelector('#auth-form').reset();

  // Hide close button when login is required
  document.getElementById('btn-auth-close').style.display = required ? 'none' : 'flex';

  overlay.querySelector('[data-auth-switch]').innerHTML = mode === 'login'
    ? `No account? <a id="auth-mode-switch">Register</a>`
    : `Have an account? <a id="auth-mode-switch">Sign in</a>`;
  document.getElementById('auth-mode-switch').addEventListener('click', () => {
    openAuthModal(mode === 'login' ? 'register' : 'login', required);
  });
}

async function submitAuth() {
  const overlay = document.getElementById('auth-overlay');
  const mode = overlay.querySelector('[data-auth-mode]').dataset.authMode;
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value.trim();
  const errEl = overlay.querySelector('.auth-error');

  if (!email) { errEl.textContent = 'Please enter your email'; return; }
  if (!password) { errEl.textContent = 'Please enter your password'; return; }
  if (mode === 'register' && !name) { errEl.textContent = 'Please enter your name'; return; }

  try {
    let session;
    if (mode === 'login') {
      session = await localLogin(email, password);
    } else {
      session = await localRegister(email, password, name);
    }
    state.user = session;
    overlay.classList.remove('open');
    await loadExpenses();
    renderHome();
    renderSettings();
    showToast(mode === 'login' ? `Welcome back, ${session.name}` : `Account created, welcome ${session.name}!`);
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function signOut() {
  clearSession();
  state.user = null;
  state.expenses = [];
  renderHome();
  renderSettings();
  showToast('Signed out');
  // Require login again
  openAuthModal('login', true);
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
  // Step 1: Check shared site access code
  const gateOk = checkGateOnLoad();
  if (!gateOk) return; // Wait for gate submission which calls checkLoginRequired()

  // Step 2: Check personal login
  await openDB();
  const loginOk = checkLoginRequired();
  if (!loginOk) {
    // Auth modal is open; after login submitAuth() loads expenses and renders
    // Still set up UI so it's ready
  } else {
    await loadExpenses();
  }

  // Month labels
  document.querySelectorAll('[data-month-label]').forEach(el => {
    el.textContent = formatMonthLabel(state.currentMonth);
  });

  renderHome();
  renderSettings();

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

  // Expense drawer close
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
  document.getElementById('btn-export-excel').addEventListener('click', exportExcel);
  document.getElementById('btn-export-photos').addEventListener('click', exportPhotosZip);

  // Auth modal
  document.getElementById('btn-sign-in').addEventListener('click', () => openAuthModal('login'));
  document.getElementById('btn-register').addEventListener('click', () => openAuthModal('register'));
  document.getElementById('btn-sign-out').addEventListener('click', signOut);
  document.getElementById('auth-overlay').addEventListener('click', e => {
    if (_authRequired) return; // Can't dismiss if login is required
    if (e.target === document.getElementById('auth-overlay'))
      document.getElementById('auth-overlay').classList.remove('open');
  });
  document.getElementById('btn-auth-close').addEventListener('click', () => {
    if (_authRequired) return;
    document.getElementById('auth-overlay').classList.remove('open');
  });
  document.getElementById('btn-auth-submit').addEventListener('click', submitAuth);
  document.getElementById('auth-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAuth();
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/remerge-expense/sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
