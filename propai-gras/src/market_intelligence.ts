import { supabase } from './config/supabase';

export interface MarketReality {
    locality: string;
    project: string;
    type: 'Sale' | 'Rent';
    latest_transactions: any[];
    analysis: string;
}

export class MarketIntelligenceService {
    /**
     * Look up latest 3 transactions for a building
     */
    async getGroundTruth(buildingName: string, type: 'Sale' | 'Rent'): Promise<MarketReality | null> {
        console.log(`🔍 GRAS: Searching ground truth for "${buildingName}" (${type})`);
        
        // Map common article types
        const articleType = type === 'Sale' ? '25' : 'Leave and License';

        const { data, error } = await supabase
            .from('igr_transactions')
            .select('*')
            .ilike('property_description', `%${buildingName}%`)
            // If it's rent, we filter by rent_amount being not null, else consideration_amount
            .or(type === 'Rent' ? 'rent_amount.neq.0' : 'consideration_amount.neq.0')
            .order('registration_date', { ascending: false })
            .limit(3);

        if (error || !data || data.length === 0) {
            return null;
        }

        const latest = data[0];
        const avgPsf = data.reduce((acc, curr) => {
            const area = curr.area_sqft || 1;
            const price = type === 'Rent' ? curr.rent_amount : curr.consideration_amount;
            return acc + (price / area);
        }, 0) / data.length;

        return {
            locality: latest.village_locality,
            project: buildingName,
            type,
            latest_transactions: data.map(tx => ({
                date: tx.registration_date,
                price: type === 'Rent' ? tx.rent_amount : tx.consideration_amount,
                area: tx.area_sqft,
                psf: (type === 'Rent' ? tx.rent_amount : tx.consideration_amount) / (tx.area_sqft || 1)
            })),
            analysis: `Average ${type} rate in ${buildingName} is ₹${avgPsf.toFixed(2)}/sqft based on last ${data.length} registrations.`
        };
    }
}

export const marketIntelligence = new MarketIntelligenceService();
