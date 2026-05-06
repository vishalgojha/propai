export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  budget?: string;
  budgetNumeric?: number;
  location?: string;
  city?: string;
  propertyType?: string;
  bhk?: string;
  status: LeadStatus;
  priority: 'high' | 'medium' | 'low';
  source?: string;
  notes?: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUp {
  id: string;
  leadId: string;
  type: 'call' | 'message' | 'email' | 'visit';
  note?: string;
  createdAt: string;
}

export interface LeadFilters {
  status?: LeadStatus[];
  priority?: string[];
  location?: string;
  minBudget?: number;
  maxBudget?: number;
  overdue?: boolean;
  source?: string;
}

export interface LeadStats {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
  lost: number;
}
