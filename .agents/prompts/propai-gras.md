---
name: propai-gras
description: "Fix propai-gras IGR Maharashtra portal scraper. Use Camoufox (Playwright-based) to navigate the government portal instead of direct HTTP fetch, which gets blocked by robots.txt. Target: building name + locality -> registered transaction price + date."
---

# Fix propai-gras IGR Maharashtra Portal Scraper

## Problem

The live IGR fetch (`POST /api/igr/fetch`) is timing out. The government portal (`https://igrmaharashtra.gov.in/`) blocks direct crawlers with robots.txt. The scraper fails with:

```
"No live IGR source URL could be found."
```

Current code at `apps/api/src/services/igrLiveFetchService.ts`:
1. Uses `browserToolService.execute('search_web', ...)` to search for the portal URL
2. Then does a direct `web_fetch` on the found URL
3. The direct fetch gets blocked because the portal requires browser-like headers, session cookies, and possibly a form POST flow

## Required Fix

Rewrite the IGR live fetch to use **Camoufox** (Playwright-based browser) for full portal navigation instead of direct URL fetch. Camoufox is already deployed and available at `http://camofox:9377` (configurable via `CAMOFOX_URL` env var).

The IGR Maharashtra portal flow requires:
1. **Browser-like headers** — User-Agent, Accept-Language, etc. Raw axios/fetch gets blocked.
2. **Session cookie** — The portal sets a session cookie on the landing page before the data endpoint is accessible.
3. **Form POST flow** — Navigate to the property registration search section, submit district/taluka/building params, extract transaction data from the results page.

## Implementation

### Architecture

The fix goes in `apps/api/src/services/igrLiveFetchService.ts`. Replace the `web_fetch` call with a Camoufox-based navigation flow.

### Camoufox API Available

Base URL: `http://camofox:9377` (or `CAMOFOX_URL` env var)

Endpoints used by existing code (`apps/api/src/services/browserToolService.ts`):
- `POST /tab/create` — Create a new browser tab
- `POST /tab/{id}/navigate` — Navigate to a URL
- `GET /tab/{id}/snapshot` — Get page content/HTML
- `DELETE /tab/{id}` — Close tab
- `POST /tab/{id}/click` — Click an element (selector)
- `POST /tab/{id}/evaluate` — Run JS in the page context

### Navigation Flow

1. **Create tab** via Camoufox
2. **Navigate** to `https://igrmaharashtra.gov.in/` (or `https://freesearchigrservice.maharashtra.gov.in/`)
3. **Wait** for page to load — the portal sets session cookies
4. **Navigate** to the property search section (likely a form at a sub-path or via clicking a link)
5. **Fill form**: Enter building name and/or locality, select district/taluka if required
6. **Submit** the search form
7. **Extract** transaction results from the response page (table rows with doc number, registration date, consideration, area, etc.)
8. **Parse** results into structured transaction records
9. **Close** tab
10. **Upsert** into `igr_transactions` table (same logic as current `fetchAndStore`)

### Target URL Discovery

The current `pickCandidateUrl` logic tries to find URLs matching patterns like `igrmaharashtra`, `igrs.maharashtra`, `registration`, `freesearchigrservice`. The actual portal is at:
- Main: `https://igrmaharashtra.gov.in/`
- Free search: `https://freesearchigrservice.maharashtra.gov.in/`

The free search portal has a form where you can search by:
- Document number
- Year
- SRO office (district/taluka)
- Property address / building name

### CAPTCHA Handling

The portal may show CAPTCHA. `igr_scanner.py` (`apps/api/src/scrapers/igr_scanner.py`) already handles this via screenshot + solver. Reuse that approach if needed:
1. Take a screenshot via Camoufox snapshot
2. Pass to a CAPTCHA solver or AI service
3. Fill the CAPTCHA response and submit

### Fallback Strategy

If the browser-based navigation fails entirely:
1. Fall back to web search for publicly indexed IGR data
2. Or use Cached/archived versions from Google Cache

### Verification

After implementing:
1. Test with known building name like "Kalpataru Magnus" in Bandra East
2. Verify a valid transaction record is returned
3. Confirm the record upserts correctly into `igr_transactions`
4. Verify the frontend IGR page displays the new data

## Files to Modify

### Primary
- `apps/api/src/services/igrLiveFetchService.ts` — Replace `web_fetch` with Camoufox navigation

### Reference Files
- `apps/api/src/services/browserToolService.ts` — Existing Camoufox integration patterns
- `apps/api/src/scrapers/igr_scanner.py` — Python Camoufox-based scanner (for reference on portal flow)
- `propai-gras/src/scraper.ts` — TypeScript scraper skeleton (update with real logic)
- `propai-gras/src/fetch_actual_igr.ts` — Actual data fetching utility
- `apps/api/src/routes/igrRoutes.ts` — API route handler
- `supabase/migrations/20260519150000_create_igr_transactions.sql` — DB schema

## Dependencies

- Camoufox already deployed at `propai-camofox` service (port 9377)
- `browserToolService.ts` already has `withCamofoxTab()`, `getCamofoxSnapshot()`, `ensureCamofoxStarted()` helpers
