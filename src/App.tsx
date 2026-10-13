import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen,
  CalendarDays, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Flame, Focus,
  Gauge, Leaf, ListTodo, Moon, MoreHorizontal, Plus, RotateCcw, Settings2, ShieldCheck,
  Sparkles, Sun, Target, Timer, Trophy, X, Zap,
} from 'lucide-react';
import type { Category, Frequency, Habit, Page, Task } from './types';

const STORAGE_KEY = 'streako-elite-v1';
const todayKey = () => toKey(new Date());
const toKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftKey = (key: string, delta: number) => {
  const [year, month, day] = key.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + delta);
  return toKey(next);
};
const categories: Category[] = ['Mind', 'Body', 'Craft', 'Life'];
const frequencies: Frequency[] = ['Daily', 'Weekdays', 'Weekends', '3× / week'];
const categoryTone: Record<Category, string> = { Mind: 'violet', Body: 'lime', Craft: 'orange', Life: 'blue' };
const categoryEmoji: Record<Category, string> = { Mind: '◌', Body: '↗', Craft: '✳', Life: '⌂' };

function seedHabits(): Habit[] {
  const now = todayKey();
  const seed = [
    { id: 'h1', name: 'Read 10 pages', emoji: '📚', category: 'Mind' as Category, cue: 'After my first coffee', minimum: 'Read one page', frequency: 'Daily' as Frequency, color: 'violet' },
    { id: 'h2', name: 'Move my body', emoji: '🏃', category: 'Body' as Category, cue: 'After I get dressed', minimum: 'Move for two minutes', frequency: 'Daily' as Frequency, color: 'lime' },
    { id: 'h3', name: 'Build something', emoji: '⌘', category: 'Craft' as Category, cue: 'After lunch', minimum: 'Open the project and do one thing', frequency: 'Weekdays' as Frequency, color: 'orange' },
    { id: 'h4', name: 'Plan tomorrow', emoji: '✍️', category: 'Life' as Category, cue: 'Before I close my laptop', minimum: 'Write the one priority', frequency: 'Daily' as Frequency, color: 'blue' },
  ];
  return seed.map((item, i) => {
    const logs: Record<string, boolean> = {};
    for (let back = 0; back < 42; back += 1) {
      const key = shiftKey(now, -back);
      if (item.frequency === 'Weekdays' && [0, 6].includes(new Date(`${key}T12:00:00`).getDay())) continue;
      // Seed history is demonstration data; replace it simply by checking habits off or clearing the app data.
      logs[key] = back === 0 ? i < 2 : ((back * 7 + i * 11) % (i === 1 ? 8 : 6)) !== 0;
    }
    return { ...item, logs, createdAt: shiftKey(now, -(28 + i * 4)) };
  });
}

function seedTasks(): Task[] {
  const today = todayKey();
  return [
    { id: 't1', title: 'Review lecture notes', completed: true, priority: 'Normal', estimate: 15, date: today },
    { id: 't2', title: 'Finish one project milestone', completed: false, priority: 'High', estimate: 45, date: today },
    { id: 't3', title: 'Prepare tomorrow’s top 3', completed: false, priority: 'Low', estimate: 10, date: today },
  ];
}

function loadSaved<T>(key: 'habits' | 'tasks', seed: () => T): T {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<Record<'habits' | 'tasks', unknown>>;
      if (Array.isArray(parsed[key])) return parsed[key] as T;
    }
  } catch {
    // A malformed local save should never prevent the app from opening.
  }
  return seed();
}

function isDue(habit: Habit, dayKey: string): boolean {
  const day = new Date(`${dayKey}T12:00:00`).getDay();
  if (habit.frequency === 'Weekdays') return day >= 1 && day <= 5;
  if (habit.frequency === 'Weekends') return day === 0 || day === 6;
  if (habit.frequency === '3× / week') return [2, 4, 6].includes(day);
  return true;
}

function getCurrentStreak(habit: Habit, dayKey = todayKey()): number {
  let count = 0;
  let cursor = habit.logs[dayKey] ? dayKey : shiftKey(dayKey, -1);
  // A missed day breaks the streak; today may still be completed later.
  while (habit.logs[cursor] && count < 500) {
    count += 1;
    cursor = shiftKey(cursor, -1);
  }
  return count;
}

function getBestStreak(habit: Habit, dayKey = todayKey()): number {
  let best = 0;
  let current = 0;
  let cursor = habit.createdAt || Object.keys(habit.logs).sort()[0] || dayKey;
  let guard = 0;
  while (cursor <= dayKey && guard < 20000) {
    if (habit.logs[cursor]) {
      current += 1;
      best = Math.max(best, current);
    } else current = 0;
    cursor = shiftKey(cursor, 1);
    guard += 1;
  }
  return best;
}

function IconButton({ label, onClick, children, className = '' }: { label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function App() {
  const [habits, setHabits] = useState<Habit[]>(() => loadSaved('habits', seedHabits));
  const [tasks, setTasks] = useState<Task[]>(() => loadSaved('tasks', seedTasks));
  const [page, setPage] = useState<Page>('Today');
  const [filter, setFilter] = useState<'All' | Category>('All');
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [taskDraft, setTaskDraft] = useState('');
  const [habitDraft, setHabitDraft] = useState({ name: '', category: 'Craft' as Category, frequency: 'Daily' as Frequency, cue: '', minimum: '' });
  const [dark, setDark] = useState(true);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusPreset, setFocusPreset] = useState(25);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusSessions, setFocusSessions] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const today = todayKey();

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits, tasks }));
  }, [habits, tasks]);

  useEffect(() => {
    if (!focusRunning) return undefined;
    const interval = window.setInterval(() => {
      setFocusSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [focusRunning]);

  useEffect(() => {
    if (focusRunning && focusSeconds === 0) {
      setFocusRunning(false);
      setFocusSessions((count) => count + 1);
      setToast('Focus session complete. Take a small reset.');
    }
  }, [focusRunning, focusSeconds]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!showHabitModal) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowHabitModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showHabitModal]);

  const dueHabits = useMemo(() => habits.filter((habit) => isDue(habit, today)), [habits, today]);
  const doneToday = dueHabits.filter((habit) => Boolean(habit.logs[today])).length;
  const todayTasks = tasks.filter((task) => task.date === today);
  const focusTask = todayTasks.find((task) => task.id === focusTaskId && !task.completed);
  const doneTasks = todayTasks.filter((task) => task.completed).length;
  const completion = dueHabits.length ? Math.round((doneToday / dueHabits.length) * 100) : 0;
  const consistency = useMemo(() => {
    let possible = 0;
    let completed = 0;
    for (let back = 0; back < 7; back += 1) {
      const day = shiftKey(today, -back);
      habits.forEach((habit) => {
        if (isDue(habit, day)) {
          possible += 1;
          if (habit.logs[day]) completed += 1;
        }
      });
    }
    return possible ? Math.round((completed / possible) * 100) : 0;
  }, [habits, today]);
  const bestStreak = habits.reduce((max, habit) => Math.max(max, getBestStreak(habit, today)), 0);
  const activeStreaks = habits.filter((habit) => getCurrentStreak(habit, today) > 0).length;
  const totalWins = habits.reduce((count, habit) => count + Object.values(habit.logs).filter(Boolean).length, 0);
  const filteredHabits = habits.filter((habit) => filter === 'All' || habit.category === filter);
  const quote = doneToday === dueHabits.length && dueHabits.length > 0
    ? 'You showed up for yourself today. That’s the whole point.'
    : doneToday === 0
      ? 'Make the first step so small it feels almost too easy.'
      : 'Momentum is built in the next small action, not the perfect day.';

  const toggleHabit = (id: string) => {
    const habit = habits.find((item) => item.id === id);
    if (!habit) return;
    const nextValue = !habit.logs[today];
    setHabits((current) => current.map((item) => item.id === id ? { ...item, logs: { ...item.logs, [today]: nextValue } } : item));
    if (nextValue) setToast(`Logged: ${habit.name}`);
  };

  const addHabit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = habitDraft.name.trim();
    if (!name) return;
    const tone = categoryTone[habitDraft.category];
    const emoji = habitDraft.category === 'Body' ? '↗' : habitDraft.category === 'Mind' ? '◌' : habitDraft.category === 'Life' ? '✳' : '⌘';
    const next: Habit = {
      id: `h-${crypto.randomUUID()}`,
      name,
      emoji,
      category: habitDraft.category,
      frequency: habitDraft.frequency,
      cue: habitDraft.cue.trim() || 'Choose a consistent moment',
      minimum: habitDraft.minimum.trim() || 'Do the smallest version for two minutes',
      logs: {},
      createdAt: today,
      color: tone,
    };
    setHabits((current) => [next, ...current]);
    setHabitDraft({ name: '', category: 'Craft', frequency: 'Daily', cue: '', minimum: '' });
    setShowHabitModal(false);
    setPage('Habits');
    setToast('Your new habit is ready. Start with the minimum version.');
  };

  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = taskDraft.trim();
    if (!title) return;
    setTasks((current) => [...current, { id: `t-${crypto.randomUUID()}`, title, completed: false, priority: 'Normal', estimate: 15, date: today }]);
    setTaskDraft('');
    setShowTaskInput(false);
    setToast('Added to today’s plan');
  };

  const toggleTask = (id: string) => setTasks((current) => current.map((task) => task.id === id ? { ...task, completed: !task.completed } : task));
  const resetFocus = (minutes = focusPreset) => { setFocusRunning(false); setFocusPreset(minutes); setFocusSeconds(minutes * 60); };
  const timeText = `${String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:${String(focusSeconds % 60).padStart(2, '0')}`;
  const timerProgress = 1 - focusSeconds / (focusPreset * 60 || 1);

  return (
    <div className={`app-shell ${dark ? 'dark-mode' : 'light-mode'}`}>
      <aside className="sidebar">
        <button className="brand-lockup" onClick={() => setPage('Today')} type="button" aria-label="Go to today">
          <span className="brand-mark"><Activity size={20} strokeWidth={2.6} /></span>
          <span className="brand-name">streako<span className="brand-elite"> / ELITE</span></span>
        </button>
        <div className="workspace-label">YOUR SPACE <span className="live-dot" /></div>
        <nav className="nav-list" aria-label="Main navigation">
          {([
            { label: 'Today' as Page, icon: Gauge, sub: 'Your daily dashboard' },
            { label: 'Habits' as Page, icon: Target, sub: 'Routines that stick' },
            { label: 'Insights' as Page, icon: BarChart3, sub: 'Patterns & progress' },
            { label: 'Focus' as Page, icon: Focus, sub: 'Make room for deep work' },
          ]).map(({ label, icon: Icon, sub }) => (
            <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => setPage(label)} type="button">
              <span className="nav-icon"><Icon size={17} /></span><span className="nav-copy"><b>{label}</b><small>{sub}</small></span>
              {label === 'Today' && <span className="nav-count">{Math.max(0, dueHabits.length - doneToday)}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-head"><span>YOUR ROUTINES</span><IconButton label="Create a habit" onClick={() => setShowHabitModal(true)}><Plus size={15} /></IconButton></div>
        <div className="routine-list">
          {habits.slice(0, 5).map((habit) => (
            <button className="routine-mini" key={habit.id} type="button" onClick={() => { setPage('Habits'); setFilter(habit.category); }}>
              <span className={`mini-emoji tone-${habit.color}`}>{habit.emoji}</span><span>{habit.name}</span><span className={`mini-check ${habit.logs[today] ? 'checked' : ''}`}>{habit.logs[today] ? <Check size={11} /> : ''}</span>
            </button>
          ))}
          {habits.length === 0 && <p className="sidebar-empty">Your first routine starts here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={15} /></div><div><b>Small counts.</b><p>Never miss twice. Restart gently.</p></div></div>
          <button className="profile-row" type="button" onClick={() => setToast('Profile settings will be added when accounts are connected.')}>
            <span className="avatar">IR</span><span className="profile-copy"><b>Your workspace</b><small>Personal edition</small></span><MoreHorizontal size={18} className="muted-icon" />
          </button>
          <div className="sidebar-tools"><button type="button" onClick={() => setDark((current) => !current)}><span>{dark ? <Sun size={15} /> : <Moon size={15} />}</span>{dark ? 'Light appearance' : 'Dark appearance'}</button><button type="button" onClick={() => setToast('You’re using local-first demo mode. Your changes stay in this browser.')}><Settings2 size={15} />Preferences</button></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{page}</b></div>
          <div className="topbar-actions"><span className="local-save"><span className="save-dot" /> Saved locally</span><IconButton label="Notifications" onClick={() => setToast('You’re all caught up. No reminders are scheduled yet.')}><Bell size={17} /></IconButton><button className="date-chip" type="button" onClick={() => setPage('Today')}><CalendarDays size={15} />{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<ChevronDown size={13} /></button></div>
        </header>

        {page === 'Today' && <>
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" /> {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div><h1>Make today <span>count.</span></h1><p className="welcome-sub">A little progress, repeated. That’s how things change.</p></div>
            <button className="primary-button" onClick={() => setShowHabitModal(true)} type="button"><Plus size={16} /> New habit</button>
          </section>

          <section className="hero-card">
            <div className="hero-copy"><div className="section-kicker"><span className="kicker-mark"><Sparkles size={13} /></span> YOUR DAILY MOMENTUM</div><h2>{doneToday === 0 ? 'Start where you are.' : doneToday === dueHabits.length ? 'You did what you said.' : 'You’re building momentum.'}</h2><p>{quote}</p><div className="hero-meta"><span><CheckCheck size={15} /> <b>{doneToday}</b> of {dueHabits.length} habits done</span><span className="meta-separator" /><span><Clock3 size={15} /> {dueHabits.length - doneToday} left to show up for</span></div></div>
            <div className="progress-orbit" style={{ '--progress': `${completion}%` } as CSSProperties}><div className="orbit-inner"><span className="orbit-value">{completion}<small>%</small></span><span className="orbit-label">COMPLETE</span></div><span className="orbit-spark orbit-spark-one" /><span className="orbit-spark orbit-spark-two" /></div>
            <div className="hero-glow" />
          </section>

          <section className="stats-grid">
            <StatCard icon={<Flame size={17} />} label="Active streaks" value={String(activeStreaks).padStart(2, '0')} detail="Routines in motion" tone="orange" />
            <StatCard icon={<Activity size={17} />} label="7-day consistency" value={`${consistency}%`} detail={consistency >= 70 ? 'Steady momentum' : 'Room to find your rhythm'} tone="lime" />
            <StatCard icon={<Trophy size={17} />} label="Best streak" value={`${bestStreak}d`} detail="Your longest run" tone="violet" />
            <StatCard icon={<Zap size={17} />} label="Total check-ins" value={String(totalWins)} detail="Small wins add up" tone="blue" />
          </section>

          <div className="content-grid">
            <section className="panel habits-panel">
              <div className="panel-heading"><div><div className="panel-overline">MAKE IT A RITUAL</div><h3>Today’s habits <span className="heading-count">{doneToday}/{dueHabits.length}</span></h3></div><button className="text-button" type="button" onClick={() => setPage('Habits')}>All habits <ArrowRight size={14} /></button></div>
              <div className="habits-progress-line"><span style={{ width: `${completion}%` }} /></div>
              <div className="habit-list">
                {dueHabits.slice(0, 5).map((habit) => <HabitRow key={habit.id} habit={habit} completed={Boolean(habit.logs[today])} streak={getCurrentStreak(habit, today)} onToggle={() => toggleHabit(habit.id)} />)}
                {dueHabits.length === 0 && <EmptyState title="Make room for a habit" body="Start with one small repeatable action." action="Create a habit" onAction={() => setShowHabitModal(true)} />}
                {dueHabits.length > 5 && <button className="show-more" onClick={() => setPage('Habits')} type="button">+ {dueHabits.length - 5} more habits</button>}
              </div>
              <button className="add-inline" type="button" onClick={() => setShowHabitModal(true)}><span><Plus size={15} /></span> Add a habit to your day</button>
            </section>

            <section className="panel focus-panel">
              <div className="panel-heading"><div><div className="panel-overline">PROTECT YOUR ATTENTION</div><h3>Focus room <span className="live-pill"><span /> READY</span></h3></div><IconButton label="Open focus page" onClick={() => setPage('Focus')}><ArrowUpRight size={17} /></IconButton></div>
              <div className="focus-visual"><div className="focus-ring" style={{ '--timer-progress': `${timerProgress * 100}%` } as CSSProperties}><div className="focus-ring-inner"><span className="focus-time">{timeText}</span><span className="focus-caption">{focusRunning ? 'IN THE ZONE' : 'ONE THING AT A TIME'}</span></div></div><div className="focus-motivation"><div className="motivation-icon"><Target size={18} /></div><b>{focusRunning ? 'Stay with it.' : focusTask ? `Next up: ${focusTask.title}` : 'What deserves your focus?'}</b><p>{focusRunning ? 'You don’t need to feel ready. Just keep going.' : focusTask ? `Give this one task ${focusPreset} minutes of your attention.` : 'Choose one task. Make the next 25 minutes count.'}</p></div></div>
              <div className="timer-presets">{[15, 25, 50].map((minutes) => <button type="button" key={minutes} className={focusPreset === minutes ? 'selected' : ''} onClick={() => resetFocus(minutes)}>{minutes} min</button>)}</div>
              <div className="timer-actions"><button className="primary-button full-button" type="button" onClick={() => { if (focusSeconds === 0) resetFocus(); else setFocusRunning((running) => !running); }}><span>{focusRunning ? 'Pause session' : focusSeconds === 0 ? 'Start again' : 'Start focus session'}</span>{focusRunning ? <span className="pause-glyph">Ⅱ</span> : <ArrowRight size={16} />}</button><IconButton label="Reset timer" onClick={() => resetFocus()}><RotateCcw size={16} /></IconButton></div>
              <div className="focus-footer"><span><ShieldCheck size={14} /> One tab. One task.</span><span>{focusSessions} sessions completed</span></div>
            </section>
          </div>

          <div className="content-grid lower-grid">
            <section className="panel activity-panel"><div className="panel-heading"><div><div className="panel-overline">CONSISTENCY OVER INTENSITY</div><h3>Your activity</h3></div><button className="period-chip" type="button" onClick={() => setPage('Insights')}>Last 5 weeks <ChevronDown size={13} /></button></div><ActivityHeatmap habits={habits} today={today} /><div className="heatmap-footer"><span>Less <i className="heat h0" /><i className="heat h1" /><i className="heat h2" /><i className="heat h3" /><i className="heat h4" /> More</span><button className="text-button" type="button" onClick={() => setPage('Insights')}>View insights <ArrowRight size={14} /></button></div></section>
            <section className="panel tasks-panel"><div className="panel-heading"><div><div className="panel-overline">DO THE NEXT RIGHT THING</div><h3>Today’s plan <span className="heading-count">{doneTasks}/{todayTasks.length}</span></h3></div><IconButton label="Add task" onClick={() => setShowTaskInput(true)}><Plus size={17} /></IconButton></div><div className="task-progress"><span style={{ width: `${todayTasks.length ? doneTasks / todayTasks.length * 100 : 0}%` }} /></div><div className="task-list">{todayTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} />)}{todayTasks.length === 0 && <p className="quiet-empty">Your day is open. Add one priority.</p>}</div>{showTaskInput ? <form className="task-add-form" onSubmit={addTask}><input autoFocus value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} placeholder="What needs doing?" aria-label="New task" /><IconButton label="Save task" onClick={() => { if (taskDraft.trim()) { setTasks((current) => [...current, { id: `t-${crypto.randomUUID()}`, title: taskDraft.trim(), completed: false, priority: 'Normal', estimate: 15, date: today }]); setTaskDraft(''); setShowTaskInput(false); } }}><Check size={16} /></IconButton><IconButton label="Cancel" onClick={() => setShowTaskInput(false)}><X size={16} /></IconButton></form> : <button className="add-inline task-add" type="button" onClick={() => setShowTaskInput(true)}><span><Plus size={15} /></span> Add a task</button>}</section>
          </div>
          <footer className="page-footer"><span><Sparkles size={13} /> Built for progress, not perfection.</span><span>Local-first • Your data stays in this browser</span></footer>
        </>}

        {page === 'Habits' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> BUILD YOUR BASELINE</div><h1>Habits, <span>by design.</span></h1><p className="welcome-sub">Make good actions easier to start and easier to repeat.</p></div><button className="primary-button" type="button" onClick={() => setShowHabitModal(true)}><Plus size={16} /> Create habit</button></section>
          <section className="habits-overview-strip"><div><span className="strip-label">ACTIVE ROUTINES</span><b>{habits.length.toString().padStart(2, '0')}</b></div><div><span className="strip-label">CHECKED IN TODAY</span><b>{doneToday}<small> / {dueHabits.length}</small></b></div><div><span className="strip-label">WEEKLY CONSISTENCY</span><b>{consistency}<small>%</small></b></div><div className="strip-quote"><Sparkles size={18} /><span>Let the minimum version keep the habit alive.</span></div></section>
          <section className="panel habits-library"><div className="panel-heading"><div><div className="panel-overline">YOUR PERSONAL SYSTEM</div><h3>All routines <span className="heading-count">{habits.length}</span></h3></div><div className="filter-pills"><button type="button" className={filter === 'All' ? 'selected' : ''} onClick={() => setFilter('All')}>All</button>{categories.map((cat) => <button type="button" key={cat} className={filter === cat ? 'selected' : ''} onClick={() => setFilter(cat)}>{cat}</button>)}</div></div><div className="library-list">{filteredHabits.map((habit) => <HabitDetail key={habit.id} habit={habit} today={today} onToggle={() => toggleHabit(habit.id)} onDelete={() => { setHabits((current) => current.filter((item) => item.id !== habit.id)); setToast('Habit removed'); }} />)}{filteredHabits.length === 0 && <EmptyState title="Nothing in this category yet" body="A good system starts small. Add a routine when you’re ready." action="Add habit" onAction={() => setShowHabitModal(true)} />}</div></section>
          <section className="principle-grid"><Principle icon={<Zap size={18} />} tag="MAKE IT EASY" title="Shrink the first step" copy="Choose a minimum version so starting takes less effort than avoiding it." /><Principle icon={<CalendarDays size={18} />} tag="MAKE IT OBVIOUS" title="Attach it to a cue" copy="Give your habit a reliable place in the day: after coffee, before lunch, or when you close your laptop." /><Principle icon={<Trophy size={18} />} tag="MAKE IT VISIBLE" title="Record each rep" copy="A small check-in creates feedback. Review the pattern, then adjust the plan—not your self-worth." /></section>
        </>}

        {page === 'Insights' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> THE PATTERNS BEHIND PROGRESS</div><h1>Notice what <span>works.</span></h1><p className="welcome-sub">Use the evidence you create to make tomorrow easier.</p></div><div className="review-date-chip"><CalendarDays size={15} /> Last 7 days</div></section>
          <section className="insights-stat-grid"><StatCard icon={<Activity size={17} />} label="Consistency" value={`${consistency}%`} detail="Of scheduled habit check-ins" tone="lime" /><StatCard icon={<CheckCheck size={17} />} label="Logged actions" value={String(totalWins)} detail="Across your habit history" tone="violet" /><StatCard icon={<Flame size={17} />} label="Active routines" value={String(activeStreaks)} detail="With a current streak" tone="orange" /></section>
          <section className="panel insight-activity"><div className="panel-heading"><div><div className="panel-overline">SHOWING UP ADDS UP</div><h3>Five weeks of activity</h3></div><div className="consistency-label"><span className="save-dot" /> {consistency}% this week</div></div><ActivityHeatmap habits={habits} today={today} large /></section>
          <div className="content-grid insight-bottom"><section className="panel"><div className="panel-heading"><div><div className="panel-overline">WHAT THE DATA SAYS</div><h3>Your strongest routines</h3></div><Trophy size={18} className="muted-icon" /></div><div className="ranking-list">{[...habits].sort((a, b) => getBestStreak(b, today) - getBestStreak(a, today)).slice(0, 4).map((habit, index) => <div className="ranking-row" key={habit.id}><span className="rank-number">0{index + 1}</span><span className={`rank-emoji tone-${habit.color}`}>{habit.emoji}</span><span className="rank-name"><b>{habit.name}</b><small>{habit.category} · {habit.frequency.toLowerCase()}</small></span><span className="rank-streak"><Flame size={13} /> {getCurrentStreak(habit, today)} days</span><div className="rank-bar"><span style={{ width: `${Math.min(100, getBestStreak(habit, today) / Math.max(1, bestStreak) * 100)}%` }} /></div></div>)}{habits.length === 0 && <p className="quiet-empty">Add routines to start seeing patterns.</p>}</div></section><section className="panel reflection-panel"><div className="panel-heading"><div><div className="panel-overline">YOUR NEXT EXPERIMENT</div><h3>Make it easier</h3></div><Sparkles size={17} className="accent-icon" /></div><div className="reflection-quote">“Success is often a better-designed starting point.”</div><div className="experiment-row"><span className="experiment-number">01</span><div><b>Pick one habit to protect</b><p>Which routine would make the rest of your day feel better?</p></div></div><div className="experiment-row"><span className="experiment-number">02</span><div><b>Make a specific if–then plan</b><p>“After <em>your cue</em>, I’ll do <em>the smallest version</em>.”</p></div></div><div className="experiment-row"><span className="experiment-number">03</span><div><b>Review, don’t judge</b><p>At week’s end, adjust the cue, effort, or timing that got in the way.</p></div></div><button className="secondary-button full-button" type="button" onClick={() => setPage('Habits')}>Tune my habits <ArrowRight size={15} /></button></section></div>
          <section className="research-note"><div className="research-icon"><BookOpen size={17} /></div><div><b>Grounded in behavior research</b><p>Progress monitoring, context cues, and specific if–then plans are established approaches—not guarantees. This tracker turns them into repeatable prompts.</p></div><button type="button" onClick={() => setToast('Research references are included in the project README.')}><CircleHelp size={16} /> About the method</button></section>
        </>}

        {page === 'Focus' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> ONE THING AT A TIME</div><h1>Make space for <span>deep work.</span></h1><p className="welcome-sub">Pick a task, choose a block, and give it your full attention.</p></div><div className="focus-session-badge"><span className="save-dot" /> {focusSessions} sessions completed</div></section>
          <section className="focus-page-grid"><div className="panel focus-large-panel"><div className="focus-large-top"><span className="section-kicker"><span className="kicker-mark"><Timer size={13} /></span> FOCUS TIMER</span><span className="live-pill"><span /> {focusRunning ? 'IN SESSION' : 'READY WHEN YOU ARE'}</span></div><div className="focus-large-ring" style={{ '--timer-progress': `${timerProgress * 100}%` } as CSSProperties}><div className="focus-ring-inner"><span className="focus-time">{timeText}</span><span className="focus-caption">{focusRunning ? 'STAY PRESENT' : 'YOUR NEXT BLOCK'}</span></div></div><div className="timer-presets large-presets">{[15, 25, 50].map((minutes) => <button type="button" key={minutes} className={focusPreset === minutes ? 'selected' : ''} onClick={() => resetFocus(minutes)}>{minutes} min</button>)}</div><div className="focus-large-actions"><button className="primary-button" type="button" onClick={() => { if (focusSeconds === 0) resetFocus(); else setFocusRunning((running) => !running); }}>{focusRunning ? 'Pause focus' : focusSeconds === 0 ? 'Start another' : 'Start focusing'} {focusRunning ? <span className="pause-glyph">Ⅱ</span> : <ArrowRight size={16} />}</button><button className="secondary-button" type="button" onClick={() => resetFocus() }><RotateCcw size={15} /> Reset</button></div><p className="timer-reassurance"><ShieldCheck size={15} /> Missed a block? Nothing is lost. Restart with the next minute.</p></div><div className="focus-side-column"><section className="panel choose-task-panel"><div className="panel-overline">YOUR NEXT PRIORITY</div><h3>What will you work on?</h3><p>Choose one task. Everything else can wait for this block.</p>{todayTasks.filter((task) => !task.completed).map((task) => <button key={task.id} type="button" className={`focus-task-choice ${focusTaskId === task.id ? 'selected' : ''}`} onClick={() => { setFocusTaskId(task.id); setToast(`Focus target selected: ${task.title}`); }}><span className="todo-box" /><span><b>{task.title}</b><small>{task.estimate} min · {task.priority} priority</small></span><ArrowUpRight size={15} /></button>)}{todayTasks.filter((task) => !task.completed).length === 0 && <p className="quiet-empty">Your task list is clear. Enjoy the breathing room.</p>}<button className="text-button" type="button" onClick={() => setPage('Today')}>Manage today’s plan <ArrowRight size={14} /></button></section><section className="panel focus-rule-panel"><span className="rule-icon"><Leaf size={17} /></span><div className="panel-overline">A GENTLER RULE</div><h3>Return your attention.</h3><p>Focus isn’t never getting distracted. It’s noticing and coming back—without making a story out of it.</p></section></div></section>
        </>}
      </main>

      {showHabitModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHabitModal(false); }}><section className="habit-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-top"><div><div className="panel-overline">START SMALL, STAY CONSISTENT</div><h2 id="modal-title">Create a habit</h2><p>Design the start, not just the finish line.</p></div><IconButton label="Close modal" onClick={() => setShowHabitModal(false)}><X size={18} /></IconButton></div><form onSubmit={addHabit}><label className="field-label">Habit name<input autoFocus value={habitDraft.name} onChange={(event) => setHabitDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. Practice coding" maxLength={70} required /></label><label className="field-label">Area of life<div className="category-select">{categories.map((category) => <button type="button" key={category} className={habitDraft.category === category ? `selected ${categoryTone[category]}` : ''} onClick={() => setHabitDraft((draft) => ({ ...draft, category }))}><span>{categoryEmoji[category]}</span>{category}</button>)}</div></label><label className="field-label">Frequency<select value={habitDraft.frequency} onChange={(event) => setHabitDraft((draft) => ({ ...draft, frequency: event.target.value as Frequency }))}>{frequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label><label className="field-label">When will you do it? <span className="field-hint">A reliable cue</span><input value={habitDraft.cue} onChange={(event) => setHabitDraft((draft) => ({ ...draft, cue: event.target.value }))} placeholder="After I finish breakfast…" maxLength={100} /></label><label className="field-label">Your minimum version <span className="field-hint">Make it hard to say no</span><input value={habitDraft.minimum} onChange={(event) => setHabitDraft((draft) => ({ ...draft, minimum: event.target.value }))} placeholder="Read one page, write one line…" maxLength={100} /></label><div className="if-then-preview"><span><Sparkles size={15} /></span><p><b>Your if–then plan</b><br />If {habitDraft.cue.trim() || 'my cue happens'}, then I’ll {habitDraft.minimum.trim() || 'do the smallest version'}.</p></div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowHabitModal(false)}>Cancel</button><button className="primary-button" type="submit"><Plus size={15} /> Create habit</button></div></form></section></div>}
      {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}<button type="button" aria-label="Dismiss message" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  );
}

function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <div className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-indicator"><ArrowUpRight size={14} /></span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>;
}

function HabitRow({ habit, completed, streak, onToggle }: { habit: Habit; completed: boolean; streak: number; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return <div className={`habit-row ${completed ? 'habit-complete' : ''}`}><button className={`habit-checkbox ${completed ? 'checked' : ''}`} type="button" onClick={onToggle} aria-label={`${completed ? 'Undo' : 'Complete'} ${habit.name}`}>{completed && <Check size={16} strokeWidth={2.7} />}</button><span className={`habit-emoji tone-${habit.color}`}>{habit.emoji}</span><div className="habit-row-copy"><div className="habit-title-line"><b>{habit.name}</b>{completed && <span className="logged-pill">DONE</span>}</div><p>{habit.cue ? `↳ ${habit.cue}` : habit.category}</p>{expanded && <p className="habit-insight-expanded">Minimum: {habit.minimum} · {habit.frequency}</p>}</div><div className="habit-streak"><Flame size={13}/><b>{streak}</b><small>day{streak === 1 ? '' : 's'}</small></div><button className="habit-more" type="button" aria-label={`Details for ${habit.name}`} title="Show habit details" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><MoreHorizontal size={18} /></button></div>;
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return <div className={`task-row ${task.completed ? 'task-complete' : ''}`}><button className={`todo-box ${task.completed ? 'checked' : ''}`} type="button" aria-label={`${task.completed ? 'Reopen' : 'Complete'} ${task.title}`} onClick={onToggle}>{task.completed && <Check size={13} />}</button><div className="task-copy"><b>{task.title}</b><span><Clock3 size={12} /> {task.estimate} min <i /> <span className={`priority-dot ${task.priority.toLowerCase()}`} /> {task.priority} priority</span></div><span className="task-arrow">{task.completed ? <CheckCheck size={15} /> : <ArrowDownRight size={15} />}</span></div>;
}

function ActivityHeatmap({ habits, today, large = false }: { habits: Habit[]; today: string; large?: boolean }) {
  const cells = Array.from({ length: 35 }, (_, index) => {
    const key = shiftKey(today, index - 34);
    const count = habits.filter((habit) => habit.logs[key]).length;
    const dueCount = habits.filter((habit) => isDue(habit, key)).length;
    const intensity = count === 0 ? 0 : count / Math.max(dueCount, 1) < 0.25 ? 1 : count / Math.max(dueCount, 1) < 0.5 ? 2 : count / Math.max(dueCount, 1) < 0.8 ? 3 : 4;
    return { key, count, intensity };
  });
  const monthLabels = Array.from({ length: 5 }, (_, weekIndex) => {
    const cell = cells[weekIndex * 7];
    const previous = weekIndex > 0 ? cells[(weekIndex - 1) * 7] : undefined;
    return weekIndex === 0 || cell.key.slice(5, 7) !== previous?.key.slice(5, 7)
      ? new Date(`${cell.key}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })
      : '';
  });
  return <div className={`heatmap ${large ? 'large-heatmap' : ''}`}><div className="heatmap-months">{monthLabels.map((month, index) => <span key={`${index}-${month}`}>{month}</span>)}</div><div className="heatmap-grid">{cells.map((cell) => <div key={cell.key} className={`heat-cell h${cell.intensity} ${cell.key === today ? 'today-cell' : ''}`} title={`${cell.key}: ${cell.count} habit${cell.count === 1 ? '' : 's'} completed`} />)}</div><div className="heatmap-days"><span>5 WKS AGO</span><span>4 WKS AGO</span><span>3 WKS AGO</span><span>2 WKS AGO</span><span>THIS WEEK</span></div></div>;
}

function HabitDetail({ habit, today, onToggle, onDelete }: { habit: Habit; today: string; onToggle: () => void; onDelete: () => void }) {
  const streak = getCurrentStreak(habit, today);
  const best = getBestStreak(habit, today);
  const last7 = Array.from({ length: 7 }, (_, index) => shiftKey(today, index - 6));
  return <div className="habit-detail-row"><div className={`detail-emoji tone-${habit.color}`}>{habit.emoji}</div><div className="detail-main"><div className="detail-title-row"><b>{habit.name}</b><span className={`category-tag ${categoryTone[habit.category]}`}>{habit.category}</span><span className="frequency-tag">{habit.frequency}</span></div><p>{habit.cue ? `Cue: ${habit.cue}` : 'Choose a consistent cue'} <span>·</span> Minimum: {habit.minimum}</p><div className="mini-week">{last7.map((key) => <span key={key} className={`${habit.logs[key] ? 'done' : ''} ${key === today ? 'current' : ''}`} title={`${key}: ${habit.logs[key] ? 'completed' : 'not logged'}`}>{new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'narrow' })}</span>)}</div></div><div className="detail-stats"><span><Flame size={14} /> <b>{streak}</b> current</span><span><Trophy size={14} /> <b>{best}</b> best</span></div><div className="detail-actions"><button className={`detail-check ${habit.logs[today] ? 'checked' : ''}`} onClick={onToggle} type="button">{habit.logs[today] ? <><Check size={14} /> Done today</> : <><Plus size={14} /> Check in</>}</button><button className="delete-button" onClick={onDelete} type="button" aria-label={`Delete ${habit.name}`} title="Delete habit"><X size={15} /></button></div></div>;
}

function Principle({ icon, tag, title, copy }: { icon: ReactNode; tag: string; title: string; copy: string }) {
  return <article className="principle-card"><span className="principle-icon">{icon}</span><span className="principle-tag">{tag}</span><h3>{title}</h3><p>{copy}</p></article>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return <div className="empty-state"><span><ListTodo size={21} /></span><b>{title}</b><p>{body}</p><button className="text-button" type="button" onClick={onAction}>{action} <ArrowRight size={14} /></button></div>;
}

export default App;