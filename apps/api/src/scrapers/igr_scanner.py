#!/usr/bin/env python3
"""
IGR Maharashtra scanner via Camoufox browser backend.

Standalone CLI: scans IGR portal for a given SRO + year, outputs JSON to stdout.

Usage:
  python3 igr_scanner.py --sro "Bandra 1" --year 2025
  python3 igr_scanner.py --sro "Andheri 1" --year 2024 --captcha <TEXT>

Environment:
  CAMOUFOX_URL  - Camoufox REST API URL (default: http://127.0.0.1:9377)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from typing import Any

CAMOUFOX_BASE = os.environ.get("CAMOUFOX_URL", "http://127.0.0.1:9377")
USER_ID = "propai_gras"
SESSION_KEY = "igr_scan"
IGR_URL = "https://freesearchigrservice.maharashtra.gov.in/"

# ──────────────────────────────────────────────
# Camoufox REST API helpers
# ──────────────────────────────────────────────


def _api(method: str, path: str, body: Any = None) -> dict[str, Any]:
    url = f"{CAMOUFOX_BASE}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode() if e.fp else str(e)
        raise RuntimeError(f"Camofox API error {e.code}: {err_body}")


def camofox_health() -> bool:
    try:
        resp = _api("GET", "/health")
        return resp.get("ok") is True and resp.get("browserConnected") is True
    except Exception:
        return False


def camofox_create_tab(url: str) -> str:
    resp = _api("POST", "/tabs", {
        "userId": USER_ID,
        "sessionKey": SESSION_KEY,
        "url": url,
    })
    return resp["tabId"]


def camofox_close_tab(tab_id: str) -> None:
    _api("DELETE", f"/tabs/{tab_id}?userId={USER_ID}")


def camofox_snapshot(tab_id: str) -> str:
    resp = _api("GET", f"/tabs/{tab_id}/snapshot?userId={USER_ID}")
    return resp.get("snapshot", "")


def camofox_click(tab_id: str, ref: str | None = None, selector: str | None = None) -> None:
    body: dict[str, Any] = {"userId": USER_ID}
    if ref:
        body["ref"] = ref
    if selector:
        body["selector"] = selector
    _api("POST", f"/tabs/{tab_id}/click", body)


def camofox_navigate(tab_id: str, url: str) -> None:
    _api("POST", f"/tabs/{tab_id}/navigate", {
        "userId": USER_ID,
        "url": url,
    })


def camofox_evaluate(tab_id: str, expression: str) -> Any:
    resp = _api("POST", f"/tabs/{tab_id}/evaluate", {
        "userId": USER_ID,
        "expression": expression,
    })
    return resp.get("result")


def _wait_for_tab(tab_id: str, poll_interval: float = 1.0, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            snap = _api("GET", f"/tabs/{tab_id}/snapshot?userId={USER_ID}")
            if snap.get("snapshot", "").strip():
                return
        except Exception:
            pass
        time.sleep(poll_interval)


# ──────────────────────────────────────────────
# IGR form filling
# ──────────────────────────────────────────────


def _fill_igr_form(tab_id: str, sro: str, year: int) -> str:
    """Fill the IGR Property Details search form via JS evaluation."""
    try:
        r = camofox_evaluate(tab_id, f"""
            (() => {{
                const y = document.getElementById('ddlFromYear');
                if (!y) return 'no year select';
                y.value = '{year}';
                y.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return 'year=' + y.value;
            }})()
        """)
        if r and 'no' in str(r):
            return r

        # Set district to Mumbai Suburban (31) or search across all
        # Use empty or 0 to show all districts, or specific district by value
        # Let's leave it default and just fill year + area name
        # Actually the form needs district to change properly

        # Type SRO name into area text field
        r = camofox_evaluate(tab_id, f"""
            (() => {{
                const t = document.getElementById('txtAreaName');
                if (!t) return 'no area text field';
                t.value = '{sro}';
                t.dispatchEvent(new Event('input', {{ bubbles: true }}));
                t.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return 'area_typed=' + t.value;
            }})()
        """)
        if r and 'no' in str(r):
            return r

        return 'ready'
    except Exception as e:
        return f'error: {e}'


# ──────────────────────────────────────────────
# Result extraction
# ──────────────────────────────────────────────


def _parse_amount(text: str) -> float:
    if not text:
        return 0.0
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0


def _extract_results_from_page(tab_id: str) -> dict[str, Any]:
    """Extract transaction data from search results via JS evaluation."""
    result = camofox_evaluate(tab_id, """
        (() => {
            const rows = [];
            const tables = document.querySelectorAll('table');
            let targetTable = null;

            for (const t of tables) {
                const trs = t.querySelectorAll('tr');
                let numCount = 0;
                for (const tr of trs) {
                    const firstTd = tr.querySelector('td');
                    if (firstTd && /^\\d+$/.test(firstTd.textContent.trim())) {
                        numCount++;
                    }
                }
                if (numCount > 2) { targetTable = t; break; }
            }

            if (!targetTable) return JSON.stringify({error: 'no results table found'});

            const trs = targetTable.querySelectorAll('tr');
            for (const tr of trs) {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 3) continue;
                const docNo = tds[0]?.textContent.trim();
                if (!docNo || !/^\\d+$/.test(docNo)) continue;
                rows.push({
                    doc_no: docNo,
                    reg_date: tds[1]?.textContent.trim() || '',
                    consideration: tds[2]?.textContent.trim() || '',
                    stamp_duty: tds[3]?.textContent.trim() || '',
                    property_type: tds[4]?.textContent.trim() || '',
                    village: tds[5]?.textContent.trim() || '',
                    buyer: tds[6]?.textContent.trim() || '',
                    seller: tds[7]?.textContent.trim() || '',
                });
            }

            const nextLink = document.querySelector('a[href*="__doPostBack"][href*="Page"]');
            const hasNext = nextLink !== null;

            return JSON.stringify({
                rows: rows,
                count: rows.length,
                has_next_page: hasNext,
            });
        })()
    """)
    return json.loads(result)


def _snapshot_to_rows(snapshot: str) -> list[dict[str, str]]:
    """Parse Camoufox snapshot YAML into rows."""
    rows: list[dict[str, str]] = []
    current_row: dict[str, str] = {}
    col_index = 0

    for line in snapshot.split("\n"):
        stripped = line.lstrip()
        indent = len(line) - len(stripped)

        if stripped.startswith("- row"):
            if current_row:
                rows.append(current_row)
                current_row = {}
                col_index = 0
        elif stripped.startswith("- cell") or stripped.startswith("- columnheader"):
            m = re.search(r'"(.*?)"', stripped)
            cell_text = m.group(1) if m else stripped.split('"')[0].split(" ", 2)[-1].strip()
            current_row[f"col_{col_index}"] = cell_text
            col_index += 1

    if current_row:
        rows.append(current_row)

    return rows


# ──────────────────────────────────────────────
# Main scanner
# ──────────────────────────────────────────────


def _is_duplicate(doc_number: str, year: int, sro: str, seen: set[str]) -> bool:
    return f"{sro}/{year}/{doc_number}" in seen


def scan_sro(
    sro: str,
    year: int,
    captcha_text: str | None = None,
    camofox_url: str | None = None,
) -> list[dict[str, Any]]:
    """
    Scan IGR for a given SRO and year. Returns list of transaction dicts
    suitable for JSON serialization and upsert into Supabase.
    """
    global CAMOUFOX_BASE
    if camofox_url:
        CAMOUFOX_BASE = camofox_url

    if not camofox_health():
        print(json.dumps({
            "error": "camofox_unavailable",
            "message": "Camoufox server not reachable",
            "url": CAMOUFOX_BASE,
        }), file=sys.stderr)
        return []

    print(f"Camoufox connected at {CAMOUFOX_BASE}", file=sys.stderr)
    print(f"Scanning SRO={sro} Year={year}", file=sys.stderr)

    tab_id = None
    results: list[dict[str, Any]] = []
    seen: set[str] = set()

    try:
        tab_id = camofox_create_tab(IGR_URL)
        _wait_for_tab(tab_id)
        time.sleep(3)

        # Fill form
        status = _fill_igr_form(tab_id, sro, year)
        if status != 'ready':
            print(json.dumps({
                "error": "form_fill_failed",
                "sro": sro,
                "year": year,
                "detail": status,
            }), file=sys.stderr)
            return []

        # CAPTCHA — try solver, fall back to manual
        if not captcha_text:
            # Take screenshot for manual solving
            cap_path = f"igr_captcha_{sro.replace(' ', '_')}_{year}.png"
            url = f"{CAMOUFOX_BASE}/tabs/{tab_id}/screenshot?userId={USER_ID}"
            try:
                req = urllib.request.Request(url, method="GET")
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                    if data.startswith(b"{"):
                        import base64
                        data = base64.b64decode(json.loads(data.decode()).get("screenshot", ""))
                    with open(cap_path, "wb") as f:
                        f.write(data)
            except Exception as e:
                print(f"Screenshot failed: {e}", file=sys.stderr)
                cap_path = None
        else:
            cap_path = None

        if not captcha_text and cap_path:
            # Try automated solver
            print(f"  Trying CAPTCHA solver...", file=sys.stderr)
            import importlib.util
            solver_path = os.path.join(os.path.dirname(__file__), "captcha_solver.py")
            spec = importlib.util.spec_from_file_location("captcha_solver", solver_path)
            solver_mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(solver_mod)
            captcha_text = solver_mod.solve_captcha(cap_path, retries=2)

            if captcha_text:
                print(f"  ✓ Solver returned: {captcha_text}", file=sys.stderr)
            else:
                # Fallback to manual
                print(f"\n  Solver failed. Opening: {os.path.abspath(cap_path)}", file=sys.stderr)
                print(f"  (Or press Enter to skip this SRO)", file=sys.stderr)
                captcha_text = input("CAPTCHA text: ").strip()

        # Enter CAPTCHA and click Search
        camofox_evaluate(tab_id, f"""
            (() => {{
                const c = document.getElementById('txtImg');
                if (c) {{ c.value = '{captcha_text}'; }}
            }})()
        """)
        camofox_click(tab_id, ref="e18")  # Search button ref — may need adjustment per session
        time.sleep(5)

        # Extract all pages
        page_num = 1
        while True:
            print(f"  Page {page_num}...", file=sys.stderr)
            data = _extract_results_from_page(tab_id)
            if isinstance(data, dict) and data.get("error"):
                # Fallback: snapshot-based parsing
                print("  Using snapshot fallback...", file=sys.stderr)
                snap = camofox_snapshot(tab_id)
                raw_rows = _snapshot_to_rows(snap)
                for row in raw_rows:
                    doc_no = row.get("col_0", "")
                    if not doc_no or not re.search(r"\d", doc_no):
                        continue
                    if _is_duplicate(doc_no.strip(), year, sro, seen):
                        continue
                    seen.add(f"{sro}/{year}/{doc_no.strip()}")
                    txn = {
                        "doc_number": doc_no.strip(),
                        "year": year,
                        "sro_office": sro,
                        "registration_date": row.get("col_1", ""),
                        "consideration_amount": _parse_amount(row.get("col_2", "")),
                        "property_type": row.get("col_4", ""),
                        "village_locality": row.get("col_5", ""),
                        "source": "igr_scanner",
                        "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    }
                    results.append(txn)
                break

            rows = data.get("rows", [])
            for row in rows:
                doc_no = row.get("doc_no", "")
                if _is_duplicate(doc_no, year, sro, seen):
                    continue
                seen.add(f"{sro}/{year}/{doc_no}")

                txn = {
                    "doc_number": doc_no,
                    "year": year,
                    "sro_office": sro,
                    "registration_date": row.get("reg_date", ""),
                    "consideration_amount": _parse_amount(row.get("consideration", "")),
                    "stamp_duty": _parse_amount(row.get("stamp_duty", "")),
                    "property_type": row.get("property_type", ""),
                    "village_locality": row.get("village", ""),
                    "buyer_name": row.get("buyer", ""),
                    "seller_name": row.get("seller", ""),
                    "source": "igr_scanner",
                    "scraped_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                results.append(txn)

            print(f"  → {len(rows)} results (total: {len(results)})", file=sys.stderr)

            if not data.get("has_next_page"):
                break

            # Click next page
            result = camofox_evaluate(tab_id, """
                (() => {
                    const links = document.querySelectorAll('a');
                    for (const a of links) {
                        const href = a.href || a.getAttribute('href') || '';
                        if (href.includes('__doPostBack') && href.includes('Page')) {
                            a.click();
                            return 'clicked';
                        }
                    }
                    return 'none';
                })()
            """)
            if 'clicked' not in str(result).lower():
                break
            page_num += 1
            time.sleep(3)

        print(f"Done: {len(results)} transactions for {sro}/{year}", file=sys.stderr)

    except Exception as e:
        print(json.dumps({
            "error": "scan_failed",
            "sro": sro,
            "year": year,
            "detail": str(e),
        }), file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
    finally:
        if tab_id:
            try:
                camofox_close_tab(tab_id)
            except Exception:
                pass

    return results


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="IGR Maharashtra scanner via Camoufox")
    parser.add_argument("--sro", required=True, help="SRO name (e.g., 'Bandra 1')")
    parser.add_argument("--year", required=True, type=int, help="Year (e.g., 2025)")
    parser.add_argument("--captcha", default=None, help="CAPTCHA text (skip interactive prompt)")
    parser.add_argument("--camofox-url", default=None, help="Camoufox API URL override")
    parser.add_argument("--dry-run", action="store_true", help="Just test connection, don't scan")
    args = parser.parse_args()

    if args.dry_run:
        if camofox_health():
            print(json.dumps({"ok": True, "camofox": CAMOUFOX_BASE}))
        else:
            print(json.dumps({"ok": False, "camofox": CAMOUFOX_BASE, "error": "not reachable"}))
            sys.exit(1)
        return

    results = scan_sro(
        sro=args.sro,
        year=args.year,
        captcha_text=args.captcha,
        camofox_url=args.camofox_url,
    )

    # Output JSON to stdout (pipeable)
    print(json.dumps({
        "sro": args.sro,
        "year": args.year,
        "count": len(results),
        "transactions": results,
    }, indent=2))


if __name__ == "__main__":
    main()
