# PropAI — Canonical Building Registry v1

**Version:** 1.3  
**Date:** 2026-06-26  
**Status:** Frozen — never rebuilt from scratch. Subsequent scrapers enrich this registry.

---

## Source

- **PROPi.in** — 4,800 raw building+location records
- Blocks 1–684 scraped (all pages)

---

## Registry Stats

| Metric | Value |
|---|---|
| Canonical buildings | 4,459 |
| Unique fingerprints | 4,459 |
| Geo-coordinates | 4,306 (96.6%) |
| Micro market assigned | 4,178 (93.7%) |
| Developer identified | 627 (14.1%) |
| Aliases tracked | 465 |
| Auto-merges applied | 227 |
| Needs area resolution | 139 (3.1%) |
| Review queue items | 242 |
| Review clusters | 7 |

### Health Score

| Range | Buildings | Meaning |
|---|---|---|
| 90–100 | 428 | Complete — all fields populated |
| 80–89 | 314 | Good — minor enrichment needed |
| 70–79 | 3,344 | Solid — coordinates + area + market |
| 50–69 | 112 | Partial — missing developer/aliases |
| 10–39 | 151 | Poor — needs area resolution |
| **Avg** | **75.0** | |

---

## Registry v1.1 — Street Registry + Location Graph (2026-06-26)

## v1.2 — MahaRERA Enrichment Pipeline (2026-06-26)

Added a street registry layer between micro markets and buildings.

| Metric | Value |
|---|---|
| Streets in registry | 68 |
| Streets with mapped buildings | 41 |
| Building → Street mappings | 3,265 (73.2%) |
| Location graph entries | 98 (5 zones, 92 micro markets) |

### StreetID scheme: `ST-001` through `ST-068`

Each street has:
- Canonical name (e.g. "Hill Road")
- Aliases (e.g. "Hill Rd", "Hillroad", "Dr Ambedkar Road")
- Micro market assignment
- Building IDs (all buildings on that street)
- Source (nominatim, geocode_area, manual)

### Location graph hierarchy

```
City                          Mumbai
  └─ Zone                     South Mumbai (5 zones)
       └─ Micro Market        Bandra West (92 micro markets)
            └─ Street         Hill Road (68 streets)
                 └─ Building  Elco Residency (4,459 buildings)
```

### Resolver enhancement

Added street-based resolution as step 4 (between normalized match and fuzzy match):
- `resolve("near Hill Road")` → finds Hill Road → returns buildings on that road
- `resolve_by_street("Carter Road")` → returns all building IDs on Carter Road
- Prefix handling: "near", "opposite", "behind", "building on", "on", "at"

### Street files

```
data/streets.csv                ← 68 streets with IDs, aliases, mappings
data/building_streets.csv       ← 3,265 building-street pairs
data/location_graph.csv         ← 98 hierarchical entries
archive/v1/streets.csv         ← archived with v1 snapshot
archive/v1/building_streets.csv
archive/v1/location_graph.csv
```

---

## v1.2 — MahaRERA Enrichment Pipeline (2026-06-26)

Added a complete enrichment pipeline for MahaRERA project data.

### Flow

```
Raw scraper CSV (maharera_projects.csv)
  → Normalize (field mapping, name cleaning)
  → Resolve BuildingID (name + area + developer + RERA)
  → Build Project Registry (RERA# → building_id)
  → Build Developer Registry (developer → projects → buildings)
  → Create MAHARERA_PROJECT observations
  → Store via Pipeline → observations.csv
```

### Resolver enhancements

| Function | Purpose |
|---|---|
| `resolve_by_rera(rera_no)` | Resolve MahaRERA number to BuildingID via rera_lookup.csv |
| `resolve_by_developer(name)` | Return all BuildingIDs associated with a developer |

Resolution strategy extended with two new steps:
- **Step 5 (before fuzzy):** RERA lookup — if the project was previously resolved
- **Step 6 (before fuzzy):** Developer match — narrow candidate search to known developer buildings

### New data files

| File | Description |
|---|---|
| `data/projects.csv` | **Canonical project registry** — project_id, rera_no, project_name, building_ids[] |
| `data/developer_registry.csv` | Developer → projects + building_ids (resolved devs only) |
| `data/rera_lookup.csv` | Fast RERA# → project_id + building_ids lookup |

### Schema extensions

Three new tables in `evidence/schema.sql`:
- **developers** — canonical developer names with aliases, project/resolved counts
- **developer_streets** — many-to-many developer→street relationships
- **projects** — canonical entity with project_id, rera_no, multi-building support via building_ids[] array

### Resolution architecture change

Projects are now a **first-class canonical entity** in the resolver with a multi-path design:

```
Canonical entity hierarchy:
  Developer → Project(s) → Building(s)

Resolution paths (in order):
  1. Building Name → BuildingID    (exact, alias, normalized)
  2. Street → BuildingIDs          (exact name match or partial)
  3. Project Name → ProjectID → BuildingIDs  (NEW — from projects.csv)
  4. Developer-narrowed fuzzy      (NEW — fuzzy match restricted to dev's buildings)
  5. Full fuzzy + area/developer   (fallback for any building)
```

The old `project_registry.csv` (flat RERA→building_id) is replaced by `projects.csv` (canonical entity with project_id, building_ids[], rera_no).

### Resolver Report

New diagnostic tool `evidence/resolver_report.py` — categorizes every project with a machine-readable reason:

```
  Category                                           Count
  ────────────────────────────────────────────────── ─────
  Matched BuildingID                                    14
  Outside Mumbai region                                 29
  Low similarity — name differs from nearest building     6
  Close fuzzy match missed — check resolver              1
```

Instead of "28% resolved", the report tells the real story: 14 matched, 29 expected misses, 6 genuinely new projects, 1 ambiguous.

### Resolver bug fixed

The first-letter filter in fuzzy matching (`norm_canon[:1] != norm_name[:1]`) was blocking valid matches like "DGS HEIGHTS" → "Sun Heights" (ratio 0.82) because `d` ≠ `s`. Removed the filter. DGS HEIGHTS now resolves correctly.

### Evidence Coverage Report

New diagnostic `evidence/coverage.py` — measures what matters:

```
  Coverage Status: CRITICAL (14/4459 buildings have observations)
  Next priority: Fill observation gaps
```

Key metrics tracked per run:
- Buildings with ≥1, ≥10, ≥100 observations
- Buildings with ≥3 independent data sources
- Buildings with ≥90 days of observation history
- Average / median evidence density (obs per building)
- Source diversity distribution (1-source, 2-source, 3+)
- Projects and developers linked to buildings
- Unresolved observation queue size

Per-building density function `building_density(building_id)` returns source diversity rating (★–★★★★★), time span, confidence level. Designed for integration with the intelligence engine / API.

Current baseline (2026-06-26):
```
Canonical buildings:          4,459
Buildings with ≥1 obs:           14  (0.3%)
Avg evidence density:            1.0
Buildings with ≥3 sources:        0
Unresolved observations:         36
```

### Adapter rewrite

`evidence/adapters/maharera_adapter.py` rewritten to match actual scraper output fields:

| Scraper field | Adapter maps to |
|---|---|
| `rera_no` | `source_reference` |
| `project_name` | `building_name` |
| `promoter` | `developer` |
| `location` | `area` |
| `district` | `district` |
| `pincode` | `pincode` |
| `last_modified` | `observed_at` |
| `source` (constant) | `MAHARERA` |

### Usage

```bash
# After scraper finishes:
python3 evidence/enrich_maharera.py
```

---

## v1.3 — Landmark Registry + Broker Vocabulary Parser (2026-06-26)

Added a canonical Landmark Registry above Street in the location graph hierarchy. Mumbai broker language references landmarks (malls, hospitals, railway stations) far more often than street names or building names.

| Metric | Value |
|---|---|
| Landmarks in registry | 58 |
| Landmark types | 29 (Railway Station, Mall, Hospital, Temple, etc.) |
| Buildings within 1km of ≥1 landmark | 2,850 (66.2%) |
| Building→Landmark proximity links | 5,438 |

### LandmarkID scheme: `LM-001` through `LM-058`

Each landmark has:
- Canonical name (e.g. "High Street Phoenix")
- Aliases (e.g. "Phoenix Marketcity", "Phoenix Mills", "High Street Phoenix Mall")
- Type classification (29 types)
- Micro market assignment
- Importance score (0–100, blended from seed + nearby building density)
- Coordinates

### Broker Vocabulary Parser (`evidence/parsers.py`)

Interprets spatial relationship patterns from broker language:

| Pattern | Relation | Confidence |
|---|---|---|
| "opposite X" / "opp. X" / "across from X" | opposite | 0.95 |
| "behind X" / "backside of X" | behind | 0.90 |
| "near X" / "next to X" / "adjacent to X" | near | 0.85 |
| "walkable to X" / "walking distance from X" | walkable | 0.80 |
| "off X" | off | 0.85 |
| "X station" / "X road" | suffix | 0.75–0.90 |
| "X lane" / "X naka" / "X circle" / "X signal" | suffix | 0.70–0.85 |

Keyword hints (weak signals): hospital, mall, temple, church, mosque, station, beach, etc. → treats as landmark (0.50–0.75).

### Location graph updated

```
City                          Mumbai
  └─ Zone                     South Mumbai (5 zones)
       └─ Micro Market        Bandra West (92 micro markets)
            └─ Landmark       Mount Mary Church (58 landmarks)
                 └─ Street    Hill Road (68 streets)
                      └─ Building  Elco Residency (4,459 buildings)
```

### Resolver enhancement

Landmark resolution added as steps 4+5 (between normalized match and street match):

1. Exact match
2. Alias match
3. Normalized match
4. **Exact/alias check on raw name** — "Bandra Station" → LM-008 (station is a landmark)
5. **Broker parse → landmark match** — "near High Street Phoenix" → LM-014 → nearby building
6. Street match
7. Project name match
8. RERA match
9. Developer-narrowed fuzzy
10. Full fuzzy + area/developer

New function: `resolve_by_landmark(landmark_query)` — exact, alias, and fuzzy matching on landmark names, returns nearest building.

Schema extended with `landmarks` and `building_landmarks` tables.

### New + updated files

| Path | Purpose |
|---|---|
| `data/landmarks.csv` | 58 canonical landmarks with aliases, types, coords |
| `data/building_landmarks.csv` | 5,438 building→landmark proximity links |
| `evidence/parsers.py` | Broker vocabulary parser (spatial relations) |
| `registry/landmarks.py` | Landmark registry builder (seeds + proximity computation) |
| `evidence/resolver.py` | Updated: steps 4+5 landmark resolution |
| `evidence/schema.sql` | Updated: `landmarks` + `building_landmarks` tables |
| `evidence/ARCHITECTURE.md` | Updated: landmark layer in location graph, 10-step resolver |

### Testing

```bash
python3 -c "from evidence.resolver import resolve; print(resolve('opposite Lilavati Hospital'))"
# → (840, 0.93, 'lm_broker:lm:LM-015')
python3 -c "from evidence.resolver import resolve; print(resolve('near High Street Phoenix'))"
# → (2662, 0.93, 'lm_broker:lm:LM-014')
python3 -c "from evidence.resolver import resolve; print(resolve('Bandra Station'))"
# → (840, 0.88, 'lm:LM-008')
```

## Knowledge Base

### Normalization Strategies (20)

| Category | Strategies | Count |
|---|---|---|
| Lexical | NS-001, NS-004–016, NS-019 | 15 |
| Semantic | NS-002, NS-003 | 2 |
| Domain | NS-017, NS-020 | 2 |
| Risk Rules | NS-011, NS-018 | 2 |

### Negative Knowledge (11 pairs)

Known-distinct building pairs that the system will never suggest merging:
- Lodha World Crest ↔ World One ↔ World View (different projects)
- Ajmera Aeon ↔ Treon ↔ Zeon (different projects)
- Hiranandani Empress Hill ↔ Regent Hill (different towers)
- Kalpataru Aura ↔ Aura II (different phases)
- Silver Arch ↔ Silver Arch A (different wings)
- Signature ↔ Signature BY Peridot (different buildings)

---

## File Layout

```
knowledge/                          ← Git-versioned knowledge base
  normalization/building/*.yaml     ← 6 files, 20 strategies
  negative/building_distinct.yaml   ← 11 negative knowledge pairs

registry/                           ← Build pipeline (Python)
  schema.py                         ← Data models
  dedup.py                          ← Evidence-based scoring
  developers.py                     ← Developer extraction
  locations.py                      ← Mumbai area hierarchy
  rules.py                          ← Strategy adapter
  build.py                          ← Pipeline orchestrator
  street.py                         ← Street registry builder
  location_graph.py                 ← Location graph builder

evidence/                           ← Evidence Engine
  models.py                         ← Observation data classes
  schema.sql                        ← Full PostgreSQL schema (incl. streets)
  pipeline.py                       ← Ingestion orchestrator
  resolver.py                       ← Multi-path resolver (buildings, projects, streets, devs, RERA)
  resolver_report.py                ← Diagnostic: categorizes every resolution attempt
  enrich_maharera.py                ← MahaRERA enrichment pipeline
  intelligence.py                   ← Intelligence computation stubs
  adapters/                         ← Source adapters (5 sources)

data/                               ← Registry outputs + evidence
  canonical_buildings.csv           ← 4,459 canonical records
  building_aliases.csv              ← 465 alias mappings
  streets.csv                       ← 68 street records
  building_streets.csv              ← 3,265 building-street pairs
  location_graph.csv                ← 98 location hierarchy entries
  projects.csv                      ← Canonical project registry (project_id, rera_no, building_ids[])
  developer_registry.csv            ← Devs with resolved buildings only
  rera_lookup.csv                   ← Fast RERA# → project_id + building_ids
  maharera_projects.csv             ← Raw scraper output (live append)
  observations.csv                  ← Append-only evidence store (via pipeline)
  unresolved_observations.csv       ← Queued for retry/manual resolution

archive/v1/                         ← Immutable v1 snapshot
```

---

## Pipeline

```
Raw Listing → Normalizer (20 strategies) → Canonical Resolver
  → Fingerprint Match → Negative Knowledge Check
  → Dedup Engine → Review Queue
  → Evidence Store → Market Intelligence
```
