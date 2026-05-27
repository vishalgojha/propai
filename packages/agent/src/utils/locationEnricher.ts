import { postLocationApi } from './locationApi';

export type EnrichedLocation = {
	locality: string;
	city: string;
	pincode?: string | null;
} | null;

type EnrichLocationResponse = {
	success: boolean;
	locality: string | null;
	city: string | null;
	pincode?: string | null;
	error?: string | null;
};

export async function enrichLocation(
	buildingName: string,
	rawHint?: string
): Promise<EnrichedLocation> {
	const normalized = String(buildingName || '').trim();
	if (!normalized) {
		return null;
	}

	const response = await postLocationApi<EnrichLocationResponse>('/location/enrich', {
		buildingName: normalized,
		rawHint: rawHint?.trim() || undefined,
	});

	if (!response?.success || !response.locality || !response.city) {
		return null;
	}

	return {
		locality: response.locality,
		city: response.city,
		pincode: response.pincode || null,
	};
}
