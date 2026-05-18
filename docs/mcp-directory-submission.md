# PropAI MCP Directory Submission Pack

## Public URL

- Docs page: `https://www.propai.live/mcp`
- MCP server: `https://mcp.propai.live`

## Short listing blurb

PropAI MCP connects broker-network real estate intelligence to Claude and other MCP clients. Search fresh listings from WhatsApp broker groups, inspect Maharashtra IGR pricing, save CRM records, qualify leads, schedule follow-ups, and summarize broker threads inside one connector.

## Suggested category

- Real Estate
- Secondary: Sales, CRM, Market Intelligence

## Key claims

- First Indian real estate MCP connector
- Fresh broker-network inventory from WhatsApp-led workflows
- Combines search, CRM actions, and market intelligence in one connector

## Screenshot Carousel Plan

Anthropic requires screenshots in carousel format. Keep each panel clean, product-led, and operational. Avoid tiny text. Use real data only if it is safe to publish.

### Panel 1

- Title: `Search live broker inventory`
- Caption: `Find fresh listings from broker WhatsApp networks with direct structured results inside the MCP client.`
- Product state to capture:
  - Prompt asking for `2BHK sale listings in Bandra under 4 Cr`
  - Response showing `search_listings` or `semantic_search`
  - At least 3 returned listings

### Panel 2

- Title: `Price with market context`
- Caption: `Check Maharashtra IGR transaction context and compare against current market asks before advising a buyer or seller.`
- Product state to capture:
  - Prompt asking for building or locality pricing
  - Response using `get_igr_price` or `price_estimate`
  - Clear display of transaction rate or estimated value

### Panel 3

- Title: `Save a listing into CRM`
- Caption: `Turn a broker note into a saved PropAI listing record without leaving the MCP workflow.`
- Product state to capture:
  - Prompt with a raw listing note
  - Response using `save_listing`
  - Confirmation message with listing saved

### Panel 4

- Title: `Capture buyer requirements`
- Caption: `Create structured buyer or tenant requirements, then qualify urgency and budget in the same conversation.`
- Product state to capture:
  - Prompt creating a requirement
  - Response using `create_requirement` and optionally `qualify_lead`
  - Confirmation plus lead priority

### Panel 5

- Title: `Run follow-ups and thread summaries`
- Caption: `Summarize a broker thread, decide the next action, and schedule a callback from one connector.`
- Product state to capture:
  - Prompt summarizing a thread
  - Response using `summarise_thread`
  - Follow-up prompt using `set_follow_up`

### Optional Panel 6

- Title: `See broker activity at a glance`
- Caption: `Review lead volume, active chats, top localities, and pending follow-ups for the workspace.`
- Product state to capture:
  - Prompt asking for weekly broker activity
  - Response using `broker_activity`

## Screenshot Shot List

- Use a single visual style across all panels.
- Prefer desktop Claude connector UI with the PropAI connector visible.
- Keep the tool call/result area readable.
- Blur or replace phone numbers, personal names, and exact addresses if they are not safe to publish.
- Show enough of the conversation context so the action feels real, not cropped into ambiguity.

## Logo / Asset Checklist

- Square app icon
- Transparent logo variant
- Dark-background logo variant
- Favicon-sized mark

## Submission Notes

- Mention OAuth authentication explicitly.
- Mention HTTPS and public documentation URL explicitly.
- Mention privacy policy URL if the form asks for it.
- If a category picker exists and Real Estate is missing, submit under the closest operational category and note `Real Estate MCP connector` in description.

## Social Launch Angle

- `PropAI is now one of the first MCP connectors built for Indian real estate workflows.`
- `Broker-network inventory, IGR pricing, CRM saves, and follow-ups now work directly inside MCP clients.`
- `If a real estate category does not exist yet in the directory, PropAI should define it.`
