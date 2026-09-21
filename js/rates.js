// EUR -> CZK exchange rate, cached in localStorage and refreshed once a day.
// Frankfurter (frankfurter.app) is a free, key-less, CORS-friendly rates API.
// Exposed as window.ContasRates (plain script, no ES modules).

(function (global) {
  const RATE_KEY = 'contas_rate_v1';
  const DEFAULT_RATE = 25; // used only if there is no cache and the network call fails
  const API_URL = 'https://api.frankfurter.app/latest?from=EUR&to=CZK';

  function readCache() {
    try {
      const raw = localStorage.getItem(RATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeCache(data) {
    localStorage.setItem(RATE_KEY, JSON.stringify(data));
  }

  function isSameDay(isoTimestamp) {
    const d = new Date(isoTimestamp);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  // Returns { rate, fetchedAt, stale }. `stale` means the value is a cached/
  // fallback value, not a value fetched moments ago.
  async function getRate({ forceRefresh = false } = {}) {
    const cached = readCache();
    if (cached && !forceRefresh && isSameDay(cached.fetchedAt)) {
      return { ...cached, stale: false };
    }

    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rate = data?.rates?.CZK;
      if (!rate) throw new Error('Resposta sem taxa CZK');
      const fresh = { rate, fetchedAt: new Date().toISOString() };
      writeCache(fresh);
      return { ...fresh, stale: false };
    } catch (err) {
      if (cached) return { ...cached, stale: true };
      return { rate: DEFAULT_RATE, fetchedAt: null, stale: true };
    }
  }

  global.ContasRates = { getRate };
})(window);
