// charts.js — D3-based chart builders used across the detail panel, trends,
// distributions, correlation, and rankings sections. Each function renders into
// a given container selection and is defensive against missing/NaN data.

App.Charts = {};

const CHART_FONT = "'Inter', sans-serif";
const MUTED = '#5c554c';
const LINE_COLOR = '#ddd3c1';
const ACCENT = '#a0442c';
const OLIVE = '#6b7a4f';

function clearAndSvg(container, width, height, margin) {
  container.innerHTML = '';
  const svg = d3.select(container).append('svg')
    .attr('width', width).attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('font-family', CHART_FONT);
  return svg;
}

/** Horizontal bar chart of the 5 hazards' normalized values for one district-year. */
App.Charts.hazardBar = function (container, hazardValues) {
  try {
    const width = 420, height = 220, margin = { top: 8, right: 40, bottom: 8, left: 110 };
    const svg = clearAndSvg(container, width, height, margin);
    const data = hazardValues.slice().sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    const innerH = height - margin.top - margin.bottom;
    const innerW = width - margin.left - margin.right;
    const y = d3.scaleBand().domain(data.map(d => d.label)).range([0, innerH]).padding(0.28);
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.selectAll('.bar').data(data).join('rect')
      .attr('y', d => y(d.label))
      .attr('height', y.bandwidth())
      .attr('x', 0)
      .attr('width', d => d.value == null ? innerW : x(d.value))
      .attr('fill', d => d.value == null ? 'none' : App.colorScale(d.value))
      .attr('stroke', d => d.value == null ? '#999' : 'none')
      .attr('stroke-dasharray', d => d.value == null ? '4,3' : null)
      .attr('rx', 2);

    g.selectAll('.lbl').data(data).join('text')
      .attr('x', -8).attr('y', d => y(d.label) + y.bandwidth() / 2)
      .attr('dy', '0.32em').attr('text-anchor', 'end')
      .style('font-size', '11px').style('fill', MUTED)
      .text(d => d.label);

    g.selectAll('.val').data(data).join('text')
      .attr('x', d => d.value == null ? 6 : x(d.value) + 6)
      .attr('y', d => y(d.label) + y.bandwidth() / 2)
      .attr('dy', '0.32em')
      .style('font-size', '10.5px').style('fill', '#2b2621').style('font-weight', 600)
      .text(d => d.value == null ? 'No data' : d.value.toFixed(2));
  } catch (err) { console.error('hazardBar failed', err); }
};

/** Dumbbell chart: min-max range per hazard with a marker for the selected year's value. */
App.Charts.dumbbell = function (container, rows) {
  try {
    const width = 420, height = 220, margin = { top: 8, right: 40, bottom: 8, left: 110 };
    const svg = clearAndSvg(container, width, height, margin);
    const innerH = height - margin.top - margin.bottom;
    const innerW = width - margin.left - margin.right;
    const y = d3.scaleBand().domain(rows.map(d => d.label)).range([0, innerH]).padding(0.32);
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    rows.forEach(d => {
      const cy = y(d.label) + y.bandwidth() / 2;
      if (d.min == null || d.max == null) {
        g.append('text').attr('x', 6).attr('y', cy).attr('dy', '0.32em')
          .style('font-size', '10.5px').style('fill', '#999').text('No data');
      } else {
        g.append('line').attr('x1', x(d.min)).attr('x2', x(d.max)).attr('y1', cy).attr('y2', cy)
          .attr('stroke', LINE_COLOR).attr('stroke-width', 4).attr('stroke-linecap', 'round');
        g.append('circle').attr('cx', x(d.min)).attr('cy', cy).attr('r', 3.5).attr('fill', '#8a8072');
        g.append('circle').attr('cx', x(d.max)).attr('cy', cy).attr('r', 3.5).attr('fill', '#8a8072');
        if (d.current != null) {
          g.append('circle').attr('cx', x(d.current)).attr('cy', cy).attr('r', 5.5)
            .attr('fill', ACCENT).attr('stroke', '#fff').attr('stroke-width', 1.5);
        }
      }
      g.append('text').attr('x', -8).attr('y', cy).attr('dy', '0.32em').attr('text-anchor', 'end')
        .style('font-size', '11px').style('fill', MUTED).text(d.label);
    });
  } catch (err) { console.error('dumbbell failed', err); }
};

/** Simple line chart of MHVI across years. */
App.Charts.mhviLine = function (container, series /* [{year, value}] */) {
  try {
    const width = 640, height = 220, margin = { top: 14, right: 20, bottom: 26, left: 40 };
    const svg = clearAndSvg(container, width, height, margin);
    const innerH = height - margin.top - margin.bottom;
    const innerW = width - margin.left - margin.right;
    const x = d3.scaleLinear().domain([App.YEAR_MIN, App.YEAR_MAX]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')))
      .call(sel => sel.selectAll('text').style('font-size', '10px').style('fill', MUTED))
      .call(sel => sel.selectAll('line,path').attr('stroke', LINE_COLOR));
    g.append('g').call(d3.axisLeft(y).ticks(4))
      .call(sel => sel.selectAll('text').style('font-size', '10px').style('fill', MUTED))
      .call(sel => sel.selectAll('line,path').attr('stroke', LINE_COLOR));

    const valid = series.filter(d => d.value != null);
    const line = d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
    g.append('path').datum(valid).attr('fill', 'none').attr('stroke', ACCENT).attr('stroke-width', 2).attr('d', line);
    g.selectAll('.pt').data(valid).join('circle')
      .attr('cx', d => x(d.year)).attr('cy', d => y(d.value)).attr('r', 2.5).attr('fill', ACCENT);
  } catch (err) { console.error('mhviLine failed', err); }
};

/** National trend line with 3 colored era segments, boundary dividers, and anomaly markers. */
App.Charts.trendChart = function (container, hazardLabel, byYear, stats) {
  try {
    const width = 320, height = 190, margin = { top: 16, right: 14, bottom: 24, left: 34 };
    const svg = clearAndSvg(container, width, height, margin);
    const innerH = height - margin.top - margin.bottom;
    const innerW = width - margin.left - margin.right;
    const x = d3.scaleLinear().domain([App.YEAR_MIN, App.YEAR_MAX]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).tickValues([2000, 2008, 2009, 2016, 2017, 2025]).tickFormat(d3.format('d')))
      .call(sel => sel.selectAll('text').style('font-size', '8.5px').style('fill', MUTED).attr('transform', 'rotate(0)'))
      .call(sel => sel.selectAll('line,path').attr('stroke', LINE_COLOR));
    g.append('g').call(d3.axisLeft(y).ticks(3))
      .call(sel => sel.selectAll('text').style('font-size', '9px').style('fill', MUTED))
      .call(sel => sel.selectAll('line,path').attr('stroke', LINE_COLOR));

    App.ERAS.forEach(era => {
      const pts = [];
      for (let yr = era.start; yr <= era.end; yr++) {
        const v = byYear[yr];
        if (v != null) pts.push({ year: yr, value: v });
      }
      const line = d3.line().x(d => x(d.year)).y(d => y(d.value)).curve(d3.curveMonotoneX);
      g.append('path').datum(pts).attr('fill', 'none').attr('stroke', era.color).attr('stroke-width', 2).attr('d', line);
    });

    // Era boundary dividers
    [2008.5, 2016.5].forEach(b => {
      g.append('line').attr('x1', x(b)).attr('x2', x(b)).attr('y1', 0).attr('y2', innerH)
        .attr('stroke', '#b6ac96').attr('stroke-dasharray', '3,3');
    });

    // Anomaly markers
    (stats.anomalies || []).forEach(yr => {
      const v = byYear[yr];
      if (v == null) return;
      g.append('circle').attr('cx', x(yr)).attr('cy', y(v)).attr('r', 5)
        .attr('fill', 'none').attr('stroke', '#2b2621').attr('stroke-width', 1.5);
      g.append('text').attr('x', x(yr)).attr('y', y(v) - 8).attr('text-anchor', 'middle')
        .style('font-size', '8.5px').style('fill', '#2b2621').style('font-weight', 700).text(yr);
    });
  } catch (err) { console.error('trendChart failed', err); }
};

/** Kernel density estimate plot for a hazard's normalized values across all district-years. */
App.Charts.densityChart = function (container, values, overlayValue) {
  try {
    const width = 320, height = 190, margin = { top: 16, right: 14, bottom: 24, left: 30 };
    const svg = clearAndSvg(container, width, height, margin);
    const innerH = height - margin.top - margin.bottom;
    const innerW = width - margin.left - margin.right;
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);

    const bandwidth = 0.06;
    function kernelEpanechnikov(k) {
      return v => Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    }
    const kde = (() => {
      const kernel = kernelEpanechnikov(bandwidth);
      const grid = d3.range(0, 1.001, 1 / 200);
      return grid.map(t => [t, d3.mean(values, v => kernel(t - v)) || 0]);
    })();
    const y = d3.scaleLinear().domain([0, d3.max(kde, d => d[1]) || 1]).range([innerH, 0]);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(x).ticks(5))
      .call(sel => sel.selectAll('text').style('font-size', '9px').style('fill', MUTED))
      .call(sel => sel.selectAll('line,path').attr('stroke', LINE_COLOR));

    const area = d3.area().x(d => x(d[0])).y0(innerH).y1(d => y(d[1])).curve(d3.curveBasis);
    g.append('path').datum(kde).attr('fill', OLIVE).attr('fill-opacity', 0.35)
      .attr('stroke', OLIVE).attr('stroke-width', 1.5).attr('d', area);

    g.append('line').attr('x1', x(0.6)).attr('x2', x(0.6)).attr('y1', 0).attr('y2', innerH)
      .attr('stroke', '#7a2015').attr('stroke-dasharray', '4,3');
    g.append('text').attr('x', x(0.6) + 3).attr('y', 10).style('font-size', '8px').style('fill', '#7a2015').text('0.6');

    if (overlayValue != null) {
      g.append('circle').attr('cx', x(overlayValue)).attr('cy', innerH).attr('r', 5)
        .attr('fill', ACCENT).attr('stroke', '#fff').attr('stroke-width', 1.5);
      g.append('line').attr('x1', x(overlayValue)).attr('x2', x(overlayValue)).attr('y1', innerH).attr('y2', 0)
        .attr('stroke', ACCENT).attr('stroke-width', 1.2).attr('stroke-dasharray', '2,2');
    }
  } catch (err) { console.error('densityChart failed', err); }
};

/** Scatter plot with fitted linear trend line. */
App.Charts.scatterChart = function (container, points /* [{x,y}] */, r) {
  try {
    const width = 620, height = 420, margin = { top: 20, right: 24, bottom: 44, left: 50 };
    const svg = clearAndSvg(container, width, height, margin);
    const innerH = height - margin.top - margin.bottom;
    const innerW = width - margin.left - margin.right;
    const x = d3.scaleLinear().domain([0, 1]).range([0, innerW]);
    const y = d3.scaleLinear().domain([0, 1]).range([innerH, 0]);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(6))
      .call(sel => sel.selectAll('text').style('font-size', '10px').style('fill', MUTED))
      .call(sel => sel.selectAll('line,path').attr('stroke', LINE_COLOR));
    g.append('g').call(d3.axisLeft(y).ticks(6))
      .call(sel => sel.selectAll('text').style('font-size', '10px').style('fill', MUTED))
      .call(sel => sel.selectAll('line,path').attr('stroke', LINE_COLOR));

    g.append('text').attr('x', innerW / 2).attr('y', innerH + 36).attr('text-anchor', 'middle')
      .style('font-size', '11px').style('fill', MUTED).text('River Water Level (normalized)');
    g.append('text').attr('transform', `translate(${-38},${innerH / 2}) rotate(-90)`).attr('text-anchor', 'middle')
      .style('font-size', '11px').style('fill', MUTED).text('Flood Impact (normalized)');

    g.selectAll('.pt').data(points).join('circle')
      .attr('cx', d => x(d.x)).attr('cy', d => y(d.y_)).attr('r', 2.5)
      .attr('fill', OLIVE).attr('fill-opacity', 0.45);

    // Fitted linear trend (least squares)
    const n = points.length;
    if (n > 1) {
      const mx = d3.mean(points, d => d.x), my = d3.mean(points, d => d.y_);
      let num = 0, den = 0;
      points.forEach(p => { num += (p.x - mx) * (p.y_ - my); den += (p.x - mx) * (p.x - mx); });
      const slope = den === 0 ? 0 : num / den;
      const intercept = my - slope * mx;
      const x0 = 0, x1 = 1;
      g.append('line')
        .attr('x1', x(x0)).attr('y1', y(Math.max(0, Math.min(1, slope * x0 + intercept))))
        .attr('x2', x(x1)).attr('y2', y(Math.max(0, Math.min(1, slope * x1 + intercept))))
        .attr('stroke', ACCENT).attr('stroke-width', 2.5);
    }
  } catch (err) { console.error('scatterChart failed', err); }
};
