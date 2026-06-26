"""
Scraper for Mumbai real estate data from multiple public sources.

Sources:
  1. MahaRERA       — Registered project listings (free, server HTML)
  2. PROPi.in       — Broker property listings (public data only)
  3. IGR Maharashtra — Property transaction registry (free search, PIN required)
"""

import csv
import json
import os
import sys
import time
import re
from datetime import datetime
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

REQUEST_DELAY = 1.5
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
})


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


def safe_get(soup, sel, attr=None, default=""):
    el = soup.select_one(sel)
    if el is None:
        return default
    if attr:
        return el.get(attr, default)
    return el.get_text(strip=True)


# ─────────────────────────────────────────────────
#  1. MahaRERA — Registered Projects
# ─────────────────────────────────────────────────

MAHARERA_SEARCH_URL = "https://maharera.maharashtra.gov.in/projects-search-result"


def scrape_maharera_page(page):
    params = {
        "project_state": 27,
        "project_district": 0,
        "page": page,
    }
    resp = SESSION.get(MAHARERA_SEARCH_URL, params=params, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    projects = []

    for block in soup.select("div.row.shadow.p-3"):
        rera_no = safe_get(block, "p.p-0").lstrip("# ")
        name = safe_get(block, "h4.title4 strong")
        promoter = safe_get(block, "p.darkBlue.bold")

        location_link = block.select_one("ul.listingList a[href*='google.com/maps']")
        location = location_link.get_text(strip=True) if location_link else ""

        fields = block.select("div.greyColor")
        data = {}
        for f in fields:
            label = f.get_text(strip=True)
            value_tag = f.find_next_sibling("p") or f.find_next_sibling("a")
            value = value_tag.get_text(strip=True) if value_tag else ""
            data[label] = value

        projects.append({
            "rera_no": rera_no,
            "project_name": name,
            "promoter": promoter,
            "location": location,
            "district": data.get("District", ""),
            "pincode": data.get("Pincode", ""),
            "state": data.get("State", ""),
            "last_modified": data.get("Last Modified", ""),
            "source": "maharera",
        })
    return projects


def scrape_maharera(max_pages=10):
    log("--- MahaRERA: fetching first page for total count ---")
    soup = BeautifulSoup(SESSION.get(MAHARERA_SEARCH_URL, params={"project_state": 27}, timeout=30).text, "lxml")
    total_text = soup.select_one("span.colorBlue")
    total_projects = int(total_text.get_text(strip=True)) if total_text else 0
    total_pages = (total_projects // 10) + 1
    pages_to_scrape = min(max_pages, total_pages)
    log(f"MahaRERA: {total_projects} projects across {total_pages} pages, scraping {pages_to_scrape}")

    all_projects = scrape_maharera_page(1)
    for page in range(2, pages_to_scrape + 1):
        log(f"  MahaRERA page {page}/{pages_to_scrape}")
        try:
            projects = scrape_maharera_page(page)
            all_projects.extend(projects)
        except Exception as e:
            log(f"  Error on page {page}: {e}")
        time.sleep(REQUEST_DELAY)

    path = os.path.join(OUTPUT_DIR, "maharera_projects.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["rera_no", "project_name", "promoter", "location", "district", "pincode", "state", "last_modified", "source"])
        w.writeheader()
        w.writerows(all_projects)
    log(f"MahaRERA: {len(all_projects)} projects → {path}")
    return all_projects


# ─────────────────────────────────────────────────
#  2. PROPi.in — Public Property Listings
# ─────────────────────────────────────────────────

PROPI_SEARCH_URL = "https://www.propi.in/search/properties"


def scrape_propi_page(page):
    resp = SESSION.get(PROPI_SEARCH_URL, params={"page": page}, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    listings = []

    for card in soup.select("div.card"):
        title_el = card.select_one("div.card-title")
        title = title_el.get_text(strip=True) if title_el else ""

        sub_el = card.select_one("div.card-sub")
        location = sub_el.get_text(strip=True) if sub_el else ""

        chips = card.select("div.card-chips div.chip")
        bhk = ""
        sqft = ""
        furnishing = ""
        for chip in chips:
            text = chip.get_text(" ", strip=True)
            if "BHK" in text:
                bhk = text.split()[-2] + " BHK" if "BHK" in text else text
            elif "sqft" in text:
                sqft = text.split()[-2] + " sqft" if "sqft" in text else text
            elif "Furnished" in text or "Unfurnished" in text:
                furnishing = text

        price_el = card.select_one("div.card-price")
        price = price_el.get_text(strip=True) if price_el else ""

        date_el = card.select_one("div[style*='font-size:11.5px']")
        listed_date = date_el.get_text(strip=True) if date_el else ""

        listings.append({
            "building": title,
            "location": location,
            "bhk": bhk,
            "sqft": sqft,
            "furnishing": furnishing,
            "price": price,
            "listed_date": listed_date,
            "source": "propi_in",
        })
    return listings


def scrape_propi(max_pages=5):
    log("--- PROPi.in: fetching first page for total count ---")
    soup = BeautifulSoup(SESSION.get(PROPI_SEARCH_URL, timeout=30).text, "lxml")
    desc = soup.select_one("meta[name=description]")
    m = re.search(r'([\d,]+)\s+Property', desc["content"] if desc and desc.get("content") else "")
    total_properties = int(m.group(1).replace(",", "")) if m else 0
    total_pages = max((total_properties // 20), 684) if total_properties else 684
    pages_to_scrape = min(max_pages, total_pages)
    log(f"PROPi: ~{total_properties} listings, ~{total_pages} pages, scraping {pages_to_scrape}")

    all_listings = scrape_propi_page(1)
    for page in range(2, pages_to_scrape + 1):
        log(f"  PROPi page {page}/{pages_to_scrape}")
        try:
            listings = scrape_propi_page(page)
            all_listings.extend(listings)
        except Exception as e:
            log(f"  Error on page {page}: {e}")
        time.sleep(REQUEST_DELAY)

    path = os.path.join(OUTPUT_DIR, "propi_listings.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["building", "location", "bhk", "sqft", "furnishing", "price", "listed_date", "source"])
        w.writeheader()
        w.writerows(all_listings)
    log(f"PROPi: {len(all_listings)} listings → {path}")
    return all_listings


# ─────────────────────────────────────────────────
#  3. IGR Maharashtra — Transaction Search
#    NOT IMPLEMENTED: Uses ASP.NET WebForms with:
#      - Dynamic __VIEWSTATE / __EVENTVALIDATION tokens
#      - Village name autocomplete (AJAX)
#      - Image-based math CAPTCHA (needs solving)
#      - __doPostBack for form submission
#    This requires Playwright or Selenium. The code below
#    is a placeholder showing the approach.
# ─────────────────────────────────────────────────

def scrape_igr(max_searches=20):
    log("--- IGR Maharashtra ---")
    log("SKIPPED: IGR uses ASP.NET WebForms with:")
    log("  - Dynamic VIEWSTATE/EVENTVALIDATION tokens")
    log("  - AJAX village autocomplete")
    log("  - Image-based math CAPTCHA")
    log("Needs Playwright/Selenium + OCR to automate.")
    log("See: https://freesearchigrservice.maharashtra.gov.in/")
    return []


# ─────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Scrape Mumbai real estate data")
    parser.add_argument("--maharera-pages", type=int, default=5, dest="maharera_pages", help="MahaRERA pages (10/page)")
    parser.add_argument("--propi-pages", type=int, default=5, dest="propi_pages", help="PROPi.in pages (20/page)")
    parser.add_argument("--igr-searches", type=int, default=10, dest="igr_searches", help="IGR property searches")
    parser.add_argument("--delay", type=float, default=1.5, help="Delay between requests (seconds)")
    parser.add_argument("--sources", nargs="+", default=["maharera", "propi", "igr"],
                        choices=["maharera", "propi", "igr"], help="Which sources to scrape")
    args = parser.parse_args()

    REQUEST_DELAY = args.delay

    results = {}

    if "maharera" in args.sources:
        results["maharera"] = scrape_maharera(max_pages=args.maharera_pages)

    if "propi" in args.sources:
        results["propi"] = scrape_propi(max_pages=args.propi_pages)

    if "igr" in args.sources:
        results["igr"] = scrape_igr(max_searches=args.igr_searches)

    summary = os.path.join(OUTPUT_DIR, "summary.json")
    with open(summary, "w") as f:
        json.dump({k: len(v) for k, v in results.items()}, f, indent=2)

    log(f"\nDone! Files in {OUTPUT_DIR}/")
    for k, v in results.items():
        log(f"  {k}: {len(v)} records")
