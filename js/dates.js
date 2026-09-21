// Date/week helpers. Exposed as window.ContasDates (plain script, no ES modules).

(function (global) {
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function getMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function formatDayName(date) {
    const name = date.toLocaleDateString('pt-PT', { weekday: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function formatShortDate(date) {
    return date.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  }

  function formatWeekRange(monday) {
    const sunday = addDays(monday, 6);
    const start = monday.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
    const end = sunday.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${start} – ${end}`;
  }

  // Returns the distinct {year, month} pairs (month is 0-11) touched by the Mon-Sun week.
  function getMonthsInWeek(monday) {
    const months = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!months.some((m) => `${m.year}-${m.month}` === key)) {
        months.push({ year: d.getFullYear(), month: d.getMonth() });
      }
    }
    return months;
  }

  function formatMonthLabel(year, month) {
    const d = new Date(year, month, 1);
    const label = d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  // Adds n months to a {year, month} pair (month is 0-11), wrapping the year.
  function addMonths({ year, month }, n) {
    const total = month + n;
    return { year: year + Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
  }

  global.ContasDates = {
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
  };
})(window);
