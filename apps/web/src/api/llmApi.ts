export type LlmSettings = {
  configured: boolean;
  key_in_keychain: boolean;
  model: string;
  base_url: string;
};

const configuredServer = import.meta.env.VITE_NPC_SERVER_URL as string | undefined;
const apiBase = () => configuredServer
  ? configuredServer.replace(/^ws/, 'http').replace(/\/ws\/world\/[^/]+$/, '')
  : 'http://127.0.0.1:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `模型设置请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const getLlmSettings = () => request<LlmSettings>('/api/llm/settings');
export const saveLlmSettings = (body: { model: string; base_url: string; api_key?: string }) => request<LlmSettings>('/api/llm/settings', { method: 'PUT', body: JSON.stringify(body) });
export const testLlmConnection = () => request<{ ok: boolean; message: string }>('/api/llm/test', { method: 'POST' });
export const clearLlmKey = () => request<LlmSettings>('/api/llm/settings', { method: 'DELETE' });
