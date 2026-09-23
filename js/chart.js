// Small self-contained SVG bar chart for the weekly spend view.
// No external chart library: keeps the site dependency-free and offline-friendly.
// Exposed as window.ContasChart (plain script, no ES modules).

(function (global) {
  function roundedTopRectPath(x, y, w, h, r) {
    if (h <= 0 || w <= 0) return '';
    const rr = Math.min(r, h, w / 2);
    return `M ${x},${y + h} L ${x},${y + rr} Q ${x},${y} ${x + rr},${y} L ${x + w - rr},${y} Q ${x + w},${y} ${x + w},${y + rr} L ${x + w},${y + h} Z`;
  }

  /**
   * @param {HTMLElement} container
   * @param {Array<{label:string, dateLabel:string, value:number, threshold:number|null, colorClass?:string}>} days
   *   threshold is null for a bar with no reference limit. colorClass, when
   *   given, overrides the default threshold-based bar color (used for the
   *   per-category totals chart, where color identifies the category).
   * @param {(value:number, opts?:{compact?:boolean}) => string} formatAmount
   * @param {string} [ariaLabel]
   */
  function renderWeekChart(container, days, formatAmount, ariaLabel = 'Gastos diários da semana') {
  const width = 640;
  const height = 280;
  const paddingLeft = 56;
  const paddingRight = 12;
  const paddingTop = 28;
  const paddingBottom = 44;
  const plotW = width - paddingLeft - paddingRight;
  const plotH = height - paddingTop - paddingBottom;

  const maxRaw = Math.max(1, ...days.map((d) => Math.max(d.value, d.threshold ?? 0)));
  const maxVal = maxRaw * 1.2;
  const n = days.length;
  const bandW = plotW / n;
  const barW = Math.min(24, bandW - 10);

  const yFor = (v) => paddingTop + plotH - (v / maxVal) * plotH;
  const xForBand = (i) => paddingLeft + i * bandW;

  const steps = 4;
  let gridlines = '';
  let yTicks = '';
  for (let s = 0; s <= steps; s++) {
    const v = (maxVal / steps) * s;
    const y = yFor(v);
    gridlines += `<line x1="${paddingLeft}" y1="${y.toFixed(1)}" x2="${width - paddingRight}" y2="${y.toFixed(1)}" class="chart-gridline" />`;
    yTicks += `<text x="${paddingLeft - 8}" y="${y.toFixed(1)}" class="chart-tick" text-anchor="end" dominant-baseline="middle">${formatAmount(v, { compact: true })}</text>`;
  }

  let bars = '';
  let valueLabels = '';
  let dayLabels = '';
  const thresholdSegments = [];
  let currentSegment = [];

  days.forEach((d, i) => {
    const x0 = xForBand(i);
    const cx = x0 + bandW / 2;
    const barX = cx - barW / 2;
    const barTop = yFor(d.value);
    const barBottom = yFor(0);
    const barH = Math.max(0, barBottom - barTop);
    const hasThreshold = d.threshold != null;
    const over = hasThreshold && d.value > d.threshold;
    const colorClass = d.colorClass || (!hasThreshold ? 'chart-bar-neutral' : over ? 'chart-bar-over' : 'chart-bar-under');

    bars += `<path class="chart-bar ${colorClass}" data-index="${i}" d="${roundedTopRectPath(barX, barTop, barW, barH, 4)}"></path>`;
    if (d.value > 0) {
      valueLabels += `<text x="${cx}" y="${(barTop - 6).toFixed(1)}" class="chart-value-label" text-anchor="middle">${formatAmount(d.value, { compact: true })}</text>`;
    }
    dayLabels += `<text x="${cx}" y="${height - paddingBottom + 18}" class="chart-axis-label" text-anchor="middle">${d.label}</text>`;
    dayLabels += `<text x="${cx}" y="${height - paddingBottom + 32}" class="chart-axis-label chart-axis-label-muted" text-anchor="middle">${d.dateLabel}</text>`;

    if (hasThreshold) {
      currentSegment.push([x0 + 4, yFor(d.threshold)], [x0 + bandW - 4, yFor(d.threshold)]);
    } else if (currentSegment.length) {
      thresholdSegments.push(currentSegment);
      currentSegment = [];
    }
  });
  if (currentSegment.length) thresholdSegments.push(currentSegment);

  const thresholdPath = thresholdSegments
    .map((seg) => `M ${seg.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ')}`)
    .join(' ');

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="chart-svg" role="img" aria-label="${ariaLabel}">
      ${gridlines}
      <line x1="${paddingLeft}" y1="${yFor(0).toFixed(1)}" x2="${width - paddingRight}" y2="${yFor(0).toFixed(1)}" class="chart-baseline" />
      <path d="${thresholdPath}" class="chart-threshold-line" />
      ${bars}
      ${valueLabels}
      ${dayLabels}
      ${yTicks}
    </svg>
    <div class="chart-tooltip" hidden></div>
  `;

  const tooltip = container.querySelector('.chart-tooltip');
  container.querySelectorAll('.chart-bar').forEach((barEl, i) => {
    const d = days[i];
    const show = (evt) => {
      const hasThreshold = d.threshold != null;
      const over = hasThreshold && d.value > d.threshold;
      const statusLine = hasThreshold
        ? `<br>Limite: ${formatAmount(d.threshold)}<br><span class="${over ? 'tooltip-over' : 'tooltip-under'}">${over ? 'Acima do limite' : 'Dentro do limite'}</span>`
        : '';
      tooltip.hidden = false;
      tooltip.innerHTML = `<strong>${d.label} · ${d.dateLabel}</strong><br>Gasto: ${formatAmount(d.value)}${statusLine}`;
      const rect = container.getBoundingClientRect();
      let left = evt.clientX - rect.left + 12;
      if (left + 160 > rect.width) left = evt.clientX - rect.left - 172;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${evt.clientY - rect.top - 10}px`;
    };
    barEl.addEventListener('mousemove', show);
    barEl.addEventListener('mouseenter', show);
    barEl.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
    barEl.addEventListener('click', show);
  });
  }

  /**
   * @param {HTMLElement} container
   * @param {Array<{label:string, value:number, colorClass:string}>} items
   * @param {(value:number, opts?:{compact?:boolean}) => string} formatAmount
   */
  function renderPieChart(container, items, formatAmount) {
    const total = items.reduce((sum, i) => sum + i.value, 0);
    if (total <= 0) {
      container.innerHTML = '<p class="empty-day-msg">Sem despesas neste mês.</p>';
      return;
    }

    const size = 200;
    const radius = 92;
    const cx = size / 2;
    const cy = size / 2;
    let angle = -Math.PI / 2;

    const slices = items
      .filter((item) => item.value > 0)
      .map((item) => {
        const pct = item.value / total;
        const startAngle = angle;
        const endAngle = angle + pct * Math.PI * 2;
        angle = endAngle;
        const isFullCircle = pct >= 0.9999;
        const x1 = cx + radius * Math.cos(startAngle);
        const y1 = cy + radius * Math.sin(startAngle);
        const x2 = cx + radius * Math.cos(endAngle);
        const y2 = cy + radius * Math.sin(endAngle);
        const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
        const path = isFullCircle
          ? `M ${cx},${cy - radius} A ${radius},${radius} 0 1 1 ${(cx - 0.01).toFixed(2)},${cy - radius} Z`
          : `M ${cx},${cy} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${radius},${radius} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
        return { path, pct, item };
      });

    const paths = slices
      .map(
        ({ path, pct, item }) =>
          `<path class="pie-slice ${item.colorClass}" d="${path}"><title>${item.label}: ${formatAmount(item.value)} (${Math.round(pct * 100)}%)</title></path>`
      )
      .join('');

    const legend = items
      .map((item) => {
        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return `<span class="legend-item"><span class="legend-dot ${item.colorClass}"></span>${item.label} — ${pct}% (${formatAmount(item.value, { compact: true })})</span>`;
      })
      .join('');

    container.innerHTML = `
      <div class="pie-wrap">
        <svg viewBox="0 0 ${size} ${size}" class="pie-svg" role="img" aria-label="Percentagem de gastos por categoria">${paths}</svg>
        <div class="chart-legend pie-legend">${legend}</div>
      </div>
    `;
  }

  global.ContasChart = { renderWeekChart, renderPieChart };
})(window);
