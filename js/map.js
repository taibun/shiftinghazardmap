// map.js — Leaflet rendering: choropleth polygons, labels, legend, and the
// diagonal-hash "no data" pattern. Designed to be re-run on every year/hazard change.

App.colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, 1]);

/**
 * Ensure a diagonal-hash SVG pattern exists in the map's SVG renderer, for
 * districts with no data. Returns the pattern's URL fill string.
 */
function ensureHashPattern(map, id) {
  try {
    const renderer = map._renderer || map.getRenderer(map._layers ? Object.values(map._layers)[0] : null);
  } catch (e) { /* ignore, we find svg directly below */ }
  const container = map.getContainer();
  let svg = container.querySelector('svg');
  if (!svg) return null;
  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }
  if (!defs.querySelector('#' + id)) {
    const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
    pattern.setAttribute('id', id);
    pattern.setAttribute('width', '6');
    pattern.setAttribute('height', '6');
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('patternTransform', 'rotate(45)');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '6'); rect.setAttribute('height', '6'); rect.setAttribute('fill', '#e8e2d5');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0'); line.setAttribute('y1', '0'); line.setAttribute('x2', '0'); line.setAttribute('y2', '6');
    line.setAttribute('stroke', '#b6ac96'); line.setAttribute('stroke-width', '2');
    pattern.appendChild(rect); pattern.appendChild(line);
    defs.appendChild(pattern);
  }
  return 'url(#' + id + ')';
}

/**
 * Render (or re-render) a choropleth map of all upazila polygons grouped by district.
 *
 * @param {L.Map} map
 * @param {{layer: L.LayerGroup|null, labelLayer: L.LayerGroup|null}} state - mutable refs, updated in place
 * @param {Object} data - processed dataset from App.loadData()
 * @param {string} hazardKey
 * @param {number} year
 * @param {(csvDistrictName: string) => void} onDistrictClick
 * @param {string|null} selectedDistrict
 */
App.renderChoropleth = function (map, state, data, hazardKey, year, onDistrictClick, selectedDistrict) {
  try {
    if (state.layer) { map.removeLayer(state.layer); state.layer = null; }
    const patternId = 'hashpat-' + (map._container ? map._container.id || Math.random().toString(36).slice(2) : 'm');
    const group = L.layerGroup();
    const noDataLayers = [];

    data.csvDistricts.forEach(csvName => {
      const meta = data.districtMeta[csvName];
      if (!meta.matched) return;
      const rec = (data.normByDistrictYear[csvName] || {})[year] || {};
      const val = rec[hazardKey];
      const hasData = val != null;
      const isSelected = selectedDistrict === csvName;

      meta.features.forEach(feature => {
        let layer;
        try {
          layer = L.geoJSON(feature, {
            style: () => ({
              fillColor: hasData ? App.colorScale(val) : '#e8e2d5',
              fillOpacity: hasData ? 0.85 : 0.9,
              color: isSelected ? '#2b2621' : '#8a8072',
              weight: isSelected ? 2 : 0.5,
              fillPattern: !hasData,
            }),
          });
        } catch (e) {
          console.error('Failed to render feature for', csvName, e);
          return;
        }
        if (!hasData) noDataLayers.push(layer);
        layer.on('click', () => {
          try { onDistrictClick(csvName); } catch (e) { console.error('District click handler failed', e); }
        });
        layer.bindTooltip(
          csvName + (hasData ? ': ' + val.toFixed(2) : ': No data'),
          { sticky: true, className: 'hazard-tooltip-wrap' }
        );
        group.addLayer(layer);
      });
    });

    group.addTo(map);
    state.layer = group;

    // Apply the diagonal-hash "no data" pattern now that paths exist in the DOM.
    try {
      const url = ensureHashPattern(map, patternId);
      if (url) {
        noDataLayers.forEach(layer => {
          layer.eachLayer(l => { if (l._path) l._path.setAttribute('fill', url); });
        });
      }
    } catch (e) {
      console.error('Failed to apply no-data pattern', e);
    }
  } catch (err) {
    console.error('renderChoropleth failed:', err);
  }
};

/**
 * Render permanent district name labels at each district's centroid.
 */
App.renderLabels = function (map, state, data) {
  try {
    if (state.labelLayer) { map.removeLayer(state.labelLayer); state.labelLayer = null; }
    const group = L.layerGroup();
    data.csvDistricts.forEach(csvName => {
      const meta = data.districtMeta[csvName];
      if (!meta.matched || !meta.centroid) return;
      const [lng, lat] = meta.centroid;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const icon = L.divIcon({
        className: 'district-label',
        html: csvName,
        iconSize: null,
      });
      group.addLayer(L.marker([lat, lng], { icon, interactive: false }));
    });
    group.addTo(map);
    state.labelLayer = group;
  } catch (err) {
    console.error('renderLabels failed:', err);
  }
};

/**
 * Render a horizontal gradient legend bar with ticks into a container.
 */
App.renderLegend = function (containerEl, hazardLabel, year) {
  try {
    containerEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = hazardLabel + ' — Normalized Exposure — ' + year;
    containerEl.appendChild(title);

    const bar = document.createElement('div');
    bar.className = 'legend-bar';
    const stops = d3.range(0, 1.01, 0.05).map(t => App.colorScale(t) + ' ' + (t * 100) + '%').join(', ');
    bar.style.background = 'linear-gradient(to right, ' + stops + ')';
    containerEl.appendChild(bar);

    const ticks = document.createElement('div');
    ticks.className = 'legend-ticks';
    [0, 0.25, 0.5, 0.75, 1.0].forEach(t => {
      const span = document.createElement('span');
      span.textContent = t.toFixed(2);
      ticks.appendChild(span);
    });
    containerEl.appendChild(ticks);
  } catch (err) {
    console.error('renderLegend failed:', err);
  }
};

App.BD_BOUNDS = [[20.5, 88.0], [26.7, 92.7]];

App.createMap = function (elId) {
  const map = L.map(elId, { scrollWheelZoom: true });
  map.fitBounds(App.BD_BOUNDS);
  L.control.attribution({ prefix: false }).addAttribution('Basemap: none (offline-safe)').addTo(map);
  return map;
};

App.createMiniMap = function (elId) {
  const map = L.map(elId, { scrollWheelZoom: false, zoomControl: false, dragging: false, doubleClickZoom: false });
  map.fitBounds(App.BD_BOUNDS);
  return map;
};
