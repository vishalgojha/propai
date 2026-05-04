import { igrQueryService } from './igrQueryService';

export class IntelligenceAPI {
  async getLastTransactionForBuilding(buildingName: string) {
    return igrQueryService.getLastTransactionForBuilding(buildingName);
  }

  async getLocalityStats(locality: string, months = 6) {
    return igrQueryService.getLocalityStats(locality, months);
  }

  async searchTransactions(query: { locality?: string; building?: string; minDate?: string }) {
    return igrQueryService.searchTransactions(query);
  }
}

export const intelligenceAPI = new IntelligenceAPI();
