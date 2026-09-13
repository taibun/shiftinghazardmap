# Bangladesh Climate-Hazard Data Story

A single-page, static data-story website exploring 26 years (2000–2025) of district-level climate-hazard data across Bangladesh: cyclone exposure, flood impact, drought severity, river water level, and coastal erosion.

## Technologies

- Plain HTML, CSS, and vanilla JavaScript — no build step, no frameworks, no npm.
- [Leaflet.js](https://leafletjs.com/) (via CDN) for the interactive choropleth maps.
- [D3.js](https://d3js.org/) (via CDN) for data loading, statistics, and all charts (bars, dumbbells, line charts, KDE density plots, scatter plot).

## Data

- `assets/data.csv` — district-year climate and hazard indicators, 2000–2025.
- `assets/bangladesh.geojson` — 544 upazila (sub-district) polygons, grouped at runtime by their `district_name` property to represent 53 districts.

Both files are fetched at runtime — they are not embedded in the code.

## Running locally

Because this is a fully static site, any static file server works:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL in a browser. No build or install step is required.

## Deploying

Deploys as-is to Netlify as a static site (see `netlify.toml`, which publishes the repository root with no build command).
