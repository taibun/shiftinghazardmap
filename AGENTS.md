# AGENTS.md

## Architecture

Static, single-page site. No build tools, no npm, no bundler — files are served as-is.

- `index.html` — page structure: masthead, key findings, interactive map, detail panel, national trends, distributions, correlation, rankings.
- `style.css` — editorial/cartographic-report styling (serif headings via "Source Serif 4", sans-serif body via "Inter"), muted earth-tone palette, light background only.
- `js/data.js` — loads `assets/data.csv` and `assets/bangladesh.geojson`, joins them via the district-name alias table, averages duplicate raw rows per district-year, min-max normalizes each of the 5 hazard indicators across all district-years, computes the Composite MHVI, and derives all downstream statistics (national trends, era comparisons, anomalies, correlation, rankings). This is the single source of truth for all numbers on the page — nothing is hardcoded.
- `js/map.js` — Leaflet rendering: the choropleth (544 upazila polygons styled per their parent district), permanent district labels at centroids, the gradient legend, and the diagonal-hash "no data" SVG pattern.
- `js/charts.js` — D3 chart builders (bar, dumbbell/range, line, KDE density, scatter). Each function is self-contained and defensive (try/catch, null-safe) so one broken chart cannot break the page.
- `js/main.js` — orchestrator: wires the hazard dropdown, year slider/play button, map clicks, and the "Clear" control to re-renders of the map and every chart section.

## Key decisions

- **Alias table** (`App.ALIASES` in `js/data.js`) maps `data.csv`'s `District` values to the GeoJSON's `district_name` values where spellings differ (e.g. "Comilla" → "Cumilla"). Any CSV district that still doesn't match after aliasing logs a `console.warn` rather than crashing.
- **Districts are never dissolved geometrically.** Upazila polygons are grouped by shared `district_name` and styled identically per district — the GeoJSON's 544 individual polygons are all still rendered.
- **Missing data is never estimated.** A missing district-year value renders as "No data" (bar charts show a dashed gray bar; the map shows a diagonal-hash pattern). The Composite MHVI for a district-year is only computed when all 5 underlying hazard indicators are present for that year.
- **Normalization is global**, not per-year or per-district: each hazard's min/max is taken across all district-year averages in the dataset, and duplicate raw rows for the same district-year are averaged *before* normalization.
- Map layers (choropleth + labels) are fully destroyed and rebuilt on every year/hazard change, and click listeners are re-attached each time — Leaflet layers aren't diffed/reused.
- Each render function (map, legend, labels, each chart) wraps its own logic in try/catch so a failure in one section doesn't take down the rest of the page.

## Conventions

- No comments explaining *what* code does — only short comments where a non-obvious constraint (e.g. the averaging-before-normalizing order) would otherwise surprise a reader.
- All hazard metadata (key, display label, short label) lives in `App.HAZARDS` — add new hazards there rather than hardcoding strings elsewhere.
