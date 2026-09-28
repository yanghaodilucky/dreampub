export type ProjectRecord = { id: string; name: string; color: string; start_date: string; end_date: string };
export type TaskRecord = { id: string; project_id: string; title: string; status: 'next' | 'done'; start_date: string; end_date: string };
export type FocusSessionRecord = { id: string; task_id: string; project_id: string; seat_id: string; started_at: string; running_since: string | null; ended_at: string | null; state: 'running' | 'paused' | 'finished' | 'cancelled'; duration_seconds: number };
export type LocalSave = { projects: ProjectRecord[]; tasks: TaskRecord[]; focus_sessions: FocusSessionRecord[]; active_focus_session: FocusSessionRecord | null };

const configuredServer = import.meta.env.VITE_NPC_SERVER_URL as string | undefined;
const apiBase = () => configuredServer
  ? configuredServer.replace(/^ws/, 'http').replace(/\/ws\/world\/[^/]+$/, '')
  : 'http://127.0.0.1:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(body?.detail ?? `本地存档请求失败（${response.status}）`);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export const loadLocalSave = () => request<LocalSave>('/api/save');
export const createProject = (body: Pick<ProjectRecord, 'name' | 'color' | 'start_date' | 'end_date'>) => request<ProjectRecord>('/api/projects', { method: 'POST', body: JSON.stringify(body) });
export const updateProject = (id: string, body: Pick<ProjectRecord, 'start_date' | 'end_date'>) => request<ProjectRecord>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteProject = (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' });
export const createTask = (body: Pick<TaskRecord, 'project_id' | 'title' | 'start_date' | 'end_date'>) => request<TaskRecord>('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
export const updateTask = (id: string, body: Partial<Pick<TaskRecord, 'status' | 'start_date' | 'end_date'>>) => request<TaskRecord>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteTask = (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' });
export const startFocus = (task_id: string, seat_id: string) => request<FocusSessionRecord>('/api/focus-sessions', { method: 'POST', body: JSON.stringify({ task_id, seat_id }) });
export const transitionFocus = (id: string, action: 'pause' | 'resume' | 'finish' | 'cancel') => request<FocusSessionRecord>(`/api/focus-sessions/${id}/${action}`, { method: 'POST' });
export const deleteFocusSession = (id: string) => request<void>(`/api/focus-sessions/${id}`, { method: 'DELETE' });
