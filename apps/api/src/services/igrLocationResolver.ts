import { parseIndianLocation } from '../utils/locationParser';

type LocationInput = {
  buildingName?: string | null;
  locality?: string | null;
  city?: string | null;
};

const DEFAULT_CITY_BY_KEYWORD: Array<{ city: string; pattern: RegExp }> = [
  { city: 'Mumbai', pattern: /\b(mumbai|bandra|andheri|juhu|powai|worli|dadar|khar|malad|goregaon|borivali|kandivali|chembur|kurla|lower parel|parel|mira road|bkc|bandra kurla complex)\b/i },
  { city: 'Thane', pattern: /\b(thane)\b/i },
  { city: 'Pune', pattern: /\b(pune|hinjewadi|baner|wakad|kharadi|viman nagar|hadapsar|wagholi|magarpatta|kondhwa|nibm|tathawade|ravet|aundh|balewadi|bavdhan|kothrud)\b/i },
  { city: 'Navi Mumbai', pattern: /\b(vashi|kharghar|belapur|navi mumbai|nerul|seawoods|panvel)\b/i },
];

export function inferIgrCity(input: LocationInput): string | null {
  const explicitCity = String(input.city || '').trim();
  if (explicitCity && explicitCity.toLowerCase() !== 'unknown') {
    return explicitCity;
  }

  const combined = [input.locality, input.buildingName]
    .filter(Boolean)
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  if (!combined) {
    return null;
  }

  const parsed = parseIndianLocation(combined);
  if (parsed?.city && parsed.city !== 'Unknown') {
    return parsed.city;
  }

  for (const entry of DEFAULT_CITY_BY_KEYWORD) {
    if (entry.pattern.test(combined)) {
      return entry.city;
    }
  }

  return null;
}
