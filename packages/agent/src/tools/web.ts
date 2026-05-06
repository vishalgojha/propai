import { z } from 'zod';

export const WebTools = {
    web_fetch: {
        description: 'Fetch the content of a URL and return it as text. Useful for reading property news or verifying a project page.',
        schema: z.object({
            url: z.string().url().describe('The full URL to fetch'),
        }),
    },
    search_web: {
        description: 'Search the web for property information, market rates, locality data, or builder reputation.',
        schema: z.object({
            query: z.string().describe('The search query'),
        }),
    },
    verify_rera: {
        description: 'Verify if a real estate project is RERA registered by checking the respective state portal (e.g., MahaRERA).',
        schema: z.object({
            project_name: z.string().describe('The name of the project to verify'),
            state: z.string().describe('The state for the RERA portal (e.g., Maharashtra, Karnataka)'),
        }),
    },
    fetch_property_listing: {
        description: 'Scrape a property listing URL from portals like 99acres, MagicBricks, or Housing.com and return structured data.',
        schema: z.object({
            url: z.string().url().describe('The URL of the property listing'),
        }),
    },
};
