const APP_CONFIG = {
  apiUrl:
    'https://script.google.com/macros/s/AKfycby3RSKYE9VtHT72iW2rNGnAVujMTmOTKIR1vGgoAcCNcMjtBQDO17SuB7pYQAeiltfZaQ/exec',
  secret: '2026',
};

const CHANNEL_TO_BRIDGE = 'gastos-pwa';
const CHANNEL_FROM_BRIDGE = 'gastos-bridge';

const OLD_STORAGE_KEYS = {
  apiUrl: 'gastos.apiUrl',
  secret: 'gastos.secret',
};

const state = {
  mode: 'payment',
  view: 'home',
  accounts: [],
  dashboard: null,
  availableMonths: [],
  currentMonthKey: '',
  installPrompt: null,
  currentDate: new Date(),
  busyCount: 0,
  bridgeReady: false,
  bridgeWindow: null,
  bridgeOrigin: '',
  bridgeSequence: 0,
  bridgePending: new Map(),
};

const els = {
  installButton: document.getElementById('installButton'),
  prevMonth: document.getElementById('prevMonth'),
  nextMonth: document.getElementById('nextMonth'),
  monthSelect: document.getElementById('monthSelect'),
  monthTitle: document.getElementById('monthTitle'),
  views: {
    home: document.getElementById('homeView'),
    form: document.getElementById('formView'),
    alerts: document.getElementById('alertsView'),
  },
  navButtons: [...document.querySelectorAll('.bottom-nav button')],
  balanceMetric: document.getElementById('balanceMetric'),
  expensesMetric: document.getElementById('expensesMetric'),
  incomeMetric: document.getElementById('incomeMetric'),
  progressLabel: document.getElementById('progressLabel'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  expenseList: document.getElementById('expenseList'),
  refreshHome: document.getElementById('refreshHome'),
  quickAdd: document.getElementById('quickAdd'),
  formTitle: document.getElementById('formTitle'),
  modePayment: document.getElementById('modePayment'),
  modeDue: document.getElementById('modeDue'),
  detail: document.getElementById('detail'),
  date: document.getElementById('date'),
  amountWrap: document.getElementById('amountWrap'),
  amount: document.getElementById('amount'),
  suggestions: document.getElementById('suggestions'),
  saveEntry: document.getElementById('saveEntry'),
  saveEntryLabel: document.getElementById('saveEntryLabel'),
  refreshAlerts: document.getElementById('refreshAlerts'),
  alerts: document.getElementById('alerts'),
  busyOverlay: document.getElementById('busyOverlay'),
  busyTitle: document.getElementById('busyTitle'),
  busyText: document.getElementById('busyText'),
  serverBridge: document.getElementById('serverBridge'),
};

function init() {
  localStorage.removeItem(OLD_STORAGE_KEYS.apiUrl);
  localStorage.removeItem(OLD_STORAGE_KEYS.secret);
  els.date.value = toInputDate(new Date());

  bindEvents();
  setMode('payment');
  setView('home');
  setupPwaInstall();
  clearServiceWorkers();
  loadBridge(true);
  loadEverything();
}

function bindEvents() {
  els.installButton.addEventListener('click', installApp);
  els.prevMonth.addEventListener('click', () => {
    navigateMonth(-1);
  });
  els.nextMonth.addEventListener('click', () => {
    navigateMonth(1);
  });
  els.monthSelect.addEventListener('change', () => {
    if (!els.monthSelect.value) {
      return;
    }

    state.currentDate = dateFromMonthKey(els.monthSelect.value);
    loadDashboard();
  });

  els.navButtons.forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  els.modePayment.addEventListener('click', () => setMode('payment'));
  els.modeDue.addEventListener('click', () => setMode('due'));
  els.saveEntry.addEventListener('click', saveEntry);
  els.refreshAlerts.addEventListener('click', refreshAlerts);
  els.refreshHome.addEventListener('click', loadDashboard);
  els.quickAdd.addEventListener('click', () => {
    setMode('payment');
    setView('form');
  });
}

function setupPwaInstall() {
  if (isStandalone()) {
    els.installButton.hidden = true;
    return;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    els.installButton.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    els.installButton.hidden = true;
    setStatus('App instalada.', 'ok');
  });
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice;
    state.installPrompt = null;
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const message = isIOS
    ? 'En iPhone: Compartir > Agregar a pantalla de inicio.'
    : 'En el navegador: menu > Instalar app o Agregar a pantalla principal.';

  window.alert(message);
}

function clearServiceWorkers() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});
  });
}

function isGoogleAppsScriptOrigin(origin) {
  try {
    const host = new URL(origin).hostname;

    return (
      host === 'script.google.com' ||
      host === 'script.googleusercontent.com' ||
      host.endsWith('.googleusercontent.com')
    );
  } catch (error) {
    return false;
  }
}

function getBridgeUrl() {
  const url = new URL(getApiUrl());

  url.searchParams.set('modo', 'bridge');
  url.searchParams.set('_', Date.now().toString());

  return url.toString();
}

function loadBridge(force) {
  if (!els.serverBridge || !navigator.onLine) {
    return;
  }

  if (force || !els.serverBridge.getAttribute('src')) {
    state.bridgeReady = false;
    state.bridgeWindow = null;
    state.bridgeOrigin = '';
    els.serverBridge.src = getBridgeUrl();
  }
}

window.addEventListener('message', (event) => {
  const message = event.data || {};

  if (message.channel !== CHANNEL_FROM_BRIDGE) {
    return;
  }

  if (!isGoogleAppsScriptOrigin(event.origin)) {
    return;
  }

  if (message.type === 'ready') {
    state.bridgeWindow = event.source;
    state.bridgeOrigin = event.origin;
    state.bridgeReady = true;
    return;
  }

  if (message.type === 'response') {
    if (!state.bridgeWindow || event.source !== state.bridgeWindow) {
      return;
    }

    if (state.bridgeOrigin && event.origin !== state.bridgeOrigin) {
      return;
    }

    const pending = state.bridgePending.get(String(message.id || ''));

    if (!pending) {
      return;
    }

    state.bridgePending.delete(String(message.id || ''));
    window.clearTimeout(pending.timer);

    if (message.error) {
      pending.reject(new Error(String(message.error)));
      return;
    }

    pending.resolve(message.data);
  }
});

async function waitForBridge(timeoutMs = 9000) {
  if (!navigator.onLine) {
    return false;
  }

  if (state.bridgeReady && state.bridgeWindow) {
    return true;
  }

  loadBridge(false);

  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (state.bridgeReady && state.bridgeWindow) {
      return true;
    }

    await delay(100);
  }

  return false;
}

function bridgeCall(action, payload = {}, timeoutMs = 18000) {
  return waitForBridge(Math.min(timeoutMs, 9000)).then((ready) => {
    if (!ready || !state.bridgeWindow) {
      throw new Error('No se pudo abrir el puente con Apps Script.');
    }

    const id = `rpc_${Date.now()}_${++state.bridgeSequence}`;

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        state.bridgePending.delete(id);
        reject(new Error('Apps Script no respondio a tiempo.'));
      }, timeoutMs);

      state.bridgePending.set(id, { resolve, reject, timer });
      state.bridgeWindow.postMessage(
        {
          channel: CHANNEL_TO_BRIDGE,
          id,
          action,
          payload,
        },
        state.bridgeOrigin || '*'
      );
    });
  });
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function setView(view) {
  state.view = view;

  Object.entries(els.views).forEach(([name, element]) => {
    element.classList.toggle('active', name === view);
  });

  els.navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  const titles = {
    home: state.dashboard?.month || 'Gastos',
    form: state.mode === 'payment' ? 'Nuevo gasto' : 'Nuevo vencimiento',
    alerts: 'Alertas',
  };

  els.monthTitle.textContent = titles[view] || 'Gastos';
  const isHome = view === 'home';
  els.prevMonth.hidden = !isHome;
  els.nextMonth.hidden = !isHome;
  els.monthSelect.hidden = !isHome || !state.availableMonths.length;
  els.monthTitle.hidden = isHome && state.availableMonths.length > 0;
}

function setMode(mode) {
  state.mode = mode;
  els.modePayment.classList.toggle('active', mode === 'payment');
  els.modeDue.classList.toggle('active', mode === 'due');
  els.amountWrap.hidden = mode !== 'payment';
  els.formTitle.textContent = mode === 'payment' ? 'Nuevo gasto' : 'Nuevo vencimiento';
  els.saveEntryLabel.textContent = mode === 'payment' ? 'Guardar' : 'Guardar vencimiento';

  if (state.view === 'form') {
    setView('form');
  }
}

async function loadEverything() {
  await withBusy('Cargando app', 'Leyendo cuentas, tablero y alertas...', async () => {
    await loadAccounts();
    await Promise.all([loadDashboard({ silent: true }), refreshAlerts({ silent: true })]);
  });
}

async function loadAccounts() {
  setStatus('Cargando cuentas...', '');

  try {
    const response = await apiCall('accounts', { includeArchived: 'false' });

    if (!response.ok) {
      throw new Error(response.error || 'No se pudieron cargar las cuentas.');
    }

    state.accounts = response.accounts || [];
    els.detail.innerHTML = state.accounts
      .map((account) => `<option value="${escapeHtml(account.detail)}">${escapeHtml(account.detail)}</option>`)
      .join('');
    renderSuggestions();

    setStatus(`${state.accounts.length} cuentas activas.`, 'ok');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadDashboard(options = {}) {
  if (!getApiUrl()) {
    renderEmptyDashboard();
    return;
  }

  if (!options.silent) {
    setBusy(true, 'Actualizando mes', 'Leyendo datos del Google Sheet...');
  }

  try {
    const response = await apiCall('dashboard', { date: toInputDate(state.currentDate) });

    if (!response.ok) {
      throw new Error(response.error || 'No se pudo cargar el tablero.');
    }

    state.dashboard = response;
    renderDashboard(response);

    if (state.view === 'home') {
      setView('home');
    }
  } catch (error) {
    renderEmptyDashboard(error.message);
  } finally {
    if (!options.silent) {
      setBusy(false);
    }
  }
}

function renderDashboard(data) {
  state.availableMonths = data.months || [];
  state.currentMonthKey = data.currentKey || monthKeyFromDate(state.currentDate);
  state.currentDate = dateFromMonthKey(state.currentMonthKey);

  renderMonthSelect(data.month || 'Gastos');
  els.balanceMetric.textContent = formatMoney(data.balance);
  els.expensesMetric.textContent = formatMoney(data.expenses);
  els.incomeMetric.textContent = formatMoney(data.income);

  const progress = clamp(Number(data.progress) || 0, 0, 100);
  els.progressLabel.textContent = `${progress}%`;
  els.progressFill.style.width = `${progress}%`;
  els.progressText.textContent = `${formatMoney(data.expenses)} de ${formatMoney(data.income)}`;

  const items = data.items || [];

  if (!items.length) {
    els.expenseList.innerHTML = '<div class="empty-state">Sin movimientos cargados en este mes.</div>';
    return;
  }

  els.expenseList.innerHTML = items.map(renderExpenseItem).join('');
}

function renderEmptyDashboard(message) {
  renderMonthSelect('Gastos');
  els.balanceMetric.textContent = '$ 0,00';
  els.expensesMetric.textContent = '$ 0,00';
  els.incomeMetric.textContent = '$ 0,00';
  els.progressLabel.textContent = '0%';
  els.progressFill.style.width = '0%';
  els.progressText.textContent = '$ 0,00 de $ 0,00';
  els.expenseList.innerHTML = `<div class="empty-state">${escapeHtml(message || 'Sin datos para mostrar.')}</div>`;
}

function renderMonthSelect(fallbackLabel) {
  const months = state.availableMonths;

  if (!months.length) {
    els.monthTitle.hidden = false;
    els.monthSelect.hidden = true;
    els.monthTitle.textContent = fallbackLabel || 'Gastos';
    els.prevMonth.disabled = true;
    els.nextMonth.disabled = true;
    return;
  }

  els.monthSelect.innerHTML = months
    .map((month) => `<option value="${escapeHtml(month.key)}">${escapeHtml(capitalize(month.label))}</option>`)
    .join('');

  const selected = months.some((month) => month.key === state.currentMonthKey)
    ? state.currentMonthKey
    : months[months.length - 1].key;

  els.monthSelect.value = selected;
  els.monthSelect.hidden = state.view !== 'home';
  els.monthTitle.hidden = state.view === 'home';
  els.monthTitle.textContent = capitalize(fallbackLabel || 'Gastos');
  updateMonthButtons();
}

function updateMonthButtons() {
  const months = state.availableMonths || [];
  const currentIndex = months.findIndex((month) => month.key === state.currentMonthKey);

  els.prevMonth.disabled = currentIndex <= 0;
  els.nextMonth.disabled = currentIndex < 0 || currentIndex >= months.length - 1;
}

function navigateMonth(direction) {
  const months = state.availableMonths || [];
  const currentKey = state.currentMonthKey || monthKeyFromDate(state.currentDate);
  const currentIndex = months.findIndex((month) => month.key === currentKey);

  if (currentIndex >= 0) {
    const nextIndex = clamp(currentIndex + direction, 0, months.length - 1);

    if (nextIndex !== currentIndex) {
      state.currentDate = dateFromMonthKey(months[nextIndex].key);
      loadDashboard();
    }

    return;
  }

  state.currentDate = new Date(state.currentDate.getFullYear(), state.currentDate.getMonth() + direction, 1);
  loadDashboard();
}

function renderExpenseItem(item) {
  const icon = iconForDetail(item.detail);
  const statusClass = item.paid ? 'paid' : 'pending';
  const amount = item.paid ? formatMoney(item.amount) : 'Vence';

  return `
    <article class="expense-item">
      <span class="item-icon ${icon.tone}">${icon.symbol}</span>
      <div class="item-main">
        <strong>${escapeHtml(item.detail)}</strong>
        <small>${escapeHtml(item.date || 'Sin fecha')}</small>
      </div>
      <div class="item-side">
        <strong>${escapeHtml(amount)}</strong>
        <span class="status-chip ${statusClass}">${escapeHtml(item.status)}</span>
      </div>
    </article>
  `;
}

function renderSuggestions() {
  const suggestions = state.accounts.slice(0, 6);

  els.suggestions.innerHTML = suggestions
    .map((account) => {
      const icon = iconForDetail(account.detail);
      return `<button type="button" data-detail="${escapeHtml(account.detail)}"><span>${icon.symbol}</span>${escapeHtml(
        shortLabel(account.detail)
      )}</button>`;
    })
    .join('');

  els.suggestions.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      els.detail.value = button.dataset.detail;
    });
  });
}

async function saveEntry() {
  const detail = els.detail.value;
  const date = els.date.value;
  const amount = els.amount.value;

  if (!detail || !date) {
    setStatus('Falta cuenta o fecha.', 'error');
    setView('form');
    return;
  }

  if (state.mode === 'payment' && !amount) {
    setStatus('Falta monto.', 'error');
    setView('form');
    return;
  }

  setStatus('Guardando...', '');
  setBusy(true, state.mode === 'payment' ? 'Guardando pago' : 'Guardando vencimiento', 'Actualizando el Google Sheet...');

  try {
    const response =
      state.mode === 'payment'
        ? await apiCall('record-payment', { detail, date, amount })
        : await apiCall('record-due-date', { detail, dueDate: date });

    if (!response.ok) {
      throw new Error(response.error || response.message || 'No se pudo guardar.');
    }

    setStatus(state.mode === 'payment' ? 'Pago guardado.' : 'Vencimiento guardado.', 'ok');
    els.amount.value = '';
    state.currentDate = new Date(`${date}T00:00:00`);
    await Promise.all([loadDashboard({ silent: true }), refreshAlerts({ silent: true })]);
    setView('home');
  } catch (error) {
    setStatus(error.message, 'error');
    setView('form');
  } finally {
    setBusy(false);
  }
}

async function refreshAlerts(options = {}) {
  if (!getApiUrl()) {
    return;
  }

  els.alerts.textContent = 'Calculando...';

  if (!options.silent) {
    setBusy(true, 'Actualizando alertas', 'Calculando vencimientos y pendientes...');
  }

  try {
    const response = await apiCall('alerts-preview');

    if (!response.ok) {
      throw new Error(response.error || 'No se pudo calcular alertas.');
    }

    els.alerts.textContent = response.message || 'Sin novedades para alertar.';
  } catch (error) {
    els.alerts.textContent = error.message;
  } finally {
    if (!options.silent) {
      setBusy(false);
    }
  }
}

async function apiCall(action, params = {}) {
  const apiUrl = getApiUrl();

  if (!apiUrl) {
    return Promise.reject(new Error('Falta definir la URL interna del Apps Script en app.js.'));
  }

  const payload = { ...params };
  const secret = getSecret();

  if (secret) {
    payload.secret = secret;
  }

  return bridgeCall(action, payload);
}

function iconForDetail(detail) {
  const text = String(detail || '').toLowerCase();

  if (text.includes('luz') || text.includes('electric')) return { symbol: '⚡', tone: 'amber' };
  if (text.includes('internet')) return { symbol: '⌁', tone: 'green' };
  if (text.includes('alquiler')) return { symbol: '⌂', tone: 'blue' };
  if (text.includes('tarjeta')) return { symbol: '▣', tone: 'blue' };
  if (text.includes('seguro')) return { symbol: '◆', tone: 'amber' };
  if (text.includes('super') || text.includes('mercado')) return { symbol: '◼', tone: 'green' };
  return { symbol: '•', tone: 'gray' };
}

function shortLabel(detail) {
  return String(detail || '').split(' ')[0] || 'Cuenta';
}

function getApiUrl() {
  return APP_CONFIG.apiUrl;
}

function getSecret() {
  return APP_CONFIG.secret;
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function setStatus(message, tone) {
  if (!els.status) {
    return;
  }

  els.status.textContent = message;
  els.status.className = tone || '';
}

async function withBusy(title, text, task) {
  setBusy(true, title, text);

  try {
    return await task();
  } finally {
    setBusy(false);
  }
}

function setBusy(active, title, text) {
  if (active) {
    state.busyCount += 1;
    els.busyTitle.textContent = title || 'Procesando';
    els.busyText.textContent = text || 'Un momento...';
    els.busyOverlay.hidden = false;
    document.body.classList.add('is-busy');
    return;
  }

  state.busyCount = Math.max(0, state.busyCount - 1);

  if (state.busyCount === 0) {
    els.busyOverlay.hidden = true;
    document.body.classList.remove('is-busy');
  }
}

function formatMoney(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromMonthKey(key) {
  const [year, month] = String(key || '').split('-').map(Number);

  if (!year || !month) {
    return new Date();
  }

  return new Date(year, month - 1, 1);
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
