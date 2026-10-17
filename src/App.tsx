import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen, Brain, Coffee, Compass, Code2, Droplets, Dumbbell, Flower2,
  CalendarDays, Check, CheckCheck, CircleHelp, Clock3, Flame, Focus,
  Gauge, Heart, Leaf, ListTodo, LogOut, Moon, MoreHorizontal, Pencil, PenTool, Plus, RotateCcw, Settings2, ShieldCheck,
  Sparkles, Sun, Target, Timer, Trophy, X, Zap,
} from 'lucide-react';
import type { Category, Frequency, Habit, Page, Task } from './types';
import { PlannerPage, taskIsDone, taskOccursOn } from './Planner';
import TasksPage from './TasksPage';
import AuthScreen from './components/AuthScreen';
import { supabase, supabaseConfigured } from './lib/supabase';

const STORAGE_KEY = 'streako-elite-v2';
const todayKey = () => toKey(new Date());
const toKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shiftKey = (key: string, delta: number) => {
  const [year, month, day] = key.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + delta);
  return toKey(next);
};
const categories: Category[] = ['Mind', 'Body', 'Craft', 'Life'];
const frequencies: Frequency[] = ['Daily', 'Weekdays', 'Weekends', '3× / week', 'Custom'];
const categoryTone: Record<Category, string> = { Mind: 'violet', Body: 'violet', Craft: 'violet', Life: 'violet' };

function CategoryGlyph({ category, size = 14 }: { category: Category; size?: number }) {
  if (category === 'Mind') return <Brain size={size} strokeWidth={1.7} />;
  if (category === 'Body') return <Dumbbell size={size} strokeWidth={1.7} />;
  if (category === 'Craft') return <PenTool size={size} strokeWidth={1.7} />;
  return <Compass size={size} strokeWidth={1.7} />;
}

function HabitGlyph({ habit, size = 17 }: { habit: Habit; size?: number }) {
  const name = habit.name.toLowerCase();
  const iconProps = { size, strokeWidth: 1.8, 'aria-hidden': true as const };
  if (/(work.?out|gym|exercise|fitness|training|strength|lift)/.test(name)) return <Dumbbell {...iconProps} />;
  if (/(meditat|breath|mindful|calm|reflection|gratitude)/.test(name)) return <Flower2 {...iconProps} />;
  if (/(read|book|study|learn|language|course|lecture)/.test(name)) return <BookOpen {...iconProps} />;
  if (/(code|program|develop|software|coding|algorithm)/.test(name)) return <Code2 {...iconProps} />;
  if (/(write|journal|draw|design|craft|create|sketch)/.test(name)) return <PenTool {...iconProps} />;
  if (/(water|hydrate|drink)/.test(name)) return <Droplets {...iconProps} />;
  if (/(coffee|morning|routine)/.test(name)) return <Coffee {...iconProps} />;
  if (/(walk|run|steps|outdoor|nature|stretch)/.test(name)) return <Activity {...iconProps} />;
  if (/(family|friend|connect|care|health)/.test(name)) return <Heart {...iconProps} />;
  if (habit.category === 'Mind') return <Brain {...iconProps} />;
  if (habit.category === 'Body') return <Dumbbell {...iconProps} />;
  if (habit.category === 'Craft') return <PenTool {...iconProps} />;
  return <Compass {...iconProps} />;
}
type ActiveReminder = { habitId: string; habitName: string; reminderTime: string; reminderSoundUrl?: string };

type ReminderMedia = { provider: 'YouTube' | 'Spotify'; originalUrl: string; embedUrl: string };

function parseReminderMedia(input?: string): ReminderMedia | null {
  if (!input?.trim()) return null;
  try {
    const parsed = new URL(input.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const videoId = host === 'youtu.be'
        ? segments[0]
        : parsed.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(segments[0] || '') ? segments[1] : undefined);
      if (!videoId || !/^[a-zA-Z0-9_-]{6,20}$/.test(videoId)) return null;
      return {
        provider: 'YouTube',
        originalUrl: parsed.toString(),
        embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&mute=0&controls=1&rel=0&playsinline=1&loop=1&playlist=' + videoId + '&enablejsapi=1&origin=' + encodeURIComponent(window.location.origin),
      };
    }
    if (host === 'open.spotify.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const types = ['track', 'album', 'playlist', 'episode', 'show'];
      const typeIndex = segments.findIndex((segment) => types.includes(segment));
      const type = segments[typeIndex];
      const mediaId = segments[typeIndex + 1];
      if (!type || !mediaId || !/^[a-zA-Z0-9]+$/.test(mediaId)) return null;
      return {
        provider: 'Spotify',
        originalUrl: parsed.toString(),
        embedUrl: 'https://open.spotify.com/embed/' + type + '/' + mediaId + '?utm_source=generator&autoplay=1',
      };
    }
  } catch {
    return null;
  }
  return null;
}

const formatReminderTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

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
        <defs><linearGradient id="momentumArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#b78aff" stopOpacity=".24"/><stop offset="100%" stopColor="#b78aff" stopOpacity="0"/></linearGradient><linearGradient id="momentumLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#8e58d9"/><stop offset="55%" stopColor="#b78aff"/><stop offset="100%" stopColor="#dfc6ff"/></linearGradient></defs>
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

function habitEndKey(habit: Habit): string | null {
  const durationMonths = Number(habit.durationMonths || 0);
  const durationStart = habit.durationStartedAt || habit.createdAt;
  if (!durationMonths || !durationStart) return null;
  const [year, month, day] = durationStart.split('-').map(Number);
  const monthIndex = year * 12 + (month - 1) + durationMonths;
  const endYear = Math.floor(monthIndex / 12);
  const endMonthIndex = monthIndex % 12;
  const lastDay = new Date(endYear, endMonthIndex + 1, 0, 12).getDate();
  const endDay = Math.min(day, lastDay);
  return toKey(new Date(endYear, endMonthIndex, endDay, 12));
}

function isDue(habit: Habit, dayKey: string): boolean {
  if (habit.createdAt && dayKey < habit.createdAt) return false;
  const durationStart = habit.durationStartedAt || habit.createdAt;
  if (habit.durationMonths && durationStart && dayKey < durationStart) return false;
  const endKey = habitEndKey(habit);
  if (endKey && dayKey >= endKey) return false;
  const day = new Date(`${dayKey}T12:00:00`).getDay();
  if (habit.frequency === 'Weekdays') return day >= 1 && day <= 5;
  if (habit.frequency === 'Weekends') return day === 0 || day === 6;
  if (habit.frequency === '3× / week') return [2, 4, 6].includes(day);
  if (habit.frequency === 'Custom') return Boolean(habit.scheduleDays?.includes(day));
  return true;
}

function getCurrentStreak(habit: Habit, dayKey = todayKey()): number {
  let count = 0;
  let cursor = habit.logs[dayKey] ? dayKey : shiftKey(dayKey, -1);
  let guard = 0;
  // Streaks count scheduled repetitions, not calendar days the habit was never due.
  while (cursor >= habit.createdAt && guard < 1500) {
    if (!isDue(habit, cursor)) {
      cursor = shiftKey(cursor, -1);
      guard += 1;
      continue;
    }
    if (!habit.logs[cursor]) break;
    count += 1;
    cursor = shiftKey(cursor, -1);
    guard += 1;
  }
  return count;
}

function getBestStreak(habit: Habit, dayKey = todayKey()): number {
  let best = 0;
  let current = 0;
  let cursor = habit.createdAt || Object.keys(habit.logs).sort()[0] || dayKey;
  let guard = 0;
  while (cursor <= dayKey && guard < 20000) {
    if (!isDue(habit, cursor)) {
      cursor = shiftKey(cursor, 1);
      guard += 1;
      continue;
    }
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
  const [habits, setHabits] = useState<Habit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState<Page>('Today');
  const [filter, setFilter] = useState<'All' | Category>('All');
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const emptyHabitDraft = { name: '', category: 'Craft' as Category, frequency: 'Daily' as Frequency, cue: '', minimum: '', reminderEnabled: false, reminderTime: '09:00', reminderSoundUrl: '', customDays: [1, 2, 3, 4, 5], durationMonths: 0, timerMinutes: 0 };
  const [habitDraft, setHabitDraft] = useState(emptyHabitDraft);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);
  const [reminderSoundStopped, setReminderSoundStopped] = useState(false);
  const [reminderMediaReload, setReminderMediaReload] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const firedRemindersRef = useRef<Set<string>>(new Set());
  const snoozeTimeoutRef = useRef<number | null>(null);
  const [dark, setDark] = useState(true);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusPreset, setFocusPreset] = useState(25);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusSessions, setFocusSessions] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [workspaceReady, setWorkspaceReady] = useState(!supabaseConfigured);
  const [cloudStatus, setCloudStatus] = useState(supabaseConfigured ? 'Connecting…' : 'Saved locally');
  const [cloudError, setCloudError] = useState('');
  const today = todayKey();
  const activeReminderMedia = parseReminderMedia(activeReminder?.reminderSoundUrl);

  const unlockReminderAudio = () => {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    if (!audioContextRef.current) audioContextRef.current = new window.AudioContext();
    const context = audioContextRef.current;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
  };

  const playReminderMelody = () => {
    const context = audioContextRef.current;
    if (!context) return;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    [784, 988, 1175, 988].forEach((frequency, index) => {
      const startAt = context.currentTime + index * 0.22;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.15, startAt + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.19);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.21);
    });
  };

  const enableDesktopNotifications = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      setToast('Desktop notifications are not supported in this browser.');
      return;
    }
    if (Notification.permission === 'denied') {
      setNotificationPermission('denied');
      setToast('Notifications are blocked. Open the site controls beside the address bar and allow notifications for Cadence.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      setToast(permission === 'granted'
        ? 'Desktop notifications enabled for habit reminders.'
        : 'Notifications were not allowed. Your in-app sound reminder can still work while Cadence is open.');
    } catch {
      setToast('The browser could not request notification permission. Check this site’s browser settings.');
    }
  };

  const stopReminderAlarm = () => {
    setActiveReminder(null);
    setReminderSoundStopped(false);
    setReminderMediaReload(0);
    if (snoozeTimeoutRef.current !== null) {
      window.clearTimeout(snoozeTimeoutRef.current);
      snoozeTimeoutRef.current = null;
    }
  };

  const snoozeReminderAlarm = () => {
    if (!activeReminder) return;
    const reminder = activeReminder;
    setActiveReminder(null);
    if (snoozeTimeoutRef.current !== null) window.clearTimeout(snoozeTimeoutRef.current);
    snoozeTimeoutRef.current = window.setTimeout(() => {
      setReminderSoundStopped(false);
      setReminderMediaReload(0);
      setActiveReminder(reminder);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Time for ${reminder.habitName}`, { body: 'Your snoozed Cadence habit reminder is here.' });
        } catch { /* In-app alarm still appears if desktop notifications are unavailable. */ }
      }
      snoozeTimeoutRef.current = null;
    }, 10 * 60 * 1000);
    setToast('Reminder snoozed for 10 minutes. Keep Cadence open.');
  };

  useEffect(() => {
    // Remove pre-reset demo workspaces from this browser. Do not reuse these
    // snapshots across accounts after the fresh-start reset.
    const legacyKeys = new Set(['streako-elite-v1']);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && (legacyKeys.has(key) || key.startsWith('streako-elite-v1:'))) {
        localStorage.removeItem(key);
      }
    }
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAuthReady(true);
      setWorkspaceReady(true);
      setCloudStatus('Saved locally');
      return undefined;
    }

    let active = true;
    let requestVersion = 0;
    const hydrateWorkspace = async (session: Session) => {
      const version = ++requestVersion;
      setAuthReady(false);
      setWorkspaceReady(false);
      setCloudError('');
      setCloudStatus('Loading workspace…');
      try {
        const { data, error } = await client
          .from('tracker_workspaces')
          .select('habits, tasks, focus_sessions, preferences')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (!active || version !== requestVersion) return;
        if (error) throw error;

        let workspace = data;
        if (!workspace) {
          // Every new account starts with genuinely empty progress. Never import
          // demo content or browser-local data into a different account.
          const { data: created, error: createError } = await client
            .from('tracker_workspaces')
            .insert({
              user_id: session.user.id,
              habits: [],
              tasks: [],
              focus_sessions: 0,
              preferences: { dark: true },
            })
            .select('habits, tasks, focus_sessions, preferences')
            .single();
          if (!active || version !== requestVersion) return;
          if (createError) throw createError;
          workspace = created;
        }

        setHabits(Array.isArray(workspace.habits) ? workspace.habits as Habit[] : []);
        setTasks(Array.isArray(workspace.tasks) ? workspace.tasks as Task[] : []);
        setFocusSessions(typeof workspace.focus_sessions === 'number' ? workspace.focus_sessions : 0);
        const preferences = workspace.preferences as { dark?: unknown } | null;
        if (typeof preferences?.dark === 'boolean') setDark(preferences.dark);
        setAuthSession(session);
        setWorkspaceReady(true);
        setAuthReady(true);
        setCloudStatus('Cloud synced');
      } catch (caught) {
        if (!active || version !== requestVersion) return;
        const message = caught instanceof Error ? caught.message : 'Unknown workspace error';
        setCloudError(message);
        setCloudStatus('Sync issue');
        setAuthSession(session);
        setWorkspaceReady(false);
        setAuthReady(true);
      }
    };

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'PASSWORD_RECOVERY' && session) {
        requestVersion += 1;
        setAuthSession(session);
        setPasswordRecovery(true);
        setAuthReady(true);
        setWorkspaceReady(false);
        setCloudStatus('Password reset');
        return;
      }
      if (event === 'SIGNED_OUT' || !session) {
        requestVersion += 1;
        setAuthSession(null);
        setPasswordRecovery(false);
        setAuthReady(true);
        setWorkspaceReady(false);
        setCloudError('');
        setCloudStatus('Signed out');
        return;
      }
      setAuthSession(session);
      if (event === 'USER_UPDATED') setPasswordRecovery(false);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void hydrateWorkspace(session);
      }
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setCloudError(error.message);
        setCloudStatus('Auth issue');
        setAuthReady(true);
        return;
      }
      if (data.session) {
        setAuthSession(data.session);
        void hydrateWorkspace(data.session);
      } else {
        setAuthSession(null);
        setAuthReady(true);
        setWorkspaceReady(false);
        setCloudStatus('Signed out');
      }
    });

    return () => {
      active = false;
      requestVersion += 1;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!supabaseConfigured || !client) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits, tasks, focusSessions, preferences: { dark } }));
      return undefined;
    }
    if (!authSession || !workspaceReady) return undefined;

    const snapshot = { habits, tasks, focusSessions, preferences: { dark } };
    localStorage.setItem(STORAGE_KEY + ':' + authSession.user.id, JSON.stringify(snapshot));
    setCloudStatus('Syncing…');
    const timeout = window.setTimeout(() => {
      void client.from('tracker_workspaces').upsert({
        user_id: authSession.user.id,
        habits,
        tasks,
        focus_sessions: focusSessions,
        preferences: { dark },
      }).then(({ error }) => {
        if (error) {
          setCloudStatus('Sync issue');
          setCloudError(error.message);
        } else {
          setCloudStatus('Cloud synced');
          setCloudError('');
        }
      });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [habits, tasks, focusSessions, dark, authSession?.user.id, workspaceReady]);

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
    if (!habits.some((habit) => habit.reminderEnabled && habit.reminderTime)) return undefined;
    const checkReminders = () => {
      const now = new Date();
      const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const day = toKey(now);
      const due = habits.filter((habit) => habit.reminderEnabled && isDue(habit, day) && habit.reminderTime === currentTime && !habit.logs[day]);
      const fresh = due.filter((habit) => !firedRemindersRef.current.has(`${habit.id}:${day}:${currentTime}`));
      if (!fresh.length) return;
      fresh.forEach((habit) => {
        firedRemindersRef.current.add(`${habit.id}:${day}:${currentTime}`);
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const notification = new Notification(`Time for ${habit.name}`, {
              body: 'A small step is enough. Open Cadence to check in.',
              tag: `streako-${habit.id}-${day}`,
            });
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          } catch { /* The in-app alarm remains available if notification delivery is blocked. */ }
        }
      });
      setActiveReminder((current) => current || {
        habitId: fresh[0].id,
        habitName: fresh[0].name,
        reminderTime: currentTime,
        reminderSoundUrl: fresh[0].reminderSoundUrl,
      });
    };
    const interval = window.setInterval(checkReminders, 10000);
    checkReminders();
    return () => window.clearInterval(interval);
  }, [habits]);

  useEffect(() => {
    if (!activeReminder || reminderSoundStopped) return undefined;
    // Repeat the native alarm while the reminder is open. Linked YouTube audio
    // also attempts autoplay + loop; this chime is the fallback if the browser
    // refuses audible autoplay for the embedded player.
    playReminderMelody();
    const interval = window.setInterval(playReminderMelody, 2800);
    return () => window.clearInterval(interval);
  }, [activeReminder, reminderSoundStopped]);

  useEffect(() => () => {
    if (snoozeTimeoutRef.current !== null) window.clearTimeout(snoozeTimeoutRef.current);
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const content = document.querySelector('.main-content');
    if (!content) return undefined;

    const panels = Array.from(content.querySelectorAll<HTMLElement>([
      '.analytics-metric-card',
      '.analytics-chart-panel',
      '.analytics-side-card',
      '.analytics-table-panel',
      '.panel',
      '.hero-card',
      '.weekly-tracker-panel',
      '.planner-calendar-panel',
      '.planner-summary-panel',
      '.planner-activity-panel',
      '.habits-library',
      '.principle-card',
      '.insight-activity',
      '.research-note',
      '.focus-large-panel',
      '.choose-task-panel',
      '.focus-rule-panel',
    ].join(',')));

    panels.forEach((panel, index) => {
      panel.classList.add('scroll-reveal');
      panel.style.setProperty('--reveal-delay', (Math.min(index % 4, 3) * 55) + 'ms');
    });

    const showAll = () => panels.forEach((panel) => panel.classList.add('is-visible'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      showAll();
      return () => {
        panels.forEach((panel) => {
          panel.classList.remove('scroll-reveal', 'is-visible');
          panel.style.removeProperty('--reveal-delay');
        });
      };
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });

    panels.forEach((panel) => observer.observe(panel));
    return () => {
      observer.disconnect();
      panels.forEach((panel) => {
        panel.classList.remove('scroll-reveal', 'is-visible');
        panel.style.removeProperty('--reveal-delay');
      });
    };
  }, [page]);

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
  const tasksDoneToday = todayTasks.filter((task) => task.completed).length;
  const totalTodayActions = dueHabits.length + todayTasks.length;
  const completedTodayActions = doneToday + tasksDoneToday;
  const todayProgress = totalTodayActions ? Math.round((completedTodayActions / totalTodayActions) * 100) : 0;
  const nextTask = todayTasks.find((task) => !task.completed);
  const nextHabit = dueHabits.find((habit) => !habit.logs[today]);
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

  const openEditHabit = (habit: Habit) => {
    setEditingHabitId(habit.id);
    setHabitDraft({
      name: habit.name,
      category: habit.category,
      frequency: habit.frequency,
      cue: habit.cue,
      minimum: habit.minimum,
      reminderEnabled: Boolean(habit.reminderEnabled),
      reminderTime: habit.reminderTime || '09:00',
      reminderSoundUrl: habit.reminderSoundUrl || '',
      customDays: habit.scheduleDays ?? [1, 2, 3, 4, 5],
      durationMonths: habit.durationMonths ?? 0,
      timerMinutes: habit.timerMinutes ?? 0,
    });
    setShowHabitModal(true);
  };

  const openCreateHabit = () => {
    setEditingHabitId(null);
    setHabitDraft({ ...emptyHabitDraft });
    setShowHabitModal(true);
  };

  const addHabit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = habitDraft.name.trim();
    if (!name) return;
    if (habitDraft.frequency === 'Custom' && habitDraft.customDays.length === 0) {
      setToast('Choose at least one day for this custom habit.');
      return;
    }
    const reminderMedia = parseReminderMedia(habitDraft.reminderSoundUrl);
    if (habitDraft.reminderSoundUrl.trim() && !reminderMedia) {
      setToast('Add a valid YouTube or Spotify track, album, or playlist link.');
      return;
    }
    const tone = categoryTone[habitDraft.category];
    const emoji = habitDraft.category === 'Body' ? '↗' : habitDraft.category === 'Mind' ? '◌' : habitDraft.category === 'Life' ? '✳' : '⌘';
    const existing = editingHabitId ? habits.find((habit) => habit.id === editingHabitId) : undefined;
    const durationMonths = Number(habitDraft.durationMonths) || undefined;
    const durationStartedAt = existing && existing.durationMonths === durationMonths
      ? (existing.durationStartedAt || existing.createdAt)
      : today;
    const next: Habit = {
      id: existing?.id ?? 'h-' + crypto.randomUUID(),
      name,
      emoji,
      category: habitDraft.category,
      frequency: habitDraft.frequency,
      cue: habitDraft.cue.trim() || 'Choose a consistent moment',
      minimum: habitDraft.minimum.trim() || 'Do the smallest version for two minutes',
      logs: existing?.logs ?? {},
      createdAt: existing?.createdAt ?? today,
      color: tone,
      reminderEnabled: habitDraft.reminderEnabled,
      ...(habitDraft.reminderEnabled ? { reminderTime: habitDraft.reminderTime } : {}),
      ...(habitDraft.reminderEnabled && reminderMedia ? { reminderSoundUrl: reminderMedia.originalUrl } : {}),
      ...(habitDraft.frequency === 'Custom' ? { scheduleDays: [...habitDraft.customDays] } : { scheduleDays: undefined }),
      durationMonths,
      durationStartedAt,
      timerMinutes: Math.min(180, Math.max(0, Number(habitDraft.timerMinutes) || 0)) || undefined,
    };
    if (existing) {
      setHabits((current) => current.map((habit) => habit.id === existing.id ? next : habit));
    } else {
      setHabits((current) => [next, ...current]);
    }
    const wasEditing = Boolean(existing);
    const reminderMessage = habitDraft.reminderEnabled
      ? ' Reminder set for ' + formatReminderTime(habitDraft.reminderTime) + '; keep Cadence open for alerts.'
      : '';
    setHabitDraft({ ...emptyHabitDraft });
    setEditingHabitId(null);
    setShowHabitModal(false);
    setPage('Habits');
    setToast((wasEditing ? 'Habit updated.' : 'Your new habit is ready.') + reminderMessage);
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

  if (supabaseConfigured && passwordRecovery) return <AuthScreen initialMode="update" />;
    if (supabaseConfigured && !authReady) {
    return <div className="auth-loading-screen"><div className="auth-loading-mark"><CadenceMark /></div><h1>Preparing your workspace</h1><p>Securely loading your routines and task history…</p></div>;
  }
  if (supabaseConfigured && !authSession) return <AuthScreen />;
  if (supabaseConfigured && authSession && !workspaceReady) {
    return <div className="auth-loading-screen"><div className="auth-loading-mark"><ShieldCheck size={21} /></div><h1>Workspace sync needs attention</h1><p>We signed you in, but couldn’t load your saved workspace. Your data was not overwritten.</p><div className="auth-workspace-error">{cloudError || 'Check that the Supabase tracker_workspaces migration has been applied and the project environment variables are correct.'}</div><div className="auth-loading-actions"><button className="auth-retry-button" type="button" onClick={() => window.location.reload()}>Retry connection</button><button className="auth-retry-button secondary" type="button" onClick={() => { if (supabase) void supabase.auth.signOut(); }}>Sign out</button></div></div>;
  }

  return (
    <div className={`app-shell ${dark ? 'dark-mode' : 'light-mode'}`}>
      <aside className="sidebar">
        <button className="brand-lockup cadence-brand-lockup" onClick={() => { setPage('Today'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} type="button" aria-label="Go to Cadence dashboard">
          <img className="cadence-brand-icon" src="/cadence-icon.svg" alt="" aria-hidden="true" />
          <img className="cadence-brand-wordmark" src="/cadence-wordmark.svg" alt="" aria-hidden="true" />
        </button>
        <div className="workspace-label">YOUR SPACE <span className="live-dot" /></div>
        <nav className="nav-list" aria-label="Main navigation">
          {([
            { label: 'Today' as Page, icon: Gauge, sub: 'Your daily dashboard' },
            { label: 'Tasks' as Page, icon: ListTodo, sub: 'Plan and finish work' },
            { label: 'Planner' as Page, icon: CalendarDays, sub: 'Daily, weekly & monthly' },
            { label: 'Habits' as Page, icon: Target, sub: 'Routines that stick' },
            { label: 'Insights' as Page, icon: BarChart3, sub: 'Patterns & progress' },
            { label: 'Focus' as Page, icon: Focus, sub: 'Make room for deep work' },
          ]).map(({ label, icon: Icon, sub }) => (
            <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => { setPage(label); window.scrollTo({ top: 0, behavior: 'smooth' }); }} type="button" aria-current={page === label ? 'page' : undefined}>
              <span className="nav-icon"><Icon size={17} /></span><span className="nav-copy"><b>{label}</b><small>{sub}</small></span>
              {label === 'Today' && <span className="nav-count">{Math.max(0, dueHabits.length - doneToday)}</span>}
              {label === 'Tasks' && <span className="nav-count">{tasks.filter((task) => taskOccursOn(task, today) && !taskIsDone(task, today)).length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-section-head"><span>YOUR ROUTINES</span><IconButton label="Create a habit" onClick={openCreateHabit}><Plus size={15} /></IconButton></div>
        <div className="routine-list">
          {habits.slice(0, 5).map((habit) => (
            <button className="routine-mini" key={habit.id} type="button" onClick={() => { setPage('Habits'); setFilter(habit.category); }}>
              <span className="mini-emoji tone-violet"><HabitGlyph habit={habit} size={13} /></span><span>{habit.name}</span><span className={`mini-check ${habit.logs[today] ? 'checked' : ''}`}>{habit.logs[today] ? <Check size={11} /> : ''}</span>
            </button>
          ))}
          {habits.length === 0 && <p className="sidebar-empty">Your first routine starts here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={15} /></div><div><b>Small counts.</b><p>Never miss twice. Restart gently.</p></div></div>
          <div className="profile-row">
            <span className="avatar">{authSession?.user.email?.slice(0, 2).toUpperCase() || 'IR'}</span><span className="profile-copy"><b>{authSession?.user.email?.split('@')[0] || 'Your workspace'}</b><small>{authSession ? 'Synced workspace' : 'Personal edition'}</small></span>{authSession && supabase ? <button type="button" className="profile-signout" aria-label="Sign out" title="Sign out" onClick={() => { void supabase?.auth.signOut(); }}><LogOut size={15}/></button> : <MoreHorizontal size={18} className="muted-icon" />}
          </div>
          <div className="sidebar-tools"><button type="button" onClick={() => setDark((current) => !current)}><span>{dark ? <Sun size={15} /> : <Moon size={15} />}</span>{dark ? 'Soft violet appearance' : 'Midnight appearance'}</button><button type="button" onClick={() => setToast(authSession ? 'Your workspace syncs to your account.' : 'Cloud auth is not connected yet.')}><Settings2 size={15} />Preferences</button>{!supabaseConfigured && <span className="local-mode-note">LOCAL MODE · CLOUD NOT CONNECTED</span>}</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{page}</b></div>
          <div className="topbar-actions"><span className="local-save" title={cloudError || cloudStatus}><span className="save-dot" /> {cloudStatus}</span><IconButton label="Notifications and reminders" onClick={() => { const count = habits.filter((habit) => habit.reminderEnabled).length; setToast(count ? `${count} habit reminder${count === 1 ? '' : 's'} scheduled. Cadence must remain open for alerts.` : 'No reminders yet. Enable one when creating a habit.'); }}><Bell size={17} /></IconButton><button className="date-chip" type="button" onClick={() => { setPage('Planner'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={'Open planner for ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} title="Open planner"><CalendarDays size={15} />{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<ArrowUpRight size={12} /></button></div>
        </header>

        {page === 'Today' && <>
          <section className="today-page-header">
            <div>
              <div className="today-eyebrow"><span /> YOUR DAY · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</div>
              <h1>Your day, <span>in rhythm.</span></h1>
              <p>Start with what's scheduled. Keep the next step small and clear.</p>
            </div>
            <div className="today-header-actions">
              <button type="button" className="secondary-button" onClick={() => setPage('Planner')}><CalendarDays size={15} /> Plan ahead <ArrowUpRight size={13} /></button>
              <button type="button" className="secondary-button" onClick={() => setPage('Tasks')}><Plus size={15} /> Add task</button>
              <button type="button" className="primary-button" onClick={openCreateHabit}><Plus size={15} /> New habit</button>
            </div>
          </section>
          <section className="today-progress-overview" aria-label="Today's overall progress">
            <div className="today-progress-copy">
              <span className="today-section-kicker">DAILY PROGRESS</span>
              <div className="today-progress-number">{totalTodayActions ? todayProgress + '%' : '—'}<span>{totalTodayActions ? 'complete' : 'no actions scheduled'}</span></div>
              <p>{totalTodayActions ? (totalTodayActions - completedTodayActions === 0 ? 'Everything scheduled for today is complete.' : (totalTodayActions - completedTodayActions) + ' small ' + (totalTodayActions - completedTodayActions === 1 ? 'action remains' : 'actions remain') + ' for today.') : 'A clear day. Add a task or routine only if it would help.'}</p>
            </div>
            <div className="today-progress-track-wrap">
              <div className="today-progress-track" role="progressbar" aria-label="Today's completed actions" aria-valuemin={0} aria-valuemax={totalTodayActions || 1} aria-valuenow={completedTodayActions}>
                <span style={{ width: todayProgress + '%' }} />
              </div>
              <div className="today-progress-breakdown">
                <span><i className="today-breakdown-dot" /> Habits <b>{doneToday}<small>/{dueHabits.length}</small></b></span>
                <span><i className="today-breakdown-dot task-dot" /> Tasks <b>{tasksDoneToday}<small>/{todayTasks.length}</small></b></span>
              </div>
            </div>
            <div className="today-progress-stat"><span className="today-stat-icon"><CheckCheck size={17} /></span><b>{completedTodayActions}<small> / {totalTodayActions}</small></b><span>actions completed</span></div>
          </section>
          <section className="today-workspace-grid">
            <div className="today-action-column">
              <section className="today-action-card">
                <div className="today-card-heading">
                  <div><span className="today-section-kicker">BUILD YOUR BASELINE</span><h2>Habits for today <span>{dueHabits.length.toString().padStart(2, '0')}</span></h2><p>Return to the routine, not perfection.</p></div>
                  <button type="button" className="today-text-link" onClick={() => setPage('Habits')}>All habits <ArrowRight size={14} /></button>
                </div>
                {dueHabits.length > 0 ? <div className="today-action-list">
                  {dueHabits.map((habit) => {
                    const done = Boolean(habit.logs[today]);
                    return <article className={'today-action-row ' + (done ? 'is-done' : '')} key={habit.id}>
                      <span className="today-item-glyph"><HabitGlyph habit={habit} size={17} /></span>
                      <div className="today-item-copy">
                        <div className="today-item-title"><b>{habit.name}</b><span>{habit.category}</span></div>
                        <p>{habit.cue ? <><span className="today-detail-label">CUE</span> {habit.cue}</> : habit.minimum ? <><span className="today-detail-label">MINIMUM</span> {habit.minimum}</> : <>{habit.frequency} routine</>}</p>
                        {habit.minimum && habit.cue && <small className="today-item-minimum">Minimum: {habit.minimum}</small>}
                      </div>
                      <button type="button" className={'today-action-check ' + (done ? 'is-checked' : '')} onClick={() => toggleHabit(habit.id)} aria-label={(done ? 'Undo' : 'Complete') + ' habit ' + habit.name} title={done ? 'Mark as not complete' : 'Mark habit complete'}>{done ? <Check size={16} strokeWidth={2.6} /> : <span />}</button>
                    </article>;
                  })}
                </div> : <div className="today-empty-state">
                  <span className="today-empty-icon"><Target size={19} /></span>
                  <div><b>{habits.length ? 'No habits due today' : 'Start with one small routine'}</b><p>{habits.length ? 'Your schedule is clear. Review your routines or plan a new one.' : 'Choose a simple action you can repeat, even on a busy day.'}</p></div>
                  <button type="button" className="today-empty-action" onClick={habits.length ? () => setPage('Habits') : openCreateHabit}>{habits.length ? 'Review habits' : 'Create habit'} <ArrowRight size={14} /></button>
                </div>}
              </section>
              <section className="today-action-card">
                <div className="today-card-heading">
                  <div><span className="today-section-kicker">MAKE SPACE FOR WHAT MATTERS</span><h2>Tasks on your list <span>{todayTasks.length.toString().padStart(2, '0')}</span></h2><p>One clear next step is enough.</p></div>
                  <button type="button" className="today-text-link" onClick={() => setPage('Tasks')}>All tasks <ArrowRight size={14} /></button>
                </div>
                {todayTasks.length > 0 ? <div className="today-action-list">
                  {todayTasks.map((task) => <article className={'today-action-row today-task-row ' + (task.completed ? 'is-done' : '')} key={task.id}>
                    <button type="button" className={'today-action-check ' + (task.completed ? 'is-checked' : '')} onClick={() => toggleTask(task.id, today)} aria-label={(task.completed ? 'Undo' : 'Complete') + ' task ' + task.title} title={task.completed ? 'Mark as open' : 'Mark as complete'}>{task.completed ? <Check size={16} strokeWidth={2.6} /> : <span />}</button>
                    <div className="today-item-copy">
                      <div className="today-item-title"><b>{task.title}</b>{task.priority === 'High' && <span className="today-priority-tag">HIGH PRIORITY</span>}</div>
                      <p>{[task.category ?? 'Personal', task.time, task.estimate ? task.estimate + ' min' : null].filter(Boolean).join(' · ')}</p>
                    </div>
                    <button type="button" className="today-row-more" onClick={() => { if (!task.completed) setFocusTaskId(task.id); setPage('Focus'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={'Focus on task ' + task.title} title="Focus on this task"><Zap size={16} /></button>
                  </article>)}
                </div> : <div className="today-empty-state">
                  <span className="today-empty-icon"><ListTodo size={19} /></span>
                  <div><b>No tasks scheduled for today</b><p>Add one concrete action if you want a little structure for the day.</p></div>
                  <button type="button" className="today-empty-action" onClick={() => setPage('Tasks')}>Plan a task <ArrowRight size={14} /></button>
                </div>}
              </section>
            </div>
            <aside className="today-side-column">
              <section className="today-side-card today-next-card">
                <div className="today-side-heading"><span className="today-section-kicker">YOUR NEXT SMALL ACTION</span><span className="today-side-spark"><Zap size={15} /></span></div>
                {nextTask || nextHabit ? <>
                  <h2>{nextTask ? nextTask.title : nextHabit?.name}</h2>
                  <p>{nextTask ? 'A task is waiting for your attention. Make the first step small enough to start.' : (nextHabit?.minimum || nextHabit?.cue || 'Show up for the smallest useful version of this routine.')}</p>
                  <div className="today-next-meta">{nextTask ? <><ListTodo size={14} /> {nextTask.estimate ? nextTask.estimate + ' min' : 'Task'} · {nextTask.priority.toLowerCase()} priority</> : <><Target size={14} /> {nextHabit?.category} routine</>}</div>
                  <button type="button" className="today-next-button" onClick={() => { if (nextTask) { setFocusTaskId(nextTask.id); setPage('Focus'); } else if (nextHabit) { setFilter(nextHabit.category); setPage('Habits'); } window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{nextTask ? 'Start a focus block' : 'Open this routine'} <ArrowRight size={15} /></button>
                </> : <>
                  <h2>You have room to reset.</h2><p>Everything scheduled for today is complete—or your calendar is clear. Choose what deserves your attention next.</p>
                  <button type="button" className="today-next-button" onClick={() => setPage('Planner')}>Plan the next day <ArrowRight size={15} /></button>
                </>}
              </section>
              <section className="today-side-card today-rhythm-card">
                <span className="today-section-kicker">KEEP IT REALISTIC</span><h2>Small counts.</h2>
                <p>Your minimum version is not a shortcut. It is the bridge between intention and doing.</p>
                <div className="today-rhythm-quote"><span>“</span><b>Never miss twice. Restart gently.</b></div>
                <button type="button" className="today-quiet-link" onClick={() => setPage('Insights')}>Review your patterns <ArrowUpRight size={14} /></button>
              </section>
            </aside>
          </section>
          <footer className="analytics-footer"><span><img className="cadence-footer-lockup" src="/cadence-icon.svg" alt="Cadence" width="42" height="42" /> <i>/</i> PERSONAL PERFORMANCE SYSTEM</span><span>YOUR PROGRESS, WITHOUT THE NOISE.</span></footer>
        </>}
  
        {page === 'Tasks' && <TasksPage tasks={tasks} today={today} onToggleTask={toggleTask} onAddTask={addPlannerTask} onDeleteTask={(taskId) => { setTasks((current) => current.filter((task) => task.id !== taskId)); setToast('Task removed.'); }} />}

        {page === 'Planner' && <PlannerPage habits={habits} tasks={tasks} today={today} onToggleHabit={toggleHabit} onToggleTask={toggleTask} onAddTask={addPlannerTask} />}

        {page === 'Habits' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> BUILD YOUR BASELINE</div><h1>Habits, <span>by design.</span></h1><p className="welcome-sub">Make good actions easier to start and easier to repeat.</p></div><button className="primary-button" type="button" onClick={openCreateHabit}><Plus size={16} /> Create habit</button></section>
          <section className="habits-overview-strip"><div><span className="strip-label">ACTIVE ROUTINES</span><b>{habits.length.toString().padStart(2, '0')}</b></div><div><span className="strip-label">CHECKED IN TODAY</span><b>{doneToday}<small> / {dueHabits.length}</small></b></div><div><span className="strip-label">WEEKLY CONSISTENCY</span><b>{consistency}<small>%</small></b></div><div className="strip-quote"><Sparkles size={18} /><span>Let the minimum version keep the habit alive.</span></div></section>
          <WeeklyTracker habits={habits} today={today} onToggle={toggleHabit} />
          <section className="panel habits-library"><div className="panel-heading"><div><div className="panel-overline">YOUR PERSONAL SYSTEM</div><h3>All routines <span className="heading-count">{habits.length}</span></h3></div><div className="filter-pills"><button type="button" className={filter === 'All' ? 'selected' : ''} onClick={() => setFilter('All')}>All</button>{categories.map((cat) => <button type="button" key={cat} className={filter === cat ? 'selected' : ''} onClick={() => setFilter(cat)}>{cat}</button>)}</div></div><div className="library-list">{filteredHabits.map((habit) => <HabitDetail key={habit.id} habit={habit} today={today} onToggle={() => toggleHabit(habit.id)} onEdit={() => openEditHabit(habit)} onDelete={() => { setHabits((current) => current.filter((item) => item.id !== habit.id)); setToast('Habit removed'); }} />)}{filteredHabits.length === 0 && <EmptyState title="Nothing in this category yet" body="A good system starts small. Add a routine when you’re ready." action="Add habit" onAction={openCreateHabit} />}</div></section>
          <section className="principle-grid"><Principle icon={<Zap size={18} />} tag="MAKE IT EASY" title="Shrink the first step" copy="Choose a minimum version so starting takes less effort than avoiding it." /><Principle icon={<CalendarDays size={18} />} tag="MAKE IT OBVIOUS" title="Attach it to a cue" copy="Give your habit a reliable place in the day: after coffee, before lunch, or when you close your laptop." /><Principle icon={<Trophy size={18} />} tag="MAKE IT VISIBLE" title="Record each rep" copy="A small check-in creates feedback. Review the pattern, then adjust the plan—not your self-worth." /></section>
        </>}

        {page === 'Insights' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> THE PATTERNS BEHIND PROGRESS</div><h1>Notice what <span>works.</span></h1><p className="welcome-sub">Use the evidence you create to make tomorrow easier.</p></div><div className="review-date-chip"><CalendarDays size={15} /> Last 7 days</div></section>
          <section className="insights-stat-grid"><StatCard icon={<Activity size={17} />} label="Consistency" value={habits.length ? `${consistency}%` : '—'} detail={habits.length ? "Of scheduled habit check-ins" : "Add a routine to establish a baseline"} tone="lime" /><StatCard icon={<CheckCheck size={17} />} label="Logged actions" value={String(totalWins)} detail="Across your habit history" tone="violet" /><StatCard icon={<Flame size={17} />} label="Active routines" value={String(activeStreaks)} detail="With a current streak" tone="orange" /></section>
          <div className="today-insights-trend"><MomentumChart habits={habits} today={today} /></div>
          <div className="insight-activity"><MonthlyActivityCalendar habits={habits} tasks={tasks} today={today} onToggleHabit={toggleHabit} onToggleTask={toggleTask} /></div>
          <div className="content-grid insight-bottom"><section className="panel"><div className="panel-heading"><div><div className="panel-overline">WHAT THE DATA SAYS</div><h3>Your strongest routines</h3></div><Trophy size={18} className="muted-icon" /></div><div className="ranking-list">{[...habits].sort((a, b) => getBestStreak(b, today) - getBestStreak(a, today)).slice(0, 4).map((habit, index) => <div className="ranking-row" key={habit.id}><span className="rank-number">0{index + 1}</span><span className="rank-emoji tone-violet"><HabitGlyph habit={habit} size={16} /></span><span className="rank-name"><b>{habit.name}</b><small>{habit.category} · {habit.frequency.toLowerCase()}</small></span><span className="rank-streak"><Flame size={13} /> {getCurrentStreak(habit, today)} days</span><div className="rank-bar"><span style={{ width: `${Math.min(100, getBestStreak(habit, today) / Math.max(1, bestStreak) * 100)}%` }} /></div></div>)}{habits.length === 0 && <p className="quiet-empty">Add routines to start seeing patterns.</p>}</div></section><section className="panel reflection-panel"><div className="panel-heading"><div><div className="panel-overline">YOUR NEXT EXPERIMENT</div><h3>Make it easier</h3></div><Sparkles size={17} className="accent-icon" /></div><div className="reflection-quote">“Success is often a better-designed starting point.”</div><div className="experiment-row"><span className="experiment-number">01</span><div><b>Pick one habit to protect</b><p>Which routine would make the rest of your day feel better?</p></div></div><div className="experiment-row"><span className="experiment-number">02</span><div><b>Make a specific if–then plan</b><p>“After <em>your cue</em>, I’ll do <em>the smallest version</em>.”</p></div></div><div className="experiment-row"><span className="experiment-number">03</span><div><b>Review, don’t judge</b><p>At week’s end, adjust the cue, effort, or timing that got in the way.</p></div></div><button className="secondary-button full-button" type="button" onClick={() => setPage('Habits')}>Tune my habits <ArrowRight size={15} /></button></section></div>
          <section className="research-note"><div className="research-icon"><BookOpen size={17} /></div><div><b>Grounded in behavior research</b><p>Progress monitoring, context cues, and specific if–then plans are established approaches—not guarantees. This tracker turns them into repeatable prompts.</p></div><button type="button" onClick={() => setToast('Research references are included in the project README.')}><CircleHelp size={16} /> About the method</button></section>
        </>}

        {page === 'Focus' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> ONE THING AT A TIME</div><h1>Make space for <span>deep work.</span></h1><p className="welcome-sub">Pick a task, choose a block, and give it your full attention.</p></div><div className="focus-session-badge"><span className="save-dot" /> {focusSessions} sessions completed</div></section>
          <section className="focus-page-grid"><div className="panel focus-large-panel"><div className="focus-large-top"><span className="section-kicker"><span className="kicker-mark"><Timer size={13} /></span> FOCUS TIMER</span><span className="live-pill"><span /> {focusRunning ? 'IN SESSION' : 'READY WHEN YOU ARE'}</span></div><div className="focus-large-ring" style={{ '--timer-progress': `${timerProgress * 100}%` } as CSSProperties}><div className="focus-ring-inner"><span className="focus-time">{timeText}</span><span className="focus-caption">{focusRunning ? 'STAY PRESENT' : 'YOUR NEXT BLOCK'}</span></div></div><div className="timer-presets large-presets">{[15, 25, 50].map((minutes) => <button type="button" key={minutes} className={focusPreset === minutes ? 'selected' : ''} onClick={() => resetFocus(minutes)}>{minutes} min</button>)}</div><div className="focus-large-actions"><button className="primary-button" type="button" onClick={() => { if (focusSeconds === 0) resetFocus(); else setFocusRunning((running) => !running); }}>{focusRunning ? 'Pause focus' : focusSeconds === 0 ? 'Start another' : 'Start focusing'} {focusRunning ? <span className="pause-glyph">Ⅱ</span> : <ArrowRight size={16} />}</button><button className="secondary-button" type="button" onClick={() => resetFocus() }><RotateCcw size={15} /> Reset</button></div><p className="timer-reassurance"><ShieldCheck size={15} /> Missed a block? Nothing is lost. Restart with the next minute.</p></div><div className="focus-side-column"><section className="panel choose-task-panel"><div className="panel-overline">YOUR NEXT PRIORITY</div><h3>What will you work on?</h3><p>Choose one task. Everything else can wait for this block.</p>{todayTasks.filter((task) => !task.completed).map((task) => <button key={task.id} type="button" className={`focus-task-choice ${focusTaskId === task.id ? 'selected' : ''}`} onClick={() => { setFocusTaskId(task.id); setToast(`Focus target selected: ${task.title}`); }}><span className="todo-box" /><span><b>{task.title}</b><small>{task.estimate} min · {task.priority} priority</small></span><ArrowUpRight size={15} /></button>)}{todayTasks.filter((task) => !task.completed).length === 0 && <p className="quiet-empty">Your task list is clear. Enjoy the breathing room.</p>}<button className="text-button" type="button" onClick={() => setPage('Tasks')}>Manage today’s tasks <ArrowRight size={14} /></button></section><section className="panel focus-rule-panel"><span className="rule-icon"><Leaf size={17} /></span><div className="panel-overline">A GENTLER RULE</div><h3>Return your attention.</h3><p>Focus isn’t never getting distracted. It’s noticing and coming back—without making a story out of it.</p></section></div></section>
        </>}
      </main>

      {showHabitModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowHabitModal(false); setEditingHabitId(null); setHabitDraft({ ...emptyHabitDraft }); } }}><section className="habit-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-top"><div><div className="panel-overline">START SMALL, STAY CONSISTENT</div><h2 id="modal-title">{editingHabitId ? 'Edit habit' : 'Create a habit'}</h2><p>{editingHabitId ? 'Update your routine without losing its history.' : 'Design the start, not just the finish line.'}</p></div><IconButton label="Close modal" onClick={() => setShowHabitModal(false)}><X size={18} /></IconButton></div><form onSubmit={addHabit}><label className="field-label">Habit name<input autoFocus value={habitDraft.name} onChange={(event) => setHabitDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. Practice coding" maxLength={70} required /></label><label className="field-label">Area of life<div className="category-select">{categories.map((category) => <button type="button" key={category} className={habitDraft.category === category ? `selected ${categoryTone[category]}` : ''} onClick={() => setHabitDraft((draft) => ({ ...draft, category }))}><CategoryGlyph category={category} size={15} />{category}</button>)}</div></label><label className="field-label">Frequency<select value={habitDraft.frequency} onChange={(event) => setHabitDraft((draft) => ({ ...draft, frequency: event.target.value as Frequency }))}>{frequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label>
          {habitDraft.frequency === 'Custom' && <fieldset className="habit-schedule-days"><legend>Repeat on these days</legend><div className="habit-weekday-picker">{[{ label: 'Sun', value: 0 }, { label: 'Mon', value: 1 }, { label: 'Tue', value: 2 }, { label: 'Wed', value: 3 }, { label: 'Thu', value: 4 }, { label: 'Fri', value: 5 }, { label: 'Sat', value: 6 }].map(({ label, value }) => <button type="button" key={value} className={habitDraft.customDays.includes(value) ? 'selected' : ''} aria-pressed={habitDraft.customDays.includes(value)} onClick={() => setHabitDraft((draft) => ({ ...draft, customDays: draft.customDays.includes(value) ? draft.customDays.filter((day) => day !== value) : [...draft.customDays, value].sort((left, right) => left - right) }))}>{label}</button>)}</div><p>Choose one or more weekdays. Only selected days count toward consistency and reminders.</p></fieldset>}<label className="field-label">When will you do it? <span className="field-hint">A reliable cue</span><input value={habitDraft.cue} onChange={(event) => setHabitDraft((draft) => ({ ...draft, cue: event.target.value }))} placeholder="After I finish breakfast…" maxLength={100} /></label><label className="field-label">Your minimum version <span className="field-hint">Make it hard to say no</span><input value={habitDraft.minimum} onChange={(event) => setHabitDraft((draft) => ({ ...draft, minimum: event.target.value }))} placeholder="Read one page, write one line…" maxLength={100} /></label>
          <div className="habit-configuration-grid">
            <label className="field-label">Duration<select value={String(habitDraft.durationMonths)} onChange={(event) => setHabitDraft((draft) => ({ ...draft, durationMonths: Number(event.target.value) }))}><option value="0">Forever</option><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option></select><span className="field-hint">Starts on the creation date. Your history stays saved after it ends.</span></label>
            <label className="field-label">Session timer <span className="field-hint">Optional · minutes</span><input type="number" min="0" max="180" step="1" value={habitDraft.timerMinutes} onChange={(event) => setHabitDraft((draft) => ({ ...draft, timerMinutes: Math.min(180, Math.max(0, Number(event.target.value) || 0)) }))} /><span className="field-hint">Set 0 to keep the timer off. Maximum 180 minutes.</span></label>
          </div>
          <section className="reminder-settings" aria-label="Habit reminder settings">
            <div className="reminder-settings-heading">
              <span className="reminder-bell-icon"><Bell size={17} /></span>
              <span className="reminder-settings-copy"><b>Habit reminder</b><small>Get a repeating chime and desktop notification at a chosen time.</small></span>
              <label className="reminder-switch">
                <input type="checkbox" checked={habitDraft.reminderEnabled} onChange={(event) => { const enabled = event.target.checked; if (enabled) unlockReminderAudio(); setHabitDraft((draft) => ({ ...draft, reminderEnabled: enabled })); }} />
                <span className="reminder-switch-track" aria-hidden="true" />
                <b>{habitDraft.reminderEnabled ? 'On' : 'Off'}</b>
              </label>
            </div>
            {habitDraft.reminderEnabled && <div className="reminder-options">
              <label className="field-label reminder-time-label">Reminder time
                <input type="time" value={habitDraft.reminderTime} onChange={(event) => setHabitDraft((draft) => ({ ...draft, reminderTime: event.target.value }))} required />
              </label>
              <label className="field-label reminder-sound-label">Custom music link <span className="field-hint">Optional · YouTube or Spotify</span>
                <input type="url" value={habitDraft.reminderSoundUrl} onChange={(event) => setHabitDraft((draft) => ({ ...draft, reminderSoundUrl: event.target.value }))} placeholder="https://open.spotify.com/track/…" autoComplete="url" />
              </label>
              <p className="reminder-music-help">YouTube links attempt to autoplay and loop. Browsers can block audible autoplay until you interact with the player; Spotify playback is controlled by its embed. The repeating Cadence chime stays active as a fallback until you stop it or mark the habit done.</p>
              <div className="reminder-notification-option">
                <span className="reminder-permission-status">{notificationPermission === 'granted' ? 'Desktop notifications enabled' : notificationPermission === 'denied' ? 'Browser notifications are blocked' : notificationPermission === 'unsupported' ? 'Desktop notifications unavailable' : 'Allow desktop notifications'}</span>
                <button type="button" className="secondary-button notification-permission-button" onClick={() => { void enableDesktopNotifications(); }}>{notificationPermission === 'granted' ? 'Enabled' : notificationPermission === 'denied' ? 'How to allow' : notificationPermission === 'unsupported' ? 'Not supported' : 'Enable'}</button>
              </div>
              <p className="reminder-footnote">Reminders run while Cadence is open (including a minimized tab). Browser permission is needed for desktop notifications. Use Stop sound to silence the looping alarm, or Mark done to close it.</p>
            </div>}
          </section>
          <div className="if-then-preview"><span><Sparkles size={15} /></span><p><b>Your if–then plan</b><br />If {habitDraft.cue.trim() || 'my cue happens'}, then I’ll {habitDraft.minimum.trim() || 'do the smallest version'}.</p></div><div className="modal-actions"><button className="secondary-button" type="button" onClick={() => { setShowHabitModal(false); setEditingHabitId(null); setHabitDraft({ ...emptyHabitDraft }); }}>Cancel</button><button className="primary-button" type="submit">{editingHabitId ? <><Check size={15} /> Save changes</> : <><Plus size={15} /> Create habit</>}</button></div></form></section></div>}
      {activeReminder && <div className="reminder-alarm-backdrop" role="presentation">
        <section className="reminder-alarm" role="alertdialog" aria-modal="true" aria-labelledby="reminder-alarm-title">
          <span className="reminder-alarm-icon"><Bell size={22} /></span>
          <span className="reminder-alarm-kicker">CADENCE REMINDER · {formatReminderTime(activeReminder.reminderTime)}</span>
          <h2 id="reminder-alarm-title">Time for {activeReminder.habitName}</h2>
          <p>A small step counts. Check in now, or snooze this reminder for ten minutes.</p>
          {activeReminderMedia && !reminderSoundStopped && <section className="reminder-media-player" aria-label="Custom reminder music">
            <div className="reminder-media-heading"><span className="reminder-media-wave"><CadenceMark /></span><div><b>Your reminder soundtrack</b><small>{activeReminderMedia?.provider} player</small></div></div>
            <iframe
              key={reminderMediaReload}
              src={activeReminderMedia?.embedUrl}
              title={'Cadence reminder music from ' + activeReminderMedia?.provider}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              loading="eager"
              className="reminder-media-iframe"
            />
            <a className="reminder-media-open" href={activeReminderMedia?.originalUrl} target="_blank" rel="noreferrer">
              Open in {activeReminderMedia?.provider} <ArrowUpRight size={13}/>
            </a>
          </section>}
          <div className="reminder-alarm-actions">
            <button type="button" className="secondary-button" onClick={snoozeReminderAlarm}><Clock3 size={15} /> Snooze 10 min</button>
            <button type="button" className="primary-button" onClick={() => { toggleHabit(activeReminder.habitId); stopReminderAlarm(); }}><Check size={15} /> Mark done</button>
          </div>
          <div className="reminder-sound-controls">{activeReminderMedia && <button type="button" className="reminder-replay-button" onClick={() => { setReminderSoundStopped(false); setReminderMediaReload((value) => value + 1); }}>Play soundtrack again</button>}<button type="button" className="reminder-stop-button" onClick={() => setReminderSoundStopped(true)}>Stop sound</button></div>
        </section>
      </div>}
      {toast && <div className="toast" role="status"><span><Check size={15} /></span>{toast}<button type="button" aria-label="Dismiss message" onClick={() => setToast('')}><X size={14} /></button></div>}
    </div>
  );
}

function CadenceMark() {
  return <svg className="cadence-mark-svg" viewBox="0 0 44 44" role="img" aria-label="Cadence waveform">
    <defs>
      <linearGradient id="cadence-wave-stroke" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#E3B4FF" />
        <stop offset="48%" stopColor="#C16BFF" />
        <stop offset="100%" stopColor="#8B35E6" />
      </linearGradient>
    </defs>
    <path d="M2 23 C7 23 8 23 11 20 C14 17 14 10 18 10 C22 10 22 34 27 34 C31 34 32 6 36 6 C39 6 40 21 42 21" fill="none" stroke="url(#cadence-wave-stroke)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <div className="stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-indicator"><ArrowUpRight size={14} /></span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>;
}

function WeeklyTracker({ habits, today, onToggle }: { habits: Habit[]; today: string; onToggle: (habitId: string, dayKey: string) => void }) {
  const weekday = new Date(today + 'T12:00:00').getDay();
  const monday = shiftKey(today, -((weekday + 6) % 7));
  const days = Array.from({ length: 7 }, (_, index) => {
    const key = shiftKey(monday, index);
    const due = habits.filter((habit) => isDue(habit, key));
    const done = due.filter((habit) => Boolean(habit.logs[key])).length;
    return { key, due: due.length, done, percent: due.length ? Math.round((done / due.length) * 100) : 0, future: key > today, label: new Date(key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }), date: new Date(key + 'T12:00:00').getDate() };
  });
  const weeklyDue = days.reduce((sum, day) => sum + (day.future ? 0 : day.due), 0);
  const weeklyDone = days.reduce((sum, day) => sum + (day.future ? 0 : day.done), 0);
  const weeklyPercent = weeklyDue ? Math.round((weeklyDone / weeklyDue) * 100) : null;
  return <section className="panel weekly-tracker-panel">
    <div className="panel-heading weekly-heading">
      <div><div className="panel-overline">THE SMALL WINS, MADE VISIBLE</div><h3>This week <span className="heading-count">{weeklyDone}/{weeklyDue}</span></h3></div>
      <div className="weekly-heading-side"><span className="weekly-average"><span className="weekly-average-dot" /> {weeklyPercent === null ? 'No check-ins yet' : `${weeklyPercent}% logged`}</span><span className="weekly-hint">Tap any past day to edit</span></div>
    </div>
    <div className="weekly-chart" aria-label="Daily habit completion for this week">
      {days.map((day, index) => <div className={'weekly-chart-day ' + (day.key === today ? 'is-today ' : '') + (day.future ? 'is-future ' : '') + (day.due === 0 && !day.future ? 'is-empty' : '')} key={day.key}>
        <div className="weekly-chart-top"><b>{day.future || day.due === 0 ? '—' : day.percent + '%'}</b><small>{day.future ? 'UP NEXT' : day.due === 0 ? 'NO HABITS' : day.done + '/' + day.due}</small></div>
        <div className="weekly-bar-track"><span style={{ height: (day.future ? 3 : Math.max(day.percent > 0 ? 10 : 3, day.percent)) + '%', animationDelay: (index * 45) + 'ms' }} /></div>
        <div className="weekly-day-label"><b>{day.label}</b><small>{day.date}</small></div>
      </div>)}
    </div>
    <div className="weekly-matrix-wrap"><div className="weekly-matrix" role="grid" aria-label="Habit check-ins for each day of the week">
      <div className="weekly-matrix-cell weekly-matrix-label weekly-matrix-head" role="columnheader">ROUTINE</div>
      {days.map((day) => <div key={day.key} role="columnheader" className={'weekly-matrix-cell weekly-matrix-day ' + (day.key === today ? 'is-today ' : '') + (day.future ? 'is-future' : '')}><b>{day.label.slice(0, 1)}</b><small>{day.date}</small></div>)}
      {habits.map((habit) => <div className="weekly-matrix-row" role="row" key={habit.id}>
        <div className="weekly-matrix-cell weekly-matrix-label" role="rowheader"><span className={'weekly-habit-dot tone-' + habit.color} /><span className="weekly-habit-name" title={habit.name}>{habit.name}</span><small>{habit.category}</small></div>
        {days.map((day) => {
          const done = Boolean(habit.logs[day.key]);
          const scheduled = isDue(habit, day.key);
          return <div className={'weekly-matrix-cell weekly-tick-cell ' + (day.key === today ? 'is-today' : '')} role="gridcell" key={day.key}>
            {!scheduled ? <span className="weekly-not-due" aria-label="Not scheduled">·</span> : <button type="button" className={'weekly-tick ' + (done ? 'done ' : '') + (day.future ? 'future' : '')} disabled={day.future} onClick={() => onToggle(habit.id, day.key)} aria-label={(done ? 'Undo' : 'Log') + ' ' + habit.name + ' for ' + day.key} title={habit.name + ' · ' + day.key + ': ' + (done ? 'completed' : 'not logged')}><span>{done ? <Check size={12} strokeWidth={3} /> : null}</span></button>}
          </div>;
        })}
      </div>)}
    </div></div>
    {habits.length === 0 && <div className="weekly-empty"><Zap size={16} /> Your weekly check-ins will show up here when you add a habit.</div>}
    <div className="weekly-footer"><span><i className="weekly-legend-box done" /> Done</span><span><i className="weekly-legend-box" /> Not logged</span><span><i className="weekly-legend-box scheduled" /> Not scheduled</span><span className="weekly-footer-note">Future days stay locked until they happen.</span></div>
  </section>;
}

function MonthlyActivityCalendar({
  habits, tasks, today, onToggleHabit, onToggleTask,
}: {
  habits: Habit[];
  tasks: Task[];
  today: string;
  onToggleHabit: (habitId: string, dayKey: string) => void;
  onToggleTask: (taskId: string, dayKey: string) => void;
}) {
  const [monthAnchor, setMonthAnchor] = useState(() => today.slice(0, 7) + '-01');
  const [selectedDate, setSelectedDate] = useState(today);
  const [showDetails, setShowDetails] = useState(true);
  const [year, month] = monthAnchor.split('-').map(Number);
  const monthTitle = new Date(year, month - 1, 1, 12).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstOffset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
  const cellCount = Math.ceil((firstOffset + daysInMonth) / 7) * 7;
  const dateKey = (day: number) => year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => {
    const key = dateKey(index + 1);
    const dueHabits = habits.filter((habit) => isDue(habit, key));
    const doneHabits = dueHabits.filter((habit) => Boolean(habit.logs[key]));
    const scheduledTasks = tasks.filter((task) => taskOccursOn(task, key));
    const doneTasks = scheduledTasks.filter((task) => taskIsDone(task, key));
    const total = dueHabits.length + scheduledTasks.length;
    const done = doneHabits.length + doneTasks.length;
    const isFuture = key > today;
    return {
      key, day: index + 1, dueHabits, doneHabits, scheduledTasks, doneTasks,
      total, done, percent: total ? Math.round(done / total * 100) : 0,
      taskCount: doneTasks.length, taskTotal: scheduledTasks.length,
      habitCount: doneHabits.length, habitTotal: dueHabits.length,
      isFuture, isToday: key === today,
    };
  });
  const gridCells = Array.from({ length: cellCount }, (_, index) => {
    const dayNumber = index - firstOffset + 1;
    return dayNumber < 1 || dayNumber > daysInMonth ? null : monthDays[dayNumber - 1];
  });
  const monthCompletedTasks = monthDays.reduce((sum, day) => sum + (day.isFuture ? 0 : day.taskCount), 0);
  const monthDueTasks = monthDays.reduce((sum, day) => sum + (day.isFuture ? 0 : day.taskTotal), 0);
  const monthCompletedHabits = monthDays.reduce((sum, day) => sum + (day.isFuture ? 0 : day.habitCount), 0);
  const monthDueHabits = monthDays.reduce((sum, day) => sum + (day.isFuture ? 0 : day.habitTotal), 0);
  const activeDays = monthDays.filter((day) => !day.isFuture && day.done > 0).length;
  const selected = monthDays.find((day) => day.key === selectedDate);
  const selectedDateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const changeMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1, 12);
    const key = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-01';
    setMonthAnchor(key);
    setSelectedDate(key.slice(0, 7) === today.slice(0, 7) ? today : key);
  };
  const jumpToCurrentMonth = () => {
    setMonthAnchor(today.slice(0, 7) + '-01');
    setSelectedDate(today);
  };

  return <section className="monthly-activity">
    <div className="monthly-activity-header">
      <div className="monthly-title-block">
        <span className="analytics-section-index">TASKS + ROUTINES / CALENDAR VIEW</span>
        <h3>Daily execution <span>by month</span></h3>
        <p>Every date shows finished tasks and completed habits. Select a day to review its checklist.</p>
      </div>
      <div className="monthly-navigation" aria-label="Calendar month navigation">
        <button type="button" className="monthly-nav-arrow" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
        <div className="monthly-current-month"><CalendarDays size={14}/><b>{monthTitle}</b></div>
        <button type="button" className="monthly-nav-arrow" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
        <button type="button" className="monthly-today-button" onClick={jumpToCurrentMonth}>Today</button>
      </div>
    </div>

    <div className="monthly-stats-row">
      <div className="monthly-stat"><span className="monthly-stat-icon tasks-icon"><CheckCheck size={14}/></span><div><small>TASKS COMPLETED</small><b>{monthCompletedTasks}{monthDueTasks ? <i> / {monthDueTasks}</i> : <i> no tasks</i>}</b></div></div>
      <div className="monthly-stat"><span className="monthly-stat-icon habits-icon"><Target size={14}/></span><div><small>HABIT CHECK-INS</small><b>{monthCompletedHabits}{monthDueHabits ? <i> / {monthDueHabits}</i> : <i> no routines</i>}</b></div></div>
      <div className="monthly-stat"><span className="monthly-stat-icon days-icon"><Activity size={14}/></span><div><small>ACTIVE DAYS</small><b>{activeDays}<i> / {monthDays.filter((day) => !day.isFuture).length}</i></b></div></div>
    </div>

    <div className="monthly-calendar-shell">
      <div className="monthly-weekday-row">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="monthly-calendar-grid">
        {gridCells.map((day, index) => day ? <button
          type="button"
          key={day.key}
          className={'monthly-day-cell ' + (day.key === selectedDate ? 'is-selected ' : '') + (day.isToday ? 'is-today ' : '') + (day.isFuture ? 'is-future ' : '') + (day.done > 0 ? 'has-progress ' : '') + (day.total === 0 ? 'is-empty' : '')}
          onClick={() => { setSelectedDate(day.key); setShowDetails(true); }}
          aria-pressed={day.key === selectedDate}
          aria-label={day.key + ': ' + day.taskCount + ' of ' + day.taskTotal + ' tasks, ' + day.habitCount + ' of ' + day.habitTotal + ' habits completed'}
        >
          <span className="monthly-day-top"><b>{day.day}</b>{day.isToday ? <i>today</i> : null}</span>
          {day.total > 0 ? <><span className="monthly-day-task-count"><strong>{day.taskCount}</strong><small> / {day.taskTotal} tasks</small></span>
          <span className="monthly-day-habit-count"><span className="monthly-habit-dot"/> {day.habitCount}<small> / {day.habitTotal} habits</small></span></> : <span className="monthly-day-no-activity">Nothing scheduled</span>}
          <span className="monthly-day-progress"><i style={{ width: day.isFuture ? '0%' : day.percent + '%' }}/></span>
          <span className="monthly-day-status">{day.isFuture ? (day.total ? 'UP NEXT' : '—') : day.total ? day.percent + '% DONE' : '—'}</span>
        </button> : <div key={'blank-' + index} className="monthly-day-empty" aria-hidden="true"/> )}
      </div>
      <div className="monthly-calendar-legend">
        <span><i className="monthly-legend-task"/> Tasks completed</span>
        <span><i className="monthly-legend-habit"/> Habit check-ins</span>
        <span><i className="monthly-legend-today"/> Today</span>
        <span className="monthly-week-note">Weeks run Monday → Sunday</span>
      </div>
    </div>

    {selected && <section className="monthly-day-detail">
      <div className="monthly-detail-header">
        <div><span className="analytics-section-index">SELECTED DATE / DAILY LOG</span><h4>{selectedDateLabel}</h4><p>{selected.isFuture ? 'A look ahead. Future dates remain editable only when the day arrives.' : selected.done + ' of ' + selected.total + ' scheduled actions completed.'}</p></div>
        <button type="button" className="monthly-detail-collapse" onClick={() => setShowDetails((value) => !value)}>{showDetails ? 'Hide checklist' : 'Show checklist'} <span>{showDetails ? '−' : '+'}</span></button>
      </div>
      {showDetails && <div className="monthly-detail-columns">
        <div className="monthly-detail-group">
          <div className="monthly-detail-group-title"><span className="monthly-stat-icon tasks-icon"><CheckCheck size={13}/></span><b>Tasks</b><small>{selected.doneTasks.length}/{selected.scheduledTasks.length}</small></div>
          {selected.scheduledTasks.length ? selected.scheduledTasks.map((task) => {
            const done = taskIsDone(task, selectedDate);
            const disabled = selected.isFuture || (task.recurrence ?? 'None') === 'None' && task.date !== selectedDate;
            return <div className={'monthly-detail-row ' + (done ? 'is-done' : '')} key={task.id}>
              <button type="button" className={'monthly-detail-check ' + (done ? 'checked' : '')} disabled={disabled} onClick={() => onToggleTask(task.id, selectedDate)} aria-label={(done ? 'Undo ' : 'Complete ') + task.title}>{done ? <Check size={12}/> : null}</button>
              <span className="monthly-detail-item-copy"><b>{task.title}</b><small>{task.time || 'Flexible'} · {task.category || 'Personal'} · {task.estimate} min</small></span>
              <span className={'monthly-item-status ' + (done ? 'is-done' : '')}>{done ? 'DONE' : selected.isFuture ? 'UP NEXT' : 'OPEN'}</span>
            </div>;
          }) : <p className="monthly-detail-empty">No tasks scheduled for this date.</p>}
        </div>
        <div className="monthly-detail-group">
          <div className="monthly-detail-group-title"><span className="monthly-stat-icon habits-icon"><Target size={13}/></span><b>Habits</b><small>{selected.doneHabits.length}/{selected.dueHabits.length}</small></div>
          {selected.dueHabits.length ? selected.dueHabits.map((habit) => {
            const done = Boolean(habit.logs[selectedDate]);
            return <div className={'monthly-detail-row ' + (done ? 'is-done' : '')} key={habit.id}>
              <button type="button" className={'monthly-detail-check ' + (done ? 'checked' : '')} disabled={selected.isFuture} onClick={() => onToggleHabit(habit.id, selectedDate)} aria-label={(done ? 'Undo ' : 'Complete ') + habit.name}>{done ? <Check size={12}/> : null}</button>
              <span className="monthly-detail-emoji tone-violet"><HabitGlyph habit={habit} size={15} /></span>
              <span className="monthly-detail-item-copy"><b>{habit.name}</b><small>{habit.cue || habit.category}</small></span>
              <span className={'monthly-item-status ' + (done ? 'is-done' : '')}>{done ? 'DONE' : selected.isFuture ? 'UP NEXT' : 'OPEN'}</span>
            </div>;
          }) : <p className="monthly-detail-empty">No habits scheduled for this date.</p>}
        </div>
      </div>}
    </section>}
  </section>;
}


function HabitSessionTimer({ minutes }: { minutes: number }) {
  const [remaining, setRemaining] = useState(minutes * 60);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    setRunning(false);
    setRemaining(minutes * 60);
  }, [minutes]);
  useEffect(() => {
    if (!running) return undefined;
    const interval = window.setInterval(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [running]);
  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);
  const minutesLeft = Math.floor(remaining / 60);
  const secondsLeft = remaining % 60;
  return <div className="habit-session-timer">
    <span className="habit-session-timer-icon"><Timer size={14}/></span>
    <span className="habit-session-timer-copy"><small>SESSION TIMER</small><b>{String(minutesLeft).padStart(2, '0')}:{String(secondsLeft).padStart(2, '0')}</b><em>{remaining === 0 ? 'Session complete' : running ? 'In progress' : 'Ready when you are'}</em></span>
    <div className="habit-session-timer-actions">
      <button type="button" className="habit-session-timer-start" disabled={remaining === 0} onClick={() => setRunning((value) => !value)}>{running ? 'Pause' : remaining === minutes * 60 ? 'Start' : 'Resume'}</button>
      <button type="button" className="habit-session-timer-reset" onClick={() => { setRunning(false); setRemaining(minutes * 60); }} aria-label="Reset habit timer" title="Reset timer"><RotateCcw size={13}/></button>
    </div>
  </div>;
}

function HabitDetail({ habit, today, onToggle, onEdit, onDelete }: { habit: Habit; today: string; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const streak = getCurrentStreak(habit, today);
  const best = getBestStreak(habit, today);
  const last7 = Array.from({ length: 7 }, (_, index) => shiftKey(today, index - 6));
  const last14 = Array.from({ length: 14 }, (_, index) => shiftKey(today, index - 13));
  const tracked14 = (key: string) => key >= habit.createdAt && isDue(habit, key);
  const completed14 = last14.filter((key) => key <= today && tracked14(key) && Boolean(habit.logs[key])).length;
  const due14 = last14.filter((key) => key <= today && tracked14(key)).length;
  const chartPoints = last14.map((key, index) => {
    const scheduled = key <= today && key >= habit.createdAt && isDue(habit, key);
    const completed = scheduled && Boolean(habit.logs[key]);
    const percent = scheduled ? (completed ? 100 : 0) : null;
    const day = new Date(key + "T12:00:00");
    return { key, day, x: (index + 0.5) * (857 / 14), y: percent === null ? 90 : 90 - percent * 0.8, percent, scheduled, completed };
  });
  const chartedPoints = chartPoints.filter((point) => point.percent !== null);
  const linePath = chartedPoints.reduce((path, point, index, points) => {
    if (index === 0) return "M " + point.x + " " + point.y;
    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;
    return path + " C " + midX + " " + previous.y + ", " + midX + " " + point.y + ", " + point.x + " " + point.y;
  }, "");
  const firstChartPoint = chartedPoints[0];
  const lastChartPoint = chartedPoints[chartedPoints.length - 1];
  const areaPath = firstChartPoint && lastChartPoint ? linePath + " L " + lastChartPoint.x + " 90 L " + firstChartPoint.x + " 90 Z" : "";
  const chartId = habit.id.replace(/[^a-zA-Z0-9_-]/g, "");
  return <article className="habit-detail-card">
    <div className="habit-detail-row">
      <div className="detail-emoji tone-violet"><HabitGlyph habit={habit} size={20} /></div>
      <div className="detail-main">
        <div className="detail-title-row"><b>{habit.name}</b><span className={"category-tag " + categoryTone[habit.category]}>{habit.category}</span><span className="frequency-tag">{habit.frequency === 'Custom' ? 'Custom days' : habit.frequency}</span>{habit.durationMonths ? <span className="habit-duration-tag">{habit.durationMonths} mo plan</span> : null}</div>
        <p>{habit.cue ? "Cue: " + habit.cue : "Choose a consistent cue"} <span>·</span> Minimum: {habit.minimum} {habit.reminderEnabled && habit.reminderTime && <span className="habit-reminder-tag"><Bell size={11} /> Reminder {formatReminderTime(habit.reminderTime)}</span>}</p>
        <div className="mini-week" aria-label={"Last seven days for " + habit.name}>{last7.map((key) => {
          const dayDate = new Date(key + "T12:00:00");
          const completed = Boolean(habit.logs[key]);
          const scheduled = key >= habit.createdAt && isDue(habit, key);
          const dayName = dayDate.toLocaleDateString("en-US", { weekday: "short" });
          return <span key={key} className={(completed ? "done " : "") + (key === today ? "current " : "") + (!scheduled ? "not-scheduled" : "")} title={dayName + ", " + key + ": " + (completed ? "completed" : scheduled ? "not logged" : "not scheduled")} aria-label={dayName + ", " + key + ": " + (completed ? "completed" : scheduled ? "not logged" : "not scheduled")}><b>{dayName.slice(0, 1)}</b><small>{dayDate.getDate()}</small></span>;
        })}</div>
        <div className="habit-plan-meta">
          {habit.frequency === 'Custom' && <span><CalendarDays size={11}/>{(habit.scheduleDays ?? []).map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(' · ') || 'No days selected'}</span>}
          {habit.durationMonths ? <span><Clock3 size={11}/>{habit.durationMonths} month{habit.durationMonths === 1 ? '' : 's'} total</span> : <span><RotateCcw size={11}/>Ongoing</span>}
          {habit.timerMinutes ? <span><Timer size={11}/>{habit.timerMinutes} min timer</span> : null}
        </div>
      </div>
      <div className="detail-stats"><span><Flame size={14} /> <b>{streak}</b> current</span><span><Trophy size={14} /> <b>{best}</b> best</span></div>
      <div className="detail-actions">
        <button className="habit-edit-button" onClick={onEdit} type="button" aria-label={"Edit " + habit.name} title="Edit habit"><Pencil size={14} /> Edit</button>
        <button className={"detail-check " + (habit.logs[today] ? "checked" : "")} onClick={onToggle} type="button">{habit.logs[today] ? <><Check size={14} /> Done today</> : <><Plus size={14} /> Check in</>}</button>
        <button className="delete-button" onClick={onDelete} type="button" aria-label={"Delete " + habit.name} title="Delete habit"><X size={15} /></button>
      </div>
    </div>
    {habit.timerMinutes && habit.timerMinutes > 0 ? <HabitSessionTimer key={habit.id + ":" + habit.timerMinutes} minutes={habit.timerMinutes} /> : null}
    <div className="habit-detail-activity" aria-label={"Fourteen-day activity for " + habit.name}>
      <div className="habit-activity-caption"><span>LAST 14 DAYS</span><span><b>{completed14}</b> / {due14} completed</span></div>
      <div className="habit-activity-chart" role="img" aria-label={completed14 + " of " + due14 + " scheduled check-ins completed over the last 14 days. The line shows 100% for completed days and 0% for scheduled days that were missed; unscheduled days are omitted from the line."}>
        <div className="habit-chart-layout" aria-hidden="true">
          <div className="habit-chart-y-axis">
            <span>100%</span><span>50%</span><span>0%</span>
          </div>
          <div className="habit-chart-plot">
            <svg className="habit-activity-line-chart" viewBox="0 0 857 100" preserveAspectRatio="none" focusable="false">
              <defs>
                <linearGradient id={"cadence-habit-line-" + chartId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#9562ef" />
                  <stop offset="52%" stopColor="#c59aff" />
                  <stop offset="100%" stopColor="#a878ff" />
                </linearGradient>
                <linearGradient id={"cadence-habit-area-" + chartId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ac70ff" stopOpacity=".23" />
                  <stop offset="100%" stopColor="#ac70ff" stopOpacity=".015" />
                </linearGradient>
              </defs>
              {[10, 50, 90].map((y) => <line key={y} x1="0" y1={y} x2="857" y2={y} className="habit-chart-grid-line" />)}
              {areaPath && <path d={areaPath} fill={"url(#cadence-habit-area-" + chartId + ")"} className="habit-activity-area" />}
              {linePath && <path d={linePath} fill="none" stroke={"url(#cadence-habit-line-" + chartId + ")"} className="habit-activity-line" />}
              {chartedPoints.map((point) => (
                <circle key={point.key} cx={point.x} cy={point.y} r={point.completed ? 3.2 : 2.8} className={"habit-activity-point " + (point.completed ? "is-complete" : "is-missed")}>
                  <title>{point.key}: {point.completed ? "Completed · 100%" : "Not logged · 0%"}</title>
                </circle>
              ))}
            </svg>
            <div className="habit-chart-x-axis">
              {chartPoints.map((point) => <span key={point.key} title={point.key}>{point.day.getDate()}</span>)}
            </div>
          </div>
        </div>
        {due14 === 0 && <span className="habit-chart-empty">No scheduled check-ins to plot yet</span>}
      </div>
      <div className="habit-activity-legend"><span><i className="done"/>Completed</span><span><i className="missed"/>Not logged</span><span><i className="unscheduled"/>Not scheduled</span></div>
    </div>
  </article>;
}

function Principle({ icon, tag, title, copy }: { icon: ReactNode; tag: string; title: string; copy: string }) {
  return <article className="principle-card"><span className="principle-icon">{icon}</span><span className="principle-tag">{tag}</span><h3>{title}</h3><p>{copy}</p></article>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return <div className="empty-state"><span><ListTodo size={21} /></span><b>{title}</b><p>{body}</p><button className="text-button" type="button" onClick={onAction}>{action} <ArrowRight size={14} /></button></div>;
}

export default App;