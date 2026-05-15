# WaBro V2 — Product Requirements Document

## Broker-to-Broker WhatsApp Broadcast Platform for Indian Real Estate

**Version:** 2.0  
**Last Updated:** May 2025  
**Author:** WaBro Team  
**Status:** Draft

---

## Table of Contents

1. [Vision & Problem Statement](#1-vision--problem-statement)
2. [Target Users & Personas](#2-target-users--personas)
3. [Core Value Proposition](#3-core-value-proposition)
4. [Feature Breakdown](#4-feature-breakdown)
   - [4.1 P0 — Must Have (V2.0)](#41-p0--must-have-v20)
   - [4.2 P1 — Should Have (V2.1)](#42-p1--should-have-v21)
   - [4.3 P2 — Could Have (V2.2)](#43-p2--could-have-v22)
5. [User Flows & Wireframes](#5-user-flows--wireframes)
6. [Data Model](#6-data-model)
7. [Technical Architecture](#7-technical-architecture)
8. [API Integrations](#8-api-integrations)
9. [Monetization Strategy](#9-monetization-strategy)
10. [Compliance & Trust](#10-compliance--trust)
11. [Success Metrics & KPIs](#11-success-metrics--kpis)
12. [Release Roadmap](#12-release-roadmap)
13. [Competitive Landscape](#13-competitive-landscape)

---

## 1. Vision & Problem Statement

### Vision
Make WaBro the **default infrastructure** for broker networks in Indian real estate — the tool that developers, agencies, and individual brokers use to distribute property listings, track sub-broker responses, and settle commissions transparently.

### Problem Statement

Indian real estate brokerage runs on **informal, unmeasurable networks**:

- **Developers/Agencies** maintain broker lists in Excel sheets and WhatsApp groups
- Property listings are shared chaotically — buried in group chats, lost in noise
- No way to measure which broker responded, which lead converted, which commission is owed
- Sub-brokerage disputes are the #1 source of conflict between developers and brokers
- Manual personalization at scale is impossible — brokers receive generic blasts they ignore
- WhatsApp spam filters and ban risks make mass broadcasting unreliable

### Opportunity
India has **~12 lakh+ active real estate brokers**, with the top 10 cities alone generating ₹3.5 lakh Cr in annual transactions. The broker network is the distribution backbone — yet has **zero digital infrastructure**. WaBro V2 fills this gap.

---

## 2. Target Users & Personas

### Persona 1: **Developer/Agency Owner** (Primary Buyer)
- **Age:** 30–55
- **Profile:** Runs a real estate development firm or large agency. Has 50–500+ sub-brokers.
- **Pain:** Can't efficiently push new listings to their network. No visibility into broker activity.
- **Goal:** Maximize reach of new launches, track which brokers are productive, automate commission calculations.
- **Willingness to Pay:** High (₹2,000–₹10,000/month for enterprise plans)

### Persona 2: **Broker Manager / Team Lead**
- **Age:** 25–45
- **Profile:** Manages a team of 10–50 freelance brokers for a developer or agency.
- **Pain:** Manual tracking of who got which lead, commission calculations via Excel, chasing brokers for updates.
- **Goal:** Systematic lead distribution, response tracking, automated commission reports.
- **Willingness to Pay:** Medium (₹999–₹2,999/month)

### Persona 3: **Individual Broker / Sub-Broker**
- **Age:** 22–50
- **Profile:** Freelance broker working with multiple developers. Receives listings via WhatsApp groups.
- **Pain:** Listings get buried in groups. No structured way to see commissions, track client interest, or follow up.
- **Goal:** Receive relevant listings, track their referrals, get paid correctly.
- **Willingness to Pay:** Low/Freemium (₹0–₹499/month)

---

## 3. Core Value Proposition

| For | Value |
|-----|-------|
| **Developers/Agencies** | Turn your broker network into a measurable distribution engine |
| **Broker Managers** | Replace Excel with an automated campaign + tracking + payout system |
| **Sub-Brokers** | Get relevant listings fast, track your referrals, prove your worth |

**One-line:**  
*WaBro is the campaign management + lead tracking + commission settlement platform for India's broker-driven real estate market.*

---

## 4. Feature Breakdown

### 🔴 4.1 P0 — Must Have (V2.0)

---

#### **F1: Campaign Builder**

**Description:** Create and send structured property broadcast campaigns to broker networks.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F1-US1 | Developer | "As a developer, I can create a campaign by selecting a project/listing, writing a message with auto-populated details, and choosing broker groups to send to." | Campaign creation flow completes in < 3 min. Message auto-fills property details (price, BHK, area, RERA). |
| F1-US2 | Broker Manager | "As a manager, I can create bulk-personalized campaigns using merge fields like `{{broker_name}}`, `{{project_name}}`, `{{commission}}`." | Merge fields render correctly in preview and sent messages. |
| F1-US3 | User | "As a user, I can attach images (floor plans, renders), PDFs (brochures), and location pins to my campaign." | All attachment types supported; total size ≤ 20MB per campaign. |
| F1-US4 | User | "As a user, I can schedule a campaign for a future date/time." | Campaign sends at scheduled time with ±1 min accuracy. |
| F1-US5 | User | "As a user, I can save a campaign as a template for reuse." | Saved template loads all fields (message, attachments, targeting) for new campaigns. |
| F1-US6 | User | "As a user, I can create a campaign in Hindi, English, Tamil, Marathi, Telugu, Kannada, Gujarati, or Bengali." | Multi-language editor with character count per language. Unicode rendering correct. |

**Functional Requirements:**
- Rich text message editor with merge field toolbar
- Property detail auto-population from listing database or manual entry
- Broker group selector with search/filter
- Multi-language support with RTL-safe rendering
- Image compression before upload (max 5MB per image)
- PDF attachment viewer in-app
- Schedule/queue management
- Template library (pre-built + custom)

---

#### **F2: Broker Group & Contact Management**

**Description:** Organize sub-brokers into structured groups with rich metadata.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F2-US1 | User | "As a user, I can create broker groups by city, property type, specialization, or custom tags (e.g., 'Top Performers', 'New Leads - Pune')." | Groups support unlimited custom tags. Broker can belong to multiple groups. |
| F2-US2 | User | "As a user, I can import broker contacts from CSV, Excel, or phonebook with auto-mapping of columns." | CSV import wizard detects +91 phone numbers, auto-maps columns, duplicates flagged. |
| F2-US3 | User | "As a user, I can import contacts from 99acres Developer / MagicBricks / NoBroker portal exports." | Dedicated importers for each portal's CSV format with field mapping. |
| F2-US4 | User | "As a user, I can filter contacts by city, pincode range, language, past response rate, and deal history." | Filters are chainable (AND logic). Results load in < 2 seconds for 10K contacts. |
| F2-US5 | User | "As a user, I can geo-tag brokers based on their operating locality." | Auto-geo-tag via pincode lookup. Manual pin override available. Map view for visual verification. |
| F2-US6 | User | "As a user, I can maintain a broker performance score based on response rate and closed deals." | Score auto-calculated: (response_rate × 0.4) + (close_rate × 0.4) + (avg_response_time_score × 0.2). |

**Functional Requirements:**
- Contact fields: Name, Phone, City, Locality, Pincode, Languages, Specialization (Resale/New Launch/Commercial/Plot), Group Tags, Performance Score, Notes, Commission Terms, Active/Inactive status
- Bulk operations: Add to group, remove, merge duplicates, export
- Phone number validation (Indian mobile format +91XXXXXXXXXX)
- Duplicate detection (phone number match + fuzzy name match)

---

#### **F3: WhatsApp Business API Integration (Migration from Accessibility Service)**

**Description:** Replace the current Accessibility Service-based approach with official WhatsApp Business API for reliability and compliance.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F3-US1 | User | "As a user, I want the app to use WhatsApp Business API so my messages don't get flagged as spam." | All outgoing messages sent via official API. No ban incidents in 30-day testing. |
| F3-US2 | User | "As a user, I can connect my WhatsApp Business account via phone number verification." | Onboarding: Enter number → OTP → verified in < 2 min. |
| F3-US3 | User | "As a user, I receive delivery receipts and read receipts for every message sent." | Status tracking: Sent → Delivered → Read. 95%+ delivery rate. |
| F3-US4 | User | "As a user, I can set message templates approved by Meta (WhatsApp) for structured broadcasts." | Template approval workflow visible. Template preview before submission. |
| F3-US5 | User | "As a user, my broadcast respects WhatsApp rate limits (1000 msg/hour for new accounts)." | Rate limiting auto-handled. Campaign pauses and resumes within limits. |

**Technical Note:**
- Primary: Use WhatsApp Business Cloud API via official BSP (Business Solution Provider) like Twilio, 360dialog, or Gupshup
- Fallback: For users who can't access official API, keep Accessibility Service as legacy mode with clear warning
- Template-based messaging for broadcasts; session messages for replies

---

#### **F4: Broker Response Tracking & Hot Lead Detection**

**Description:** Track which brokers respond to campaigns, flag hot leads, and measure engagement.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F4-US1 | User | "As a user, I can see a real-time dashboard of who replied to my campaign broadcast." | Response list shows: broker name, phone, response text, timestamp, message type (text/reply/button). |
| F4-US2 | User | "As a user, I can set keyword rules to auto-flag 'hot' responses (e.g., 'interested', 'visit', 'call me', 'rate')." | Keyword rules configurable per campaign. Hot leads highlighted in dashboard. |
| F4-US3 | User | "As a user, I can see response rate, delivery rate, and read rate per campaign." | Campaign metrics: Sent, Delivered (%), Read (%), Responded (%), Hot Leads (#). |
| F4-US4 | User | "As a user, I can get push notifications when a broker responds with high-intent keywords." | Notification fires within 30 seconds of response detection. |
| F4-US5 | User | "As a user, I can send auto-follow-up messages to brokers who didn't respond within X hours." | Follow-up delay configurable (1h, 4h, 12h, 24h, 48h). Follow-up message editable. |
| F4-US6 | User | "As a user, I can see a broker's full response history across all campaigns." | Broker profile shows: campaigns responded to, response timestamps, conversation snippets. |

**Functional Requirements:**
- Response listener via WhatsApp API webhooks
- NLP keyword matching (synonym support: "interesht" → "interested", "dekhna chahta hoon" → "interested")
- Lead scoring algorithm (response speed + keyword match + follow-up responses)
- Real-time dashboard with WebSocket updates
- Auto-follow-up queue with configurable delay

---

#### **F5: Commission Tracker & Payout Reports**

**Description:** Track sub-brokerage per deal, generate commission reports, and handle settlement.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F5-US1 | Developer | "As a developer, I can set commission rates per broker or broker group for each project." | Commission rates: 0.5%–3% configurable. Tier-based (e.g., 1.5% for first 10 units, 0.75% beyond). |
| F5-US2 | Developer | "As a developer, I can auto-calculate commission for a deal based on unit price and broker's rate." | Calculation: `unit_price × commission_% = commission_amount`. Auto-generated invoice. |
| F5-US3 | Broker Manager | "As a manager, I can see pending, processed, and paid commissions for each broker." | Dashboard with status: Pending / Invoice Raised / Paid. Filter by date range, broker, project. |
| F5-US4 | User | "As a user, I can generate a monthly commission report in PDF/Excel format." | Report includes: broker name, deal details, deal value, commission %, commission amount, payment status. |
| F5-US5 | User | "As a user, I can link a broker's response to a converted deal to attribute the commission correctly." | Attribution flow: Campaign → Response → Client Meeting → Deal Closure → Commission. |
| F5-US6 | Developer | "As a developer, I can record deal closure and trigger commission calculation automatically." | Deal closure form: Select broker, select client, deal value, date. Commission auto-calculated. |

**Functional Requirements:**
- Commission rate management (global default + broker override)
- Tiered commission structure per project
- Deal closure workflow with broker attribution
- Commission ledger with payment tracking
- Export: PDF, Excel, CSV
- Integration with accounting tools (optional)

---

#### **F6: RERA Compliance Auto-Append**

**Description:** Automatically append RERA registration numbers and required disclaimers to every broadcast.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F6-US1 | Developer | "As a developer, I can register my RERA numbers per project and state." | Project profile includes RERA registration number, state, and registration URL. |
| F6-US2 | User | "As a user, RERA numbers are automatically appended to every campaign message." | Template: `*RERA Registration No.: PXXY1234567 | [Project URL]` auto-added as footer. |
| F6-US3 | User | "As a user, customizable compliance disclaimers are added to messages." | Disclaimer templates: "This communication is for informational purposes only.", "All prices are subject to change.", etc. Configurable per campaign. |
| F6-US4 | User | "As a user, I can set RERA disclaimers as mandatory — campaign won't send without them." | Campaign validation fails if RERA number missing for linked project. |

---

### 🟡 4.2 P1 — Should Have (V2.1)

---

#### **F7: Geo-Targeted Broker Matching**

**Description:** Automatically recommend brokers based on geographic proximity to project locations.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F7-US1 | User | "As a user launching a project in Whitefield Bangalore, I can see which of my brokers operate in East Bangalore." | Map visualization with project pin + broker density overlay. Pincode-based matching. |
| F7-US2 | User | "As a user, I can auto-assign a new lead from a specific pincode to the nearest broker." | Auto-routing rules configurable per pincode/area. Fallback to round-robin if no geo-match. |
| F7-US3 | User | "As a user, I can create hyper-local campaigns (e.g., target brokers within 5 km of project site)." | Geo-fence radius selector (1 km, 5 km, 10 km, city-wide). Broker proximity ranking. |

**Functional Requirements:**
- Pincode database integration (Indian pincode → lat/long)
- Broker geo-coordinates from pincode/locality
- Proximity calculation engine
- Coverage map visualization

---

#### **F8: Property Listing Management**

**Description:** Central repository for all projects and inventory.

**User Stories:**

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F8-US1 | User | "As a user, I can add property listings with full details (price, BHK, area, possession date, RERA, amenities)." | Listing form covers all fields. Address auto-suggest via Google Maps API. |
| F8-US2 | User | "As a user, I can organize listings by project, phase, tower, and unit type." | Hierarchical structure: Project → Phase → Tower → Units. |
| F8-US3 | User | "As a user, I can update listing status (Coming Soon → Launched → Sold Out)."" | Status dashboard with inventory overview. Sold units highlighted. |
| F8-US4 | User | "As a user, I can generate WhatsApp-ready listing cards with all details auto-formatted." | Card preview with WhatsApp formatting (emojis, line breaks, bold). |

---

#### **F9: Payment Integration (UPI/Online)**

**Description:** Enable P2P and business payments for sub-broker commission payouts.

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F9-US1 | User | "As a developer, I can process commission payouts via UPI to brokers." | UPI ID validation, payment initiation via Razorpay/Payout API. |
| F9-US2 | User | "As a user, I can generate commission invoices that brokers can pay via UPI/GPay." | Invoice with UPI deep link. Payment status auto-tracked. |
| F9-US3 | User | "As a user, I can subscribe to WaBro plans via UPI." | UPI autopay integration. Plan management in Settings. |

---

#### **F10: Festival & Seasonal Campaign Templates**

**Description:** Pre-built campaign templates for Indian festivals and seasons.

**Templates:**
- 🪔 **Diwali Dhamaka** — "This Diwali, gift your clients a new home. Special festive rates inside!"
- 🎨 **Holi Bonanza** — "Colors of savings! Enjoy extra ₹X lakhs off on bookings this Holi."
- 🌾 **Akshay Tritiya** — "Auspicious day, auspicious investment. Book now for exclusive benefits."
- ☀️ **Summer Move-in** — "Possession-ready flats! Move in this summer with zero wait."
- 🏷️ **Year-End Clearance** — "Last chance! Unsold inventory at unbeatable prices."
- 🌧️ **Monsoon Special** — "Monsoon discounts on under-construction projects."

---

#### **F11: EMI Calculator Integration**

**Description:** Include pre-filled EMI calculator links in every listing broadcast.

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F11-US1 | User | "As a user, I can generate an EMI calculator link pre-filled with property price, down payment, and interest rate." | Deep link opens calculator with values pre-loaded. Supports major banks' rate ranges. |
| F11-US2 | User | "As a user, EMI details are auto-included in listing broadcast messages." | Message template includes: "EMI from ₹X,XXX/month for 20 years @ 8.5%". |

---

### 🟢 4.3 P2 — Could Have (V2.2)

---

#### **F12: AI-Powered Lead Scoring**

**Description:** Machine learning model to predict which broker leads will convert.

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F12-US1 | User | "As a user, I can see an AI-predicted conversion probability for each lead." | Score 1–100 based on: response speed, message content, broker's past close rate, property match score. |
| F12-US2 | User | "As a user, I get AI recommendations on which broker to assign a lead to." | Recommendation based on: broker's specialty, past performance in locality, response latency. |
| F12-US3 | User | "As a user, AI suggests optimal send times for each broker group." | Send time optimization based on historical open/response data per group. |

---

#### **F13: Commission Dispute Resolution Module**

**Description:** Transparent system to handle and resolve commission disputes.

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F13-US1 | User | "As a broker, I can raise a commission dispute if I believe I'm not credited correctly." | Dispute form: Select deal, explain issue, upload evidence. Auto-notify developer/manager. |
| F13-US2 | User | "As a developer, I can review disputes with full audit trail of attribution." | Audit trail: Campaign sent → Broker responded → Client connected → Deal closed. |
| F13-US3 | User | "As a user, I can configure dispute resolution rules (first-touch, last-touch, split)." | Configurable attribution models per project. |

---

#### **F14: Sub-Broker App (Companion)**

**Description:** A lightweight companion app for sub-brokers to receive listings, respond, and track referrals.

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F14-US1 | Broker | "As a broker, I can see all listings sent to me in a structured feed." | Card-based feed with filters (city, price, type). Read/unread status. |
| F14-US2 | Broker | "As a broker, I can respond to listings with one-tap intent signals (Interested, Share with Client, Not Now)." | Intent button generates WhatsApp message to developer/manager. |
| F14-US3 | Broker | "As a broker, I can see my referral history and pending commissions." | Table with: Date, Client, Property, Status, Commission Amount, Payment Status. |

---

#### **F15: Referral Chain Tracking**

**Description:** Track broker-to-broker referral chains in multi-tier networks.

| ID | Role | Story | Acceptance Criteria |
|----|------|-------|-------------------|
| F15-US1 | User | "As a developer, I can see the full chain: Developer → Agent → Sub-Agent → Client." | Visual referral tree per deal. Commission split visible at each level. |
| F15-US2 | User | "As a user, I can configure multi-tier commission splits (e.g., 60% field agent, 25% sub-agent, 15% developer)." | Multi-tier rules engine. Auto-calculates splits on deal closure. |

---

## 5. User Flows & Wireframes

### 5.1 Campaign Creation Flow

```
[Home Dashboard]
      ↓ Tap "New Campaign"
[Select Template] → [Select Listing/Project]
      ↓
[Compose Message]
  ├── Auto-filled property details
  ├── Merge field toolbar ({{name}}, {{brokerage}}, {{city}})
  ├── Attachment tray (images, PDF, location)
  └── Language selector
      ↓
[Select Recipients]
  ├── Group selector (All Brokers, City-wise, Specialty)
  ├── Geo-target map (optional)
  ├── Individual broker picker
  └── Contact count + estimated delivery time
      ↓
[Review & Send]
  ├── Message preview
  ├── Recipient count
  ├── Cost estimate (API credits)
  ├── Schedule option
  └── 🚀 Send / 💾 Save as Draft
      ↓
[Campaign Dashboard]
  ├── Sent / Delivered / Read / Responded counts (live)
  ├── Hot Leads panel
  └── Follow-up button
```

### 5.2 Broker Response Dashboard

```
[Campaign Card: "Whitefield Launch - 3BHK"]
  ├── Metrics Bar: 247 Sent | 231 Delivered (94%) | 178 Read (77%) | 43 Responded (18%)
  ├── Sort by: Response Time | Intent Strength | Broker Name
  └── Filter: Hot | Warm | Cold | No Response

[Response Card]
  ├── Broker: Rajesh Kumar (Rajasthan Realty)
  ├── Phone: +91 98XXX XXXX
  ├── Message: "Hi, can we discuss commission terms for bulk referral?"
  ├── Intent: 🔴 Hot (keywords: commission, bulk, referral)
  ├── Location: Jaipur (42 km from project)
  ├── Past Performance: 8/12 response rate, 3 deals closed
  ├── Actions: [Reply] [Call] [Mark Interested] [Assign to Agent]
  └── Timestamp: 2 hours ago
```

### 5.3 Commission Management Flow

```
[Deal Closed]
  ├── Select Broker (by response attribution or manual)
  ├── Select Client
  ├── Enter Deal Value: ₹1.25 Cr
  ├── Auto-calculate Commission @ 1.5% = ₹1,87,500
  ├── Commission Split: Agent ₹1,12,500 | Sub-Agent ₹75,000
  ├── Generate Invoice
  └── Payment Status: [Pending] → [Invoice Sent] → [UPI Paid] → [Settled]
```

---

## 6. Data Model

### Entity Relationship Diagram (Description)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   User       │─────│  BrokerGroup  │─────│   Broker     │
│  (Developer/ │     │  (Groups)     │     │  (Contact)   │
│   Manager)   │     └──────────────┘     └──────┬───────┘
└──────┬───────┘                                  │
       │                          ┌──────────────┼──────────────┐
       │                          │              │              │
┌──────▼───────┐         ┌────────▼────┐  ┌─────▼─────┐ ┌──────▼──────┐
│  Campaign    │         │ Campaign    │  │ Broker    │ │ Broker      │
│              │         │ Response    │  │ Response  │ │ Performance │
│ - title      │         │             │  │ History   │ │ Score       │
│ - message    │         │ - broker_id │  │           │ │             │
│ - listing    │         │ - response  │  │           │ │             │
│ - recipients │         │ - timestamp │  │           │ │             │
│ - status     │         │ - intent    │  │           │ │             │
│ - schedule   │         └─────────────┘  └───────────┘ └─────────────┘
└──────┬───────┘
       │
┌──────▼───────┐     ┌──────────────┐     ┌──────────────┐
│   Listing    │─────│   Deal       │─────│ Commission   │
│  (Property)  │     │  (Closure)   │     │  Record      │
│              │     │              │     │              │
│ - name       │     │ - listing_id │     │ - deal_id    │
│ - price      │     │ - broker_id  │     │ - broker_id  │
│ - details    │     │ - client_id  │     │ - amount     │
│ - RERA       │     │ - deal_value │     │ - status     │
│ - images     │     │ - date       │     │ - split      │
│ - location   │     │ - commission │     │ - paid_date  │
│ - status     │     │   amount     │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

### Core Entities

#### `User`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| name | String | |
| phone | String | +91XXXXXXXXXX |
| email | String | |
| company | String | Developer/Agency name |
| role | Enum | DEVELOPER, MANAGER, ADMIN |
| plan | Enum | FREE, PRO, ENTERPRISE |
| created_at | Timestamp | |

#### `Broker`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| name | String | |
| phone | String | +91XXXXXXXXXX (unique) |
| whatsapp_number | String | May differ from phone |
| city | String | |
| locality | String | Optional |
| pincode | String | 6-digit |
| latitude | Double | Auto from pincode |
| longitude | Double | Auto from pincode |
| specialization | Enum | RESALE, NEW_LAUNCH, COMMERCIAL, PLOT, ALL |
| languages | List<String> | HINDI, ENGLISH, MARATHI, etc. |
| groups | List<BrokerGroup> | M2M |
| performance_score | Double | 0–100 |
| tags | List<String> | Free-form |
| created_at | Timestamp | |
| is_active | Boolean | |

#### `BrokerGroup`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → User (owner) |
| name | String | "Delhi Brokers", "Top Performers Q1" |
| description | String | |
| type | Enum | CITY, SPECIALIZATION, CUSTOM, PERFORMANCE |
| filter_criteria | JSON | Dynamic filters |
| broker_count | Int | |

#### `Listing`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| project_name | String | |
| address | String | Full address |
| city | String | |
| locality | String | |
| pincode | String | |
| latitude | Double | |
| longitude | Double | |
| property_type | Enum | FLAT, HOUSE, SHOP, OFFICE, PLOT, VILLA |
| sub_type | Enum | RESALE, NEW_LAUNCH, PRE_LAUNCH |
| price | Decimal | |
| bhk | Int | 0 (studio) to 5+ |
| area_sqft | Int | |
| possession_date | Date | |
| rera_number | String | |
| rera_state | String | |
| status | Enum | COMING_SOON, LAUNCHED, SOLD_OUT, COMPLETED |
| amenities | List<String> | |
| brochure_url | String | PDF URL |
| floor_plan_url | String | Image URL |
| images | List<String> | |
| created_at | Timestamp | |

#### `Campaign`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| name | String | Campaign name (for reference) |
| listing_id | UUID | FK → Listing |
| message | String | WhatsApp message body |
| message_hindi | String | Optional |
| message_regional | String | Optional |
| template_variables | JSON | Merge field values per broker |
| status | Enum | DRAFT, SCHEDULED, IN_PROGRESS, COMPLETED, FAILED |
| schedule_time | Timestamp | |
| total_recipients | Int | |
| sent_count | Int | |
| delivered_count | Int | |
| read_count | Int | |
| responded_count | Int | |
| hot_lead_count | Int | |
| media_attachments | List<Media> | |
| created_at | Timestamp | |

#### `CampaignRecipient`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| campaign_id | UUID | FK → Campaign |
| broker_id | UUID | FK → Broker |
| status | Enum | PENDING, SENT, DELIVERED, READ, RESPONDED |
| whatsapp_message_id | String | WhatsApp API msg ID |
| delivered_at | Timestamp | |
| read_at | Timestamp | |
| response_text | String | |
| response_at | Timestamp | |
| intent | Enum | HOT, WARM, COLD, NONE |

#### `BrokerResponse`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| campaign_id | UUID | FK → Campaign |
| campaign_recipient_id | UUID | FK → CampaignRecipient |
| broker_id | UUID | FK → Broker |
| message | String | Broker's reply |
| detected_intent | Enum | INTERESTED, ASKED_PRICE, WANT_VISIT, ASKED_COMMISSION, GENERAL_QUERY, OBJECTION |
| hot_lead_score | Double | 0–100 |
| replied_at | Timestamp | |
| response_time_seconds | Int | |
| follow_up_sent | Boolean | |

#### `Deal`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → User |
| listing_id | UUID | FK → Listing |
| broker_id | UUID | FK → Broker |
| client_name | String | |
| client_phone | String | |
| deal_value | Decimal | |
| commission_amount | Decimal | |
| commission_rate | Decimal | % |
| commission_status | Enum | PENDING, INVOICED, PAID, DISPUTED |
| attribution_source | String | Campaign ID / Organic / Referral |
| closed_date | Date | |
| created_at | Timestamp | |

#### `CommissionRecord`
| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| deal_id | UUID | FK → Deal |
| broker_id | UUID | FK → Broker |
| amount | Decimal | |
| split_tier | JSON | [{role, amount, %}] |
| invoice_number | String | Auto-generated |
| invoice_url | String | PDF |
| payment_status | Enum | PENDING, SENT, PAID |
| payment_method | Enum | UPI, BANK_TRANSFER, CHEQUE |
| paid_date | Timestamp | |

---

## 7. Technical Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Android)                         │
│                   Jetpack Compose + Material 3                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Campaign  │  │   Broker     │  │  Listing  │  │ Commission │ │
│  │  Builder  │  │  Management  │  │  Manager  │  │   Tracker  │ │
│  └─────┬────┘  └──────┬───────┘  └────┬─────┘  └─────┬──────┘ │
│        └──────────────┼───────────────┘───────────────┘        │
│                       │                                        │
│              ┌────────▼────────┐                                │
│              │   Hilt DI +     │                                │
│              │   Repository    │                                │
│              │   Pattern       │                                │
│              └────────┬────────┘                                │
│                       │                                        │
│        ┌──────────────▼──────────────┐                         │
│        │         Room Database       │                         │
│        │  (Campaign, Broker, Deal,   │                         │
│        │   Listing, Commission)      │                         │
│        └──────────────┬──────────────┘                         │
│                       │                                        │
│  ┌────────────────────▼────────────────────┐                   │
│  │            Backend API Server            │                   │
│  │         (Kotlin + Ktor / Spring)         │                   │
│  │                                          │                   │
│  │  ┌─────────────┐  ┌──────────────────┐  │                   │
│  │  │ WhatsApp API │  │  Geo-Location    │  │                   │
│  │  │ Gateway      │  │  Service         │  │                   │
│  │  │ (Meta/360/   │  │  (Pincode DB     │  │                   │
│  │  │  Gupshup)    │  │   + Maps API)    │  │                   │
│  │  └─────────────┘  └──────────────────┘  │                   │
│  │  ┌─────────────┐  ┌──────────────────┐  │                   │
│  │  │ Commission   │  │  AI/ML Engine    │  │                   │
│  │  │ Calculator   │  │  (Lead Scoring,  │  │                   │
│  │  │              │  │   NLP Keyword)   │  │                   │
│  │  └─────────────┘  └──────────────────┘  │                   │
│  │  ┌──────────────────────────────────┐   │                   │
│  │  │         Notification Engine      │   │                   │
│  │  │    (FCM Push + WhatsApp replies) │   │                   │
│  │  └──────────────────────────────────┘   │                   │
│  └────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Android App** | Kotlin, Jetpack Compose, Material 3, Hilt DI |
| **Database** | Room (on-device), PostgreSQL (server) |
| **Backend** | Kotlin + Ktor (or Spring Boot) |
| **Messaging API** | WhatsApp Business Cloud API (via Gupshup/360dialog BSP) |
| **Payment** | Razorpay API (UPI, cards) |
| **Geo** | Google Maps Geocoding + Pincode DB |
| **AI/ML** | Gemini API (NLP keyword detection), custom lead scoring model |
| **Notifications** | Firebase Cloud Messaging |
| **Infrastructure** | AWS/GCP India region (Mumbai), CDN for images |

### Key Technical Decisions (V2)

| Decision | Rationale |
|----------|-----------|
| WhatsApp Business Cloud API | Reliability, compliance, read receipts, webhooks for response tracking |
| Kotlin Multi-platform (compose) | Single codebase for potential web dashboard later |
| Room + Sync | Offline-first for broker lists (crucial in areas with poor connectivity) |
| Hilt DI | Already established in codebase, consistent with existing architecture |
| Server-side campaign dispatch | Better rate limit management, retry logic, analytics tracking |

---

## 8. API Integrations

| Integration | Provider | Purpose | Priority |
|-------------|----------|---------|----------|
| WhatsApp Business Cloud API | Meta (via Gupshup/360dialog) | Message sending, read receipts, webhooks | P0 |
| Google Maps Geocoding | Google | Address auto-complete, geo-coordinates for listings | P1 |
| Pincode API | Postman/IndiaPost | Pincode → City/State/Lat/Long for broker geo-tagging | P1 |
| Razorpay | Razorpay | UPI payments for subscriptions + commission payouts | P1 |
| Gemini API | Google | AI keyword detection, lead scoring, smart suggestions | P2 |
| RERA APIs | State-wise (e.g., MahaRERA, UPRERA) | Auto-fetch RERA numbers | P1 |
| Email/SMS Gateway | SendGrid/MSG91 | Invoice notifications, alerts | P1 |

---

## 9. Monetization Strategy

### Subscription Tiers

| Feature | 🆓 Free | 🥇 Pro (₹999/mo) | 🏢 Enterprise (₹4,999/mo) |
|---------|---------|-----------------|--------------------------|
| Broker contacts | 50 | Unlimited | Unlimited |
| Campaigns/month | 5 | 50 | Unlimited |
| Messages/month | 200 | 2,000 | Unlimited |
| Hot lead tracking | ❌ | ✅ | ✅ |
| Commission tracking | Basic | Full | Full + Multi-tier |
| Priority support | ❌ | Email | Phone + WhatsApp |
| Custom branding | ❌ | ✅ | ✅ White-label |
| API access | ❌ | ❌ | ✅ |
| Multi-language | H+EN | All 8 languages | All + Custom |
| WhatsApp API | ❌ (Use WaBro sender) | ✅ (Self-managed BSP) | ✅ (Dedicated BSP) |

### Revenue Streams
1. **Subscription SaaS** — Primary revenue
2. **Per-message overage** — ₹0.005–0.01/message beyond plan
3. **Enterprise onboarding** — Setup fee for large developers (₹25,000–₹50,000)
4. **Marketplace** — Featured listing placements (brokers pay to promote to wider network)
5. **Data insights** — Anonymized market trend reports for developers

### Pricing Rationale
- Average Indian broker handles 2–5 deals/month. Developer agencies have 50–500+ brokers.
- ₹999/month = cost of 1–2 broker lunches. Easy ROI justification if even 1 extra deal closes from better tracking.

---

## 10. Compliance & Trust

### WhatsApp Compliance
| Rule | Implementation |
|------|---------------|
| Opt-in required | Brokers explicitly subscribe to campaign categories |
| Opt-out (STOP) | Auto-handle STOP keywords; update broker status to inactive |
| 24-hour session window | Broadcasts via approved templates; replies within 24h window |
| Rate limits | Auto-throttle per BSP tier limits |
| Content policy | Pre-send content scanner for spam-trigger words |

### Indian Legal
| Requirement | Implementation |
|-------------|---------------|
| TRAI DND norms | No messages between 9 PM – 9 AM IST |
| Data privacy | Indian data stored in India (Mumbai region). GDPR equivalent for broker data |
| RERA compliance | Mandatory RERA display per state requirements |
| Tax compliance | GST-compliant invoices for subscription payments |

### Trust Features
- **Broker consent logging**: Timestamped record of when each broker opted in
- **Transparent attribution**: Broker can see which campaign they were attributed from
- **Dispute resolution workflow**: Formal process for commission disagreements
- **Data export right**: Brokers can export their data anytime

---

## 11. Success Metrics & KPIs

| Metric | Target (6 months post-launch) |
|--------|------------------------------|
| Monthly Active Users (brokers + developers) | 5,000+ |
| Campaigns created per month | 10,000+ |
| Average campaign response rate | >15% (vs. ~5% in WhatsApp groups) |
| Commission disputes | <2% of total deals |
| Retention (month 1→6) | >40% |
| NPS (Net Promoter Score) | >50 |
| Time-to-create-campaign | <3 minutes |
| Payment processing time | <48 hours for commission payout |
| Customer support response time | <4 hours (Pro), <1 hour (Enterprise) |

---

## 12. Release Roadmap

### Phase 1: V2.0 (Months 1–3) — Foundation
- [ ] WhatsApp Business API integration (F3)
- [ ] Campaign Builder with multi-language templates (F1)
- [ ] Broker Group & Contact Management with CSV import (F2)
- [ ] Broker Response Tracking with hot lead detection (F4)
- [ ] Commission Tracker basic (F5 — manual deal closure)
- [ ] RERA Auto-Append (F6)

### Phase 2: V2.1 (Months 4–6) — Intelligence
- [ ] Geo-Targeted Broker Matching (F7)
- [ ] Property Listing Management (F8)
- [ ] UPI Payment Integration for subscriptions (F9)
- [ ] Festival Campaign Templates (F10)
- [ ] EMI Calculator Links (F11)
- [ ] Commission deal closure workflow

### Phase 3: V2.2 (Months 7–12) — Scale
- [ ] AI Lead Scoring (F12)
- [ ] Commission Dispute Resolution (F13)
- [ ] Sub-Broker Companion App (F14)
- [ ] Referral Chain Tracking (F15)
- [ ] Marketplace for featured listings
- [ ] Advanced analytics & reporting

---

## 13. Competitive Landscape

| Competitor | Strengths | Weaknesses for Indian Brokers |
|-----------|-----------|-------------------------------|
| **WhatsApp Groups** | Free, familiar | No tracking, chaotic, no commission management |
| **Excel + Phone** | Simple, offline | No automation, no scalability, error-prone |
| **NoBroker / PropTiger** | Large networks | Focused on consumer, not broker-to-broker |
| **BrokerBay / PropStack** | CRM features | Not WhatsApp-native, poor India fit |
| **Generic Bulk SMS Tools** | Cheap delivery | Not WhatsApp, no rich media, no response tracking |

**WaBro's Moat:**
1. **WhatsApp-native** — where brokers already live
2. **India-specific** — RERA, UPI, regional languages, pincode intelligence
3. **Broker-to-broker focus** — not consumer-facing, but network infrastructure
4. **Commission transparency** — eliminates the #1 pain point in broker relationships

---

## Appendix: Glossary

- **Broker / Agent**: Licensed real estate professional who connects buyers and sellers
- **Sub-broker**: Broker working under a developer or larger agency
- **Developer**: Real estate company building and selling properties
- **Commission / Brokerage**: Fee paid to broker for facilitating a deal (typically 1–3%)
- **RERA**: Real Estate Regulatory Authority — state-wise regulation in India
- **BSP**: Business Solution Provider — authorized WhatsApp Business API partner

---

*End of Document*