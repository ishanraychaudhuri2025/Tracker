import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen,
  CalendarDays, CalendarRange, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Flame, Focus,
  Gauge, Leaf, ListTodo, Moon, MoreHorizontal, Plus, RotateCcw, Settings2, ShieldCheck,
  Sparkles, Sun, Target, Timer, Trophy, X, Zap,
} from 'lucide-react';
import type { Category, Frequency, Habit, Page, Task } from './types';
import { PlannerPage, taskIsDone, taskOccursOn } from './Planner';

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
    { id: 't1', title: 'Review lecture notes', completed: true, priority: 'Normal', estimate: 15, date: today, category: 'Study' as const, time: '09:00', recurrence: 'None' as const },
    { id: 't2', title: 'Finish one project milestone', completed: false, priority: 'High', estimate: 45, date: today, category: 'Work' as const, time: '11:30', recurrence: 'None' as const },
    { id: 't3', title: 'Prepare tomorrow’s top 3', completed: false, priority: 'Low', estimate: 10, date: today, category: 'Personal' as const, time: '18:00', recurrence: 'Daily' as const, completedDates: [] },
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

function MomentumChart({ habits, today }: { habits: Habit[]; today: string }) {
  const [range, setRange] = useState<'7D' | '30D'>('7D');
  const count = range === '7D' ? 7 : 30;
  const series = Array.from({ length: count }, (_, index) => {
    const key = shiftKey(today, -(count - 1 - index));
    const due = habits.filter((habit) => isDue(habit, key));
    const done = due.filter((habit) => Boolean(habit.logs[key])).length;
    return { key, value: due.length ? Math.round((done / due.length) * 100) : 0, done, total: due.length };
  });
  const chartW = 660;
  const left = 18;
  const right = 16;
  const top = 18;
  const bottom = 186;
  const points = series.map((day, index) => {
    const x = left + index * ((chartW - left - right) / Math.max(1, series.length - 1));
    const y = bottom - (day.value / 100) * (bottom - top);
    return { ...day, x, y };
  });
  const linePath = points.map((point, index) => (index === 0 ? 'M ' : 'L ') + point.x.toFixed(2) + ' ' + point.y.toFixed(2)).join(' ');
  const areaPath = linePath + ' L ' + points[points.length - 1].x + ' ' + bottom + ' L ' + points[0].x + ' ' + bottom + ' Z';
  const ticks = range === '7D' ? [0, 1, 2, 3, 4, 5, 6] : [0, 5, 10, 15, 20, 25, 29];
  const labelFor = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day, 12).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  return <section className="analytics-chart-panel">
    <div className="analytics-chart-heading">
      <div><span className="analytics-section-index">ACTIVITY / TIMESERIES</span><h2>Consistency <span>trend</span></h2><p>Daily habit completion across your selected window.</p></div>
      <div className="analytics-chart-controls">
        <div className="analytics-chart-tabs"><button type="button" className={range==='7D'?'active':''} onClick={() => setRange('7D')}>7D</button><button type="button" className={range==='30D'?'active':''} onClick={() => setRange('30D')}>30D</button></div>
        <button type="button" className="analytics-chart-filter" onClick={() => setRange(range === '7D' ? '30D' : '7D')}><CalendarDays size={12}/> Range</button>
      </div>
    </div>
    <div className="analytics-chart-legend"><span><i className="analytics-legend-line"/> COMPLETION RATE</span><span><i className="analytics-legend-point"/> DAILY CHECK-INS</span><b>{series.length ? series[series.length-1].value : 0}% <small>LAST DAY</small></b></div>
    <div className="analytics-line-chart">
      <div className="analytics-y-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <svg viewBox="0 0 660 220" preserveAspectRatio="none" role="img" aria-label={range==='7D'?'Seven day consistency chart':'Thirty day consistency chart'}>
        <defs><linearGradient id="momentumArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#9cafff" stopOpacity=".27"/><stop offset="100%" stopColor="#9cafff" stopOpacity="0"/></linearGradient><linearGradient id="momentumLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#9aaaff"/><stop offset="55%" stopColor="#b6c2ff"/><stop offset="100%" stopColor="#c9ff75"/></linearGradient></defs>
        {[18,60,102,144,186].map((y)=><line key={y} x1="18" x2="644" y1={y} y2={y} className="analytics-grid-line"/> )}
        <path d={areaPath} fill="url(#momentumArea)" className="analytics-area-path"/>
        <path d={linePath} fill="none" stroke="url(#momentumLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="analytics-trend-path"/>
        {points.map((point)=><g key={point.key} className="analytics-chart-point"><circle cx={point.x} cy={point.y} r={range==='7D'?4:2.4} className="analytics-chart-point-halo"/><circle cx={point.x} cy={point.y} r={range==='7D'?2:1.2} className="analytics-chart-point-core"><title>{labelFor(point.key)}: {point.value}% · {point.done}/{point.total} complete</title></circle></g>)}
      </svg>
    </div>
    <div className="analytics-x-labels">{ticks.map((index)=><span key={series[index].key}>{labelFor(series[index].key)}</span>)}</div>
    <div className="analytics-chart-footer"><span><i/> Hover or tap a point for its daily result</span><button type="button" onClick={() => setRange(range==='7D'?'30D':'7D')}>Switch to {range==='7D'?'30 days':'7 days'} <ArrowRight size={12}/></button></div>
  </section>;
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
  const todayTasks = tasks.filter((task) => taskOccursOn(task, today)).map((task) => ({ ...task, completed: taskIsDone(task, today) }));
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
  const toggleHabit = (id: string, dayKey = today) => {
    const habit = habits.find((item) => item.id === id);
    if (!habit) return;
    const nextValue = !habit.logs[dayKey];
    setHabits((current) => current.map((item) => item.id === id ? { ...item, logs: { ...item.logs, [dayKey]: nextValue } } : item));
    if (nextValue) setToast('Logged: ' + habit.name + (dayKey === today ? '' : ' · ' + dayKey));
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

  const toggleTask = (id: string, dayKey = today) => setTasks((current) => current.map((task) => {
    if (task.id !== id) return task;
    if ((task.recurrence ?? 'None') === 'None') return task.date === dayKey ? { ...task, completed: !task.completed } : task;
    const completedDates = task.completedDates ?? [];
    return { ...task, completedDates: completedDates.includes(dayKey) ? completedDates.filter((key) => key !== dayKey) : [...completedDates, dayKey] };
  }));
  const addPlannerTask = (draft: import('./Planner').PlannerTaskDraft) => {
    setTasks((current) => [...current, { ...draft, id: `t-${crypto.randomUUID()}`, completed: false, completedDates: [] }]);
    setToast('Added to your calendar');
  };
  const resetFocus = (minutes = focusPreset) => { setFocusRunning(false); setFocusPreset(minutes); setFocusSeconds(minutes * 60); };
  const timeText = `${String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:${String(focusSeconds % 60).padStart(2, '0')}`;
  const timerProgress = 1 - focusSeconds / (focusPreset * 60 || 1);

  return (
    <div className={`app-shell ${dark ? 'dark-mode' : 'light-mode'}`}>
      <aside className="sidebar">
        <button className="brand-lockup" onClick={() => setPage('Today')} type="button" aria-label="Go to today">
          <span className="brand-mark"><BoltMark /></span>
          <span className="brand-name">streako<span className="brand-elite"> / OS</span></span>
        </button>
        <div className="workspace-label">YOUR SPACE <span className="live-dot" /></div>
        <nav className="nav-list" aria-label="Main navigation">
          {([
            { label: 'Today' as Page, icon: Gauge, sub: 'Your daily dashboard' },
            { label: 'Planner' as Page, icon: CalendarDays, sub: 'Daily, weekly & monthly' },
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
          <section className="analytics-page-header">
            <div>
              <div className="analytics-kicker"><span className="analytics-live"/> PERSONAL PERFORMANCE <i/> {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}</div>
              <h1>Habit <span>Analytics</span></h1>
              <p>Consistency, made visible. Review your patterns and make the next action easier.</p>
            </div>
            <div className="analytics-header-actions">
              <span className="analytics-saved"><i/> SAVED LOCALLY</span>
              <button type="button" className="secondary-button analytics-plain-button" onClick={() => setPage('Planner')}><CalendarDays size={14}/> Planner <ArrowUpRight size={13}/></button>
              <button type="button" className="primary-button analytics-create-button" onClick={() => setShowHabitModal(true)}><Plus size={15}/> New routine</button>
            </div>
          </section>

          <nav className="analytics-view-tabs" aria-label="Analytics sections">
            <button type="button" className="active" onClick={() => setPage('Today')}><BarChart3 size={13}/> Overview</button>
            <button type="button" onClick={() => setPage('Habits')}><Target size={13}/> Routines</button>
            <button type="button" onClick={() => setPage('Planner')}><CalendarRange size={13}/> Calendar</button>
            <button type="button" onClick={() => setPage('Focus')}><Focus size={13}/> Focus sessions</button>
            <button type="button" onClick={() => setPage('Insights')}><Activity size={13}/> Reports</button>
          </nav>

          <section className="analytics-metric-grid">
            <article className="analytics-metric-card analytics-metric-primary">
              <div className="analytics-metric-label"><span>DAILY COMPLETION</span><span className="analytics-metric-icon"><Activity size={14}/></span></div>
              <div className="analytics-metric-value">{completion}<small>%</small></div>
              <div className="analytics-metric-bottom"><span>{doneToday} of {dueHabits.length} routines complete</span><span className="analytics-trend-positive"><ArrowUpRight size={12}/> TODAY</span></div>
              <div className="analytics-mini-bars" aria-hidden="true">{[28,42,34,60,47,73,58,82,55,92,69,100].map((height,index) => <i key={index} style={{height: height + '%'}}/>)}</div>
            </article>
            <article className="analytics-metric-card">
              <div className="analytics-metric-label"><span>7-DAY CONSISTENCY</span><span className="analytics-metric-icon tone-blue"><CalendarDays size={14}/></span></div>
              <div className="analytics-metric-value">{consistency}<small>%</small></div>
              <div className="analytics-metric-bottom"><span>Last seven days</span><span className="analytics-micro-note">{consistency >= 70 ? 'ON TRACK' : 'BUILDING'}</span></div>
              <div className="analytics-metric-line analytics-line-blue"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
            </article>
            <article className="analytics-metric-card">
              <div className="analytics-metric-label"><span>ACTIVE STREAKS</span><span className="analytics-metric-icon tone-pink"><Flame size={14}/></span></div>
              <div className="analytics-metric-value">{String(activeStreaks).padStart(2,'0')}<small> routines</small></div>
              <div className="analytics-metric-bottom"><span>Habits in motion</span><span className="analytics-micro-note">LIVE</span></div>
              <div className="analytics-streak-steps" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/><i/></div>
            </article>
            <article className="analytics-metric-card">
              <div className="analytics-metric-label"><span>TOTAL CHECK-INS</span><span className="analytics-metric-icon tone-violet"><CheckCheck size={14}/></span></div>
              <div className="analytics-metric-value">{totalWins}<small> total</small></div>
              <div className="analytics-metric-bottom"><span>Every rep counts</span><span className="analytics-micro-note">ALL TIME</span></div>
              <div className="analytics-checkin-grid" aria-hidden="true">{Array.from({length:28},(_,index)=><i key={index} className={index < Math.min(28,totalWins) ? 'is-filled' : ''}/>)}</div>
            </article>
          </section>

          <section className="analytics-main-grid">
            <MomentumChart habits={habits} today={today}/>
            <aside className="analytics-side-stack">
              <section className="analytics-side-card analytics-today-card">
                <div className="analytics-card-heading"><div><span className="analytics-section-index">01 / TODAY</span><h2>Daily progress</h2></div><span className="analytics-live-tag"><i/> LIVE</span></div>
                <div className="analytics-daily-ring" style={{'--daily-percent': completion + '%'} as CSSProperties}>
                  <div><b>{completion}<small>%</small></b><span>COMPLETE</span></div>
                </div>
                <div className="analytics-today-stats"><span>Completed <b>{doneToday}</b></span><span>Remaining <b>{Math.max(0,dueHabits.length-doneToday)}</b></span></div>
                <button type="button" className="analytics-side-link" onClick={() => setPage('Habits')}>Review today's routines <ArrowRight size={13}/></button>
              </section>
              <section className="analytics-side-card analytics-next-card">
                <div className="analytics-card-heading"><div><span className="analytics-section-index">02 / NEXT ACTION</span><h2>Keep momentum</h2></div><span className="analytics-spark-icon"><Zap size={14}/></span></div>
                <p>{todayTasks.find((task) => !task.completed)?.title ?? dueHabits.find((habit) => !habit.logs[today])?.name ?? 'You have room to reset and plan.'}</p>
                <div className="analytics-next-meta"><Clock3 size={12}/><span>{todayTasks.some((task) => !task.completed) ? 'Start with a short focus block' : dueHabits.some((habit) => !habit.logs[today]) ? 'Try the minimum version' : 'Plan the next small win'}</span></div>
                <button type="button" className="analytics-side-link" onClick={() => setPage(todayTasks.some((task) => !task.completed) ? 'Focus' : 'Planner')}>Go to next step <ArrowUpRight size={13}/></button>
              </section>
            </aside>
          </section>

          <section className="analytics-table-panel">
            <div className="analytics-table-header">
              <div><span className="analytics-section-index">03 / ROUTINE PERFORMANCE</span><h2>Your routines <span>{habits.length.toString().padStart(2,'0')}</span></h2><p>Seven-day check-ins and current streaks at a glance.</p></div>
              <button type="button" className="analytics-plain-button" onClick={() => setPage('Habits')}>All routines <ArrowRight size={13}/></button>
            </div>
            <div className="analytics-table-scroll">
              <div className="analytics-table analytics-table-head"><span>ROUTINE</span><span>AREA</span><span>7-DAY ACTIVITY</span><span>CONSISTENCY</span><span>STREAK</span><span>TODAY</span></div>
              {habits.slice().sort((a,b) => getCurrentStreak(b,today)-getCurrentStreak(a,today)).map((habit) => {
                const dueDays = Array.from({length:7},(_,offset)=>shiftKey(today,-(6-offset))).filter((key)=>isDue(habit,key));
                const checked = dueDays.filter((key)=>Boolean(habit.logs[key])).length;
                const percent = dueDays.length ? Math.round((checked/dueDays.length)*100) : 0;
                return <div className="analytics-table analytics-table-row" key={habit.id}>
                  <button type="button" className="analytics-routine-name" onClick={() => {setPage('Habits');setFilter(habit.category);}}><span className={'analytics-routine-rank tone-' + habit.color}>{habit.emoji}</span><span><b>{habit.name}</b><small>{habit.cue || 'Build the routine'}</small></span></button>
                  <span className="analytics-area-tag">{habit.category}</span>
                  <div className="analytics-week-ticks">{Array.from({length:7},(_,offset)=>{const key=shiftKey(today,-(6-offset));const scheduled=isDue(habit,key);const logged=Boolean(habit.logs[key]);return <button type="button" key={key} disabled={!scheduled || key>today} className={'analytics-tick ' + (!scheduled?'not-due ':'') + (logged?'checked':'')} onClick={() => toggleHabit(habit.id,key)} aria-label={habit.name + ' ' + key + (logged?' completed':' not completed')} title={key + (logged?' · complete':scheduled?' · not logged':' · not scheduled')}>{logged?<Check size={10}/>:null}</button>;})}</div>
                  <div className="analytics-consistency-cell"><span>{percent}%</span><i><b style={{width:percent+'%'}}/></i></div>
                  <span className="analytics-streak-value"><Flame size={12}/>{getCurrentStreak(habit,today)}<small>d</small></span>
                  <button type="button" className={'analytics-today-toggle ' + (habit.logs[today]?'checked':'')} onClick={() => toggleHabit(habit.id)} aria-label={(habit.logs[today]?'Uncheck ':'Complete ') + habit.name + ' today'}>{habit.logs[today]?<Check size={12}/>:<Plus size={12}/>}</button>
                </div>;
              })}
              {habits.length===0 && <div className="analytics-no-habits">Your data will appear here when you add a routine. <button type="button" onClick={() => setShowHabitModal(true)}>Create first routine <Plus size={12}/></button></div>}
            </div>
            <div className="analytics-table-footer"><span><i className="analytics-footer-dot filled"/> Complete</span><span><i className="analytics-footer-dot"/> Not logged</span><span><i className="analytics-footer-dot outline"/> Not scheduled</span><button type="button" onClick={() => setPage('Planner')}>View all dates <ArrowUpRight size={12}/></button></div>
          </section>

          <footer className="analytics-footer"><span><BoltMark/> STREAKO ANALYTICS / PERSONAL DATA SYSTEM</span><span>YOUR PROGRESS, WITHOUT THE NOISE.</span></footer>
        </>}
  
        {page === 'Planner' && <PlannerPage habits={habits} tasks={tasks} today={today} onToggleHabit={toggleHabit} onToggleTask={toggleTask} onAddTask={addPlannerTask} />}

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

function BoltMark() {
  return <svg className="bolt-mark-svg" viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <path d="M4 23.1 14.8 12l-2.2 7.1L29.7 5 21.8 20.4l10-5.1L17.2 30.1l2.1-8.1L7.5 29.2l4.1-6.1Z" fill="currentColor" />
  </svg>;
}
function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <div className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-indicator"><ArrowUpRight size={14} /></span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>;
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