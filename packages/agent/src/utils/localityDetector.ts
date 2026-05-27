import { postLocationApi } from './locationApi';

type DetectLocationResponse = {
	locality: string | null;
};

export async function detectLocality(text: string): Promise<string | null> {
	const normalized = String(text || '').trim();
	if (!normalized) {
		return null;
	}

	const response = await postLocationApi<DetectLocationResponse>('/location/detect', {
		text: normalized,
	});

	return response?.locality?.trim() || null;
}
