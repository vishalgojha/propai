const BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

export interface RawMessage {
  id: number;
  group_name: string;
  sender: string;
  message: string;
  message_type: string;
  timestamp: string;
  source: string;
  event_id: string;
  message_uid: string;
  raw_payload: string;
  synced_at: string;
  pipeline_version: string;
}

export interface ParsedObservation {
  id: number;
  raw_message_id: number;
  raw_group: string;
  broker_name: string;
  broker_phone: string;
  message_type: string;
  intent: string;
  principal: string;
  forwarded: boolean;
  bhk: string;
  price: number;
  price_unit: string;
  area_sqft: number;
  furnishing: string;
  location_raw: string;
  location: { tokens?: { text: string; kind: string }[] } | null;
  landmark_name: string;
  building_name: string;
  micro_market: string;
  street_name: string;
  confidence: number;
}

export interface DashboardActivity {
  messages_today: number;
  message_types: Record<string, number>;
  observation_types: Record<string, number>;
}

export interface DashboardCoverage {
  groups_connected: number;
  messages_stored: number;
  buildings_known: number;
  landmarks_known: number;
  developers_known: number;
  micro_markets_known: number;
}

export interface ConnectionState {
  state: string;
  connected: boolean;
}

export interface WhatsAppStatus {
  connected: boolean;
  phone: string;
  profile: string;
  instance: string;
  state: string;
  connected_since: string;
  owner_name: string;
  owner_activity: {
    listings: any[];
    requirements: any[];
  };
}

export function getRaw(limit = 50, offset = 0) {
  return fetchJSON<RawMessage[]>(`/raw?limit=${limit}&offset=${offset}`);
}

export function getParsed(limit = 50, offset = 0, intent = "") {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (intent) params.set("intent", intent);
  return fetchJSON<ParsedObservation[]>(`/parsed?${params}`);
}

export function getDashboardActivity() {
  return fetchJSON<DashboardActivity>("/dashboard/activity");
}

export function getDashboardCoverage() {
  return fetchJSON<DashboardCoverage>("/dashboard/coverage");
}

export function getDashboardFeed(limit = 20) {
  return fetchJSON<any[]>(`/dashboard/feed?limit=${limit}`);
}

export function getDashboardListings(limit = 20) {
  return fetchJSON<any[]>(`/dashboard/listings?limit=${limit}`);
}

export function getDashboardRequirements(limit = 20) {
  return fetchJSON<any[]>(`/dashboard/requirements?limit=${limit}`);
}

export function getDashboardSignals() {
  return fetchJSON<any[]>("/dashboard/signals");
}

export function getDashboardHeatmap() {
  return fetchJSON<any[]>("/dashboard/heatmap");
}

export function getStats() {
  return fetchJSON<any>("/stats");
}

export function getSyncActivity() {
  return fetchJSON<any>("/dashboard/sync-activity");
}

export function getWhatsAppStatus() {
  return fetchJSON<WhatsAppStatus>("/dashboard/whatsapp-status");
}

export function getSourceStatus() {
  return fetchJSON<any>("/sources/status");
}

export function getConnectionState() {
  return fetchJSON<ConnectionState>("/sync/connection-state");
}

export function getConnectionDetail() {
  return fetchJSON<any>("/sync/connection");
}

export function getQR() {
  return fetchJSON<any>("/sync/qr");
}

export function logout() {
  return fetchJSON<any>("/sync/logout", { method: "POST" });
}

export function startSync() {
  return fetchJSON<any>("/sources/whatsapp/sync", { method: "POST" });
}

export function stopSync() {
  return fetchJSON<any>("/sources/stop", { method: "POST" });
}

export function getObservation(id: number) {
  return fetchJSON<any>(`/observations/${id}`);
}

export function getGroups() {
  return fetchJSON<any[]>("/groups");
}

export function getBuildings() {
  return fetchJSON<any[]>("/buildings");
}

export function getBrokers() {
  return fetchJSON<any[]>("/brokers");
}

export function getBroker(id: number) {
  return fetchJSON<any>(`/brokers/${id}`);
}

export function searchMessages(q: string) {
  return fetchJSON<any[]>(`/search?q=${encodeURIComponent(q)}`);
}

export function getResolver(limit = 50, offset = 0, method?: string) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (method) params.set("method", method);
  return fetchJSON<any[]>(`/resolver?${params}`);
}

export function getFailed(limit = 50, offset = 0) {
  return fetchJSON<any[]>(`/failed?limit=${limit}&offset=${offset}`);
}

export function getGraphGrowth() {
  return fetchJSON<any>("/dashboard/graph-growth");
}

export function getAllowlist() {
  return fetchJSON<string[]>("/groups/allowlist");
}

export function setAllowlist(entries: string[]) {
  return fetchJSON<any>("/groups/allowlist", {
    method: "POST",
    body: JSON.stringify(entries),
  });
}

export function clearAllowlist() {
  return fetchJSON<any>("/groups/allowlist", { method: "DELETE" });
}

export interface EngineeringSearchResult {
  path: string;
  score: number;
  matches: { line: number; text: string }[];
}

export function getEngineeringContext() {
  return fetchJSON<any>("/engineering/context");
}

export function getEngineeringIndex(refresh = false) {
  return fetchJSON<any>(`/engineering/index?refresh=${refresh ? "true" : "false"}`);
}

export function searchEngineering(q: string) {
  return fetchJSON<EngineeringSearchResult[]>(`/engineering/search?q=${encodeURIComponent(q)}`);
}

export function getEngineeringKnowledge() {
  return fetchJSON<any[]>("/engineering/knowledge");
}

export function getEngineeringLogs(kind = "server") {
  return fetchJSON<any>(`/engineering/logs?kind=${encodeURIComponent(kind)}`);
}

export function engineeringChat(message: string) {
  return fetchJSON<any>("/engineering/chat", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function createEngineeringTask(prompt: string) {
  return fetchJSON<any>("/engineering/tasks", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function getEngineeringMCP() {
  return fetchJSON<any[]>("/engineering/mcp");
}

export function getEngineeringTerminal() {
  return fetchJSON<any>("/engineering/terminal");
}
