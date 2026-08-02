export interface SearchSource {
  title: string;
  uri: string;
}

export interface EnrichmentRow {
  id: string;
  inputData: Record<string, string>; // Full context key-value pairs from CSV
  domain?: string;
  company_linkedin?: string;
  traffic_analytics?: string;
  work_email?: string;
  sources?: SearchSource[];
  status: 'idle' | 'processing' | 'completed' | 'failed' | 'cooldown';
  error?: string;
  isDemo?: boolean;
}

export interface EnrichmentStats {
  total: number;
  completed: number;
  processing: number;
  failed: number;
  pending: number;
}
