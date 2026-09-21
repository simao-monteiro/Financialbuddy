// Plain script (no ES modules) so the site works when index.html is opened
// directly by double-click (file://) — Chrome blocks module scripts there.
(function () {
  const store = window.ContasStore;
  const { getRate } = window.ContasRates;
  const { renderWeekChart } = window.ContasChart;
  const {
    toISODate,
    parseISODate,
    addDays,
    getMonday,
    isWeekend,
    formatDayName,
    formatShortDate,
    formatWeekRange,
    getMonthsInWeek,
    formatMonthLabel,
    addMonths,
  } = window.ContasDates;

const WEEKEND_THRESHOLD_EUR = 50; // fixed, per day, always — not user-configurable
const now = new Date();

const state = {
  view: 'despesas',
  weekMonday: getMonday(now),
  resumoMonth: { year: now.getFullYear(), month: now.getMonth() },
  expenses: [],
  settings: { displayCurrency: 'EUR', weekdayLimitAmount: 10, weekdayLimitPeriod: 'day', monthlyIncome: 0 },
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
  weekdayLimitAmountInput: document.getElementById('input-weekday-limit-amount'),
  weekdayLimitPeriodSelect: document.getElementById('select-weekday-limit-period'),
  weekdayLimitPanel: document.getElementById('weekday-limit-panel'),
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

function weekdayLimitAmountDisplay() {
  return convert(state.settings.weekdayLimitAmount, 'EUR', state.settings.displayCurrency);
}

function weekendThresholdDisplay() {
  return convert(WEEKEND_THRESHOLD_EUR, 'EUR', state.settings.displayCurrency);
}

// Per-day threshold in the display currency, or null when no per-day
// threshold applies (a weekday while the configured limit period is
// 'week' or 'month' — that limit is tracked as a period total instead).
function dayThreshold(date) {
  if (isWeekend(date)) return weekendThresholdDisplay();
  if (state.settings.weekdayLimitPeriod === 'day') return weekdayLimitAmountDisplay();
  return null;
}

function weekdayTotalForWeek(monday) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
    .filter((d) => !isWeekend(d))
    .reduce((sum, d) => sum + dayTotalDisplay(toISODate(d)), 0);
}

function weekdayTotalForMonth(year, month) {
  return totalForMonth(year, month, { weekdaysOnly: true });
}

function totalForMonth(year, month, { weekdaysOnly = false } = {}) {
  return state.expenses.reduce((sum, e) => {
    const d = parseISODate(e.date);
    if (d.getFullYear() === year && d.getMonth() === month && (!weekdaysOnly || !isWeekend(d))) {
      return sum + convert(e.amount, e.currency, state.settings.displayCurrency);
    }
    return sum;
  }, 0);
}

function monthlyIncomeDisplay() {
  return convert(state.settings.monthlyIncome, 'EUR', state.settings.displayCurrency);
}

function countDaysInMonth(year, month, predicate) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (predicate(new Date(year, month, day))) count++;
  }
  return count;
}

// Number of distinct Mon-Sun weeks that touch this month — used to scale a
// weekly weekday limit into a monthly total.
function weeksOverlappingMonth(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const mondays = new Set();
  for (let day = 1; day <= daysInMonth; day++) {
    mondays.add(toISODate(getMonday(new Date(year, month, day))));
  }
  return mondays.size;
}

// Theoretical monthly ceiling if every day were spent right up to its
// applicable limit: the weekday limit (scaled to the month, whatever period
// it's configured in) plus the fixed weekend threshold for every weekend day.
function monthlyBudgetDisplay(year, month) {
  const weekendDays = countDaysInMonth(year, month, isWeekend);
  const weekdayDays = countDaysInMonth(year, month, (d) => !isWeekend(d));
  const weekendBudget = weekendThresholdDisplay() * weekendDays;
  const weekdayLimit = weekdayLimitAmountDisplay();
  let weekdayBudget;
  if (state.settings.weekdayLimitPeriod === 'day') {
    weekdayBudget = weekdayLimit * weekdayDays;
  } else if (state.settings.weekdayLimitPeriod === 'week') {
    weekdayBudget = weekdayLimit * weeksOverlappingMonth(year, month);
  } else {
    weekdayBudget = weekdayLimit;
  }
  return weekendBudget + weekdayBudget;
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

function render() {
  renderWeekNav();
  renderCurrencyToggle();
  renderRateInfo();
  renderLimitControls();
  renderWeekTable();
  renderChart();
  renderWeekdayLimitPanel();
  renderMonthSummary();
  renderResumo();
}

function renderLimitControls() {
  el.weekdayLimitAmountInput.value = state.settings.weekdayLimitAmount;
  el.weekdayLimitPeriodSelect.value = state.settings.weekdayLimitPeriod;
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

function renderWeekTable() {
  const dates = weekDates();
  const html = dates
    .map((date) => {
      const iso = toISODate(date);
      const expenses = expensesForDate(iso);
      const total = dayTotalDisplay(iso);
      const threshold = dayThreshold(date);
      const over = threshold != null && total > threshold;
      const weekend = isWeekend(date);
      const badge = threshold != null
        ? `<span class="day-badge ${weekend ? 'badge-weekend' : 'badge-weekday'}">limite ${formatAmount(threshold)}</span>`
        : '';

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
        : `<tr class="empty-row"><td></td><td colspan="4" class="empty-day-msg">Sem despesas registadas</td></tr>`;

      return `
      <tbody class="day-group" data-date="${iso}">
        <tr class="day-header-row">
          <td colspan="5">
            <div class="day-header">
              <span class="day-name">${formatDayName(date)}</span>
              <span class="day-date">${formatShortDate(date)}</span>
              ${badge}
              <span class="day-total ${over ? 'total-over' : 'total-under'}">Total: ${formatAmount(total)}</span>
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
    threshold: dayThreshold(date),
  }));
  renderWeekChart(el.chartContainer, days, formatAmount);
}

function renderWeekdayLimitPanel() {
  const period = state.settings.weekdayLimitPeriod;
  if (period === 'day') {
    el.weekdayLimitPanel.hidden = true;
    el.weekdayLimitPanel.innerHTML = '';
    return;
  }

  const limit = weekdayLimitAmountDisplay();
  const items =
    period === 'week'
      ? [{ label: 'Dias de semana (seg–sex) desta semana', spent: weekdayTotalForWeek(state.weekMonday) }]
      : getMonthsInWeek(state.weekMonday).map(({ year, month }) => ({
          label: `Dias de semana em ${formatMonthLabel(year, month)}`,
          spent: weekdayTotalForMonth(year, month),
        }));

  el.weekdayLimitPanel.hidden = false;
  el.weekdayLimitPanel.innerHTML = items
    .map(({ label, spent }) => {
      const over = spent > limit;
      const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 100;
      return `
        <div class="limit-meter">
          <div class="limit-meter-head">
            <span>${label}</span>
            <strong class="${over ? 'total-over' : 'total-under'}">${formatAmount(spent)} / ${formatAmount(limit)}</strong>
          </div>
          <div class="limit-meter-track">
            <div class="limit-meter-fill ${over ? 'limit-meter-fill-over' : ''}" style="width:${pct}%"></div>
          </div>
        </div>`;
    })
    .join('');
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

  const budget = monthlyBudgetDisplay(state.resumoMonth.year, state.resumoMonth.month);
  const budgetOver = spent > budget;
  const budgetPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const budgetDiff = budget - spent;
  const savingsLine = budgetOver
    ? `Excedeste o orçamento em ${formatAmount(-budgetDiff)}`
    : `Poupaste ${formatAmount(budgetDiff)} por não atingir o teto`;
  el.budgetProgress.innerHTML = `
    <div class="limit-meter-head">
      <span>Orçamento mensal (dias de semana + fim de semana)</span>
      <strong class="${budgetOver ? 'total-over' : 'total-under'}">${formatAmount(spent)} / ${formatAmount(budget)} (${Math.round(budgetPct)}%)</strong>
    </div>
    <div class="limit-meter-track">
      <div class="limit-meter-fill ${budgetOver ? 'limit-meter-fill-over' : ''}" style="width:${budgetPct}%"></div>
    </div>
    <div class="budget-savings-line ${budgetOver ? 'balance-negative' : 'balance-positive'}">${savingsLine}</div>
  `;

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
    a.click();
    URL.revokeObjectURL(url);
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
  el.weekdayLimitAmountInput.addEventListener('change', async () => {
    const amount = Math.max(0, parseFloat(el.weekdayLimitAmountInput.value) || 0);
    state.settings = await store.updateSettings({ weekdayLimitAmount: amount });
    render();
  });
  el.weekdayLimitPeriodSelect.addEventListener('change', async () => {
    state.settings = await store.updateSettings({ weekdayLimitPeriod: el.weekdayLimitPeriodSelect.value });
    render();
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
