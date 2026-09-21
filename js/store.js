// Persistence layer. Backed by localStorage today; every function is async
// so this can be swapped for real HTTP calls later without touching callers.
// Exposed as window.ContasStore (plain script, no ES modules) so the site
// works when index.html is opened directly by double-click (file://),
// which Chrome blocks for <script type="module">.

(function (global) {
  const EXPENSES_KEY = 'contas_expenses_v1';
  const SETTINGS_KEY = 'contas_settings_v1';

  // weekdayLimitPeriod: 'day' | 'week' | 'month' — the period over which
  // weekdayLimitAmount (always in EUR) applies to weekday spending. Weekend
  // spending has its own fixed, non-configurable per-day threshold.
  // monthlyIncome (always in EUR) is the salary used on the "Resumo mensal"
  // page to compare against that month's spending.
  const DEFAULT_SETTINGS = {
    displayCurrency: 'EUR',
    weekdayLimitAmount: 10,
    weekdayLimitPeriod: 'day',
    monthlyIncome: 0,
  };

  function genId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function getExpenses() {
    return readJSON(EXPENSES_KEY, []);
  }

  async function addExpense({ date, description, amount, currency }) {
    const expenses = readJSON(EXPENSES_KEY, []);
    const expense = { id: genId(), date, description: description || '', amount, currency };
    expenses.push(expense);
    writeJSON(EXPENSES_KEY, expenses);
    return expense;
  }

  async function updateExpense(id, patch) {
    const expenses = readJSON(EXPENSES_KEY, []);
    const idx = expenses.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    expenses[idx] = { ...expenses[idx], ...patch };
    writeJSON(EXPENSES_KEY, expenses);
    return expenses[idx];
  }

  async function deleteExpense(id) {
    const expenses = readJSON(EXPENSES_KEY, []).filter((e) => e.id !== id);
    writeJSON(EXPENSES_KEY, expenses);
  }

  async function getSettings() {
    return { ...DEFAULT_SETTINGS, ...readJSON(SETTINGS_KEY, {}) };
  }

  async function updateSettings(patch) {
    const settings = { ...(await getSettings()), ...patch };
    writeJSON(SETTINGS_KEY, settings);
    return settings;
  }

  async function exportBackup() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      expenses: readJSON(EXPENSES_KEY, []),
      settings: readJSON(SETTINGS_KEY, {}),
    };
  }

  async function importBackup(data) {
    if (!data || !Array.isArray(data.expenses)) {
      throw new Error('Ficheiro de backup inválido: falta a lista de despesas.');
    }
    writeJSON(EXPENSES_KEY, data.expenses);
    if (data.settings) writeJSON(SETTINGS_KEY, data.settings);
  }

  global.ContasStore = {
    getExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    getSettings,
    updateSettings,
    exportBackup,
    importBackup,
  };
})(window);
