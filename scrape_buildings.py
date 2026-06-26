"""
Scrape unique building + address records from PROPi.in.
Iterates all pages, deduplicates by building+location.
"""

import csv
import os
import time
import requests
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(BASE_DIR, "data", "propi_buildings.csv")
URL = "https://www.propi.in/search/properties"
DELAY = 1.0

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
})


def scrape_page(page):
    resp = session.get(URL, params={"page": page}, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    records = []
    for card in soup.select("div.card"):
        title = card.select_one("div.card-title")
        sub = card.select_one("div.card-sub")
        if title and sub:
            records.append({
                "building": title.get_text(strip=True),
                "location": sub.get_text(strip=True),
            })
    return records


def main():
    seen = set()
    all_records = []

    for page in range(1, 685):
        print(f"  Page {page}/684", end="\r")
        try:
            records = scrape_page(page)
            for r in records:
                key = (r["building"], r["location"])
                if key not in seen:
                    seen.add(key)
                    all_records.append(r)
        except Exception as e:
            print(f"\n  Error page {page}: {e}")
        time.sleep(DELAY)

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["building", "location"])
        w.writeheader()
        w.writerows(all_records)

    print(f"\nDone! {len(all_records)} unique buildings → {OUTPUT}")


if __name__ == "__main__":
    main()
