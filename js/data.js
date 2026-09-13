// data.js — loading, joining, and normalizing the Bangladesh climate-hazard dataset.
// Exposes a global `App` namespace that other scripts extend.

window.App = window.App || {};

App.HAZARDS = [
  { key: 'Cyclone_Count',              label: 'Cyclone Exposure',   short: 'Cyclone' },
  { key: 'Flood_Impact_Score',         label: 'Flood Impact',       short: 'Flood' },
  { key: 'Drought_Severity',           label: 'Drought Severity',   short: 'Drought' },
  { key: 'River_Water_Level_m',        label: 'River Water Level',  short: 'River Level' },
  { key: 'Coastal_Erosion_m_per_year', label: 'Coastal Erosion',    short: 'Erosion' },
];

// CSV District name -> GeoJSON district_name
App.ALIASES = {
  'Comilla': 'Cumilla',
  'Chapai Nawabganj': 'Nawabganj',
  'Khagrachhari': 'Khagrachari',
  'Sirajganj': 'Sirajgonj',
};

App.YEAR_MIN = 2000;
App.YEAR_MAX = 2025;

App.ERAS = [
  { start: 2000, end: 2008, label: '2000–2008', color: '#8fa06e' },
  { start: 2009, end: 2016, label: '2009–2016', color: '#c99a4a' },
  { start: 2017, end: 2025, label: '2017–2025', color: '#a0442c' },
];

function toGeoName(csvName) {
  return App.ALIASES[csvName] || csvName;
}

function mean(arr) {
  const v = arr.filter(x => x != null && !Number.isNaN(x));
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function stdev(arr) {
  const v = arr.filter(x => x != null && !Number.isNaN(x));
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / v.length);
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : num / denom;
}

/**
 * Load and process everything. Returns a promise resolving to the processed dataset,
 * or throws with a descriptive error so the caller can show an on-page message.
 */
App.loadData = async function () {
  let csvRaw, geoRaw;

  try {
    csvRaw = await d3.csv('assets/data.csv', d3.autoType);
  } catch (err) {
    throw new Error('Failed to load assets/data.csv: ' + err.message);
  }
  try {
    const resp = await fetch('assets/bangladesh.geojson');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    geoRaw = await resp.json();
  } catch (err) {
    throw new Error('Failed to load assets/bangladesh.geojson: ' + err.message);
  }

  const hazardKeys = App.HAZARDS.map(h => h.key);

  // --- 1. Group GeoJSON upazila features by district_name -------------------
  const geoByDistrict = {};
  geoRaw.features.forEach(f => {
    const name = (f.properties && f.properties.district_name) || '';
    if (!name) return;
    (geoByDistrict[name] = geoByDistrict[name] || []).push(f);
  });

  // Centroid per district = average of each upazila polygon's centroid.
  const centroids = {};
  Object.keys(geoByDistrict).forEach(name => {
    const feats = geoByDistrict[name];
    let sx = 0, sy = 0, n = 0;
    feats.forEach(f => {
      try {
        const c = d3.geoCentroid(f);
        if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) { sx += c[0]; sy += c[1]; n++; }
      } catch (e) { /* skip malformed geometry */ }
    });
    centroids[name] = n ? [sx / n, sy / n] : null;
  });

  // --- 2. CSV districts, alias-match against geojson names -------------------
  const csvDistricts = Array.from(new Set(csvRaw.map(r => r.District))).sort();
  const districtMeta = {}; // csvName -> { geoName, matched, features, centroid }
  csvDistricts.forEach(csvName => {
    const geoName = toGeoName(csvName);
    const matched = !!geoByDistrict[geoName];
    if (!matched) {
      console.warn('[data] No GeoJSON match for CSV district "' + csvName + '" (tried "' + geoName + '")');
    }
    districtMeta[csvName] = {
      geoName,
      matched,
      features: matched ? geoByDistrict[geoName] : [],
      centroid: matched ? centroids[geoName] : null,
    };
  });

  // --- 3. Average duplicate raw rows per (district, year) --------------------
  const byDistrictYear = {}; // csvName -> year -> { hazardKey: avgRawValue, ... , n: rowCount }
  csvRaw.forEach(row => {
    const d = row.District, y = row.Year;
    if (d == null || y == null) return;
    byDistrictYear[d] = byDistrictYear[d] || {};
    byDistrictYear[d][y] = byDistrictYear[d][y] || { rows: [] };
    byDistrictYear[d][y].rows.push(row);
  });

  const avgByDistrictYear = {}; // csvName -> year -> { hazardKey: number|null }
  Object.keys(byDistrictYear).forEach(d => {
    avgByDistrictYear[d] = {};
    Object.keys(byDistrictYear[d]).forEach(yStr => {
      const y = +yStr;
      const rows = byDistrictYear[d][yStr].rows;
      const rec = {};
      hazardKeys.forEach(k => {
        rec[k] = mean(rows.map(r => r[k]));
      });
      avgByDistrictYear[d][y] = rec;
    });
  });

  // --- 4. Global min/max per hazard, over district-year averaged values ------
  const hazardRange = {};
  hazardKeys.forEach(k => {
    const vals = [];
    Object.keys(avgByDistrictYear).forEach(d => {
      Object.keys(avgByDistrictYear[d]).forEach(y => {
        const v = avgByDistrictYear[d][y][k];
        if (v != null && !Number.isNaN(v)) vals.push(v);
      });
    });
    hazardRange[k] = { min: d3.min(vals), max: d3.max(vals) };
  });

  function normalize(key, val) {
    if (val == null || Number.isNaN(val)) return null;
    const { min, max } = hazardRange[key];
    if (min == null || max == null || max === min) return 0.5;
    return (val - min) / (max - min);
  }

  // --- 5. Normalized values + Composite MHVI per district-year ---------------
  const normByDistrictYear = {}; // csvName -> year -> { hazardKey: normVal|null, mhvi: number|null }
  csvDistricts.forEach(d => {
    normByDistrictYear[d] = {};
    for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
      const raw = (avgByDistrictYear[d] && avgByDistrictYear[d][y]) || null;
      const rec = { mhvi: null };
      hazardKeys.forEach(k => { rec[k] = raw ? normalize(k, raw[k]) : null; });
      const allPresent = hazardKeys.every(k => rec[k] != null);
      rec.mhvi = allPresent ? mean(hazardKeys.map(k => rec[k])) : null;
      normByDistrictYear[d][y] = rec;
    }
  });

  // --- 6. National yearly averages per hazard (+ anomalies) ------------------
  const nationalByYear = {}; // hazardKey -> year -> avgNorm
  const nationalStats = {};  // hazardKey -> { mean, std, anomalies: [year,...] }
  hazardKeys.forEach(k => {
    nationalByYear[k] = {};
    for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
      const vals = csvDistricts
        .map(d => normByDistrictYear[d][y][k])
        .filter(v => v != null);
      nationalByYear[k][y] = vals.length ? mean(vals) : null;
    }
    const series = [];
    for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) if (nationalByYear[k][y] != null) series.push(nationalByYear[k][y]);
    const m = mean(series), s = stdev(series);
    const anomalies = [];
    if (m != null && s) {
      for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
        const v = nationalByYear[k][y];
        if (v != null && Math.abs(v - m) > 1.5 * s) anomalies.push(y);
      }
    }
    nationalStats[k] = { mean: m, std: s, anomalies };
  });

  // --- 7. Era comparison per hazard (trend strength) --------------------------
  const eraStats = {}; // hazardKey -> { era1Avg(2000-2012), era2Avg(2013-2025), pctChange }
  hazardKeys.forEach(k => {
    const e1 = [], e2 = [];
    for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
      const v = nationalByYear[k][y];
      if (v == null) continue;
      if (y <= 2012) e1.push(v); else e2.push(v);
    }
    const a1 = mean(e1), a2 = mean(e2);
    eraStats[k] = {
      era1Avg: a1, era2Avg: a2,
      pctChange: (a1 != null && a2 != null && a1 !== 0) ? ((a2 - a1) / Math.abs(a1)) * 100 : null,
    };
  });

  // --- 8. District x hazard "high exposure" year counts (>=0.6) --------------
  const highExposureCounts = {}; // hazardKey -> [{district, count}]
  hazardKeys.forEach(k => {
    const counts = csvDistricts.map(d => {
      let c = 0;
      for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
        const v = normByDistrictYear[d][y][k];
        if (v != null && v >= 0.6) c++;
      }
      return { district: d, count: c };
    });
    counts.sort((a, b) => b.count - a.count);
    highExposureCounts[k] = counts.slice(0, 5);
  });

  // --- 9. Most-frequently-vulnerable-across-all-5-hazards district -----------
  // "vulnerable" year for a hazard = normalized value >= 0.6; count district-years
  // where the district was vulnerable across all five hazards simultaneously.
  const compoundCounts = csvDistricts.map(d => {
    let c = 0;
    for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
      const rec = normByDistrictYear[d][y];
      if (hazardKeys.every(k => rec[k] != null && rec[k] >= 0.6)) c++;
    }
    return { district: d, count: c };
  }).sort((a, b) => b.count - a.count);

  // --- 10. Pearson correlation: River Water Level vs Flood Impact ------------
  const scatterPoints = [];
  csvDistricts.forEach(d => {
    for (let y = App.YEAR_MIN; y <= App.YEAR_MAX; y++) {
      const rec = normByDistrictYear[d][y];
      if (rec.River_Water_Level_m != null && rec.Flood_Impact_Score != null) {
        scatterPoints.push({ district: d, year: y, x: rec.River_Water_Level_m, y_: rec.Flood_Impact_Score });
      }
    }
  });
  const corr = pearson(scatterPoints.map(p => p.x), scatterPoints.map(p => p.y_));

  return {
    csvDistricts,
    districtMeta,
    geoByDistrict,
    avgByDistrictYear,
    normByDistrictYear,
    hazardRange,
    nationalByYear,
    nationalStats,
    eraStats,
    highExposureCounts,
    compoundCounts,
    scatterPoints,
    correlation: corr,
    geoRaw,
  };
};
