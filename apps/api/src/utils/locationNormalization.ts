export interface NormalizedMumbaiLocation {
    location: string | null;
    pocket: string | null;
}

const LOCATION_NORMALIZATION_MAP: Record<string, string> = {
    'bandra': 'Bandra West',
    'bandra west': 'Bandra West',
    'bandra east': 'Bandra East',
    'bandra reclamation': 'Bandra West',
    'bandra bandstand': 'Bandra West',
    'pali hill': 'Bandra West',
    'pali': 'Bandra West',
    'carter road': 'Bandra West',
    'khar': 'Khar West',
    'khar west': 'Khar West',
    'khar east': 'Khar East',
    'santacruz': 'Santacruz West',
    'santa cruz': 'Santacruz West',
    'santacruz west': 'Santacruz West',
    'santa cruz west': 'Santacruz West',
    'santacruz east': 'Santacruz East',
    'santa cruz east': 'Santacruz East',
    'andheri': 'Andheri West',
    'andheri west': 'Andheri West',
    'andheri east': 'Andheri East',
    'juhu': 'Juhu',
    'juhu beach': 'Juhu',
    'bkc': 'Bandra Kurla Complex',
    'bandra kurla complex': 'Bandra Kurla Complex',
    'lower parel': 'Lower Parel',
    'lower parle': 'Lower Parel',
    'worli': 'Worli',
    'prabhadevi': 'Prabhadevi',
    'prabha devi': 'Prabhadevi',
    'dadar': 'Dadar',
    'dadar west': 'Dadar West',
    'dadar east': 'Dadar East',
    'mahim': 'Mahim',
    'powai': 'Powai',
    'goregaon': 'Goregaon West',
    'goregaon west': 'Goregaon West',
    'goregaon east': 'Goregaon East',
    'malad': 'Malad West',
    'malad west': 'Malad West',
    'malad east': 'Malad East',
    'versova': 'Versova',
    'borivali': 'Borivali West',
    'borivali west': 'Borivali West',
    'borivali east': 'Borivali East',
    'kandivali': 'Kandivali West',
    'kandivali west': 'Kandivali West',
    'kandivali east': 'Kandivali East',
    'chembur': 'Chembur',
    'vile parle': 'Vile Parle West',
    'vile parle west': 'Vile Parle West',
    'vile parle east': 'Vile Parle East',
    'ville parle': 'Vile Parle West',
    'ville parle west': 'Vile Parle West',
    'ville parle east': 'Vile Parle East',
};

const POCKET_PARENT_MAP: Array<{ match: string; parent: string }> = [
    { match: 'pali hill', parent: 'Bandra West' },
    { match: 'carter road', parent: 'Bandra West' },
    { match: 'union park', parent: 'Bandra West' },
    { match: 'hill road', parent: 'Bandra West' },
    { match: 'linking road', parent: 'Bandra West' },
    { match: 'sv road', parent: 'Bandra West' },
    { match: 's v road', parent: 'Bandra West' },
    { match: 'nepeansea road', parent: 'Malabar Hill' },
    { match: 'nepean sea road', parent: 'Malabar Hill' },
    { match: 'pedder road', parent: 'Breach Candy' },
    { match: 'carmichael road', parent: 'Cumballa Hill' },
    { match: 'altamount road', parent: 'Malabar Hill' },
    { match: 'malabar hill', parent: 'Malabar Hill' },
    { match: 'breach candy', parent: 'Breach Candy' },
    { match: 'cuffe parade', parent: 'Cuffe Parade' },
    { match: 'colaba causeway', parent: 'Colaba' },
    { match: 'nariman point', parent: 'Nariman Point' },
    { match: 'marine drive', parent: 'Marine Drive' },
];

export function normalizeMumbaiLocation(raw: string | null | undefined): NormalizedMumbaiLocation {
    if (!raw || typeof raw !== 'string') {
        return { location: null, pocket: null };
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        return { location: null, pocket: null };
    }

    const normalizedInput = trimmed.toLowerCase();
    const pocketMatch = POCKET_PARENT_MAP.find(({ match }) => normalizedInput.includes(match));

    if (pocketMatch) {
        return {
            location: pocketMatch.parent,
            pocket: trimmed,
        };
    }

    return {
        location: LOCATION_NORMALIZATION_MAP[normalizedInput] || trimmed,
        pocket: null,
    };
}
