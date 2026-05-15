import { z } from 'zod';

export const ListingTools = {
    parse_listing: {
        description: 'Extract structured property data from a raw WhatsApp message.',
        schema: z.object({
            text: z.string().describe('The raw message text to parse'),
        }),
    },
    save_listing: {
        description: 'Save a parsed property listing to the database.',
        schema: z.object({
            listing_data: z.object({
                bhk: z.string().nullable(),
                location: z.string().nullable(),
                price: z.string().nullable(),
                carpet_area: z.string().nullable(),
                furnishing: z.string().nullable(),
                possession_date: z.string().nullable(),
                contact_number: z.string().nullable(),
            }),
            source_group_id: z.string(),
        }),
    },
    search_listings: {
        description: 'Query property listings using filters.',
        schema: z.object({
            filters: z.object({
                location: z.string().optional(),
                bhk: z.string().optional(),
                max_budget: z.string().optional(),
            }).optional(),
        }),
    },
    get_listings: {
        description: 'Fetch all saved listings for the current broker.',
        schema: z.object({}),
    },
};
