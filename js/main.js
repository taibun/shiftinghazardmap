// main.js — wires data loading, map, controls, detail panel, and all chart
// sections together.

(function () {
  const state = {
    data: null,
    hazardKey: 'Flood_Impact_Score',
    year: App.YEAR_MIN,
    selectedDistrict: null,
    playing: false,
    playTimer: null,
    mapState: { layer: null, labelLayer: null },
    riverMapState: { layer: null, labelLayer: null },
    floodMapState: { layer: null, labelLayer: null },
  };

  let map, riverMap, floodMap;

  function showLoadError(msg) {
    const el = document.getElementById('load-error');
    el.style.display = 'block';
    el.textContent = 'Could not load the data needed for this page: ' + msg + ' Please check that assets/data.csv and assets/bangladesh.geojson are present.';
  }

  function hazardLabel(key) {
    const h = App.HAZARDS.find(h => h.key === key);
    return h ? h.label : key;
  }

  async function init() {
    try {
      state.data = await App.loadData();
    } catch (err) {
      console.error(err);
      showLoadError(err.message);
      return;
    }

    try { map = App.createMap('map'); } catch (err) { console.error('Map init failed', err); }
    try { riverMap = App.createMiniMap('ref-map-river'); } catch (err) { console.error('Ref map (river) init failed', err); }
    try { floodMap = App.createMiniMap('ref-map-flood'); } catch (err) { console.error('Ref map (flood) init failed', err); }

    renderAll();
    wireControls();
  }

  function renderAll() {
    renderMainMap();
    renderReferenceMaps();
    renderKeyFindings();
    renderDetailPanel();
    renderTrends();
    renderDistributions();
    renderCorrelation();
    renderRankings();
  }

  function renderMainMap() {
    if (!map) return;
    App.renderChoropleth(map, state.mapState, state.data, state.hazardKey, state.year, onDistrictClick, state.selectedDistrict);
    App.renderLabels(map, state.mapState, state.data);
    App.renderLegend(document.getElementById('legend'), hazardLabel(state.hazardKey), state.year);
  }

  function renderReferenceMaps() {
    if (riverMap) {
      App.renderChoropleth(riverMap, state.riverMapState, state.data, 'River_Water_Level_m', state.year, () => {}, null);
      App.renderLegend(document.getElementById('ref-legend-river'), 'River Water Level', state.year);
    }
    if (floodMap) {
      App.renderChoropleth(floodMap, state.floodMapState, state.data, 'Flood_Impact_Score', state.year, () => {}, null);
      App.renderLegend(document.getElementById('ref-legend-flood'), 'Flood Impact', state.year);
    }
  }

  function onDistrictClick(csvName) {
    state.selectedDistrict = csvName;
    renderMainMap();
    renderDetailPanel();
    renderDistributions(); // overlay marker depends on selection
  }

  function wireControls() {
    const hazardSelect = document.getElementById('hazard-select');
    hazardSelect.value = state.hazardKey;
    hazardSelect.addEventListener('change', () => {
      state.hazardKey = hazardSelect.value;
      renderMainMap();
    });

    const yearSlider = document.getElementById('year-slider');
    const yearLabel = document.getElementById('year-label');
    yearSlider.value = state.year;
    yearLabel.textContent = state.year;
    yearSlider.addEventListener('input', () => {
      state.year = +yearSlider.value;
      yearLabel.textContent = state.year;
      renderMainMap();
      renderReferenceMaps();
      renderDetailPanel();
    });

    const playBtn = document.getElementById('play-btn');
    playBtn.addEventListener('click', () => {
      state.playing = !state.playing;
      playBtn.innerHTML = state.playing ? '&#10074;&#10074;' : '&#9654;';
      if (state.playing) {
        state.playTimer = setInterval(() => {
          let next = state.year + 1;
          if (next > App.YEAR_MAX) next = App.YEAR_MIN;
          state.year = next;
          yearSlider.value = next;
          yearLabel.textContent = next;
          renderMainMap();
          renderReferenceMaps();
          renderDetailPanel();
        }, 900);
      } else {
        clearInterval(state.playTimer);
      }
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      state.selectedDistrict = null;
      renderMainMap();
      renderDetailPanel();
      renderDistributions();
    });
  }

  // ---------------------------------------------------------------- Findings

  function renderKeyFindings() {
    try {
      const d = state.data;
      const list = document.getElementById('key-findings');
      list.innerHTML = '';
      const items = [];

      const topCompound = d.compoundCounts[0];
      if (topCompound && topCompound.count > 0) {
        items.push(`<strong>${topCompound.district}</strong> shows the most persistent compound vulnerability, ranking high (≥0.6 normalized) across all five hazards simultaneously in <strong>${topCompound.count} of 26 years</strong>.`);
      } else {
        items.push('No district registered high (≥0.6) normalized exposure across all five hazards in the same year over 2000–2025.');
      }

      let strongest = null;
      App.HAZARDS.forEach(h => {
        const e = d.eraStats[h.key];
        if (e.pctChange != null && (strongest == null || Math.abs(e.pctChange) > Math.abs(strongest.pctChange))) {
          strongest = { label: h.label, pctChange: e.pctChange };
        }
      });
      if (strongest) {
        const dir = strongest.pctChange >= 0 ? 'increase' : 'decrease';
        items.push(`<strong>${strongest.label}</strong> is the strongest driver nationally, with a <strong>${Math.abs(strongest.pctChange).toFixed(1)}% ${dir}</strong> from the 2000–2012 average to the 2013–2025 average.`);
      }

      if (d.correlation != null) {
        const strength = Math.abs(d.correlation) > 0.6 ? 'a strong' : Math.abs(d.correlation) > 0.3 ? 'a moderate' : 'a weak';
        const direction = d.correlation >= 0 ? 'positive' : 'negative';
        items.push(`River water level and flood impact show ${strength} ${direction} association nationally (Pearson r = <strong>${d.correlation.toFixed(2)}</strong>).`);
      }

      const anomalySentences = [];
      App.HAZARDS.forEach(h => {
        const anomalies = d.nationalStats[h.key].anomalies;
        if (anomalies && anomalies.length) {
          anomalySentences.push(`${h.label} (${anomalies.join(', ')})`);
        }
      });
      if (anomalySentences.length) {
        items.push(`National anomaly years (&gt;1.5 standard deviations from the 26-year mean) occurred in: ${anomalySentences.join('; ')}.`);
      } else {
        items.push('No national anomaly years (>1.5 standard deviations from the 26-year mean) were detected for any hazard.');
      }

      items.forEach(html => {
        const li = document.createElement('li');
        li.innerHTML = html;
        list.appendChild(li);
      });
    } catch (err) {
      console.error('renderKeyFindings failed', err);
    }
  }

  // ------------------------------------------------------------ Detail panel

  function renderDetailPanel() {
    const panel = document.getElementById('detail-panel');
    if (!state.selectedDistrict) {
      panel.className = 'detail-panel empty';
      panel.innerHTML = '<p class="panel-placeholder">Click a district on the map to see its detailed hazard profile.</p>';
      return;
    }
    try {
      const d = state.data;
      const district = state.selectedDistrict;
      const rec = (d.normByDistrictYear[district] || {})[state.year] || {};

      panel.className = 'detail-panel';
      panel.innerHTML = `
        <div class="detail-header">
          <h3>${district}</h3>
          <span class="year-tag">${state.year}</span>
        </div>
        <div class="detail-charts">
          <div class="detail-chart">
            <h4>Hazards this year (normalized)</h4>
            <div id="chart-bar"></div>
          </div>
          <div class="detail-chart">
            <h4>26-year range per hazard</h4>
            <div id="chart-dumbbell"></div>
          </div>
          <div class="detail-chart" style="grid-column: 1 / -1;">
            <h4>Composite MHVI, 2000&ndash;2025</h4>
            <div id="chart-mhvi"></div>
          </div>
        </div>
      `;

      const barData = App.HAZARDS.map(h => ({ label: h.short, value: rec[h.key] }));
      App.Charts.hazardBar(document.getElementById('chart-bar'), barData);

      const dumbbellData = App.HAZARDS.map(h => {
        const vals = [];
        for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
          const v = (d.normByDistrictYear[district] || {})[y];
          if (v && v[h.key] != null) vals.push(v[h.key]);
        }
        return {
          label: h.short,
          min: vals.length ? d3.min(vals) : null,
          max: vals.length ? d3.max(vals) : null,
          current: rec[h.key],
        };
      });
      App.Charts.dumbbell(document.getElementById('chart-dumbbell'), dumbbellData);

      const mhviSeries = [];
      for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
        const v = (d.normByDistrictYear[district] || {})[y];
        mhviSeries.push({ year: y, value: v ? v.mhvi : null });
      }
      App.Charts.mhviLine(document.getElementById('chart-mhvi'), mhviSeries);
    } catch (err) {
      console.error('renderDetailPanel failed', err);
      panel.innerHTML = '<p class="panel-placeholder">Something went wrong rendering this district. See console for details.</p>';
    }
  }

  // ------------------------------------------------------------------ Trends

  function renderTrends() {
    try {
      const container = document.getElementById('trend-charts');
      container.innerHTML = '';
      App.HAZARDS.forEach(h => {
        const card = document.createElement('div');
        card.className = 'chart-card';
        const chartDiv = document.createElement('div');
        card.innerHTML = `<h4>${h.label}</h4>`;
        card.appendChild(chartDiv);
        const sentence = document.createElement('p');
        sentence.className = 'chart-sentence';
        const e = state.data.eraStats[h.key];
        if (e.pctChange != null) {
          const dir = e.pctChange >= 0 ? 'higher' : 'lower';
          sentence.innerHTML = `<strong>${Math.abs(e.pctChange).toFixed(0)}% ${dir}</strong> in the most recent era (2017–2025) vs. 2000–2008, comparing full-era averages of 2013–2025 to 2000–2012.`;
        } else {
          sentence.textContent = 'Not enough data to compare eras.';
        }
        card.appendChild(sentence);
        container.appendChild(card);
        App.Charts.trendChart(chartDiv, h.label, state.data.nationalByYear[h.key], state.data.nationalStats[h.key]);
      });
    } catch (err) { console.error('renderTrends failed', err); }
  }

  // ------------------------------------------------------------ Distributions

  function renderDistributions() {
    try {
      const container = document.getElementById('density-charts');
      container.innerHTML = '';
      App.HAZARDS.forEach(h => {
        const card = document.createElement('div');
        card.className = 'chart-card';
        const chartDiv = document.createElement('div');
        card.innerHTML = `<h4>${h.label}</h4>`;
        card.appendChild(chartDiv);
        container.appendChild(card);

        const values = [];
        state.data.csvDistricts.forEach(d => {
          for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
            const v = (state.data.normByDistrictYear[d] || {})[y];
            if (v && v[h.key] != null) values.push(v[h.key]);
          }
        });

        let overlay = null;
        if (state.selectedDistrict) {
          const rec = (state.data.normByDistrictYear[state.selectedDistrict] || {})[state.year];
          overlay = rec ? rec[h.key] : null;
        }
        App.Charts.densityChart(chartDiv, values, overlay);
      });
    } catch (err) { console.error('renderDistributions failed', err); }
  }

  // ------------------------------------------------------------- Correlation

  function renderCorrelation() {
    try {
      const d = state.data;
      App.Charts.scatterChart(document.getElementById('scatter-chart'), d.scatterPoints, d.correlation);
      const textEl = document.getElementById('correlation-text');
      if (d.correlation == null) {
        textEl.textContent = 'Not enough overlapping data to compute a correlation.';
      } else {
        const strength = Math.abs(d.correlation) > 0.6 ? 'strong' : Math.abs(d.correlation) > 0.3 ? 'moderate' : 'weak';
        const direction = d.correlation >= 0 ? 'positive' : 'negative';
        textEl.innerHTML = `Pearson <em>r</em> = <strong>${d.correlation.toFixed(2)}</strong> — a ${strength} ${direction} association: ${direction === 'positive' ? 'higher river water levels tend to co-occur with higher flood impact scores' : 'higher river water levels tend to co-occur with lower flood impact scores'} across district-years. This is an association, not a causal claim.`;
      }
    } catch (err) { console.error('renderCorrelation failed', err); }
  }

  // --------------------------------------------------------------- Rankings

  function renderRankings() {
    try {
      const container = document.getElementById('rankings-grid');
      container.innerHTML = '';
      App.HAZARDS.forEach(h => {
        const card = document.createElement('div');
        card.className = 'ranking-card';
        const top5 = state.data.highExposureCounts[h.key];
        const items = top5.map(r => `<li><span class="rank-name">${r.district}</span><span class="rank-count">${r.count} of 26 years</span></li>`).join('');
        card.innerHTML = `<h4>${h.label}</h4><ol>${items || '<li>No districts met the threshold</li>'}</ol>`;
        container.appendChild(card);
      });
    } catch (err) { console.error('renderRankings failed', err); }
  }

  init();
})();
