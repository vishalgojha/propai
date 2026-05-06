type SupportedCity = 'Mumbai' | 'Pune' | 'Thane' | 'Navi Mumbai' | 'Unknown';

type AliasEntry = {
    canonical: string;
    city: SupportedCity;
    aliases: string[];
    kind?: 'locality' | 'landmark';
    pincode?: string | null;
};

export type ParsedLocation = {
    locality: string;
    city: SupportedCity;
    matchedAlias: string | null;
    confidence: number;
    resolvedVia: 'direct_locality' | 'alias' | 'pincode_lookup' | 'heuristic';
    pincode?: string | null;
};

const normalize = (value: string) =>
    String(value || '')
        .toLowerCase()
        .split('').map(c => /[*_`~|]/.test(c) ? ' ' : c).join('')
        .split('').filter(c => /[a-z0-9\s/&(),.-]/.test(c)).join('')
        .split(/\s+/).join(' ')
        .trim();

const titleCase = (value: string) =>
    value.split('').map((c, i) => i === 0 || value[i-1] === ' ' ? c.toUpperCase() : c).join('');

const LOCATION_ALIASES: AliasEntry[] = [
    { canonical: 'Andheri West', city: 'Mumbai', aliases: ['andheri west', 'andheri w', 'andheri (w)', 'andheriw'] },
    { canonical: 'Andheri East', city: 'Mumbai', aliases: ['andheri east', 'andheri e', 'andheri (e)', 'andherie'] },
    { canonical: 'Bandra West', city: 'Mumbai', aliases: ['bandra west', 'bandra w', 'bandra', 'bandra stn west'] },
    { canonical: 'Bandra East', city: 'Mumbai', aliases: ['bandra east', 'bandra e', 'bkc', 'bandra kurla complex'] },
    { canonical: 'Khar West', city: 'Mumbai', aliases: ['khar west', 'khar w', 'khar'] },
    { canonical: 'Khar East', city: 'Mumbai', aliases: ['khar east', 'khar e'] },
    { canonical: 'Santacruz West', city: 'Mumbai', aliases: ['santacruz west', 'santa cruz west', 'scruz west', 'scrz west', 'scruz'] },
    { canonical: 'Santacruz East', city: 'Mumbai', aliases: ['santacruz east', 'santa cruz east', 'scruz east', 'scrz east'] },
    { canonical: 'Juhu', city: 'Mumbai', aliases: ['juhu', 'jvpd', 'gulmohar road juhu', 'juhu tara'] },
    { canonical: 'Dadar West', city: 'Mumbai', aliases: ['dadar west', 'dadar w', 'dadar'] },
    { canonical: 'Dadar East', city: 'Mumbai', aliases: ['dadar east', 'dadar e'] },
    { canonical: 'Lower Parel', city: 'Mumbai', aliases: ['lower parel', 'parel', 'parel west', 'kamala mills'] },
    { canonical: 'Lalbaug', city: 'Mumbai', aliases: ['lalbaug', 'lal bag', 'lalbag'] },
    { canonical: 'Worli', city: 'Mumbai', aliases: ['worli', 'worli sea face', 'worldi'] },
    { canonical: 'Powai', city: 'Mumbai', aliases: ['powai', 'pawai', 'hiranandani powai'] },
    { canonical: 'Ghatkopar East', city: 'Mumbai', aliases: ['ghatkopar east', 'ghatkopar e', 'ghatkopar'] },
    { canonical: 'Kanjurmarg', city: 'Mumbai', aliases: ['kanjurmarg', 'kanjur marg'] },
    { canonical: 'Malad West', city: 'Mumbai', aliases: ['malad west', 'malad w', 'malad'] },
    { canonical: 'Goregaon West', city: 'Mumbai', aliases: ['goregaon west', 'goregaon w', 'goregaon'] },
    { canonical: 'Goregaon East', city: 'Mumbai', aliases: ['goregaon east', 'goregaon e'] },
    { canonical: 'Borivali West', city: 'Mumbai', aliases: ['borivali west', 'borivali w', 'borivali'] },
    { canonical: 'Kandivali West', city: 'Mumbai', aliases: ['kandivali west', 'kandivali w', 'kandivali', 'kandivli'] },
    { canonical: 'Kandivali East', city: 'Mumbai', aliases: ['kandivali east', 'kandivali e', 'thakur village'] },
    { canonical: 'Mira Road', city: 'Mumbai', aliases: ['mira road', 'mira rd', 'miraroad', 'mira'] },
    { canonical: 'Chembur', city: 'Mumbai', aliases: ['chembur', 'chembur east', 'chembur west'] },
    { canonical: 'Kurla', city: 'Mumbai', aliases: ['kurla', 'kurla east', 'kurla west'] },
    { canonical: 'Thane West', city: 'Thane', aliases: ['thane west', 'thane w', 'thane'] },
    { canonical: 'Thane East', city: 'Thane', aliases: ['thane east', 'thane e'] },
    { canonical: 'Vashi', city: 'Navi Mumbai', aliases: ['vashi', 'navi mumbai vashi'] },
    { canonical: 'Kharghar', city: 'Navi Mumbai', aliases: ['kharghar', 'khar gar'] },
    { canonical: 'CBD Belapur', city: 'Navi Mumbai', aliases: ['belapur', 'cbd belapur', 'cbd'] },
    { canonical: 'Hinjewadi Phase 1', city: 'Pune', aliases: ['hinjewadi phase 1', 'hinjewadi p1', 'phase 1 hinjewadi'] },
    { canonical: 'Hinjewadi Phase 2', city: 'Pune', aliases: ['hinjewadi phase 2', 'hinjewadi p2', 'phase 2 hinjewadi'] },
    { canonical: 'Hinjewadi Phase 3', city: 'Pune', aliases: ['hinjewadi phase 3', 'hinjewadi p3', 'phase 3 hinjewadi'] },
    { canonical: 'Wakad', city: 'Pune', aliases: ['wakad', 'wakar'] },
    { canonical: 'Baner', city: 'Pune', aliases: ['baner', 'baner road'] },
    { canonical: 'Balewadi', city: 'Pune', aliases: ['balewadi', 'balewadi high street', 'bhs'] },
    { canonical: 'Aundh', city: 'Pune', aliases: ['aundh', 'audh'] },
    { canonical: 'Pimpri-Chinchwad', city: 'Pune', aliases: ['pcmc', 'pimpri chinchwad', 'pimpri', 'chinchwad'] },
    { canonical: 'Kharadi', city: 'Pune', aliases: ['kharadi', 'eon kharadi'] },
    { canonical: 'Viman Nagar', city: 'Pune', aliases: ['viman nagar', 'vimannagar'] },
    { canonical: 'Hadapsar', city: 'Pune', aliases: ['hadapsar', 'hadpsar'] },
    { canonical: 'Wagholi', city: 'Pune', aliases: ['wagholi', 'waghuli'] },
    { canonical: 'Magarpatta', city: 'Pune', aliases: ['magarpatta', 'magarpatta city'] },
    { canonical: 'Kondhwa', city: 'Pune', aliases: ['kondhwa', 'kondhva'] },
    { canonical: 'NIBM Road', city: 'Pune', aliases: ['nibm', 'nibm road'] },
    { canonical: 'Tathawade', city: 'Pune', aliases: ['tathawade', 'tathwade'] },
    { canonical: 'Ravet', city: 'Pune', aliases: ['ravet', 'rawet'] },
    { canonical: 'Pimple Saudagar', city: 'Pune', aliases: ['pimple saudagar', 'pimplesaudagar', 'saudagar'] },
    { canonical: 'Bavdhan', city: 'Pune', aliases: ['bavdhan', 'bawdhan'] },
    { canonical: 'Kothrud', city: 'Pune', aliases: ['kothrud'] },
];

const LANDMARK_PINCODE_MAP: AliasEntry[] = [
    { canonical: 'Bandra West', city: 'Mumbai', aliases: ['carter road', 'carter rd', 'hill road', 'mount mary', 'mount mary road', 'turner road', 'turner rd', 'linking road'], kind: 'landmark', pincode: '400050' },
    { canonical: 'Andheri West', city: 'Mumbai', aliases: ['dn nagar', 'd n nagar', 'lokhandwala back road', 'back road lokhandwala', 'behind apna bazaar', 'nr azad ngr', 'near azad nagar'], kind: 'landmark', pincode: '400053' },
    { canonical: 'Andheri West', city: 'Mumbai', aliases: ['apna bazaar andheri west', 'apna bazaar lokhandwala'], kind: 'landmark', pincode: '400058' },
    { canonical: 'Juhu', city: 'Mumbai', aliases: ['jvpd scheme', 'gulmohar road'], kind: 'landmark', pincode: '400049' },
];

const ALIAS_INDEX = LOCATION_ALIASES.flatMap((entry) =>
    entry.aliases.map((alias) => ({
        normalizedAlias: normalize(alias),
        alias,
        canonical: entry.canonical,
        city: entry.city,
        kind: entry.kind || 'locality',
        pincode: entry.pincode || null,
    })),
).sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);

const LANDMARK_INDEX = LANDMARK_PINCODE_MAP.flatMap((entry) =>
    entry.aliases.map((alias) => ({
        normalizedAlias: normalize(alias),
        alias,
        canonical: entry.canonical,
        city: entry.city,
        kind: 'landmark' as const,
        pincode: entry.pincode || null,
    })),
).sort((left, right) => right.normalizedAlias.length - left.normalizedAlias.length);

const LOCATION_FIELD_PATTERNS = [
    /\b(?:location|loc|area|place)\b\s*[:\-]?\s*([a-z0-9 ,./()&-]{3,80})/i,
    /\b(?:requirement|wanted|need)\b[^\n]*?\b(?:in|at|for)\b\s*([a-z0-9 ,./()&-]{3,80})/i,
];

const LOCATION_HINT_PATTERNS = [
    /\b(?:in|at|near|opp|opposite|behind|off)\s+([a-z0-9 ,./()&-]{3,60})/i,
    /\b([a-z][a-z\s]+(?:west|east|road|nagar|village|face|park|marg))\b/i,
];

function findLocationFromText(text: string): ParsedLocation | null {
    const normalizedText = normalize(text);
    if (!normalizedText) {
        return null;
    }

    for (const entry of ALIAS_INDEX) {
        if (entry.kind !== 'locality') {
            continue;
        }
        const boundaryPattern = new RegExp(`(?:^|\\s)${entry.normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
        if (boundaryPattern.test(normalizedText)) {
            return {
                locality: entry.canonical,
                city: entry.city,
                matchedAlias: entry.alias,
                confidence: 96,
                resolvedVia: /west|east|\bpowai\b|\bwakad\b|\bbaner\b|\bthane\b/i.test(entry.alias) ? 'direct_locality' : 'alias',
                pincode: null,
            };
        }
    }

    const commaMatch = normalizedText.match(/\b([a-z][a-z\s]{2,30}),\s*([a-z][a-z\s]{2,30})\b/);
    if (commaMatch) {
        return {
            locality: titleCase(commaMatch[1].trim()),
            city: titleCase(commaMatch[2].trim()) as SupportedCity,
            matchedAlias: commaMatch[0],
            confidence: 72,
            resolvedVia: 'heuristic',
            pincode: null,
        };
    }

    return null;
}

function resolveLandmarkToPincode(text: string): ParsedLocation | null {
    const normalizedText = normalize(text);
    if (!normalizedText) {
        return null;
    }

    for (const entry of LANDMARK_INDEX) {
        const boundaryPattern = new RegExp(`(?:^|\\s)${entry.normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i');
        if (!boundaryPattern.test(normalizedText)) {
            continue;
        }

        if (entry.alias === 'apna bazaar andheri west' || entry.alias === 'apna bazaar lokhandwala') {
            return {
                locality: entry.canonical,
                city: entry.city,
                matchedAlias: entry.alias,
                confidence: 78,
                resolvedVia: 'pincode_lookup',
                pincode: entry.pincode || null,
            };
        }

        if (entry.alias.includes('apna bazaar') && !/andheri|lokhandwala|dn nagar|azad nagar/i.test(normalizedText)) {
            continue;
        }

        return {
            locality: entry.canonical,
            city: entry.city,
            matchedAlias: entry.alias,
            confidence: 84,
            resolvedVia: 'pincode_lookup',
            pincode: entry.pincode || null,
        };
    }

    return null;
}

export function parseIndianLocation(text: string): ParsedLocation | null {
    const raw = String(text || '');
    if (!raw.trim()) {
        return null;
    }

    for (const pattern of LOCATION_FIELD_PATTERNS) {
        const match = raw.match(pattern);
        if (!match?.[1]) continue;
        const parsed = findLocationFromText(match[1]);
        if (parsed) {
            return parsed;
        }

        const fallback = resolveLandmarkToPincode(match[1]);
        if (fallback) {
            return fallback;
        }
    }

    for (const pattern of LOCATION_HINT_PATTERNS) {
        const match = raw.match(pattern);
        if (!match?.[1]) continue;
        const parsed = findLocationFromText(match[1]);
        if (parsed) {
            return parsed;
        }

        const fallback = resolveLandmarkToPincode(match[1]);
        if (fallback) {
            return fallback;
        }
    }

    return findLocationFromText(raw) || resolveLandmarkToPincode(raw);
}

export function extractIndianLocality(text: string) {
    return parseIndianLocation(text)?.locality || '';
}

export function extractIndianCity(text: string): SupportedCity {
    return parseIndianLocation(text)?.city || (
        /pune|poona|pcmc|hinjewadi|baner|wakad|kharadi|viman nagar/i.test(text)
            ? 'Pune'
            : /thane/i.test(text)
                ? 'Thane'
                : /navi mumbai|vashi|kharghar|belapur/i.test(text)
                    ? 'Navi Mumbai'
                    : /mumbai|bombay|bandra|andheri|juhu|powai|worli|dadar|parel|khar/i.test(text)
                        ? 'Mumbai'
                        : 'Unknown'
    );
}
