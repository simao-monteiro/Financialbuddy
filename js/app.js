// Plain script (no ES modules) so the site works when index.html is opened
// directly by double-click (file://) — Chrome blocks module scripts there.
(function () {
  const store = window.ContasStore;
  const { getRate } = window.ContasRates;
  const { renderWeekChart, renderPieChart } = window.ContasChart;
  const {
    toISODate,
    parseISODate,
    addDays,
    getMonday,
    formatDayName,
    formatShortDate,
    formatWeekRange,
    getMonthsInWeek,
    formatMonthLabel,
    addMonths,
  } = window.ContasDates;

const CATEGORIES = [
  { id: 'comida', label: 'Comida' },
  { id: 'transportes', label: 'Transportes' },
  { id: 'lazer', label: 'Museus/Diversões' },
  { id: 'roupa', label: 'Roupa' },
];

// Fixed monthly budgets, in EUR — not user-configurable.
const BUDGET_COMIDA_EUR = 300;
const BUDGET_OUTRAS_EUR = 100;
const BUDGET_TOTAL_EUR = 400;

const now = new Date();

const state = {
  view: 'despesas',
  weekMonday: getMonday(now),
  resumoMonth: { year: now.getFullYear(), month: now.getMonth() },
  expenses: [],
  settings: { displayCurrency: 'EUR', monthlyIncome: 0 },
  rate: { rate: 25, fetchedAt: null, stale: true },
};

const el = {
  viewTabs: document.querySelectorAll('.view-tab'),
  viewDespesas: document.getElementById('view-despesas'),
  viewResumo: document.getElementById('view-resumo'),
  weekRangeLabel: document.getElementById('week-range-label'),
  btnPrevWeek: document.getElementById('btn-prev-week'),
  btnNextWeek: document.getElementById('btn-next-week'),
  btnToday: document.getElementById('btn-today'),
  currencyButtons: document.querySelectorAll('.currency-btn'),
  rateInfo: document.getElementById('rate-info'),
  btnRefreshRate: document.getElementById('btn-refresh-rate'),
  btnExportBackup: document.getElementById('btn-export-backup'),
  btnImportBackup: document.getElementById('btn-import-backup'),
  inputImportBackup: document.getElementById('input-import-backup'),
  weekTableBody: document.getElementById('week-table-body'),
  chartContainer: document.getElementById('chart-container'),
  monthSummary: document.getElementById('month-summary'),
  monthlyIncomeInput: document.getElementById('input-monthly-income'),
  monthRangeLabel: document.getElementById('month-range-label'),
  btnPrevMonth: document.getElementById('btn-prev-month'),
  btnNextMonth: document.getElementById('btn-next-month'),
  btnCurrentMonth: document.getElementById('btn-current-month'),
  statIncome: document.getElementById('stat-income'),
  statExpenses: document.getElementById('stat-expenses'),
  statBalance: document.getElementById('stat-balance'),
  budgetProgress: document.getElementById('budget-progress'),
  compareChart: document.getElementById('compare-chart'),
  categoryChartContainer: document.getElementById('category-chart-container'),
  categoryPieContainer: document.getElementById('category-pie-container'),
};

function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  if (fromCurrency === 'EUR' && toCurrency === 'CZK') return amount * state.rate.rate;
  if (fromCurrency === 'CZK' && toCurrency === 'EUR') return amount / state.rate.rate;
  return amount;
}

function formatAmount(value, { compact = false } = {}) {
  const currency = state.settings.displayCurrency;
  const digits = compact ? 0 : 2;
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

// Converts a fixed EUR budget constant into the currently displayed currency.
function budgetDisplay(amountEur) {
  return convert(amountEur, 'EUR', state.settings.displayCurrency);
}

function weekDates() {
  return Array.from({ length: 7 }, (_, i) => addDays(state.weekMonday, i));
}

function expensesForDate(iso) {
  return state.expenses.filter((e) => e.date === iso);
}

function dayTotalDisplay(iso) {
  return expensesForDate(iso).reduce(
    (sum, e) => sum + convert(e.amount, e.currency, state.settings.displayCurrency),
    0
  );
}

function totalForMonth(year, month) {
  return state.expenses.reduce((sum, e) => {
    const d = parseISODate(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      return sum + convert(e.amount, e.currency, state.settings.displayCurrency);
    }
    return sum;
  }, 0);
}

// Total spent in the given month, broken down per category id.
function totalForMonthByCategory(year, month) {
  const totals = {};
  CATEGORIES.forEach((c) => (totals[c.id] = 0));
  state.expenses.forEach((e) => {
    const d = parseISODate(e.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      totals[e.category] = (totals[e.category] || 0) + convert(e.amount, e.currency, state.settings.displayCurrency);
    }
  });
  return totals;
}

function monthlyIncomeDisplay() {
  return convert(state.settings.monthlyIncome, 'EUR', state.settings.displayCurrency);
}

function render() {
  renderWeekNav();
  renderCurrencyToggle();
  renderRateInfo();
  renderWeekTable();
  renderChart();
  renderMonthSummary();
  renderResumo();
}

function renderWeekNav() {
  el.weekRangeLabel.textContent = formatWeekRange(state.weekMonday);
}

function renderCurrencyToggle() {
  el.currencyButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.currency === state.settings.displayCurrency);
  });
}

function renderRateInfo() {
  if (!state.rate.fetchedAt) {
    el.rateInfo.textContent = 'Taxa de câmbio: valor de referência (sem ligação)';
    return;
  }
  const date = new Date(state.rate.fetchedAt);
  const dateLabel = date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const staleLabel = state.rate.stale ? ' · desatualizada' : '';
  el.rateInfo.textContent = `1 EUR = ${state.rate.rate.toFixed(3)} CZK (${dateLabel}${staleLabel})`;
}

function categoryOptions(selectedId) {
  return CATEGORIES.map((c) => `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${c.label}</option>`).join('');
}

function renderWeekTable() {
  const dates = weekDates();
  const html = dates
    .map((date) => {
      const iso = toISODate(date);
      const expenses = expensesForDate(iso);
      const total = dayTotalDisplay(iso);

      const rows = expenses.length
        ? expenses
            .map(
              (exp) => `
          <tr class="expense-row" data-id="${exp.id}">
            <td></td>
            <td>
              <input type="text" class="input-desc" data-field="description" data-id="${exp.id}" value="${escapeHtml(exp.description)}" placeholder="Descrição" />
            </td>
            <td>
              <select class="input-category" data-field="category" data-id="${exp.id}">
                ${categoryOptions(exp.category)}
              </select>
            </td>
            <td>
              <input type="number" class="input-amount" data-field="amount" data-id="${exp.id}" value="${exp.amount}" min="0" step="0.01" />
            </td>
            <td>
              <select class="input-currency" data-field="currency" data-id="${exp.id}">
                <option value="EUR" ${exp.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                <option value="CZK" ${exp.currency === 'CZK' ? 'selected' : ''}>CZK</option>
              </select>
            </td>
            <td><button class="btn-icon btn-delete-expense" data-id="${exp.id}" title="Remover" aria-label="Remover despesa">✕</button></td>
          </tr>`
            )
            .join('')
        : `<tr class="empty-row"><td></td><td colspan="5" class="empty-day-msg">Sem despesas registadas</td></tr>`;

      return `
      <tbody class="day-group" data-date="${iso}">
        <tr class="day-header-row">
          <td colspan="6">
            <div class="day-header">
              <span class="day-name">${formatDayName(date)}</span>
              <span class="day-date">${formatShortDate(date)}</span>
              <span class="day-total">Total: ${formatAmount(total)}</span>
              <button class="btn-add-expense" data-date="${iso}">+ Adicionar despesa</button>
            </div>
          </td>
        </tr>
        ${rows}
      </tbody>`;
    })
    .join('');

  el.weekTableBody.innerHTML = html;
  wireWeekTableEvents();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function wireWeekTableEvents() {
  el.weekTableBody.querySelectorAll('.btn-add-expense').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.addExpense({ date: btn.dataset.date, description: '', amount: 0, currency: state.settings.displayCurrency });
      state.expenses = await store.getExpenses();
      render();
      const lastInput = el.weekTableBody.querySelector(`.day-group[data-date="${btn.dataset.date}"] .expense-row:last-child .input-desc`);
      lastInput?.focus();
    });
  });

  el.weekTableBody.querySelectorAll('.btn-delete-expense').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await store.deleteExpense(btn.dataset.id);
      state.expenses = await store.getExpenses();
      render();
    });
  });

  el.weekTableBody.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('change', async () => {
      const { id, field } = input.dataset;
      let value = input.value;
      if (field === 'amount') value = Math.max(0, parseFloat(value) || 0);
      await store.updateExpense(id, { [field]: value });
      state.expenses = await store.getExpenses();
      render();
    });
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        input.blur();
      }
    });
  });
}

function renderChart() {
  const dates = weekDates();
  const days = dates.map((date) => ({
    label: date.toLocaleDateString('pt-PT', { weekday: 'short' }).replace('.', ''),
    dateLabel: formatShortDate(date),
    value: dayTotalDisplay(toISODate(date)),
    threshold: null,
  }));
  renderWeekChart(el.chartContainer, days, formatAmount, 'Gastos diários da semana');
}

function renderMonthSummary() {
  const months = getMonthsInWeek(state.weekMonday);
  const html = months
    .map(({ year, month }) => {
      const total = totalForMonth(year, month);
      return `<div class="month-total"><span>${formatMonthLabel(year, month)}</span><strong>${formatAmount(total)}</strong></div>`;
    })
    .join('');
  el.monthSummary.innerHTML = html;
}

function renderBudgetMeter(label, spent, budget) {
  const over = spent > budget;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 100;
  return `
    <div class="limit-meter">
      <div class="limit-meter-head">
        <span>${label}</span>
        <strong class="${over ? 'balance-negative' : ''}">${formatAmount(spent)} / ${formatAmount(budget)}</strong>
      </div>
      <div class="limit-meter-track">
        <div class="limit-meter-fill ${over ? 'limit-meter-fill-over' : ''}" style="width:${pct}%"></div>
      </div>
    </div>`;
}

function renderResumo() {
  el.monthlyIncomeInput.value = state.settings.monthlyIncome;
  el.monthRangeLabel.textContent = formatMonthLabel(state.resumoMonth.year, state.resumoMonth.month);

  const income = monthlyIncomeDisplay();
  const spent = totalForMonth(state.resumoMonth.year, state.resumoMonth.month);
  const balance = income - spent;
  const positive = balance >= 0;

  el.statIncome.textContent = formatAmount(income);
  el.statExpenses.textContent = formatAmount(spent);
  el.statBalance.textContent = `${positive ? '▲' : '▼'} ${formatAmount(Math.abs(balance))}`;
  el.statBalance.className = `stat-value ${positive ? 'balance-positive' : 'balance-negative'}`;

  const categoryTotals = totalForMonthByCategory(state.resumoMonth.year, state.resumoMonth.month);
  const comidaSpent = categoryTotals.comida;
  const outrasSpent = categoryTotals.transportes + categoryTotals.lazer + categoryTotals.roupa;

  el.budgetProgress.innerHTML = [
    renderBudgetMeter('Comida', comidaSpent, budgetDisplay(BUDGET_COMIDA_EUR)),
    renderBudgetMeter('Outras despesas (Transportes, Museus/Diversões, Roupa)', outrasSpent, budgetDisplay(BUDGET_OUTRAS_EUR)),
    renderBudgetMeter('Total geral', spent, budgetDisplay(BUDGET_TOTAL_EUR)),
  ].join('');

  const max = Math.max(income, spent, 1);
  const incomePct = Math.min(100, (income / max) * 100);
  const spentPct = Math.min(100, (spent / max) * 100);

  el.compareChart.innerHTML = `
    <div class="compare-bar-row">
      <span class="compare-bar-label"><span class="compare-dot compare-dot-income"></span>Ganhos</span>
      <strong>${formatAmount(income)}</strong>
    </div>
    <div class="compare-bar-track"><div class="compare-bar-fill compare-fill-income" style="width:${incomePct}%"></div></div>
    <div class="compare-bar-row">
      <span class="compare-bar-label"><span class="compare-dot compare-dot-expenses"></span>Gastos</span>
      <strong>${formatAmount(spent)}</strong>
    </div>
    <div class="compare-bar-track"><div class="compare-bar-fill compare-fill-expenses" style="width:${spentPct}%"></div></div>
  `;

  const categoryBars = CATEGORIES.map((c, i) => ({
    label: c.label,
    dateLabel: '',
    value: categoryTotals[c.id],
    threshold: null,
    colorClass: `cat-bar-${i + 1}`,
  }));
  renderWeekChart(el.categoryChartContainer, categoryBars, formatAmount, 'Total gasto por categoria este mês');

  const pieItems = CATEGORIES.map((c, i) => ({
    label: c.label,
    value: categoryTotals[c.id],
    colorClass: `cat-${i + 1}`,
  }));
  renderPieChart(el.categoryPieContainer, pieItems, formatAmount);
}

function wireGlobalEvents() {
  el.btnPrevWeek.addEventListener('click', () => {
    state.weekMonday = addDays(state.weekMonday, -7);
    render();
  });
  el.btnNextWeek.addEventListener('click', () => {
    state.weekMonday = addDays(state.weekMonday, 7);
    render();
  });
  el.btnToday.addEventListener('click', () => {
    state.weekMonday = getMonday(new Date());
    render();
  });
  el.currencyButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      state.settings = await store.updateSettings({ displayCurrency: btn.dataset.currency });
      render();
    });
  });
  el.btnRefreshRate.addEventListener('click', async () => {
    el.rateInfo.textContent = 'A atualizar taxa de câmbio…';
    state.rate = await getRate({ forceRefresh: true });
    renderRateInfo();
    render();
  });
  el.btnExportBackup.addEventListener('click', async () => {
    const backup = await store.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `despesas-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  el.btnImportBackup.addEventListener('click', () => {
    el.inputImportBackup.click();
  });
  el.inputImportBackup.addEventListener('change', async () => {
    const file = el.inputImportBackup.files[0];
    el.inputImportBackup.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('Isto substitui todas as despesas e configurações atuais pelas do ficheiro. Continuar?')) return;
      await store.importBackup(data);
      state.settings = await store.getSettings();
      state.expenses = await store.getExpenses();
      render();
      alert('Backup importado com sucesso.');
    } catch (err) {
      alert(`Não foi possível importar o ficheiro: ${err.message}`);
    }
  });
  el.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.view = tab.dataset.view;
      el.viewTabs.forEach((t) => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      el.viewDespesas.hidden = state.view !== 'despesas';
      el.viewResumo.hidden = state.view !== 'resumo';
    });
  });
  el.btnPrevMonth.addEventListener('click', () => {
    state.resumoMonth = addMonths(state.resumoMonth, -1);
    renderResumo();
  });
  el.btnNextMonth.addEventListener('click', () => {
    state.resumoMonth = addMonths(state.resumoMonth, 1);
    renderResumo();
  });
  el.btnCurrentMonth.addEventListener('click', () => {
    state.resumoMonth = { year: now.getFullYear(), month: now.getMonth() };
    renderResumo();
  });
  el.monthlyIncomeInput.addEventListener('change', async () => {
    const amount = Math.max(0, parseFloat(el.monthlyIncomeInput.value) || 0);
    state.settings = await store.updateSettings({ monthlyIncome: amount });
    renderResumo();
  });
}

async function init() {
  state.settings = await store.getSettings();
  state.expenses = await store.getExpenses();
  state.rate = await getRate();
  wireGlobalEvents();
  render();
}

init();
})();
