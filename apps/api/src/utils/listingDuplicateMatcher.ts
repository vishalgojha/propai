export interface ComparableListing {
    buildingName?: string | null;
    location?: string | null;
    bhk?: string | number | null;
    floor?: string | null;
    price?: number | null;
    priceUnit?: string | null;
    carpetArea?: number | null;
    sizeSqft?: number | null;
}

function normalizeText(value: string | null | undefined): string | null {
    return value?.trim().toLowerCase() || null;
}

function normalizeBhk(value: string | number | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    return String(value).trim().toLowerCase();
}

export function priceToLakhs(price: number | null | undefined, unit: string | null | undefined): number | null {
    if (price === null || price === undefined || !Number.isFinite(price)) {
        return null;
    }

    const normalizedUnit = unit?.trim().toLowerCase();
    return normalizedUnit === 'crores' || normalizedUnit === 'crore' ? price * 100 : price;
}

export function areLikelyDuplicateListings(
    incoming: ComparableListing,
    existing: ComparableListing
): boolean {
    const sameBuilding =
        normalizeText(incoming.buildingName) !== null &&
        normalizeText(incoming.buildingName) === normalizeText(existing.buildingName);
    const sameLocation =
        normalizeText(incoming.location) !== null &&
        normalizeText(incoming.location) === normalizeText(existing.location);
    const sameBhk = normalizeBhk(incoming.bhk) !== null && normalizeBhk(incoming.bhk) === normalizeBhk(existing.bhk);

    if (!sameBuilding || !sameLocation || !sameBhk) {
        return false;
    }

    const incomingPrice = priceToLakhs(incoming.price, incoming.priceUnit);
    const existingPrice = priceToLakhs(existing.price, existing.priceUnit);
    if (incomingPrice === null || existingPrice === null) {
        return false;
    }

    const priceDiff = Math.abs(incomingPrice - existingPrice) / existingPrice;
    if (priceDiff > 0.1) {
        return false;
    }

    const incomingFloor = normalizeText(incoming.floor);
    const existingFloor = normalizeText(existing.floor);
    if (incomingFloor && existingFloor && incomingFloor !== existingFloor) {
        return false;
    }

    const incomingArea = incoming.carpetArea ?? incoming.sizeSqft ?? null;
    const existingArea = existing.carpetArea ?? existing.sizeSqft ?? null;
    if (incomingArea && existingArea) {
        const areaDiff = Math.abs(incomingArea - existingArea) / existingArea;
        if (areaDiff > 0.05) {
            return false;
        }
    }

    return true;
}
