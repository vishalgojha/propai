type LocationApiConfig = {
	apiBaseUrl: string;
	authToken: string | null;
};

async function getChromeStorage<T extends Record<string, unknown>>(keys: string[]): Promise<Partial<T>> {
	if (typeof chrome === 'undefined' || !chrome.storage?.local) {
		return {};
	}

	const result = await chrome.storage.local.get(keys);
	return result as Partial<T>;
}

export async function resolveLocationApiConfig(): Promise<LocationApiConfig> {
	const storage = await getChromeStorage<{
		propaiPresenceApiBaseUrl: string;
		propaiPresenceAuthToken: string;
	}>(['propaiPresenceApiBaseUrl', 'propaiPresenceAuthToken']);

	const baseUrlFromStorage = String(storage.propaiPresenceApiBaseUrl || '').trim();
	const authToken = String(storage.propaiPresenceAuthToken || '').trim() || null;
	const envBaseUrl =
		(typeof process !== 'undefined' && process.env?.PROPAI_API_BASE_URL) ||
		(typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) ||
		'https://api.propai.live/api';

	return {
		apiBaseUrl: (baseUrlFromStorage || envBaseUrl).replace(/\/+$/, ''),
		authToken,
	};
}

export async function postLocationApi<T>(path: string, body: unknown): Promise<T | null> {
	const { apiBaseUrl, authToken } = await resolveLocationApiConfig();
	if (!authToken) {
		return null;
	}

	try {
		const response = await fetch(`${apiBaseUrl}${path}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${authToken}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			return null;
		}

		return (await response.json()) as T;
	} catch {
		return null;
	}
}
