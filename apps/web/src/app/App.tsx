import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PhaserGame } from '../game/PhaserGame';
import { gameBridge, type FocusSpot, type NpcMessage, type NpcStatus } from '../game/bridge/GameBridge';
import { compileCharacter, getCharacterVersions, pauseWorld, resumeWorld, saveCharacterPreview, type CharacterId, type CharacterTemplate, type CharacterVersion } from '../api/characterApi';

type Drawer = 'tasks' | 'focus' | null;
type Project = { id: string; name: string; color: string; startDate: string; endDate: string };
type Task = { id: string; projectId: string; title: string; status: 'next' | 'done'; startDate: string; endDate: string };
type FocusSession = { id: string; taskId: string; projectId: string; startedAt: string; durationSeconds: number };
type ChatLine = NpcMessage & { id: string; name: string; receivedAt: number; speaker: 'npc' | 'player' };

const COLORS = ['#f39a6b', '#8ac6a8', '#80b9dc', '#b89bd9', '#e8c26e', '#df8eb0'];
const STORE = { projects: 'dreampub.projects', tasks: 'dreampub.tasks', sessions: 'dreampub.focus-sessions' };
const CHARACTER_QUESTIONS = [
  { id: 'first_meeting', part: 'Part I · TA 是谁？', question: '你第一次遇见 TA，是在哪里？那一天发生了什么？' },
  { id: 'perfect_day', part: 'Part I · TA 是谁？', question: '如果 TA 可以完全按照自己的心意度过一天，那会是什么样的一天？' },
  { id: 'absorbing_activities', part: 'Part I · TA 是谁？', question: 'TA 最喜欢做什么？有什么事情会让 TA 一做起来就忘记时间？' },
  { id: 'what_matters', part: 'Part II · TA 怎样看待世界？', question: 'TA 最珍惜什么？可以是一件东西、一段关系、一种感觉，或者一种生活方式。' },
  { id: 'precious_memory', part: 'Part II · TA 怎样看待世界？', question: 'TA 有没有一段非常珍贵的回忆？如果有，那是什么？' },
  { id: 'unfinished_dream', part: 'Part II · TA 怎样看待世界？', question: 'TA 有没有一件一直想做、但还没有做到的事情？为什么还没有去做？' },
  { id: 'meaning_of_love', part: 'Part III · TA 怎样爱别人？', question: '对 TA 来说，爱一个人意味着什么？' },
  { id: 'showing_care', part: 'Part III · TA 怎样爱别人？', question: 'TA 通常怎样表达关心？' },
  { id: 'relationship_with_player', part: 'Part III · TA 怎样爱别人？', question: 'TA 和你是什么关系？这段关系最核心的感觉是什么？' },
  { id: 'stress_response', part: 'Part IV · TA 怎样面对自己？', question: 'TA 累了、难过了，或者想一个人待一会儿时，通常会怎样？' },
  { id: 'desired_ability', part: 'Part IV · TA 怎样面对自己？', question: '如果 TA 明天醒来，可以获得一种能力，TA 最希望得到什么能力？为什么？' },
  { id: 'small_wish', part: 'Part IV · TA 怎样面对自己？', question: 'TA 最近有没有一个很小、但真的很想完成的愿望？' },
] as const;
type CharacterQuestionId = typeof CHARACTER_QUESTIONS[number]['id'];
type CharacterAnswers = Record<CharacterQuestionId, string>;
const blankCharacterAnswers = (): CharacterAnswers => Object.fromEntries(CHARACTER_QUESTIONS.map(({ id }) => [id, ''])) as CharacterAnswers;
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) => { const result = new Date(date); result.setDate(result.getDate() + days); return dateKey(result); };
const dateValue = (value: string) => new Date(`${value}T00:00:00`).getTime();
const formatDuration = (seconds: number) => `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}h ` : ''}${Math.floor((seconds % 3600) / 60)}m`;
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
function readStored<T>(key: string, fallback: T): T { try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function seedProjects() { const today = new Date(); return [{ id: 'project-dreampub', name: 'DreamPub 首版', color: COLORS[0], startDate: addDays(today, -4), endDate: addDays(today, 18) }]; }
function seedTasks(projectId: string) { const today = new Date(); return [{ id: 'task-cafe', projectId, title: '完成 Dream Cafe 场景设计', status: 'next' as const, startDate: addDays(today, -3), endDate: addDays(today, 4) }, { id: 'task-memory', projectId, title: '整理 NPC 记忆设计', status: 'next' as const, startDate: addDays(today, 5), endDate: addDays(today, 12) }, { id: 'task-world-events', projectId, title: '确定 World Event 契约', status: 'done' as const, startDate: addDays(today, -4), endDate: addDays(today, -1) }]; }

export function App() {
  const [projects, setProjects] = useState<Project[]>(() => readStored(STORE.projects, seedProjects()));
  const [tasks, setTasks] = useState<Task[]>(() => readStored(STORE.tasks, seedTasks('project-dreampub')));
  const [sessions, setSessions] = useState<FocusSession[]>(() => readStored(STORE.sessions, []));
  const [selectedProjectId, setSelectedProjectId] = useState(() => projects[0]?.id ?? '');
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [focusSpot, setFocusSpot] = useState<FocusSpot | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [focusStartedAt, setFocusStartedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [gameError, setGameError] = useState<string | null>(null);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [npcStatuses, setNpcStatuses] = useState<NpcStatus[]>([]);
  const [characterStudioOpen, setCharacterStudioOpen] = useState(false);
  const [worldPaused, setWorldPaused] = useState(false);
  const [characterId, setCharacterId] = useState<CharacterId>('evan');
  const [characterAnswers, setCharacterAnswers] = useState<CharacterAnswers>(blankCharacterAnswers);
  const [characterStep, setCharacterStep] = useState(0);
  const [characterPreview, setCharacterPreview] = useState<CharacterTemplate | null>(null);
  const [characterSaved, setCharacterSaved] = useState(false);
  const [characterVersions, setCharacterVersions] = useState<CharacterVersion[]>([]);
  const [characterBusy, setCharacterBusy] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) ?? null, [activeTaskId, tasks]);
  const remainingTasks = tasks.filter((task) => task.status === 'next');
  useEffect(() => { window.localStorage.setItem(STORE.projects, JSON.stringify(projects)); }, [projects]);
  useEffect(() => { window.localStorage.setItem(STORE.tasks, JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { window.localStorage.setItem(STORE.sessions, JSON.stringify(sessions)); }, [sessions]);
  useEffect(() => gameBridge.on('focus.open', (spot) => { setFocusSpot(spot); setDrawer('focus'); }), []);
  useEffect(() => gameBridge.on('focus.closed', () => { setFocusSpot(null); setDrawer(null); }), []);
  useEffect(() => gameBridge.on('tasks.open', () => setDrawer('tasks')), []);
  useEffect(() => gameBridge.on('game.error', ({ message }) => setGameError(message)), []);
  useEffect(() => gameBridge.on('npc.message', ({ npcId, content, eventId }) => setChatLines((current) => {
    const now = Date.now();
    // The UI is the final boundary: even if a development reload leaves two
    // scene connections alive momentarily, one NPC utterance is rendered once.
    const duplicate = current.some((line) =>
      (eventId && line.eventId === eventId)
      || (line.npcId === npcId && line.content === content && now - line.receivedAt < 10_000),
    );
    if (duplicate) return current;
    return [...current, { id: crypto.randomUUID(), npcId, content, eventId, name: npcId === 'evan' ? 'Evan' : 'Loopy', receivedAt: now, speaker: 'npc' as const }].slice(-100);
  })), []);
  useEffect(() => gameBridge.on('npc.send', ({ content }) => setChatLines((current) => [...current, {
    id: crypto.randomUUID(), npcId: 'user', content, name: '你', receivedAt: Date.now(), speaker: 'player' as const,
  }].slice(-100))), []);
  useEffect(() => gameBridge.on('npc.states', setNpcStatuses), []);
  useEffect(() => { if (!focusStartedAt) return; const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - focusStartedAt.getTime()) / 1000)), 1000); return () => window.clearInterval(interval); }, [focusStartedAt]);
  const startFocus = (task: Task) => { if (!focusSpot) return; setActiveTaskId(task.id); setFocusStartedAt(new Date()); setElapsedSeconds(0); gameBridge.emit('focus.started', { taskId: task.id, taskTitle: task.title, seatId: focusSpot.seatId }); };
  const stopFocus = () => { if (activeTask && focusStartedAt) setSessions((current) => [...current, { id: crypto.randomUUID(), taskId: activeTask.id, projectId: activeTask.projectId, startedAt: focusStartedAt.toISOString(), durationSeconds: Math.max(1, elapsedSeconds) }]); gameBridge.emit('focus.stopped', undefined); setFocusStartedAt(null); setActiveTaskId(null); };
  const leaveSeat = () => { gameBridge.emit('focus.leave', undefined); setFocusSpot(null); setDrawer(null); };
  const toggleTask = (taskId: string) => setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: task.status === 'done' ? 'next' : 'done' } : task));
  const addProject = (project: Omit<Project, 'id' | 'color'>) => { const item = { ...project, id: crypto.randomUUID(), color: COLORS[projects.length % COLORS.length] }; setProjects((current) => [...current, item]); setSelectedProjectId(item.id); };
  const addTask = (task: Omit<Task, 'id' | 'status'>) => setTasks((current) => [...current, { ...task, id: crypto.randomUUID(), status: 'next' }]);
  const updateProject = (projectId: string, changes: Pick<Project, 'startDate' | 'endDate'>) => setProjects((current) => current.map((project) => project.id === projectId ? { ...project, ...changes } : project));
  const updateTask = (taskId: string, changes: Pick<Task, 'startDate' | 'endDate'>) => setTasks((current) => current.map((task) => task.id === taskId ? { ...task, ...changes } : task));
  const deleteProject = (projectId: string) => {
    if (projects.length < 2 || !window.confirm('删除项目会一并删除其中的任务和专注记录，继续吗？')) return;
    const remaining = projects.filter((project) => project.id !== projectId);
    setProjects(remaining); setTasks((current) => current.filter((task) => task.projectId !== projectId)); setSessions((current) => current.filter((session) => session.projectId !== projectId));
    setSelectedProjectId(remaining[0]?.id ?? '');
  };
  const deleteTask = (taskId: string) => {
    if (!window.confirm('删除这个任务及其专注记录吗？')) return;
    setTasks((current) => current.filter((task) => task.id !== taskId)); setSessions((current) => current.filter((session) => session.taskId !== taskId));
  };
  const deleteSession = (sessionId: string) => { if (window.confirm('删除这段专注记录吗？')) setSessions((current) => current.filter((session) => session.id !== sessionId)); };
  const loadCharacterVersions = async (id: CharacterId) => { const result = await getCharacterVersions(id); setCharacterVersions(result.versions); };
  const openCharacterStudio = async () => {
    setCharacterStudioOpen(true); setCharacterBusy(true); setCharacterError(null); setCharacterPreview(null); setCharacterSaved(false); setCharacterStep(0);
    try { await pauseWorld(); setWorldPaused(true); await loadCharacterVersions(characterId); } catch (error) { setCharacterError(error instanceof Error ? error.message : '无法暂停世界或读取角色。'); } finally { setCharacterBusy(false); }
  };
  const closeCharacterStudio = async () => {
    setCharacterBusy(true); setCharacterError(null);
    try { await resumeWorld(); setWorldPaused(false); setCharacterStudioOpen(false); } catch (error) { setCharacterError(error instanceof Error ? error.message : '世界仍处于暂停状态，请重试继续。'); } finally { setCharacterBusy(false); }
  };
  const selectCharacter = async (id: CharacterId) => {
    setCharacterId(id); setCharacterAnswers(blankCharacterAnswers()); setCharacterStep(0); setCharacterPreview(null); setCharacterSaved(false); setCharacterError(null); setCharacterBusy(true);
    try { await loadCharacterVersions(id); } catch (error) { setCharacterError(error instanceof Error ? error.message : '无法读取角色版本。'); } finally { setCharacterBusy(false); }
  };
  const generateCharacterPreview = async () => {
    if (Object.values(characterAnswers).some((answer) => !answer.trim())) return;
    setCharacterBusy(true); setCharacterError(null);
    try { const result = await compileCharacter(characterId, characterAnswers); setCharacterPreview(result.template_preview); setCharacterSaved(false); } catch (error) { setCharacterError(error instanceof Error ? error.message : '角色生成失败。'); } finally { setCharacterBusy(false); }
  };
  const saveCharacter = async () => {
    if (!characterPreview) return;
    setCharacterBusy(true); setCharacterError(null);
    try { await saveCharacterPreview(characterId, characterPreview); await loadCharacterVersions(characterId); setCharacterSaved(true); } catch (error) { setCharacterError(error instanceof Error ? error.message : '角色保存失败。'); } finally { setCharacterBusy(false); }
  };
  const npcStatus = (npcId: string, name: string) => { const state = npcStatuses.find((item) => item.npcId === npcId); return state ? `● ${name} ${state.visible ? state.activity : '外出中'}` : `● ${name} 状态同步中`; };
  return <main className="cafe-shell">
    <section className="cafe-world" id="dream-cafe" aria-label="Dream Cafe 小世界">
      <PhaserGame />
      <header className="world-toolbar"><a className="brand" href="#dream-cafe" aria-label="Dream Cafe 主页">DREAM<span>CAFE</span></a><div className="toolbar-actions"><button className={drawer === 'tasks' ? 'toolbar-button active' : 'toolbar-button'} onClick={() => setDrawer(drawer === 'tasks' ? null : 'tasks')}>▤ 项目</button><button className={drawer === 'focus' ? 'toolbar-button active' : 'toolbar-button'} onClick={() => setDrawer(drawer === 'focus' ? null : 'focus')}>◷ 专注</button><button className={characterStudioOpen ? 'toolbar-button active' : 'toolbar-button'} onClick={openCharacterStudio}>✦ 人物</button></div></header>
      <div className="world-caption"><span>{npcStatus('loopy', 'Loopy')}</span><span>{npcStatus('evan', 'Evan')}</span>{worldPaused && <span className="paused-caption">Ⅱ 世界暂停中</span>}</div>
      <NpcChat lines={chatLines} />
      {gameError && <p className="game-error">Dream Cafe 无法初始化：{gameError}</p>}
    </section>
    {drawer && <button className="drawer-scrim" aria-label="关闭侧栏" onClick={() => setDrawer(null)} />}
    <aside className={drawer ? 'side-drawer open' : 'side-drawer'} aria-hidden={!drawer}><div className="drawer-header"><div><p className="eyebrow">{drawer === 'tasks' ? 'PROJECT DESK' : 'FOCUS'}</p><h1>{drawer === 'tasks' ? '项目工作台' : activeTask ? '正在专注' : '准备坐下'}</h1></div><button className="close-button" onClick={() => setDrawer(null)} aria-label="关闭">×</button></div>{drawer === 'tasks' && <ProjectDesk projects={projects} tasks={tasks} sessions={sessions} selectedProjectId={selectedProjectId} onAddProject={addProject} onAddTask={addTask} onDeleteProject={deleteProject} onDeleteSession={deleteSession} onDeleteTask={deleteTask} onSelectProject={setSelectedProjectId} onToggleTask={toggleTask} onUpdateProject={updateProject} onUpdateTask={updateTask} />}{drawer === 'focus' && <FocusDrawer activeTask={activeTask} elapsedSeconds={elapsedSeconds} focusSpot={focusSpot} tasks={remainingTasks} projects={projects} onLeave={leaveSeat} onStop={stopFocus} onStart={startFocus} />}</aside>
    {characterStudioOpen && <CharacterStudio characterId={characterId} answers={characterAnswers} step={characterStep} preview={characterPreview} saved={characterSaved} versions={characterVersions} busy={characterBusy} error={characterError} onSelectCharacter={selectCharacter} onAnswer={(id, value) => setCharacterAnswers((current) => ({ ...current, [id]: value }))} onStep={setCharacterStep} onPreview={generateCharacterPreview} onEdit={() => { setCharacterPreview(null); setCharacterSaved(false); setCharacterStep(CHARACTER_QUESTIONS.length - 1); }} onSave={saveCharacter} onResume={closeCharacterStudio} />}
  </main>;
}

function NpcChat({ lines }: { lines: ChatLine[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [content, setContent] = useState('');
  const send = (event: FormEvent) => { event.preventDefault(); if (!content.trim()) return; gameBridge.emit('npc.send', { content: content.trim() }); setContent(''); };
  return <section className="npc-chat" aria-label="与咖啡馆 NPC 对话"><div className="npc-chat-heading"><span>{collapsed ? '对话记录已收起' : '附近的 NPC'}</span><button type="button" onClick={() => setCollapsed((current) => !current)}>{collapsed ? '展开记录' : '收起'}</button></div>{!collapsed && <div className="npc-chat-history">{lines.map((line) => <p key={line.id} className={line.speaker === 'player' ? 'player-message' : undefined}>{line.speaker === 'player' ? <>{line.content}<strong>{line.name}</strong></> : <><strong>{line.name}</strong>{line.content}</>}</p>)}</div>}<form onSubmit={send}><input value={content} onChange={(event) => setContent(event.target.value)} placeholder="想对附近的 Loopy 或 Evan 说什么？" maxLength={800} /><button>发送</button></form></section>;
}

function CharacterStudio({ characterId, answers, step, preview, saved, versions, busy, error, onSelectCharacter, onAnswer, onStep, onPreview, onEdit, onSave, onResume }: { characterId: CharacterId; answers: CharacterAnswers; step: number; preview: CharacterTemplate | null; saved: boolean; versions: CharacterVersion[]; busy: boolean; error: string | null; onSelectCharacter: (id: CharacterId) => void; onAnswer: (id: CharacterQuestionId, value: string) => void; onStep: (step: number) => void; onPreview: () => void; onEdit: () => void; onSave: () => void; onResume: () => void }) {
  const item = CHARACTER_QUESTIONS[step];
  const complete = Object.values(answers).every((answer) => answer.trim());
  const active = versions.find((version) => version.is_active);
  return <div className="character-studio-backdrop" role="dialog" aria-modal="true" aria-label="角色塑造问卷">
    <section className="character-studio">
      <header><div><p className="eyebrow">WORLD PAUSED · CHARACTER QUESTIONNAIRE V2</p><h1>在这里，慢慢认识 TA。</h1><p>世界已经暂停。你的答案只定义角色最初的样子，不会决定 TA 以后每一次行动。</p></div><button className="close-button" disabled={busy} onClick={onResume} aria-label="继续世界">×</button></header>
      <div className="character-picker"><button className={characterId === 'evan' ? 'active' : ''} disabled={busy} onClick={() => onSelectCharacter('evan')}>Evan</button><button className={characterId === 'loopy' ? 'active' : ''} disabled={busy} onClick={() => onSelectCharacter('loopy')}>Loopy</button><span>当前版本 {active ? `v${active.version}` : '读取中'}</span></div>
      {!preview ? <div className="question-flow"><div className="question-progress"><span>{item.part}</span><strong>{step + 1} / {CHARACTER_QUESTIONS.length}</strong></div><h2>{item.question}</h2><textarea value={answers[item.id]} disabled={busy} onChange={(event) => onAnswer(item.id, event.target.value)} placeholder="用你自己的话回答，不需要写得像设定集。" maxLength={1500} autoFocus />{error && <p className="character-error">{error}</p>}<footer><button className="secondary-button" disabled={busy || step === 0} onClick={() => onStep(step - 1)}>上一步</button>{step < CHARACTER_QUESTIONS.length - 1 ? <button className="primary-button" disabled={busy || !answers[item.id].trim()} onClick={() => onStep(step + 1)}>下一题</button> : <button className="primary-button" disabled={busy || !complete} onClick={onPreview}>{busy ? '正在生成…' : '生成角色与醒来第一句话'}</button>}</footer></div> : <div className="character-preview"><p className="eyebrow">AWAKENING</p><blockquote>“{preview.awakening.first_message}”</blockquote><small>{preview.awakening.used_fallback ? '由离线回退生成' : `由 ${preview.awakening.generator} 生成`}</small><section><h2>{preview.display_name} 的初始轮廓</h2><p>{preview.core_identity.summary}</p><h3>珍惜的事</h3><ul>{preview.core_identity.values.map((value) => <li key={value}>{value}</li>)}</ul><h3>与你的已知开始</h3><p>{preview.player_relationship.known_history}</p></section>{saved && <p className="character-saved">已保存为当前版本。你可以继续 Dream Cafe。</p>}{error && <p className="character-error">{error}</p>}<footer><button className="secondary-button" disabled={busy || saved} onClick={onEdit}>返回修改</button><button className="primary-button" disabled={busy || saved} onClick={onSave}>{saved ? '已保存' : busy ? '正在保存…' : '确认保存为新版本'}</button></footer></div>}
      <div className="character-history"><strong>版本历史</strong>{versions.map((version) => <span key={version.version} className={version.is_active ? 'active' : ''}>v{version.version}{version.is_active ? ' · 当前' : ''}</span>)}</div>
      <button className="resume-world" disabled={busy} onClick={onResume}>继续 Dream Cafe</button>
    </section>
  </div>;
}

function ProjectDesk({ projects, tasks, sessions, selectedProjectId, onAddProject, onAddTask, onDeleteProject, onDeleteSession, onDeleteTask, onSelectProject, onToggleTask, onUpdateProject, onUpdateTask }: { projects: Project[]; tasks: Task[]; sessions: FocusSession[]; selectedProjectId: string; onAddProject: (project: Omit<Project, 'id' | 'color'>) => void; onAddTask: (task: Omit<Task, 'id' | 'status'>) => void; onDeleteProject: (id: string) => void; onDeleteSession: (id: string) => void; onDeleteTask: (id: string) => void; onSelectProject: (id: string) => void; onToggleTask: (id: string) => void; onUpdateProject: (id: string, changes: Pick<Project, 'startDate' | 'endDate'>) => void; onUpdateTask: (id: string, changes: Pick<Task, 'startDate' | 'endDate'>) => void }) {
  const selected = projects.find((project) => project.id === selectedProjectId) ?? projects[0]; const projectTasks = tasks.filter((task) => task.projectId === selected?.id);
  const [newProjectName, setNewProjectName] = useState(''); const [projectStart, setProjectStart] = useState(dateKey(new Date())); const [projectEnd, setProjectEnd] = useState(addDays(new Date(), 14)); const [newTask, setNewTask] = useState(''); const [taskStart, setTaskStart] = useState(selected?.startDate ?? dateKey(new Date())); const [taskEnd, setTaskEnd] = useState(selected?.endDate ?? addDays(new Date(), 3)); const [showProjectForm, setShowProjectForm] = useState(false); const [showTaskForm, setShowTaskForm] = useState(false); const [showProjectDates, setShowProjectDates] = useState(false); const [editProjectStart, setEditProjectStart] = useState(selected?.startDate ?? ''); const [editProjectEnd, setEditProjectEnd] = useState(selected?.endDate ?? ''); const [editingTaskId, setEditingTaskId] = useState<string | null>(null); const [editTaskStart, setEditTaskStart] = useState(''); const [editTaskEnd, setEditTaskEnd] = useState('');
  useEffect(() => { if (selected) { setTaskStart(selected.startDate); setTaskEnd(selected.endDate); setEditProjectStart(selected.startDate); setEditProjectEnd(selected.endDate); setShowProjectDates(false); } }, [selected?.id]);
  const addProjectSubmit = (event: FormEvent) => { event.preventDefault(); if (!newProjectName.trim() || projectEnd < projectStart) return; onAddProject({ name: newProjectName.trim(), startDate: projectStart, endDate: projectEnd }); setNewProjectName(''); setShowProjectForm(false); };
  const addTaskSubmit = (event: FormEvent) => { event.preventDefault(); if (!selected || !newTask.trim() || taskEnd < taskStart) return; onAddTask({ projectId: selected.id, title: newTask.trim(), startDate: taskStart, endDate: taskEnd }); setNewTask(''); setShowTaskForm(false); };
  const saveProjectDates = (event: FormEvent) => { event.preventDefault(); if (!selected || editProjectEnd < editProjectStart) return; onUpdateProject(selected.id, { startDate: editProjectStart, endDate: editProjectEnd }); setShowProjectDates(false); };
  const saveTaskDates = (event: FormEvent) => { event.preventDefault(); if (!editingTaskId || editTaskEnd < editTaskStart) return; onUpdateTask(editingTaskId, { startDate: editTaskStart, endDate: editTaskEnd }); setEditingTaskId(null); };
  if (!selected) return null;
  return <div className="project-desk"><section className="desk-section"><div className="section-heading"><h2>项目</h2><span>{projects.length} 个</span><button className="add-toggle" onClick={() => setShowProjectForm((open) => !open)}>{showProjectForm ? '收起' : '+ 项目'}</button></div><div className="project-tabs">{projects.map((project) => <button className={project.id === selected.id ? 'project-tab active' : 'project-tab'} key={project.id} onClick={() => { onSelectProject(project.id); setTaskStart(project.startDate); setTaskEnd(project.endDate); }}><i style={{ background: project.color }} />{project.name}</button>)}</div>{showProjectForm && <form className="inline-form project-form" onSubmit={addProjectSubmit}><input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="新项目名称" aria-label="新项目名称" /><label>开始<input type="date" value={projectStart} onChange={(event) => setProjectStart(event.target.value)} /></label><label>结束<input type="date" value={projectEnd} onChange={(event) => setProjectEnd(event.target.value)} /></label><button className="mini-primary">创建项目</button></form>}</section><section className="desk-section selected-project"><div className="project-title"><i style={{ background: selected.color }} /><div><h2>{selected.name}</h2><p>{dateLabel(selected.startDate)} — {dateLabel(selected.endDate)}</p></div><strong>{projectTasks.filter((task) => task.status === 'done').length}/{projectTasks.length}</strong><button className="add-toggle" onClick={() => setShowProjectDates((open) => !open)}>{showProjectDates ? '收起日期' : '编辑日期'}</button><button className="add-toggle" onClick={() => setShowTaskForm((open) => !open)}>{showTaskForm ? '收起' : '+ 任务'}</button><button className="delete-button" disabled={projects.length < 2} title={projects.length < 2 ? '请至少保留一个项目' : '删除项目'} onClick={() => onDeleteProject(selected.id)}>删除项目</button></div>{showProjectDates && <form className="inline-form date-edit-form" onSubmit={saveProjectDates}><label>项目开始<input type="date" value={editProjectStart} onChange={(event) => setEditProjectStart(event.target.value)} /></label><label>项目结束<input type="date" value={editProjectEnd} onChange={(event) => setEditProjectEnd(event.target.value)} /></label><button className="mini-primary">保存项目日期</button></form>}{showTaskForm && <form className="inline-form task-form" onSubmit={addTaskSubmit}><input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="为这个项目增加任务" aria-label="任务名称" /><label><input type="date" value={taskStart} onChange={(event) => setTaskStart(event.target.value)} /></label><label><input type="date" value={taskEnd} onChange={(event) => setTaskEnd(event.target.value)} /></label><button className="mini-primary">创建任务</button></form>}<ul className="task-list">{projectTasks.map((task) => <li key={task.id} className={task.status === 'done' ? 'done' : ''}><button className="task-check" onClick={() => onToggleTask(task.id)} aria-label={`切换 ${task.title} 状态`}>{task.status === 'done' && '✓'}</button>{editingTaskId === task.id ? <form className="task-date-editor" onSubmit={saveTaskDates}><label>开始<input type="date" value={editTaskStart} onChange={(event) => setEditTaskStart(event.target.value)} /></label><label>结束<input type="date" value={editTaskEnd} onChange={(event) => setEditTaskEnd(event.target.value)} /></label><button className="mini-primary">保存</button><button type="button" className="add-toggle" onClick={() => setEditingTaskId(null)}>取消</button></form> : <div><strong>{task.title}</strong><small>{dateLabel(task.startDate)} — {dateLabel(task.endDate)}</small></div>}<button className="add-toggle" onClick={() => { setEditingTaskId(task.id); setEditTaskStart(task.startDate); setEditTaskEnd(task.endDate); }}>编辑日期</button><button className="delete-icon" onClick={() => onDeleteTask(task.id)} aria-label={`删除 ${task.title}`}>×</button></li>)}{!projectTasks.length && <li className="empty-row">这个项目还没有任务。</li>}</ul></section><GanttChart tasks={tasks} projects={projects} selectedProjectId={selected.id} /><Analytics sessions={sessions} projects={projects} tasks={tasks} onDeleteSession={onDeleteSession} /></div>;
}

function GanttChart({ tasks, projects, selectedProjectId }: { tasks: Task[]; projects: Project[]; selectedProjectId: string }) {
  const [mode, setMode] = useState<'selected' | 'all'>('selected');
  const visibleTasks = mode === 'all' ? tasks : tasks.filter((task) => task.projectId === selectedProjectId);
  const allDates = [...projects.flatMap((project) => [project.startDate, project.endDate]), ...tasks.flatMap((task) => [task.startDate, task.endDate])];
  const start = Math.min(...allDates.map(dateValue)); const end = Math.max(...allDates.map(dateValue)); const span = Math.max(1, Math.ceil((end - start) / 86_400_000) + 1);
  return <section className="desk-section gantt-section"><div className="section-heading"><h2>甘特图</h2><div className="gantt-controls"><button className={mode === 'selected' ? 'active' : ''} onClick={() => setMode('selected')}>当前项目</button><button className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>全部项目</button></div><span>{dateLabel(dateKey(new Date(start)))} — {dateLabel(dateKey(new Date(end)))}</span></div><div className="gantt"><div className="gantt-scale"><span>开始</span><span>中段</span><span>结束</span></div>{visibleTasks.map((task) => { const project = projects.find((item) => item.id === task.projectId); const left = ((dateValue(task.startDate) - start) / 86_400_000 / span) * 100; const width = Math.max(4, ((dateValue(task.endDate) - dateValue(task.startDate)) / 86_400_000 + 1) / span * 100); return <div className={task.status === 'done' ? 'gantt-row done' : 'gantt-row'} key={task.id}><span title={task.title}>{mode === 'all' ? `${project?.name ?? '项目'} · ` : ''}{task.title}</span><div className="gantt-track"><b className={task.status === 'done' ? 'gantt-bar done' : 'gantt-bar'} style={{ left: `${left}%`, width: `${width}%`, background: project?.color }}>{task.status === 'done' && '✓'}</b></div></div>; })}</div></section>;
}

function Analytics({ sessions, projects, tasks, onDeleteSession }: { sessions: FocusSession[]; projects: Project[]; tasks: Task[]; onDeleteSession: (id: string) => void }) {
  const today = dateKey(new Date()); const month = today.slice(0, 7); const daily = sessions.filter((session) => dateKey(new Date(session.startedAt)) === today); const monthly = sessions.filter((session) => dateKey(new Date(session.startedAt)).startsWith(month));
  const recent = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);
  return <section className="desk-section analytics"><div className="section-heading"><h2>专注记录</h2><span>实际计时自动归档</span></div><div className="pie-grid"><PieCard title="今日 · 项目" records={daily} items={projects} getId={(item) => item.id} getName={(item) => item.name} getColor={(item) => item.color} /><PieCard title="今日 · 任务" records={daily} items={tasks} getId={(item) => item.id} getName={(item) => item.title} getColor={(item) => projects.find((project) => project.id === item.projectId)?.color ?? COLORS[0]} /><PieCard title="本月 · 项目" records={monthly} items={projects} getId={(item) => item.id} getName={(item) => item.name} getColor={(item) => item.color} /><PieCard title="本月 · 任务" records={monthly} items={tasks} getId={(item) => item.id} getName={(item) => item.title} getColor={(item) => projects.find((project) => project.id === item.projectId)?.color ?? COLORS[0]} /></div><ContributionHeatmap sessions={sessions} /><div className="session-list"><div className="section-heading"><h3>最近专注时段</h3><span>{sessions.length} 条</span></div>{recent.map((session) => <div className="session-row" key={session.id}><div><strong>{tasks.find((task) => task.id === session.taskId)?.title ?? '已删除任务'}</strong><small>{new Date(session.startedAt).toLocaleString('zh-CN')} · {formatDuration(session.durationSeconds)}</small></div><button className="delete-icon" onClick={() => onDeleteSession(session.id)} aria-label="删除专注记录">×</button></div>)}{!recent.length && <p className="empty-row">结束一次专注后，这里会显示可删除的时段。</p>}</div></section>;
}

function PieCard<T extends { id: string }>({ title, records, items, getId, getName, getColor }: { title: string; records: FocusSession[]; items: T[]; getId: (item: T) => string; getName: (item: T) => string; getColor: (item: T) => string }) { const byId = new Map<string, number>(); records.forEach((record) => { const id = title.includes('项目') ? record.projectId : record.taskId; byId.set(id, (byId.get(id) ?? 0) + record.durationSeconds); }); const parts = items.map((item) => ({ name: getName(item), color: getColor(item), seconds: byId.get(getId(item)) ?? 0 })).filter((item) => item.seconds > 0); const total = parts.reduce((sum, item) => sum + item.seconds, 0); let offset = 0; return <article className="pie-card"><h3>{title}</h3><div className="pie-content"><svg viewBox="0 0 42 42" role="img" aria-label={`${title} 专注分布`}>{!total && <circle className="pie-empty" cx="21" cy="21" r="15.9" />}{parts.map((part) => { const value = part.seconds / total * 100; const circle = <circle key={part.name} cx="21" cy="21" r="15.9" fill="none" stroke={part.color} strokeWidth="5" strokeDasharray={`${value} ${100 - value}`} strokeDashoffset={-offset} transform="rotate(-90 21 21)" />; offset += value; return circle; })}<text x="21" y="22" textAnchor="middle">{formatDuration(total)}</text></svg><ul>{parts.slice(0, 2).map((part) => <li key={part.name}><i style={{ background: part.color }} />{part.name}<span>{formatDuration(part.seconds)}</span></li>)}{!parts.length && <li className="no-data">开始一次专注后生成</li>}</ul></div></article>; }

function ContributionHeatmap({ sessions }: { sessions: FocusSession[] }) { const minutes = new Map<string, number>(); sessions.forEach((session) => { const day = dateKey(new Date(session.startedAt)); minutes.set(day, (minutes.get(day) ?? 0) + session.durationSeconds / 60); }); const today = new Date(); const days = Array.from({ length: 364 }, (_, index) => addDays(today, index - 363)); const intensity = (day: string) => { const value = minutes.get(day) ?? 0; return value === 0 ? 0 : value < 15 ? 1 : value < 45 ? 2 : value < 120 ? 3 : 4; }; const active = days.filter((day) => intensity(day) > 0); let streak = 0; let longest = 0; let current = 0; days.forEach((day) => { if (intensity(day)) { current += 1; longest = Math.max(longest, current); } else current = 0; }); for (let index = days.length - 1; index >= 0 && intensity(days[index]); index -= 1) streak += 1; const months = Array.from(new Set(days.map((day) => new Date(`${day}T00:00:00`).toLocaleDateString('zh-CN', { month: 'short' })))); return <div className="contribution"><div className="contribution-title"><h3>专注连续性</h3><span>{active.length} 个活跃日 · 连续 {streak} 天 · 最长 {longest} 天</span></div><div className="months">{months.map((month) => <span key={month}>{month}</span>)}</div><div className="heatmap">{days.map((day) => <i key={day} className={`heat-${intensity(day)}`} title={`${day} · ${Math.round(minutes.get(day) ?? 0)} 分钟`} />)}</div><div className="heat-legend"><span>少</span><i className="heat-0" /><i className="heat-1" /><i className="heat-2" /><i className="heat-3" /><i className="heat-4" /><span>多</span></div></div>; }

function FocusDrawer({ activeTask, elapsedSeconds, focusSpot, tasks, projects, onLeave, onStop, onStart }: { activeTask: Task | null; elapsedSeconds: number; focusSpot: FocusSpot | null; tasks: Task[]; projects: Project[]; onLeave: () => void; onStop: () => void; onStart: (task: Task) => void }) { if (activeTask) return <div className="focus-active"><div className="focus-clock">{formatDuration(elapsedSeconds)}</div><p className="focus-label">正在专注</p><h2>{activeTask.title}</h2><p className="seat-label">你坐在{focusSpot?.label ?? 'Dream Cafe'}。</p><button className="secondary-button" onClick={onStop}>结束这次专注并记录</button></div>; if (!focusSpot) return <div className="empty-focus"><div className="coffee-mark">☕</div><h2>先选一张咖啡桌</h2><p>点击窗边桌、中央长桌，或走到旁边按 E。选座后，这里会显示项目中的任务。</p></div>; return <div className="focus-setup"><div className="focus-spot">{focusSpot.label}</div><h2>在这里待一会儿吧。</h2><p>选择任务开始计时；结束时会自动写入项目、任务、日报和贡献格。</p><div className="focus-task-options">{tasks.map((task) => <button key={task.id} onClick={() => onStart(task)}><span>{projects.find((project) => project.id === task.projectId)?.name ?? '未分类项目'}</span>{task.title}</button>)}</div><button className="secondary-button leave-seat-button" onClick={onLeave}>离开座位</button></div>; }
