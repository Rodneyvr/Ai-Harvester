import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor for auth
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: unwrap data and handle errors
api.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API Types
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  source_url: string;
  platform: string;
  category: string | null;
  tags: string[];
  system_prompt: string | null;
  tool_code: string | null;
  dependencies: Record<string, any>;
  required_keys: string[];
  quality_score: number;
  content_hash: string | null;
  embedding: number[] | null;
  version: number;
  is_verified: boolean;
  scanned_at: string;
  created_at: string;
  updated_at: string;
}

export interface AgentListResponse {
  agents: Agent[];
  total: number;
  page: number;
  page_size: number;
}

export interface Credential {
  id: string;
  name: string;
  provider: string;
  category: string | null;
  tags: string[];
  environment: string;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
  is_valid: boolean | null;
}

export interface CredentialReveal {
  id: string;
  name: string;
  value: string;
}

export interface SearchParams {
  query?: string;
  platform?: string;
  category?: string;
  tags?: string[];
  min_quality?: number;
  page?: number;
  page_size?: number;
}

// Agents API
export const agentsApi = {
  list: (params: SearchParams = {}) =>
    api.get<AgentListResponse>('/agents', { params }),

  get: (id: string) =>
    api.get<Agent>(`/agents/${id}`),

  getWithSkills: (id: string) =>
    api.get<{ agent: Agent; skills: any[] }>(`/agents/${id}/detail`),

  create: (data: Partial<Agent>) =>
    api.post<Agent>('/agents', data),

  update: (id: string, data: Partial<Agent>) =>
    api.patch<Agent>(`/agents/${id}`, data),

  delete: (id: string) =>
    api.delete(`/agents/${id}`),

  export: (id: string, format: string, includeCredentials = false) =>
    api.get(`/agents/${id}/export/${format}`, {
      params: { include_credentials: includeCredentials },
      responseType: 'blob',
    }),

  stats: () =>
    api.get('/agents/stats'),

  categories: () =>
    api.get<string[]>('/agents/categories'),

  platforms: () =>
    api.get<string[]>('/agents/platforms'),
};

// Vault API
export const vaultApi = {
  list: (params: {
    category?: string;
    environment?: string;
    provider?: string;
    search?: string;
    tags?: string[];
    page?: number;
    page_size?: number;
  } = {}) =>
    api.get<Credential[]>('/vault/credentials', { params }),

  get: (id: string) =>
    api.get<Credential>(`/vault/credentials/${id}`),

  create: (data: {
    name: string;
    provider: string;
    category?: string;
    tags?: string[];
    environment?: string;
    metadata?: Record<string, any>;
    value: string;
  }) =>
    api.post<Credential>('/vault/credentials', data),

  update: (id: string, data: Partial<Credential> & { value?: string }) =>
    api.patch<Credential>(`/vault/credentials/${id}`, data),

  delete: (id: string) =>
    api.delete(`/vault/credentials/${id}`),

  reveal: (id: string) =>
    api.get<CredentialReveal>(`/vault/credentials/${id}/reveal`),

  export: (credentialIds?: string[]) =>
    api.post('/vault/credentials/export', { credential_ids: credentialIds }, { responseType: 'blob' }),

  categories: () =>
    api.get<string[]>('/vault/credentials/categories'),

  providers: () =>
    api.get<string[]>('/vault/credentials/providers'),
};

// Harvester API
export const harvesterApi = {
  queueCrawl: (url: string, sourceType = 'manual', priority = 0) =>
    api.post('/harvester/crawl', { url, source_type: sourceType, priority }),

  autoDiscover: (maxPerSource = 20, sources?: string[]) =>
    api.post('/harvester/auto-discover', { max_per_source: maxPerSource, sources }),

  getQueue: (status?: string, limit = 50) =>
    api.get('/harvester/queue', { params: { status, limit } }),

  getQueueStats: () =>
    api.get('/harvester/queue/stats'),

  getLogs: (params: { queue_id?: string; agent_id?: string; limit?: number } = {}) =>
    api.get('/harvester/logs', { params }),
};

// Sandbox API
export const sandboxApi = {
  execute: (data: {
    agent_code: string;
    required_keys?: string[];
    language?: string;
    timeout?: number;
    env_vars?: Record<string, string>;
  }) =>
    api.post('/sandbox/execute', data),

  executeStream: (data: {
    agent_code: string;
    required_keys?: string[];
    language?: string;
    timeout?: number;
  }) =>
    api.post('/sandbox/execute/stream', data, { responseType: 'stream' }),

  healthCheck: (credentialIds?: string[], provider?: string) =>
    api.post('/sandbox/health-check', { credential_ids: credentialIds, provider }),

  checkSingle: (credentialId: string) =>
    api.get(`/sandbox/health-check/${credentialId}`),

  killAll: () =>
    api.post('/sandbox/kill-all'),
};

// Health API
export const healthApi = {
  check: () =>
    api.get('/health'),
};

export default api;