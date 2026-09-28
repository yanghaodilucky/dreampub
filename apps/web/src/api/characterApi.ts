export type CharacterId = string;

export type CharacterProfile = { id: CharacterId; name: string; color: string; role: string; archetype: 'staff' | 'guest'; created_at: string };

export type CharacterTemplate = {
  character_id: CharacterId;
  display_name: string;
  version?: number;
  version_id?: string;
  core_identity: { summary: string; values: string[] };
  player_relationship: { known_history: string; relationship_philosophy?: string };
  awakening: { first_message: string; generator: string; used_fallback: boolean };
};

export type CharacterVersion = { version: number; version_id: string; created_at: string; change_note: string | null; is_active: boolean };

const configuredServer = import.meta.env.VITE_NPC_SERVER_URL as string | undefined;
const apiBase = () => {
  if (configuredServer) return configuredServer.replace(/^ws/, 'http').replace(/\/ws\/world\/[^/]+$/, '');
  return 'http://127.0.0.1:8000';
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export const pauseWorld = () => request<{ paused: boolean }>('/world/cafe/pause', { method: 'POST' });
export const resumeWorld = () => request<{ paused: boolean }>('/world/cafe/resume', { method: 'POST' });
export const getCharacters = () => request<{ characters: CharacterProfile[] }>('/characters');
export const createCharacter = (profile: Pick<CharacterProfile, 'name' | 'color' | 'role' | 'archetype'>) => request<CharacterProfile>('/characters', { method: 'POST', body: JSON.stringify({ display_name: profile.name, color: profile.color, role: profile.role, archetype: profile.archetype }) });
export const getCharacterVersions = (characterId: CharacterId) => request<{ versions: CharacterVersion[] }>(`/characters/${characterId}/versions`);
export const compileCharacter = (characterId: CharacterId, answers: Record<string, string>) => request<{ template_preview: CharacterTemplate }>('/characters/' + characterId + '/compile', { method: 'POST', body: JSON.stringify({ save: false, answers }) });
export const saveCharacterPreview = (characterId: CharacterId, templatePreview: CharacterTemplate) => request<{ saved: boolean; template: CharacterTemplate; duplicate_of_version?: number }>('/characters/' + characterId + '/versions', { method: 'POST', body: JSON.stringify({ template_preview: templatePreview, created_by: 'local_player', change_note: 'Created through the Character Questionnaire v2 studio.' }) });
