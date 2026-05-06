import { z } from 'zod';

export const LeadTools = {
    create_lead: {
        description: 'Convert a contact into a formal lead in the CRM.',
        schema: z.object({
            contact_id: z.string().describe('The ID of the contact to convert'),
            initial_notes: z.string().optional(),
        }),
    },
    update_lead_status: {
        description: 'Update a lead\'s progress through the sales funnel.',
        schema: z.object({
            lead_id: z.string(),
            status: z.enum(['New', 'Contacted', 'Site Visit', 'Closed']),
        }),
    },
    update_lead_qualification: {
        description: 'Save a specific qualification data point and advance the lead to the next step.',
        schema: z.object({
            lead_id: z.string(),
            data: z.object({
                budget: z.string().optional(),
                location_pref: z.string().optional(),
                timeline: z.string().optional(),
                possession: z.string().optional(),
            }),
        }),
    },
    get_leads: {
        description: 'Fetch all leads associated with the broker.',
        schema: z.object({}),
    },
    classify_contact: {
        description: 'Label a contact as Broker, Client, or Unknown based on behavior.',
        schema: z.object({
            remote_jid: z.string(),
            classification: z.enum(['Broker', 'Client', 'Unknown']),
        }),
    },
};
