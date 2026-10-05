import api from './api';
import { describeApiError } from './feedbackServices';

// Wire shapes of /api/ai-admin/* (backend AiAdminHandler providerView,
// aiSettingsView and ProviderTestResult). api_key never appears in any
// response: read providers carry only has_api_key + api_key_hint (last 4).
export type AiProtocol = 'openai' | 'anthropic' | 'gemini';

/** One model in a provider's catalog. context_window / max_output_tokens are
 *  optional limits the backend clamps to (0 = protocol default) — mirrors the
 *  ScoOS model management. */
export interface AIModel {
  name: string;
  context_window?: number;
  max_output_tokens?: number;
}

export interface AIProvider {
  id: string;
  name: string;
  base_url: string;
  protocol: AiProtocol;
  models: AIModel[];
  enabled: boolean;
  is_default: boolean;
  default_model: string;
  created_at: string;
  updated_at: string;
  api_key_hint: string;
  has_api_key: boolean;
}

export interface AIProviderInput {
  name: string;
  base_url: string;
  api_key?: string;
  protocol: AiProtocol;
  models: AIModel[];
  enabled?: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
}

export interface AISettings {
  require_premium: boolean;
}

export const aiServices = {
  listProviders: async (): Promise<AIProvider[]> => {
    const res = await api.get('/api/ai-admin/providers');
    return res.data.providers;
  },

  getProvider: async (id: string): Promise<AIProvider> => {
    const res = await api.get(`/api/ai-admin/providers/${id}`);
    return res.data.provider;
  },

  createProvider: async (input: AIProviderInput): Promise<string> => {
    const res = await api.post('/api/ai-admin/providers', input);
    return res.data.id;
  },

  // Omit api_key (or send "") to keep the stored key; omit enabled to keep
  // the stored flag (the backend preserves both on PUT).
  updateProvider: async (id: string, input: AIProviderInput): Promise<void> => {
    await api.put(`/api/ai-admin/providers/${id}`, input);
  },

  deleteProvider: async (id: string): Promise<void> => {
    await api.delete(`/api/ai-admin/providers/${id}`);
  },

  testProvider: async (id: string): Promise<ProviderTestResult> => {
    const res = await api.post(`/api/ai-admin/providers/${id}/test`);
    return res.data;
  },

  // model "" means "fall back to the provider's first model".
  setDefault: async (id: string, model: string): Promise<void> => {
    await api.post(`/api/ai-admin/providers/${id}/default`, { model });
  },

  clearDefault: async (id: string): Promise<void> => {
    await api.delete(`/api/ai-admin/providers/${id}/default`);
  },

  getSettings: async (): Promise<AISettings> => {
    const res = await api.get('/api/ai-admin/settings');
    return res.data;
  },

  putSettings: async (settings: AISettings): Promise<AISettings> => {
    const res = await api.put('/api/ai-admin/settings', settings);
    return res.data;
  },
};

export { describeApiError };
