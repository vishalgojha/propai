export const safeJSONParse = (jsonString: string, fallback: any = {}) => {
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error('JSON Parse Error:', e, 'Input:', jsonString);
        return fallback;
    }
};
