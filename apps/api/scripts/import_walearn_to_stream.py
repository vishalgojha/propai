#!/usr/bin/env python3
"""
Import parsed walearn records into PropAI stream_items.

This is a one-off/backfill utility for the external walearn SQLite dataset.
It writes accepted rows to stream_items and optionally writes rejected rows to
raw_dump so bad rows are still traceable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DEFAULT_DB_PATH = "/home/vishal/walearn/listings.db"
DEFAULT_ENV_PATH = "/home/vishal/walearn/.env.propai"
DEFAULT_BATCH_SIZE = 250
DEFAULT_SOURCE_TAG = "walearn"

PRICE_PATTERN = re.compile(
    r"(?:(rent|budget|price|quote|asking|expected)[^0-9]{0,12})?"
    r"(?:rs\.?|inr|₹)?\s*"
    r"(\d+(?:\.\d+)?)\s*"
    r"(cr|crore|crores|l|lac|lacs|lakh|lakhs|k|thousand)?",
    re.IGNORECASE,
)
PHONE_PATTERN = re.compile(r"(?:\+?91[\s-]?)?([6-9]\d{9})")
AREA_PATTERN = re.compile(r"(\d{2,5})(?:\s*[-/]\s*\d{2,5})?\s*(sq\.?\s*ft|sqft|carpet|built[\s-]?up)", re.IGNORECASE)
FLOOR_PATTERN = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+floor\b", re.IGNORECASE)
TOTAL_FLOORS_PATTERN = re.compile(r"\b(\d{1,2})\s*/\s*(\d{1,2})\b")
BHK_PATTERN = re.compile(r"\b(\d+(?:\.\d+)?)\s*bhk\b", re.IGNORECASE)
LOCATION_LINE_PATTERN = re.compile(r"^[^\n]{2,80}$", re.MULTILINE)
REQUIREMENT_PATTERN = re.compile(
    r"\b(required|requirement|looking\s+for|need|wanted|chahiye|seeking|inspection tomorrow)\b",
    re.IGNORECASE,
)
PRELEASED_PATTERN = re.compile(r"\b(pre[\s-]?leased|preleased|yield|tenant\s+running)\b", re.IGNORECASE)

COMMERCIAL_USES = {
    "office": "office",
    "shop": "shop",
    "showroom": "showroom",
    "warehouse": "warehouse",
    "godown": "warehouse",
    "industrial": "industrial",
    "shed": "industrial",
    "factory": "industrial",
    "retail": "shop",
    "commercial": "commercial",
    "restaurant": "restaurant_space",
}
LAND_USES = {
    "plot": "plot",
    "land": "land",
    "acre": "land",
    "acres": "land",
    "gunta": "land",
    "redevelopment": "redevelopment",
    "joint venture": "joint_venture",
    "jv": "joint_venture",
}
RESIDENTIAL_USES = {
    "flat": "flat",
    "apartment": "flat",
    "studio": "studio",
    "bungalow": "bungalow",
    "villa": "villa",
    "duplex": "duplex",
    "penthouse": "penthouse",
    "pg": "pg",
}
CITY_KEYWORDS = (
    "mumbai",
    "thane",
    "navi mumbai",
    "pune",
    "gurgaon",
    "gurugram",
    "bangalore",
    "bengaluru",
    "hyderabad",
    "delhi",
    "noida",
    "goa",
)


@dataclass
class ImportStats:
    scanned: int = 0
    accepted: int = 0
    rejected: int = 0
    inserted: int = 0
    updated: int = 0
    raw_dumped: int = 0
    errors: int = 0


def load_env(path: str) -> dict[str, str]:
    env: dict[str, str] = {}
    file_path = Path(path)
    if not file_path.exists():
        return env
    for line in file_path.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def coalesce_env(env_file: str) -> dict[str, str]:
    values = load_env(env_file)
    merged = dict(values)
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PROPAI_TENANT_ID"):
        if os.environ.get(key):
            merged[key] = os.environ[key]
    return merged


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import walearn SQLite records into PropAI stream_items")
    parser.add_argument("--db-path", default=DEFAULT_DB_PATH)
    parser.add_argument("--env-file", default=DEFAULT_ENV_PATH)
    parser.add_argument("--tenant-id")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--source-tag", default=DEFAULT_SOURCE_TAG)
    parser.add_argument("--raw-dump-rejects", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def safe_json_loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def normalize_whitespace(text: str | None) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def first_phone(raw: str | None) -> str | None:
    phones = safe_json_loads(raw, [])
    if isinstance(phones, list):
        for item in phones:
            match = PHONE_PATTERN.search(str(item))
            if match:
                return match.group(1)
    return None


def extract_phone_from_text(text: str) -> str | None:
    match = PHONE_PATTERN.search(text or "")
    return match.group(1) if match else None


def extract_price(text: str) -> tuple[str | None, float | None]:
    if not text:
        return (None, None)
    best_label = None
    best_numeric = None
    for match in PRICE_PATTERN.finditer(text):
        value = float(match.group(2))
        unit = (match.group(3) or "").lower()
        if unit in {"cr", "crore", "crores"}:
            numeric = round(value * 100, 2)
            label = f"{value:g} Cr"
        elif unit in {"l", "lac", "lacs", "lakh", "lakhs"}:
            numeric = round(value, 2)
            label = f"{value:g} L"
        elif unit in {"k", "thousand"}:
            numeric = round(value / 100, 2)
            label = f"{value:g} K"
        else:
            if value >= 1_000_000:
                numeric = round(value / 100000, 2)
                label = f"{value:,.0f}"
            elif value >= 1000:
                numeric = round(value / 100000, 2)
                label = f"{value:,.0f}"
            else:
                continue
        best_label = label
        best_numeric = numeric
        break
    return (best_label, best_numeric)


def infer_record_type(transaction_type: str | None, text: str) -> str:
    txn = (transaction_type or "").strip().lower()
    if "requirement" in txn:
        return "requirement"
    if REQUIREMENT_PATTERN.search(text or ""):
        return "requirement"
    return "listing"


def infer_stream_type(transaction_type: str | None, record_type: str, text: str) -> str:
    txn = (transaction_type or "").strip().lower()
    if record_type == "requirement":
        return "Requirement"
    if PRELEASED_PATTERN.search(text or ""):
        return "Pre-leased"
    if "rent" in txn or "lease" in txn:
        return "Rent"
    if "sale" in txn:
        return "Sale"
    if "leave and license" in (text or "").lower():
        return "Rent"
    if "rent" in (text or "").lower():
        return "Rent"
    if "sale" in (text or "").lower() or "out right" in (text or "").lower() or "outright" in (text or "").lower():
        return "Sale"
    return "Sale"


def infer_deal_type(stream_type: str, record_type: str, transaction_type: str | None, text: str) -> str:
    if record_type == "requirement":
        lower = ((transaction_type or "") + " " + (text or "")).lower()
        if "rent" in lower or "lease" in lower or "leave and license" in lower:
            return "rent"
        if "sale" in lower or "buy" in lower or "purchase" in lower or "outright" in lower:
            return "sale"
        return "unknown"
    if stream_type == "Pre-leased":
        return "pre-leased"
    if stream_type == "Rent":
        return "rent"
    if stream_type == "Sale":
        return "sale"
    return "unknown"


def infer_property_axes(text: str, bhk: str | None) -> tuple[str, str, str | None]:
    haystack = (text or "").lower()

    for key, property_use in COMMERCIAL_USES.items():
        if key in haystack:
            return ("commercial", "commercial", property_use)

    for key, property_use in LAND_USES.items():
        if key in haystack:
            return ("land", "commercial", property_use)

    for key, property_use in RESIDENTIAL_USES.items():
        if key in haystack:
            return ("residential", "residential", property_use)

    if bhk:
        return ("residential", "residential", "flat")

    return ("unknown", "residential", None)


def infer_city(text: str, locality: str | None) -> str | None:
    haystack = f"{locality or ''} {text or ''}".lower()
    for city in CITY_KEYWORDS:
        if city in haystack:
            return city.title()
    return "Mumbai"


def infer_locality(row: sqlite3.Row, text: str) -> str | None:
    locality = normalize_whitespace(row["locality"])
    if locality:
        return locality

    localities = safe_json_loads(row["all_localities_json"], [])
    if isinstance(localities, list):
        for item in localities:
            value = normalize_whitespace(str(item))
            if value:
                return value.title()

    for line in LOCATION_LINE_PATTERN.findall(text or ""):
        cleaned = normalize_whitespace(line)
        lower = cleaned.lower()
        if len(cleaned) < 4:
            continue
        if any(word in lower for word in ("bhk", "rent", "sale", "budget", "price", "carpet", "furnished", "parking", "available", "required", "looking", "inspection", "contact")):
            continue
        if any(ch.isdigit() for ch in cleaned):
            continue
        return cleaned.title()

    return None


def infer_area(row: sqlite3.Row, text: str) -> int | None:
    area = row["area_sqft"]
    if isinstance(area, (int, float)) and area > 0:
        return int(area)
    match = AREA_PATTERN.search(text or "")
    if match:
        return int(match.group(1))
    return None


def infer_bhk(row: sqlite3.Row, text: str) -> str | None:
    bhk = normalize_whitespace(row["bhk"])
    if bhk:
        return bhk.upper().replace("Bhk", "BHK")
    match = BHK_PATTERN.search(text or "")
    if match:
        return f"{match.group(1)} BHK"
    return None


def infer_furnishing(row: sqlite3.Row, text: str) -> str | None:
    furnishing = normalize_whitespace(row["furnishing"])
    if furnishing:
        return furnishing
    lower = (text or "").lower()
    if "semi furnished" in lower or "semi-furnished" in lower:
        return "Semi Furnished"
    if "fully furnished" in lower or "full furnished" in lower:
        return "Fully Furnished"
    if "unfurnished" in lower:
        return "Unfurnished"
    if "furnished" in lower:
        return "Furnished"
    return None


def infer_floor(text: str) -> tuple[str | None, str | None]:
    floor_number = None
    total_floors = None
    floor_match = FLOOR_PATTERN.search(text or "")
    if floor_match:
        floor_number = floor_match.group(1)
    total_match = TOTAL_FLOORS_PATTERN.search(text or "")
    if total_match:
        floor_number = floor_number or total_match.group(1)
        total_floors = total_match.group(2)
    return (floor_number, total_floors)


def price_fields(row: sqlite3.Row, text: str) -> tuple[str | None, float | None]:
    if row["price_value"] is not None and row["price_unit"]:
        label = f"{row['price_value']:g} {row['price_unit']}".strip()
        numeric = float(row["price_lakhs"]) if row["price_lakhs"] is not None else None
        return (label, numeric)
    if row["price_lakhs"] is not None:
        numeric = float(row["price_lakhs"])
        return (f"{numeric:g} L", numeric)
    return extract_price(text)


def build_source_group_id(source_tag: str, chat_name: str | None) -> str | None:
    chat = normalize_whitespace(chat_name)
    if not chat:
        return None
    digest = hashlib.sha1(chat.encode("utf-8")).hexdigest()[:16]
    return f"{source_tag}:chat:{digest}"


def build_source_group_name(chat_name: str | None) -> str | None:
    chat = normalize_whitespace(chat_name)
    if not chat or chat.lower() == "status":
        return None
    return chat


def compute_confidence(record_type: str, locality: str | None, price_numeric: float | None, bhk: str | None, phone: str | None) -> int:
    score = 55
    if record_type == "listing":
        score += 5
    if locality:
        score += 12
    if price_numeric is not None:
        score += 10
    if bhk:
        score += 8
    if phone:
        score += 8
    return max(35, min(95, score))


def should_accept_row(text: str, record_type: str, locality: str | None, bhk: str | None, area_sqft: int | None, price_numeric: float | None) -> tuple[bool, str | None]:
    normalized = normalize_whitespace(text)
    if len(normalized) < 20:
        return (False, "too_short")

    lower = normalized.lower()
    if "deep sorrow" in lower or "passed away" in lower or "condolence" in lower:
        return (False, "non_property_obituary")

    signal_count = sum(
        bool(value)
        for value in (locality, bhk, area_sqft, price_numeric)
    )
    if signal_count == 0 and record_type != "requirement":
        return (False, "no_structured_signals")

    if not any(token in lower for token in (
        "rent", "sale", "lease", "bhk", "shop", "office", "showroom",
        "warehouse", "plot", "flat", "apartment", "commercial",
        "required", "requirement", "looking for", "budget", "furnished",
    )):
        return (False, "missing_real_estate_keywords")

    return (True, None)


def to_iso(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    normalized = value.strip().replace(" ", "T", 1) if " " in value and "T" not in value else value.strip()
    try:
        return datetime.fromisoformat(normalized).astimezone(timezone.utc).isoformat()
    except ValueError:
        return datetime.now(timezone.utc).isoformat()


class SupabaseRestClient:
    def __init__(self, url: str, service_key: str) -> None:
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def upsert(self, table: str, rows: list[dict[str, Any]], on_conflict: str) -> None:
        if not rows:
            return
        query = urllib.parse.urlencode({"on_conflict": on_conflict})
        headers = dict(self.headers)
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
        self._request("POST", f"{self.base_url}/{table}?{query}", rows, headers)

    def insert(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        self._request("POST", f"{self.base_url}/{table}", rows, self.headers)

    def _request(self, method: str, url: str, payload: list[dict[str, Any]], headers: dict[str, str]) -> None:
        body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        request = urllib.request.Request(url=url, data=body, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=120) as response:
            if response.status >= 300:
                raise RuntimeError(f"{method} {url} failed with status {response.status}")


def fetch_rows(connection: sqlite3.Connection, offset: int, limit: int | None, batch_size: int) -> Iterable[list[sqlite3.Row]]:
    cursor = connection.cursor()
    remaining = limit
    current_offset = offset

    while True:
        page_size = batch_size if remaining is None else min(batch_size, remaining)
        if page_size <= 0:
            return
        cursor.execute(
            "SELECT * FROM structured_listings ORDER BY id LIMIT ? OFFSET ?",
            (page_size, current_offset),
        )
        rows = cursor.fetchall()
        if not rows:
            return
        yield rows
        current_offset += len(rows)
        if remaining is not None:
            remaining -= len(rows)
            if remaining <= 0:
                return


def map_stream_row(row: sqlite3.Row, tenant_id: str, source_tag: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    raw_text = str(row["content_preview"] or "").strip()
    record_type = infer_record_type(row["transaction_type"], raw_text)
    stream_type = infer_stream_type(row["transaction_type"], record_type, raw_text)
    deal_type = infer_deal_type(stream_type, record_type, row["transaction_type"], raw_text)
    bhk = infer_bhk(row, raw_text)
    locality = infer_locality(row, raw_text)
    city = infer_city(raw_text, locality)
    price_label, price_numeric = price_fields(row, raw_text)
    area_sqft = infer_area(row, raw_text)
    furnishing = infer_furnishing(row, raw_text)
    floor_number, total_floors = infer_floor(raw_text)
    source_phone = first_phone(row["phones_json"]) or extract_phone_from_text(raw_text)
    asset_class, property_category, property_use = infer_property_axes(raw_text, bhk)
    confidence = compute_confidence(record_type, locality, price_numeric, bhk, source_phone)

    accepted, reject_reason = should_accept_row(
        raw_text,
        record_type,
        locality,
        bhk,
        area_sqft,
        price_numeric,
    )

    source_message_id = normalize_whitespace(row["message_id"]) or f"{source_tag}:source:{row['id']}"
    message_id = f"{source_tag}:{row['id']}"
    source_group_id = build_source_group_id(source_tag, row["chat_name"])
    source_group_name = build_source_group_name(row["chat_name"])
    created_at = to_iso(row["timestamp"])

    parsed_payload = {
        "origin": source_tag,
        "walearn_id": row["id"],
        "walearn_message_id": row["message_id"],
        "chat_name": row["chat_name"],
        "sender": row["sender"],
        "phones": safe_json_loads(row["phones_json"], []),
        "prices": safe_json_loads(row["prices_json"], []),
        "all_localities": safe_json_loads(row["all_localities_json"], []),
        "content_hash": row["content_hash"],
        "listing_hash": row["listing_hash"],
        "parking": row["parking"],
        "price_value": row["price_value"],
        "price_unit": row["price_unit"],
        "sourcePhone": source_phone,
        "sourceLabel": normalize_whitespace(row["sender"]) or None,
        "contactPhone": source_phone,
        "assetClass": asset_class,
        "propertyCategory": property_category,
        "propertyUse": property_use,
        "importedAt": datetime.now(timezone.utc).isoformat(),
        "importer": "import_walearn_to_stream.py",
    }

    if not accepted:
        return (
            None,
            {
                "workspace_id": tenant_id,
                "group_jid": source_group_id or source_group_name or f"{source_tag}:unknown",
                "sender_jid": source_phone or normalize_whitespace(row["sender"]) or "unknown",
                "raw_text": raw_text,
                "received_at": created_at,
                "gate_status": "rejected",
                "session_id": source_tag,
                "rejection_reason": reject_reason or "unknown",
            },
        )

    return (
        {
            "tenant_id": tenant_id,
            "message_id": message_id,
            "source_message_id": source_message_id,
            "source_group_id": source_group_id,
            "source_group_name": source_group_name,
            "source_phone": source_phone,
            "raw_text": raw_text,
            "type": stream_type,
            "record_type": record_type,
            "locality": locality,
            "city": city,
            "bhk": bhk,
            "price_label": price_label,
            "price_numeric": price_numeric,
            "deal_type": deal_type,
            "asset_class": asset_class,
            "property_category": property_category,
            "area_sqft": area_sqft,
            "furnishing": furnishing,
            "floor_number": floor_number,
            "total_floors": total_floors,
            "property_use": property_use,
            "confidence_score": confidence,
            "is_global": False,
            "parsed_payload": parsed_payload,
            "created_at": created_at,
        },
        None,
    )


def main() -> int:
    args = parse_args()
    env = coalesce_env(args.env_file)
    supabase_url = env.get("SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    tenant_id = args.tenant_id or env.get("PROPAI_TENANT_ID")

    if not supabase_url or not service_key or not tenant_id:
        print("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and PROPAI_TENANT_ID are required.", file=sys.stderr)
        return 1

    db = sqlite3.connect(f"file:{args.db_path}?mode=ro&immutable=1", uri=True)
    db.row_factory = sqlite3.Row
    client = SupabaseRestClient(supabase_url, service_key)
    stats = ImportStats()

    start = time.time()
    for batch in fetch_rows(db, args.offset, args.limit, args.batch_size):
        stream_rows: list[dict[str, Any]] = []
        reject_rows: list[dict[str, Any]] = []

        for row in batch:
            stats.scanned += 1
            stream_row, reject_row = map_stream_row(row, tenant_id, args.source_tag)
            if stream_row:
                stats.accepted += 1
                stream_rows.append(stream_row)
            else:
                stats.rejected += 1
                if args.raw_dump_rejects and reject_row:
                    reject_rows.append(reject_row)

        if args.dry_run:
            continue

        try:
            client.upsert("stream_items", stream_rows, "tenant_id,message_id")
            stats.inserted += len(stream_rows)
        except urllib.error.HTTPError as error:
            stats.errors += len(stream_rows)
            message = error.read().decode("utf-8", "ignore")
            print(f"stream_items batch failed: {error.code} {message[:1200]}", file=sys.stderr)
            return 1

        if reject_rows:
            try:
                client.insert("raw_dump", reject_rows)
                stats.raw_dumped += len(reject_rows)
            except urllib.error.HTTPError as error:
                stats.errors += len(reject_rows)
                message = error.read().decode("utf-8", "ignore")
                print(f"raw_dump batch failed: {error.code} {message[:1200]}", file=sys.stderr)
                return 1

        elapsed = time.time() - start
        print(
            f"processed={stats.scanned} accepted={stats.accepted} rejected={stats.rejected} "
            f"stream_upserted={stats.inserted} raw_dumped={stats.raw_dumped} elapsed={elapsed:.1f}s"
        )

    db.close()
    print(
        json.dumps(
            {
                "scanned": stats.scanned,
                "accepted": stats.accepted,
                "rejected": stats.rejected,
                "stream_upserted": stats.inserted,
                "raw_dumped": stats.raw_dumped,
                "errors": stats.errors,
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
