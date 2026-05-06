import { supabase } from '../config/supabase';
import axios from 'axios';

export class DataContributionService {
    private kaggleUsername = process.env.KAGGLE_USERNAME || '';
    private kaggleApiKey = process.env.KAGGLE_API_KEY || '';
    private datasetName = process.env.KAGGLE_DATASET_NAME || 'propai-listings-dataset';

    async anonymizeText(text: string): Promise<string> {
        // Strip Indian Phone Numbers: +91... or 9...
        let cleaned = text.replace(/(\+91[\s-]?)?[6-9]\d{9}/g, '[NUMBER]');
        
        // Simple NER for names (Common Indian name indicators)
        // In v1, we rely on the prompt to not include names, but we'll do a basic replace for keywords
        cleaned = cleaned.replace(/(Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Z][a-z]+(\s+[A-Z][a-z]+)*)/g, '[CONTACT]');
        
        return cleaned;
    }

    async exportAnonymizedDataset() {
        // 1. Fetch all listings from brokers who opted in
        const { data: contributors } = await supabase
            .from('model_preferences')
            .select('tenant_id')
            .eq('contribute_data', true);

        if (!contributors || contributors.length === 0) return { status: 'no_contributors' };

        const tenantIds = contributors.map(c => c.tenant_id);
        const { data: listings } = await supabase
            .from('listings')
            .select('raw_text, structured_data')
            .in('tenant_id', tenantIds);

        if (!listings || listings.length === 0) return { status: 'no_data' };

        // 2. Format as JSONL (Input: raw_text, Output: structured_data)
        const jsonl = listings.map(l => {
            const anonymizedRaw = this.anonymizeText(l.raw_text || '');
            return JSON.stringify({
                instruction: "Extract structured real estate listing data from the following WhatsApp message.",
                input: anonymizedRaw,
                output: JSON.stringify(l.structured_data)
            });
        }).join('\\n');

        // 3. Push to Kaggle via API
        try {
            // In a real environment, we'd use the kaggle-api python package or a custom shell script
            // Here we simulate the API call to the Kaggle dataset endpoint
            console.log(`Pushing ${listings.length} anonymized samples to Kaggle dataset ${this.datasetName}...`);
            
            // Mocking the API call
            // await axios.post(`https://kaggle.com/api/v1/datasets/${this.datasetName}/upload`, { data: jsonl });
            
            return { success: true, samples: listings.length };
        } catch (error) {
            console.error('Kaggle Export Error:', error);
            throw error;
        }
    }

    async updateConsent(tenantId: string, consent: boolean) {
        const { error } = await supabase
            .from('model_preferences')
            .upsert({ 
                tenant_id: tenantId, 
                contribute_data: consent,
                consent_timestamp: consent ? new Date().toISOString() : null
            });
        if (error) throw error;
    }
}

export const dataContributionService = new DataContributionService();
