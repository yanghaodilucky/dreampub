import { useEffect, useMemo, useState } from 'react';
import { PhaserGame } from '../game/PhaserGame';
import { gameBridge, type FocusSpot } from '../game/bridge/GameBridge';

type Task = { id: string; title: string; project: string; status: 'next' | 'done' };
type Drawer = 'tasks' | 'focus' | null;

const initialTasks: Task[] = [
  { id: 'task-cafe', title: '完成 Dream Cafe 场景设计', project: 'DreamPub 首版', status: 'next' },
  { id: 'task-memory', title: '整理 NPC 记忆设计', project: 'DreamPub 首版', status: 'next' },
  { id: 'task-world-events', title: '确定 World Event 契约', project: 'DreamPub 首版', status: 'done' },
];

export function App() {
  const [tasks, setTasks] = useState(initialTasks);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [focusSpot, setFocusSpot] = useState<FocusSpot | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [focusStartedAt, setFocusStartedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [gameError, setGameError] = useState<string | null>(null);

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) ?? null, [activeTaskId, tasks]);
  const remainingTasks = tasks.filter((task) => task.status === 'next');

  useEffect(() => gameBridge.on('focus.open', (spot) => { setFocusSpot(spot); setDrawer('focus'); }), []);
  useEffect(() => gameBridge.on('tasks.open', () => setDrawer('tasks')), []);
  useEffect(() => gameBridge.on('game.error', ({ message }) => setGameError(message)), []);
  useEffect(() => {
    if (!focusStartedAt) return;
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - focusStartedAt.getTime()) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [focusStartedAt]);

  const startFocus = (task: Task) => {
    if (!focusSpot) return;
    setActiveTaskId(task.id);
    setFocusStartedAt(new Date());
    setElapsedSeconds(0);
    gameBridge.emit('focus.started', { taskId: task.id, taskTitle: task.title, seatId: focusSpot.seatId });
  };
  const stopFocus = () => { gameBridge.emit('focus.stopped', undefined); setFocusStartedAt(null); setActiveTaskId(null); };
  const addTask = () => {
    const title = window.prompt('想专注完成什么？')?.trim();
    if (title) setTasks((current) => [...current, { id: `task-${crypto.randomUUID()}`, title, project: 'DreamPub 首版', status: 'next' }]);
  };
  const toggleTask = (taskId: string) => setTasks((current) => current.map((task) => task.id === taskId ? { ...task, status: task.status === 'done' ? 'next' : 'done' } : task));

  return <main className="cafe-shell">
    <section className="cafe-world" id="dream-cafe" aria-label="Dream Cafe 小世界">
      <PhaserGame />
      <header className="world-toolbar">
        <a className="brand" href="#dream-cafe" aria-label="Dream Cafe 主页">DREAM<span>CAFE</span></a>
        <p>坐北朝南 · 法式梧桐路边</p>
        <div className="toolbar-actions">
          <button className={drawer === 'tasks' ? 'toolbar-button active' : 'toolbar-button'} onClick={() => setDrawer(drawer === 'tasks' ? null : 'tasks')}>▤ 任务</button>
          <button className={drawer === 'focus' ? 'toolbar-button active' : 'toolbar-button'} onClick={() => setDrawer(drawer === 'focus' ? null : 'focus')}>◷ 专注</button>
        </div>
      </header>
      <div className="world-caption"><span>● Loopy 在吧台调咖啡</span><span>● Evan 在中央长桌读报</span></div>
      {gameError && <p className="game-error">Dream Cafe 无法初始化：{gameError}</p>}
    </section>
    {drawer && <button className="drawer-scrim" aria-label="关闭侧栏" onClick={() => setDrawer(null)} />}
    <aside className={drawer ? 'side-drawer open' : 'side-drawer'} aria-hidden={!drawer}>
      <div className="drawer-header"><div><p className="eyebrow">{drawer === 'tasks' ? 'PROJECT BOARD' : 'FOCUS'}</p><h1>{drawer === 'tasks' ? '今天的项目' : activeTask ? '正在专注' : '准备坐下'}</h1></div><button className="close-button" onClick={() => setDrawer(null)} aria-label="关闭">×</button></div>
      {drawer === 'tasks' && <TaskDrawer tasks={tasks} onAdd={addTask} onToggle={toggleTask} />}
      {drawer === 'focus' && <FocusDrawer activeTask={activeTask} elapsedSeconds={elapsedSeconds} focusSpot={focusSpot} tasks={remainingTasks} onStop={stopFocus} onStart={startFocus} />}
    </aside>
  </main>;
}

function TaskDrawer({ tasks, onAdd, onToggle }: { tasks: Task[]; onAdd: () => void; onToggle: (taskId: string) => void }) {
  const done = tasks.filter((task) => task.status === 'done').length;
  return <><div className="project-card"><span>DreamPub 首版</span><strong>{done} / {tasks.length} 已完成</strong><small>右墙项目板和这里保持同一份任务。</small></div><button className="primary-button" onClick={onAdd}>+ 新增一个真实任务</button><ul className="task-list">{tasks.map((task) => <li key={task.id} className={task.status === 'done' ? 'done' : ''}><button className="task-check" onClick={() => onToggle(task.id)} aria-label={`切换 ${task.title} 状态`} /><div><strong>{task.title}</strong><small>{task.project}</small></div></li>)}</ul><p className="drawer-note">这是本地原型。下一阶段会将项目、任务和进度保存到服务器。</p></>;
}

function FocusDrawer({ activeTask, elapsedSeconds, focusSpot, tasks, onStop, onStart }: { activeTask: Task | null; elapsedSeconds: number; focusSpot: FocusSpot | null; tasks: Task[]; onStop: () => void; onStart: (task: Task) => void }) {
  if (activeTask) return <div className="focus-active"><div className="focus-clock">{formatDuration(elapsedSeconds)}</div><p className="focus-label">正在专注</p><h2>{activeTask.title}</h2><p className="seat-label">你坐在{focusSpot?.label ?? 'Dream Cafe'}。</p><button className="secondary-button" onClick={onStop}>结束这次专注</button></div>;
  if (!focusSpot) return <div className="empty-focus"><div className="coffee-mark">☕</div><h2>先选一张咖啡桌</h2><p>点击窗边桌、中央长桌，或走到旁边按 E。选座后，这里会显示你的任务。</p></div>;
  return <div className="focus-setup"><div className="focus-spot">{focusSpot.label}</div><h2>在这里待一会儿吧。</h2><p>选择一个真实任务，计时和角色工作状态会立刻开始。</p><div className="focus-task-options">{tasks.map((task) => <button key={task.id} onClick={() => onStart(task)}><span>{task.project}</span>{task.title}</button>)}</div></div>;
}

function formatDuration(totalSeconds: number) { return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`; }
