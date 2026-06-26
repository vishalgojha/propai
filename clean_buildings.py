"""
Clean propi_buildings.csv:
  - Normalize location names (spelling, hierarchy)
  - Normalize building names (case, obvious duplicates)
  - Merge records where same building + same location differ only by case/typo
  - Flag remaining ambiguous entries for manual review
Output: data/propi_buildings_clean.csv + data/cleaning_report.txt
"""
import csv
import os
import re
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT = os.path.join(BASE_DIR, "data", "propi_buildings.csv")
OUTPUT = os.path.join(BASE_DIR, "data", "propi_buildings_clean.csv")
REPORT = os.path.join(BASE_DIR, "data", "cleaning_report.txt")

# ── Location normalizations ──────────────────────────────────────
LOCATION_FIXES = {
    "sewree": "Sewri",
    "sewri west": "Sewri",
    "nepeansea road": "Nepean Sea Road",
    "pedder road": "Peddar Road",
    "mahalaxmi": "Mahalakshmi",
    "grant road": "Grant Road",
    "lower parel east": "Lower Parel",
    "lower parel west": "Lower Parel",
    "bandra (w)": "Bandra West",
    "bandra kurla complex": "BKC",
    "bkc annex": "BKC",
    "bkc bkc": "BKC",
    "bkc 28": "BKC",
    "lokhandwala complex back road": "Lokhandwala",
    "lokhandwala market": "Lokhandwala",
    "hiranandani gardens powai": "Powai",
    "versova, andheri west": "Versova",
    "oshiwara, andheri west": "Oshiwara",
    "yari road, andheri west": "Yari Road",
    "versova , andheri west": "Versova",
    "oshiwara , andheri west": "Oshiwara",
    "yari road , andheri west": "Yari Road",
    "santacruz (west)": "Santacruz West",
    "santacruz (east)": "Santacruz East",
    "khar (west)": "Khar West",
    "khar (east)": "Khar East",
}

# ── Building name normalizations ─────────────────────────────────
# Maps from existing name → canonical name
BUILDING_FIXES = {
    "Ashok Garden": "Ashok Gardens",
    "Lodha Belair": "Lodha Bel Air",
    "Lodha Bel Air": "Lodha Bel Air",
    "Rustomjee Season": "Rustomjee Seasons",
    "Indiabulls Skyforest": "Indiabulls Sky Forest",
    "Indiabulls SKY Forest": "Indiabulls Sky Forest",
    "Indiabulls SKY": "Indiabulls Sky",
    "India Bulls Sky Forest": "Indiabulls Sky Forest",
    "India Bulls Blu": "Indiabulls Blu",
    "India Bulls BLU": "Indiabulls Blu",
    "India Bulls Sky": "Indiabulls Sky",
    "L&T Crescent BAY": "L&T Crescent Bay",
    "L&T Crescent bay": "L&T Crescent Bay",
    "Rushabh tower": "Rushabh Tower",
    "JOY LEGEND": "Joy Legend",
    "VENUS": "Venus",
    "Crystal plaza": "Crystal Plaza",
    "New MHADA": "New Mhada",
    "INS Tower": "INS Tower",
    "Ins Tower": "INS Tower",
    "Orion west": "Orion West",
    "INDRADARSHAN": "Indradarshan",
    "Indradarshan": "Indradarshan",
    "Lotus ARC One": "Lotus Arc One",
    "Duplex heights": "Duplex Heights",
    "DGS Sheetal Regalia": "DGS Sheetal Regalia",
    "Dgs Sheetal Regalia": "DGS Sheetal Regalia",
    "Hdil Metropolis": "HDIL Metropolis",
    "Lodha World ONE": "Lodha World One",
    "K L ASTORIA": "K L Astoria",
    "Gold's Green": "Golds Green",
    "Geetanjali Chs": "Geetanjali CHS",
    "Sandhu palace": "Sandhu Palace",
    "EL Signora": "El Signora",
    "El Signora": "El Signora",
    "DUNHILL APARTMENT": "Dunhill Apartment",
    "Dheeraj Gaurav Heights": "Dheeraj Gaurav Heights",
    "DHEERAJ GAURAV HEIGHTS": "Dheeraj Gaurav Heights",
    "ANTARIKSH": "Antariksh",
    "Antariksh": "Antariksh",
    "LINK PLAZA": "Link Plaza",
    "JUHU SAMEEP": "Juhu Sameep",
    "Juhu Sameep": "Juhu Sameep",
    "Level THE Residences": "Level The Residences",
    "Level The Residences": "Level The Residences",
    "Jawaharban Chs": "Jawaharban CHS",
    "Sea lord": "Sea Lord",
    "BAY View Terraces": "Bay View Terraces",
    "Buena vista": "Buena Vista",
    "DLF The Crest": "DLF The Crest",
    "Dlf The Crest": "DLF The Crest",
    "AISHWARYA CHS": "Aishwarya CHS",
    "PRIVATE BUILDING": "Private Building",
    "ANMOL TOWERS": "Anmol Towers",
    "MANJU TOWER CHS": "Manju Tower CHS",
    "GOLDEN CHARRIOT": "Golden Charriot",
    "Chaitanya Tower": "Chaitanya Tower",
}

AMBIGUOUS_BUILDING_GROUPS = [
    ({"Runwal Elegante", "Runwal Elegant"}, "Probably same project — confirm preferred spelling"),
    ({"Shiv-Dham", "Shivdham"}, "Probably same building — confirm"),
    ({"Buena Vista", "Buena vista"}, "Case mismatch already handled, but diff locations: confirm if same building chain"),
]


def normalize_location(loc):
    loc = loc.strip()
    key = loc.strip().lower()
    key = re.sub(r'\s+', ' ', key)
    return LOCATION_FIXES.get(key, loc)


def normalize_building(name):
    name = name.strip()
    # Apply explicit fixes first
    if name in BUILDING_FIXES:
        return BUILDING_FIXES[name]
    # Fix ALL CAPS (but keep acronyms like CHS, BKC)
    if name.isupper() and len(name) > 4:
        words = name.split()
        titled = []
        for w in words:
            if w in ("CHS", "BKC", "MHADA", "HDIL", "DLF", "DGS", "EL", "L&T", "MS", "JK", "GBR"):
                titled.append(w)
            else:
                titled.append(w.capitalize())
        return " ".join(titled)
    return name


def main():
    with open(INPUT) as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    changes = []
    cleaned = []
    merge_log = defaultdict(list)

    # ── Pass 1: normalize locations ──────────────────────────────
    for r in rows:
        orig_loc = r["location"]
        r["location"] = normalize_location(orig_loc)
        if r["location"] != orig_loc:
            changes.append(f"LOCATION: {orig_loc!r} → {r['location']!r}  ({r['building']})")

    # ── Pass 2: normalize building names ─────────────────────────
    for r in rows:
        orig_bld = r["building"]
        r["building"] = normalize_building(orig_bld)
        if r["building"] != orig_bld:
            changes.append(f"BUILDING: {orig_bld!r} → {r['building']!r}")

    # ── Pass 3: merge duplicate (building, location) pairs ──────
    merged_map = {}
    for r in rows:
        key = (r["building"], r["location"])
        if key not in merged_map:
            merged_map[key] = r
        else:
            merge_log[f"{r['building']} @ {r['location']}"].append("duplicate row removed")

    # ── Pass 4: detect cross-location same-name records ─────────
    # Build set of unique (building, location) for the final output
    final_records = list(merged_map.values())

    # ── Pass 5: build "same building, merging locs" report ─────
    building_locs = defaultdict(set)
    for r in final_records:
        building_locs[r["building"]].add(r["location"])
    multi_loc = {b: locs for b, locs in building_locs.items() if len(locs) > 1}

    # ── Write output CSV ────────────────────────────────────────
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["building", "location"])
        w.writeheader()
        w.writerows(sorted(final_records, key=lambda x: (x["location"], x["building"])))

    # ── Write report ────────────────────────────────────────────
    with open(REPORT, "w") as f:
        f.write("=== CLEANING REPORT ===\n\n")
        f.write(f"Input rows: {len(rows)}\n")
        f.write(f"After merge: {len(final_records)}\n")
        f.write(f"Rows merged/deduped: {len(rows) - len(final_records)}\n\n")

        f.write("--- Changes applied ---\n")
        for c in changes:
            f.write(f"  {c}\n")

        f.write("\n--- Merge log ---\n")
        for key, msgs in sorted(merge_log.items()):
            for m in msgs:
                f.write(f"  {key}: {m}\n")

        f.write(f"\n--- Same building in 2+ locations ({len(multi_loc)}) ---\n")
        for b, locs in sorted(multi_loc.items(), key=lambda x: -len(x[1])):
            f.write(f"  {b} → {sorted(locs)}\n")

        f.write(f"\n--- \"—\" location records ({sum(1 for r in final_records if r['location'] == '—')}) ---\n")
        for r in final_records:
            if r["location"] == "—":
                f.write(f"  {r['building']}\n")

    print(f"Cleaned: {len(rows)} → {len(final_records)} records")
    print(f"Report: {REPORT}")
    print(f"Output: {OUTPUT}")


if __name__ == "__main__":
    main()
