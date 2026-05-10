import axios from 'axios';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const EXTRACTION_PROMPT = `You are a real estate data extraction engine for Mumbai property WhatsApp groups.
Return ONLY a valid JSON object. No markdown. No explanation. No backticks.

A message may contain multiple listings. Extract ALL of them.
If broker name and phone appear at the end, attribute them to ALL listings in this message.

Return this exact schema:
{
  "broker": {
    "name": "string or null",
    "phone": "string or null"
  },
  "listings": [
    {
      "type": "listing_rent | listing_sale | requirement",
      "location": "string or null",
      "area": "string or null",
      "size_sqft": number or null,
      "price_amount": number or null,
      "price_type": "monthly | psf | total | null",
      "furnishing": "unfurnished | semifurnished | furnished | null",
      "parking": number or null,
      "deposit": number or null,
      "bhk": number or null,
      "floor": "string or null",
      "building": "string or null",
      "contact_name": "string or null",
      "contact_phone": "string or null"
    }
  ]
}

Price normalization:
- 460k = 460000
- 2lacs or 2L = 200000
- 1.3L = 130000 (NOT 1300000 — 1.3 × 100000, not 13 × 100000)
- 2.5cr = 25000000
- 400psf = price_amount 400, price_type psf
- ₹15 Lakhs = 1500000

Type classification:
- "listing_sale": broker IS SELLING their property (says "for sale", "sale", "selling")
- "listing_rent": broker IS RENTING their property (says "for rent", "rent", "renting")
- "requirement": client is LOOKING for a property (says "Requirement", "Wanted", "Client Budget", "Looking for", "Need", "In search of", "Want to buy/rent")
- The word "Requirement" alone (even in caps) → type = "requirement"
- The word "Budget" → type = "requirement"

CRITICAL: When you see decimal lakhs like "1.3L", "1.5L", "0.85L":
- 1.3L = 130000 (one point three lakh)
- 1.5L = 150000 (one point five lakh)
- 0.85L = 85000 (zero point eight five lakh)
Do NOT multiply the digits after the decimal by 100000. Multiply the full decimal number.

Message:
{{message}}`;

function parseJsonResponse(raw) {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found. Response: ' + raw.substring(0, 200));
  }
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    throw new Error('JSON parse failed: ' + e.message);
  }
}

function calculateConfidence(listing) {
  const fields = ['type', 'location', 'size_sqft', 'price_amount', 'contact_phone'];
  const totalFields = fields.length;
  let nonNull = 0;
  for (const f of fields) {
    if (listing[f] !== null && listing[f] !== undefined && listing[f] !== '') {
      nonNull++;
    }
  }
  return nonNull / totalFields;
}

async function runGroq(prompt) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not configured');
  const { data } = await axios.post(
    GROQ_URL,
    {
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT.replace('{{message}}', '') },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 1024
    },
    {
      headers: { Authorization: `Bearer ${groqKey}` },
      timeout: 60000
    }
  );
  return (data?.choices?.[0]?.message?.content || '').trim();
}

export async function extractRealEstateData(text) {
  const prompt = EXTRACTION_PROMPT.replace('{{message}}', text);
  const raw = await runGroq(prompt);
  const parsed = parseJsonResponse(raw);
  const listings = parsed.listings || [];
  const confidenceList = listings.map(calculateConfidence);

  return {
    engine: 'groq',
    broker: parsed.broker || null,
    listings,
    confidence: confidenceList.length > 0 ? confidenceList[0] : 0,
    raw_message: text
  };
}
