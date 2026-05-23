import backendApi from './api';
import { ENDPOINTS } from './endpoints';

export type SyndicationStatus = 'pending' | 'active' | 'paused' | 'revoked';

export type SyndicationPartner = {
  id: string;
  status: SyndicationStatus;
  scope: string[];
  partnerName: string;
  direction: 'outgoing' | 'incoming';
  createdAt: string;
  acceptedAt: string | null;
};

export type SyndicationListResponse = {
  outgoing: SyndicationPartner[];
  incoming: SyndicationPartner[];
};

export type InviteResponse = {
  id: string;
  token: string;
  inviteLink: string;
  scope: string[];
  status: SyndicationStatus;
  createdAt: string;
};

export type AcceptResponse = {
  id: string;
  status: SyndicationStatus;
  partnerName: string;
  scope: string[];
  acceptedAt: string;
};

export async function createSyndicationInvite(scope?: string[]): Promise<InviteResponse> {
  const response = await backendApi.post(ENDPOINTS.syndication.invite, { scope });
  return response.data as InviteResponse;
}

export async function acceptSyndicationInvite(token: string): Promise<AcceptResponse> {
  const response = await backendApi.post(ENDPOINTS.syndication.accept, { token });
  return response.data as AcceptResponse;
}

export async function listSyndicationPartners(): Promise<SyndicationListResponse> {
  const response = await backendApi.get(ENDPOINTS.syndication.list);
  return response.data as SyndicationListResponse;
}

export async function revokeSyndication(id: string): Promise<void> {
  await backendApi.delete(ENDPOINTS.syndication.revoke(id));
}
