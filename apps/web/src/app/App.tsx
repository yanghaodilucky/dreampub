import { useEffect, useMemo, useState } from 'react';
import { PhaserGame } from '../game/PhaserGame';
import { gameBridge, type DeskInteraction } from '../game/bridge/GameBridge';

type Task = { id: string; title: string; project: string; status: 'next' | 'done' };

const initialTasks: Task[] = [
  { id: 'task-library', title: '完成图书馆交互原型', project: 'DreamPub 首版', status: 'next' },
  { id: 'task-memory', title: '整理 NPC 记忆设计', project: 'DreamPub 首版', status: 'next' },
  { id: 'task-world-events', title: '确定 World Event 契约', project: 'DreamPub 首版', status: 'done' },
];

export function App() {
  const [tasks, setTasks] = useState(initialTasks);
  const [seat, setSeat] = useState<DeskInteraction | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [focusSeatLabel, setFocusSeatLabel] = useState<string | null>(null);
  const [focusStartedAt, setFocusStartedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [gameError, setGameError] = useState<string | null>(null);

  const activeTask = useMemo(
    () => tasks.find((task) => task.id === activeTaskId) ?? null,
    [activeTaskId, tasks],
  );

  useEffect(() => gameBridge.on('desk.interacted', setSeat), []);
  useEffect(() => gameBridge.on('game.error', ({ message }) => setGameError(message)), []);

  useEffect(() => {
    if (!focusStartedAt) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - focusStartedAt.getTime()) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [focusStartedAt]);

  const startFocus = (task: Task) => {
    if (!seat) return;
    setActiveTaskId(task.id);
    setFocusSeatLabel(seat.label);
    setFocusStartedAt(new Date());
    setElapsedSeconds(0);
    gameBridge.emit('focus.started', { taskId: task.id, taskTitle: task.title, seatId: seat.seatId });
    setSeat(null);
  };

  const stopFocus = () => {
    gameBridge.emit('focus.stopped', undefined);
    setFocusStartedAt(null);
    setActiveTaskId(null);
    setFocusSeatLabel(null);
  };

  const addTask = () => {
    const title = window.prompt('想专注完成什么？')?.trim();
    if (!title) return;
    setTasks((current) => [
      ...current,
      { id: `task-${crypto.randomUUID()}`, title, project: 'DreamPub 首版', status: 'next' },
    ]);
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#library" aria-label="DreamPub 图书馆主页">DREAM<span>PUB</span></a>
        <p>09:30 · 周六 · 图书馆</p>
        <span className="status-pill">本地原型</span>
      </header>

      <section className="workspace" id="library">
        <aside className="panel tasks-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">TODAY</p><h1>今天想完成什么？</h1></div>
            <button className="icon-button" onClick={addTask} aria-label="新增任务">+</button>
          </div>
          <div className="project-card"><span>项目</span><strong>DreamPub 首版</strong><small>1 / 3 已完成</small></div>
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id} className={task.status === 'done' ? 'done' : ''}>
                <span className="task-dot" />
                <div><strong>{task.title}</strong><small>{task.project}</small></div>
              </li>
            ))}
          </ul>
          <p className="panel-note">任务数据目前只保存在浏览器内存。下一阶段会接入真实项目与专注记录。</p>
        </aside>

        <section className="world-panel" aria-label="图书馆世界">
          <div className="world-heading"><span>私人图书馆</span><small>方向键 / WASD 探索 · 点击或按 E 坐下</small></div>
          <PhaserGame />
          {gameError && <p className="game-error">图书馆无法初始化：{gameError}</p>}
          <div className="world-footer"><span>● Mira 在画画</span><span>● Lin 正在整理书架</span></div>
        </section>

        <aside className="panel focus-panel">
          <p className="eyebrow">FOCUS</p>
          {activeTask ? (
            <>
              <div className="focus-clock">{formatDuration(elapsedSeconds)}</div>
              <p className="focus-label">正在专注</p>
              <h2>{activeTask.title}</h2>
              <p className="seat-label">{focusSeatLabel ? `你坐在${focusSeatLabel}。` : ''}</p>
              <button className="secondary-button" onClick={stopFocus}>结束这次专注</button>
            </>
          ) : (
            <div className="empty-focus">
              <div className="moon">☾</div>
              <h2>找一张桌子吧</h2>
              <p>走到图书馆书桌旁按 E，或直接点击座位，然后选择想完成的任务。</p>
            </div>
          )}
          <div className="npc-card"><span className="npc-dot mira" /> <div><strong>Mira</strong><small>“安静也可以是一种陪伴。”</small></div></div>
        </aside>
      </section>

      {seat && (
        <div className="modal-backdrop" role="presentation">
          <section className="focus-modal" role="dialog" aria-modal="true" aria-labelledby="focus-dialog-title">
            <button className="close-button" onClick={() => setSeat(null)} aria-label="关闭">×</button>
            <p className="eyebrow">{seat.label}</p>
            <h2 id="focus-dialog-title">准备开始一段专注吗？</h2>
            <p>选择一个真实任务。现在只是前端原型，计时与任务会在刷新后重置。</p>
            <div className="focus-task-options">
              {tasks.filter((task) => task.status === 'next').map((task) => (
                <button key={task.id} onClick={() => startFocus(task)}>
                  <span>{task.project}</span>{task.title}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
