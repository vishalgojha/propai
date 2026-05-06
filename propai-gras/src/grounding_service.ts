/**
 * PropAI GRAS - Grounding Service for AI Agent
 * This service allows the AI to "fact check" market claims against IGR data.
 */

import { createClient } from '@supabase/supabase-js';

export class AgentGroundingService {
  /**
   * AI Tool: Get Market Reality for a specific building or locality
   */
  async getMarketReality(locality: string, projectHint?: string) {
    console.log(`🤖 AI AGENT: Fetching ground truth for ${projectHint || locality}...`);
    
    // In production, this calls the 'igr_transactions' table using service_role
    // Here we simulate the AI's internal "Brain" access
    
    const mockReality = {
      locality: locality,
      avg_registered_rate: 68000,
      last_transaction: {
        date: '2024-11-12',
        price: 85000000,
        psf: 68000
      },
      premium_analysis: "Prices are stable. No recorded transaction above 70k yet."
    };

    return mockReality;
  }

  /**
   * AI Tool: Validate a broker's claim
   */
  async validateClaim(askingPrice: number, area: number, locality: string) {
    const askingPsf = askingPrice / area;
    const reality = await this.getMarketReality(locality);
    
    const inflation = ((askingPsf / reality.avg_registered_rate) - 1) * 100;
    
    return {
      is_realistic: inflation < 15,
      inflation_percentage: inflation.toFixed(1) + '%',
      ground_truth_psf: reality.avg_registered_rate,
      advice: inflation > 20 ? "Significant negotiation room available." : "Price is within market norms."
    };
  }
}
