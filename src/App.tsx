import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity, ArrowRight, ArrowUpRight, BarChart3, Bell, BookOpen, Brain, Coffee, Compass, Code2, Droplets, Dumbbell, Flower2,
  CalendarDays, Check, CheckCheck, ChevronDown, CircleHelp, Clock3, Flame, Focus, Upload,
  Gauge, Heart, Leaf, ListTodo, LogOut, Moon, Pencil, PenTool, Plus, RotateCcw, ShieldCheck,
  Sparkles, Sun, Target, Timer, Trophy, X, Zap,
} from 'lucide-react';
import type { Category, Frequency, Habit, Page, Task } from './types';
import { PlannerPage, taskIsDone, taskOccursOn } from './Planner';
// Tasks overview uses the same compact dashboard metric-card system as Today and Habits.
import TasksPage from './TasksPage';
import AuthScreen from './components/AuthScreen';
import { supabase, supabaseConfigured } from './lib/supabase';
import { isRingtoneUploadSizeAllowed, isSupportedAudioMime, parseReminderMedia as parseReminderMediaUrl } from './lib/reminder-media.mjs';
import type { ReminderMedia } from './lib/reminder-media.mjs';

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
type LocalRingtone = { url: string; name: string; audio: HTMLAudioElement };
type ActiveReminder = { habitId: string; habitName: string; reminderTime: string; reminderSoundUrl?: string; localRingtone?: LocalRingtone };
type PushArrival = { kind: 'task' | 'focus'; title: string; body: string; taskId?: string; reminderSoundUrl?: string; localRingtone?: LocalRingtone };

type ProfileLogoKey = 'initials' | 'wave' | 'zap' | 'sparkles' | 'target' | 'flame' | 'leaf' | 'code' | 'heart' | 'brain' | 'compass';
type LocalProfile = { name: string; logo: ProfileLogoKey; avatarData?: string };
const PROFILE_LOGO_KEYS: ProfileLogoKey[] = ['initials', 'wave', 'zap', 'sparkles', 'target', 'flame', 'leaf', 'code', 'heart', 'brain', 'compass'];
const PROFILE_LOGO_CHOICES: { key: ProfileLogoKey; label: string }[] = [
  { key: 'initials', label: 'Initials' }, { key: 'wave', label: 'Wave' }, { key: 'zap', label: 'Lightning' },
  { key: 'sparkles', label: 'Sparkles' }, { key: 'target', label: 'Target' }, { key: 'flame', label: 'Flame' },
  { key: 'leaf', label: 'Leaf' }, { key: 'code', label: 'Code' }, { key: 'heart', label: 'Heart' },
  { key: 'brain', label: 'Mind' }, { key: 'compass', label: 'Compass' },
];

function ProfileGlyph({ logo, name, size = 17 }: { logo: ProfileLogoKey; name: string; size?: number }) {
  if (logo === 'initials') {
    const initials = name.trim().toLowerCase() === 'your workspace' ? 'IR' : (name.trim().slice(0, 2).toUpperCase() || 'IR');
    return <span className="profile-avatar-initials">{initials}</span>;
  }
  const iconProps = { size, strokeWidth: 1.8, 'aria-hidden': true as const };
  if (logo === 'zap') return <Zap {...iconProps} />;
  if (logo === 'sparkles') return <Sparkles {...iconProps} />;
  if (logo === 'target') return <Target {...iconProps} />;
  if (logo === 'flame') return <Flame {...iconProps} />;
  if (logo === 'leaf') return <Leaf {...iconProps} />;
  if (logo === 'code') return <Code2 {...iconProps} />;
  if (logo === 'heart') return <Heart {...iconProps} />;
  if (logo === 'brain') return <Brain {...iconProps} />;
  if (logo === 'compass') return <Compass {...iconProps} />;
  return <Activity {...iconProps} />;
}

function parseReminderMedia(input?: string): ReminderMedia | null {
  const origin = typeof window === 'undefined' ? 'https://cadence-elite.vercel.app' : window.location.origin;
  return parseReminderMediaUrl(input, origin);
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
        <path d={linePath} fill="none" stroke="url(#momentumLine)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="analytics-trend-path" pathLength={1}/>
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
  const [splashFinished, setSplashFinished] = useState(false);
  useEffect(() => {
    const splashTimer = window.setTimeout(() => setSplashFinished(true), 2000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [page, setPage] = useState<Page>('Today');
  const [filter, setFilter] = useState<'All' | Category>('All');
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const emptyHabitDraft = { name: '', category: 'Craft' as Category, frequency: 'Daily' as Frequency, cue: '', minimum: '', reminderEnabled: false, reminderTime: '09:00', reminderSoundUrl: '', customDays: [1, 2, 3, 4, 5], durationMonths: 0, timerMinutes: 0 };
  const [habitDraft, setHabitDraft] = useState(emptyHabitDraft);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported');
  const [backgroundPushAvailable, setBackgroundPushAvailable] = useState(false);
  const [backgroundPushEnabled, setBackgroundPushEnabled] = useState(false);
  const [backgroundPushBusy, setBackgroundPushBusy] = useState(false);
  const [pendingPushReminder, setPendingPushReminder] = useState<string | null>(null);
  const [pushArrival, setPushArrival] = useState<PushArrival | null>(null);
  const [activeReminder, setActiveReminder] = useState<ActiveReminder | null>(null);
  const [habitRingtoneFile, setHabitRingtoneFile] = useState<File | null>(null);
  const [habitLocalRingtones, setHabitLocalRingtones] = useState<Record<string, LocalRingtone>>({});
  const [taskLocalRingtones, setTaskLocalRingtones] = useState<Record<string, LocalRingtone>>({});
  const [reminderSoundStopped, setReminderSoundStopped] = useState(false);
  const [reminderMediaReload, setReminderMediaReload] = useState(0);
  const [pendingReviewOpen, setPendingReviewOpen] = useState(false);
  const [pendingReviewEnabled, setPendingReviewEnabled] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('cadence-pending-review-enabled') : null;
      return saved === null ? true : saved === 'true';
    } catch { return true; }
  });
  const pendingReviewShownRef = useRef(false);
  const pendingReviewActiveRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const localRingtoneRegistryRef = useRef<Set<LocalRingtone>>(new Set());
  const focusCompletionAudioRef = useRef<HTMLAudioElement | null>(null);
  // Detached media survives page changes and can keep sounding in a background tab.
  const focusAlarmAudioRef = useRef<HTMLAudioElement | null>(null);
  const focusAudioFallbackNotifiedRef = useRef(false);
  const firedRemindersRef = useRef<Set<string>>(new Set());
  const firedTaskRemindersRef = useRef<Set<string>>(new Set());
  const localRingtoneFallbackNotifiedRef = useRef(false);
  const snoozeTimeoutRef = useRef<number | null>(null);
  const [dark, setDark] = useState(true);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusPreset, setFocusPreset] = useState(25);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [focusCustomMinutes, setFocusCustomMinutes] = useState('40');
  const [focusRingtoneKind, setFocusRingtoneKind] = useState<'chime' | 'bell' | 'pulse' | 'custom'>(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('cadence-focus-ringtone-kind') : null;
      return saved === 'bell' || saved === 'pulse' || saved === 'custom' ? saved : 'chime';
    } catch { return 'chime'; }
  });
  const [focusRingtoneData, setFocusRingtoneData] = useState(() => {
    try {
      if (typeof window === 'undefined') return '';
      const savedLink = window.localStorage.getItem('cadence-focus-music-url') ?? '';
      if (parseReminderMedia(savedLink)) return savedLink;
      const legacyValue = window.localStorage.getItem('cadence-focus-ringtone-data') ?? '';
      return /^https?:\/\//i.test(legacyValue) && parseReminderMedia(legacyValue) ? legacyValue : '';
    } catch { return ''; }
  });
  const [focusRingtoneDraft, setFocusRingtoneDraft] = useState(() => {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem('cadence-focus-music-url') ?? '' : ''; }
    catch { return ''; }
  });
  const [focusMusicPreviewOpen, setFocusMusicPreviewOpen] = useState(false);
  const [focusLocalAudioUrl, setFocusLocalAudioUrl] = useState('');
  const [focusLocalAudioName, setFocusLocalAudioName] = useState('');
  const [focusRingtoneName, setFocusRingtoneName] = useState(() => {
    try {
      if (typeof window === 'undefined') return '';
      const storedProvider = window.localStorage.getItem('cadence-focus-ringtone-name') ?? '';
      return storedProvider === 'YouTube' || storedProvider === 'Spotify' ? storedProvider : '';
    } catch { return ''; }
  });
  const [focusSessions, setFocusSessions] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [profileLogoDraft, setProfileLogoDraft] = useState<ProfileLogoKey>('initials');
  const [profileSaveBusy, setProfileSaveBusy] = useState(false);
  const [localProfile, setLocalProfile] = useState<LocalProfile>(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('cadence-profile-local') : null;
      const saved = raw ? JSON.parse(raw) as Partial<LocalProfile> : {};
      return {
        name: typeof saved.name === 'string' ? saved.name : '',
        logo: PROFILE_LOGO_KEYS.includes(saved.logo as ProfileLogoKey) ? saved.logo as ProfileLogoKey : 'initials',
        avatarData: typeof saved.avatarData === 'string' ? saved.avatarData : '',
      };
    } catch {
      return { name: '', logo: 'initials', avatarData: '' };
    }
  });
  const metadataDisplayName = typeof authSession?.user.user_metadata?.display_name === 'string'
    ? authSession.user.user_metadata.display_name.trim() : '';
  const profileDisplayName = authSession
    ? (metadataDisplayName || authSession.user.email?.split('@')[0] || 'Your workspace')
    : (localProfile.name.trim() || 'Your workspace');
  const metadataLogo = authSession?.user.user_metadata?.avatar_key as ProfileLogoKey | undefined;
  const profileLogo: ProfileLogoKey = authSession
    ? (metadataLogo && PROFILE_LOGO_KEYS.includes(metadataLogo) ? metadataLogo : 'initials')
    : localProfile.logo;
  const metadataAvatarData = typeof authSession?.user.user_metadata?.avatar_data === 'string' ? authSession.user.user_metadata.avatar_data : '';
  const profilePhoto = authSession ? metadataAvatarData : (localProfile.avatarData || '');
  const [profilePhotoDraft, setProfilePhotoDraft] = useState('');

  const openProfileSettings = () => {
    setProfileNameDraft(profileDisplayName === 'Your workspace' ? '' : profileDisplayName);
    setProfileLogoDraft(profileLogo);
    setProfilePhotoDraft(profilePhoto);
    setShowProfileModal(true);
  };

  const handleProfilePhotoFile = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setToast('Choose an image file for your profile photo.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setToast('Choose an image smaller than 10 MB.');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const side = 112;
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = side;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not process this image.');
      const scale = Math.max(side / image.naturalWidth, side / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.drawImage(image, (side - width) / 2, (side - height) / 2, width, height);
      let photo = canvas.toDataURL('image/webp', 0.68);
      if (!photo.startsWith('data:image/webp')) photo = canvas.toDataURL('image/jpeg', 0.68);
      if (photo.length > 40_000) photo = canvas.toDataURL('image/jpeg', 0.5);
      if (photo.length > 40_000) throw new Error('This image could not be compressed enough. Try a simpler photo.');
      setProfilePhotoDraft(photo);
      setToast('Photo ready. Save your profile to apply it.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not read this image. Try another file.');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const saveProfile = async () => {
    const displayName = profileNameDraft.trim().replace(/\s+/g, ' ').slice(0, 32);
    if (!displayName) {
      setToast('Enter a username before saving.');
      return;
    }
    setProfileSaveBusy(true);
    try {
      if (authSession && supabase) {
        const { error } = await supabase.auth.updateUser({
          data: { display_name: displayName, avatar_key: profileLogoDraft, avatar_data: profilePhotoDraft },
        });
        if (error) throw error;
        setAuthSession((current) => current ? {
          ...current,
          user: {
            ...current.user,
            user_metadata: { ...current.user.user_metadata, display_name: displayName, avatar_key: profileLogoDraft, avatar_data: profilePhotoDraft },
          },
        } : current);
      } else {
        const nextProfile = { name: displayName, logo: profileLogoDraft, avatarData: profilePhotoDraft };
        window.localStorage.setItem('cadence-profile-local', JSON.stringify(nextProfile));
        setLocalProfile(nextProfile);
      }
      setShowProfileModal(false);
      setToast('Profile updated.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      setToast('Could not save your profile. ' + message);
    } finally {
      setProfileSaveBusy(false);
    }
  };
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [workspaceReady, setWorkspaceReady] = useState(!supabaseConfigured);
  const [cloudStatus, setCloudStatus] = useState(supabaseConfigured ? 'Connecting…' : 'Saved locally');
  const [cloudError, setCloudError] = useState('');
  const today = todayKey();
  const currentReminderTime = String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0');
  // On-open review is only for timed items whose scheduled time has passed.
  const pendingReviewHabits = useMemo(
    () => habits.filter((habit) => today >= habit.createdAt && isDue(habit, today) && !habit.logs[today]
      && habit.reminderEnabled && Boolean(habit.reminderTime) && habit.reminderTime! <= currentReminderTime),
    [habits, today, currentReminderTime],
  );
  const pendingReviewTasks = useMemo(
    () => tasks.filter((task) => task.date <= today && Boolean(task.time) && task.time! <= currentReminderTime
      && taskOccursOn(task, today) && !taskIsDone(task, today)),
    [tasks, today, currentReminderTime],
  );
  const dueTodayHabits = habits.filter((habit) => today >= habit.createdAt && isDue(habit, today));
  const pendingTodayHabits = dueTodayHabits.filter((habit) => !habit.logs[today]);
  const experimentHabit = pendingTodayHabits[0] ?? habits[0] ?? null;
  const experimentMode = pendingTodayHabits.length > 0 ? 'pending' : dueTodayHabits.length > 0 ? 'complete' : 'setup';
  const rawExperimentCue = experimentHabit?.cue?.trim() ?? '';
  const experimentCue = rawExperimentCue && !/choose a consistent|choose your cue|add a cue/i.test(rawExperimentCue)
    ? rawExperimentCue
    : 'your next regular cue';
  const rawExperimentAction = experimentHabit?.minimum?.trim() || 'do the smallest version for two minutes';
  const experimentAction = rawExperimentAction.charAt(0).toLowerCase() + rawExperimentAction.slice(1);
  const activeReminderMedia = parseReminderMedia(activeReminder?.reminderSoundUrl);
  const pushArrivalMedia = parseReminderMedia(pushArrival?.kind === 'task' ? pushArrival.reminderSoundUrl : undefined);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setBackgroundPushAvailable(false);
      return undefined;
    }
    let cancelled = false;
    setBackgroundPushAvailable(true);
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      if (!cancelled) setBackgroundPushEnabled(Boolean(subscription));
    }).catch(() => {
      if (!cancelled) setBackgroundPushAvailable(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onPushMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; payload?: { kind?: string; id?: string; title?: string; body?: string; soundUrl?: string } } | undefined;
      if (message?.type !== 'CADENCE_PUSH_REMINDER' || !message.payload) return;
      const payload = message.payload;
      // A push received while this tab is hidden should trigger the same
      // music/alarm path as a reminder caught by the page timer.
      if (payload.kind === 'habit') {
        const habit = habits.find((item) => item.id === payload.id);
        if (!habit || habit.logs[today]) return;
        setReminderSoundStopped(false);
        setActiveReminder((current) => current || {
          habitId: habit.id,
          habitName: habit.name,
          reminderTime: habit.reminderTime || (String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0')),
          reminderSoundUrl: habit.reminderSoundUrl || payload.soundUrl || '',
          localRingtone: habitLocalRingtones[habit.id],
        });
        return;
      }
      if (payload.kind === 'task') {
        const task = tasks.find((item) => item.id === payload.id);
        if (task && taskIsDone(task, today)) return;
        setReminderSoundStopped(false);
        setPushArrival((current) => current || {
          kind: 'task',
          title: payload.title || (task ? 'Time for ' + task.title : 'Your task reminder'),
          body: payload.body || 'Your planned time has arrived. Start with the smallest useful next step.',
          taskId: task?.id ?? payload.id,
          reminderSoundUrl: task?.reminderSoundUrl || payload.soundUrl || '',
          localRingtone: task ? taskLocalRingtones[task.id] : undefined,
        });
        return;
      }
      if (payload.kind === 'focus') {
        setReminderSoundStopped(false);
        setPushArrival((current) => current || {
          kind: 'focus',
          title: payload.title || 'Focus block complete',
          body: payload.body || 'Your scheduled focus session has ended. Take a short reset before choosing your next step.',
        });
      }
    };
    navigator.serviceWorker.addEventListener('message', onPushMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onPushMessage);
  }, [habits, tasks, today, habitLocalRingtones, taskLocalRingtones]);

  // The service worker adds this query parameter when a user clicks a
  // background notification. Route the click into the correct workspace view.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reminder = params.get('cadenceReminder');
    if (!reminder) return;
    setPendingPushReminder(reminder);
    const kind = reminder.split(':', 1)[0];
    if (kind === 'habit') setPage('Habits');
    if (kind === 'task') setPage('Tasks');
    if (kind === 'focus') setPage('Focus');
    params.delete('cadenceReminder');
    const rest = params.toString();
    const cleanUrl = window.location.pathname + (rest ? '?' + rest : '') + window.location.hash;
    window.history.replaceState(window.history.state, '', cleanUrl);
  }, []);

  useEffect(() => {
    if (!pendingPushReminder || !workspaceReady) return;
    const divider = pendingPushReminder.indexOf(':');
    const kind = divider < 0 ? pendingPushReminder : pendingPushReminder.slice(0, divider);
    const id = divider < 0 ? '' : pendingPushReminder.slice(divider + 1);
    if (kind === 'focus') {
      setPage('Focus');
      setPushArrival({
        kind: 'focus',
        title: 'Focus block complete',
        body: 'Your scheduled focus session has ended. Take a short reset before choosing your next step.',
      });
      setPendingPushReminder(null);
      return;
    }
    if (kind === 'habit') {
      const habit = habits.find((item) => item.id === id);
      if (!habit) return;
      setPage('Habits');
      if (habit.logs[today]) {
        setToast(habit.name + ' is already checked off for today. Nice work.');
      } else {
        setReminderSoundStopped(false);
        setActiveReminder((current) => current || {
          habitId: habit.id,
          habitName: habit.name,
          reminderTime: habit.reminderTime || (String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0')),
          reminderSoundUrl: habit.reminderSoundUrl || '',
          localRingtone: habitLocalRingtones[habit.id],
        });
      }
      setPendingPushReminder(null);
      return;
    }
    if (kind === 'task') {
      const task = tasks.find((item) => item.id === id);
      setPage('Tasks');
      setPushArrival({
        kind: 'task',
        title: task ? 'Time for ' + task.title : 'Your task reminder',
        body: task ? 'Your planned time has arrived. Start with the smallest useful next step.' : 'A scheduled task reminder arrived. Review Tasks to see what is next.',
        taskId: task?.id,
        reminderSoundUrl: task?.reminderSoundUrl || '',
        localRingtone: task ? taskLocalRingtones[task.id] : undefined,
      });
      setPendingPushReminder(null);
    }
  }, [pendingPushReminder, workspaceReady, habits, tasks, today, habitLocalRingtones, taskLocalRingtones]);

  useEffect(() => {
    const pageRoot = document.querySelector<HTMLElement>('.page-transition-shell');
    if (!pageRoot) return;

    const revealSelector = [
      '.page-intro',
      '.analytics-page-header',
      '.analytics-metric-card',
      '.analytics-chart-panel',
      '.panel',
      '.today-main-card',
      '.today-side-card',
      '.habit-detail-row',
      '.principle-card',
      '.tasks-list-row',
      '.focus-timer-panel',
      '.planner-calendar',
      '.planner-week-grid'
    ].join(',');

    const targets = Array.from(pageRoot.querySelectorAll<HTMLElement>(revealSelector))
      .filter((element) => element.dataset.motionReveal !== 'visible');

    if (!targets.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      targets.forEach((element) => { element.dataset.motionReveal = 'visible'; });
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target as HTMLElement;
        element.dataset.motionReveal = 'visible';
        observer.unobserve(element);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });

    targets.forEach((element, index) => {
      element.dataset.motionReveal = 'pending';
      element.style.setProperty('--motion-order', String(index % 4));
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [page, habits.length, tasks.length]);

  const unlockReminderAudio = () => {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new window.AudioContext();
      }
      const context = audioContextRef.current;
      if (context.state === 'suspended') {
        void context.resume().catch(() => undefined);
      }
    } catch {
      // Audio can be unavailable in restricted browser contexts; the alert UI still works.
    }
  };

  const playReminderMelody = () => {
    const context = audioContextRef.current;
    if (!context || context.state === 'closed') return;

    const playNotes = () => {
      if (context.state !== 'running') return;
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

    if (context.state === 'suspended') {
      void context.resume().then(playNotes).catch(() => undefined);
      return;
    }
    playNotes();
  };

  const createLocalRingtone = (file: File): LocalRingtone => {
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = 0;
    // Prime this media element from the user's Save gesture for browser autoplay permission.
    void audio.play().then(() => {
      window.setTimeout(() => {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* Ignore non-seekable audio. */ }
        audio.volume = 1;
      }, 120);
    }).catch(() => { audio.volume = 1; });
    const ringtone = { url, name: file.name, audio };
    localRingtoneRegistryRef.current.add(ringtone);
    return ringtone;
  };

  const releaseLocalRingtone = (ringtone: LocalRingtone) => {
    ringtone.audio.pause();
    ringtone.audio.loop = false;
    ringtone.audio.removeAttribute('src');
    ringtone.audio.load();
    URL.revokeObjectURL(ringtone.url);
    localRingtoneRegistryRef.current.delete(ringtone);
  };

  const startLocalRingtonePlayback = (ringtone: LocalRingtone) => {
    unlockReminderAudio();
    const audio = ringtone.audio;
    if (!audio.paused && !audio.ended) return;
    audio.loop = true;
    audio.volume = 1;
    try { audio.currentTime = 0; } catch { /* Use current position if the format is not seekable. */ }
    void audio.play().catch(() => {
      playReminderMelody();
      if (!localRingtoneFallbackNotifiedRef.current) {
        localRingtoneFallbackNotifiedRef.current = true;
        setToast('The browser blocked the uploaded track, so Cadence is repeating its alarm tone instead.');
      }
    });
  };

  // Unlock Web Audio during a real user gesture, so a reminder can sound even
  // while Cadence is in a background tab or the browser is minimized.
  useEffect(() => {
    const unlock = () => unlockReminderAudio();
    window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, true);
    const onVisibilityChange = () => {
      if (!document.hidden && audioContextRef.current?.state === 'suspended') {
        void audioContextRef.current.resume().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('touchstart', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const playFocusCompletionSound = (loop = false) => {
    if (focusRingtoneKind === 'custom') {
      const media = parseReminderMedia(focusRingtoneData);
      if (!media) {
        if (!loop) setToast('Add a valid Spotify or YouTube link in Focus settings first.');
        return;
      }
      if (!loop) {
        setFocusMusicPreviewOpen(true);
        setToast('Your soundtrack is ready. Press Play in the embedded player to start it.');
      }
      return;
    }

    unlockReminderAudio();
    const context = audioContextRef.current;
    if (!context) return;
    if (focusRingtoneKind === 'chime') {
      playReminderMelody();
      return;
    }
    const notes = focusRingtoneKind === 'bell'
      ? [1046, 1318, 1046, 784]
      : [523, 659, 784, 659, 523];
    notes.forEach((frequency, index) => {
      const startAt = context.currentTime + index * (focusRingtoneKind === 'bell' ? 0.28 : 0.16);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = focusRingtoneKind === 'bell' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(focusRingtoneKind === 'bell' ? 0.18 : 0.11, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + (focusRingtoneKind === 'bell' ? 0.24 : 0.13));
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + (focusRingtoneKind === 'bell' ? 0.26 : 0.15));
    });
  };

  const primeFocusAlarmAudio = () => {
    unlockReminderAudio();
    const audio = focusAlarmAudioRef.current;
    if (!audio || !focusLocalAudioUrl || !audio.paused) return;
    const originalVolume = audio.volume;
    audio.loop = false;
    audio.volume = 0;
    // Start silently during the Start button gesture so Chrome can authorize
    // subsequent playback from this same media element when the timer ends.
    void audio.play().then(() => {
      window.setTimeout(() => {
        audio.pause();
        try { audio.currentTime = 0; } catch { /* Some encodings are not immediately seekable. */ }
        audio.volume = originalVolume;
      }, 120);
    }).catch(() => { audio.volume = originalVolume; });
  };

  const startFocusAlarmPlayback = () => {
    unlockReminderAudio();
    if (focusRingtoneKind === 'custom' && focusLocalAudioUrl && focusAlarmAudioRef.current) {
      const audio = focusAlarmAudioRef.current;
      if (!audio.paused && !audio.ended) return;
      if (focusCompletionAudioRef.current) focusCompletionAudioRef.current.pause();
      audio.loop = true;
      audio.volume = 1;
      try { audio.currentTime = 0; } catch { /* Start from its current position if required. */ }
      void audio.play().catch(() => {
        playReminderMelody();
        if (!focusAudioFallbackNotifiedRef.current) {
          focusAudioFallbackNotifiedRef.current = true;
          setToast('Chrome blocked the uploaded track, so Cadence is playing its alarm tone instead. The alarm will repeat until stopped.');
        }
      });
      return;
    }
    if (focusRingtoneKind === 'custom') {
      // Streaming embeds try autoplay in the completion dialog. Keep a native
      // Cadence alarm running as a fallback if the provider/browser blocks it.
      if (parseReminderMedia(focusRingtoneData)) setFocusMusicPreviewOpen(true);
      playReminderMelody();
      return;
    }
    playFocusCompletionSound(true);
  };

  const saveFocusMusicLink = () => {
    const media = parseReminderMedia(focusRingtoneDraft);
    if (!media) {
      setToast('Paste a valid Spotify or YouTube link (track/video, album, or playlist).');
      return;
    }
    try {
      if (focusAlarmAudioRef.current) {
        focusAlarmAudioRef.current.pause();
        focusAlarmAudioRef.current.loop = false;
        focusAlarmAudioRef.current.removeAttribute('src');
        focusAlarmAudioRef.current.load();
        focusAlarmAudioRef.current = null;
      }
      if (focusLocalAudioUrl) URL.revokeObjectURL(focusLocalAudioUrl);
      setFocusLocalAudioUrl('');
      setFocusLocalAudioName('');
      window.localStorage.setItem('cadence-focus-music-url', media.originalUrl);
      window.localStorage.setItem('cadence-focus-ringtone-name', media.provider);
      window.localStorage.setItem('cadence-focus-ringtone-kind', 'custom');
      setFocusRingtoneData(media.originalUrl);
      setFocusRingtoneName(media.provider);
      setFocusRingtoneKind('custom');
      setFocusMusicPreviewOpen(true);
      setToast(media.provider + ' link saved. Press Play in the embedded player to preview.');
    } catch {
      setToast('Could not save this link in your browser. Check local storage settings and try again.');
    }
  };

  const removeFocusMusicLink = () => {
    try {
      window.localStorage.removeItem('cadence-focus-music-url');
      window.localStorage.removeItem('cadence-focus-ringtone-data');
      window.localStorage.removeItem('cadence-focus-ringtone-name');
    } catch { /* Storage may be unavailable. */ }
    setFocusRingtoneData('');
    setFocusRingtoneDraft('');
    setFocusRingtoneName('');
    setFocusMusicPreviewOpen(false);
    if (focusRingtoneKind === 'custom') {
      setFocusRingtoneKind('chime');
      try { window.localStorage.setItem('cadence-focus-ringtone-kind', 'chime'); } catch { /* Storage may be unavailable. */ }
    }
    setToast('Custom soundtrack link removed.');
  };

  const handleHabitRingtoneUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!isSupportedAudioMime(file.type)) {
      setHabitRingtoneFile(null);
      setToast('Choose a valid audio file.');
      return;
    }
    if (!isRingtoneUploadSizeAllowed(file.size)) {
      setHabitRingtoneFile(null);
      setToast('Choose an audio file 50 MB or smaller.');
      return;
    }
    setHabitRingtoneFile(file);
    setHabitDraft((draft) => ({ ...draft, reminderSoundUrl: '' }));
    setToast('Ringtone selected. Save the habit to use it during this browser session.');
  };

  const handleFocusAudioUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isSupportedAudioMime(file.type)) {
      setToast('Choose a valid audio file.');
      event.target.value = '';
      return;
    }
    if (!isRingtoneUploadSizeAllowed(file.size)) {
      setToast('Choose a non-empty audio file up to 50 MB.');
      event.target.value = '';
      return;
    }
    if (focusAlarmAudioRef.current) {
      focusAlarmAudioRef.current.pause();
      focusAlarmAudioRef.current.loop = false;
      focusAlarmAudioRef.current.removeAttribute('src');
      focusAlarmAudioRef.current.load();
    }
    if (focusLocalAudioUrl) URL.revokeObjectURL(focusLocalAudioUrl);
    const url = URL.createObjectURL(file);
    const alarmAudio = new Audio(url);
    alarmAudio.preload = 'auto';
    alarmAudio.loop = true;
    focusAlarmAudioRef.current = alarmAudio;
    setFocusLocalAudioUrl(url);
    setFocusLocalAudioName(file.name);
    setFocusMusicPreviewOpen(false);
    setFocusRingtoneKind('custom');
    try { window.localStorage.setItem('cadence-focus-ringtone-kind', 'custom'); } catch { /* Storage may be unavailable. */ }
    setToast('Audio loaded for this session. Press Play to start it.');
  };

  const previewFocusRingtone = () => {
    if (focusLocalAudioUrl) {
      const audio = focusCompletionAudioRef.current;
      if (audio) {
        audio.src = focusLocalAudioUrl;
        void audio.play().then(() => setToast('Your uploaded soundtrack is playing.')).catch(() => setToast('Press Play on the audio player to start playback.'));
      }
      return;
    }
    if (focusRingtoneKind === 'custom') {
      if (!parseReminderMedia(focusRingtoneData)) {
        setToast('Save a valid Spotify or YouTube link first.');
        return;
      }
      setFocusMusicPreviewOpen(true);
      setToast('Use the player controls to start your soundtrack.');
      return;
    }
    unlockReminderAudio();
    playFocusCompletionSound();
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

  const enableBackgroundPushNotifications = async () => {
    // This button click is a user gesture; unlock audio before the first reminder.
    unlockReminderAudio();
    if (!backgroundPushAvailable) {
      setToast('Background push is not supported in this browser. Try the latest Chrome or Edge over HTTPS.');
      return;
    }
    if (!supabase || !authSession) {
      setToast('Sign in to your Cadence workspace before enabling background alerts.');
      return;
    }
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== 'granted') {
        setToast('Allow notifications for Cadence in your browser settings, then try again.');
        return;
      }
    }
    setBackgroundPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { data: keyData, error: keyError } = await supabase.functions.invoke('cadence-push', { body: { action: 'public-key' } });
      if (keyError) throw keyError;
      if (!keyData?.publicKey) throw new Error('The push service did not return its application key.');
      const encoded = String(keyData.publicKey).replace(/-/g, '+').replace(/_/g, '/');
      const padded = encoded + '='.repeat((4 - encoded.length % 4) % 4);
      const binary = window.atob(padded);
      const applicationServerKey = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const { error: saveError } = await supabase.functions.invoke('cadence-push', {
        body: { action: 'subscribe', subscription: subscription.toJSON(), timezone },
      });
      if (saveError) throw saveError;
      setBackgroundPushEnabled(true);
      setToast('Background alerts are enabled on this device for scheduled habits, tasks, and focus sessions.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown push setup error';
      setToast('Could not enable background alerts: ' + message);
    } finally {
      setBackgroundPushBusy(false);
    }
  };

  const disableBackgroundPushNotifications = async () => {
    if (!supabase || !authSession || !('serviceWorker' in navigator)) return;
    setBackgroundPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { error } = await supabase.functions.invoke('cadence-push', {
          body: { action: 'unsubscribe', endpoint: subscription.endpoint },
        });
        if (error) throw error;
        await subscription.unsubscribe();
      }
      setBackgroundPushEnabled(false);
      setToast('Background alerts have been disabled on this device.');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown push removal error';
      setToast('Could not disable background alerts: ' + message);
    } finally {
      setBackgroundPushBusy(false);
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
        const preferences = workspace.preferences as { dark?: unknown; pendingReviewEnabled?: unknown } | null;
        if (typeof preferences?.dark === 'boolean') setDark(preferences.dark);
        if (typeof preferences?.pendingReviewEnabled === 'boolean') {
          setPendingReviewEnabled(preferences.pendingReviewEnabled);
          try { window.localStorage.setItem('cadence-pending-review-enabled', String(preferences.pendingReviewEnabled)); } catch { /* Preferences remain in the workspace. */ }
        }
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits, tasks, focusSessions, preferences: { dark, pendingReviewEnabled } }));
      return undefined;
    }
    if (!authSession || !workspaceReady) return undefined;

    const snapshot = { habits, tasks, focusSessions, preferences: { dark, pendingReviewEnabled } };
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
  }, [habits, tasks, focusSessions, dark, pendingReviewEnabled, authSession?.user.id, workspaceReady]);

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
      setPushArrival((current) => current || {
        kind: 'focus',
        title: 'Focus block complete',
        body: 'Your scheduled focus session has ended. Take a short reset before choosing your next step.',
      });
      // Start the alarm immediately on completion; don't wait for navigation or a later render.
      startFocusAlarmPlayback();
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Focus block complete', {
            body: 'You made the time. Take a short reset before choosing your next step.',
          });
        } catch { /* Notifications may be unavailable in some browser contexts. */ }
      }
    }
  }, [focusRunning, focusSeconds, focusRingtoneKind, focusRingtoneData]);

  useEffect(() => {
    if (!splashFinished) return undefined;
    if (!workspaceReady) {
      pendingReviewShownRef.current = false;
      return undefined;
    }
    if (pendingReviewShownRef.current) return undefined;
    pendingReviewShownRef.current = true;
    if (!pendingReviewEnabled) return undefined;

    const hasPendingHabits = pendingReviewHabits.length > 0;
    const hasPendingTasks = pendingReviewTasks.length > 0;
    if (!hasPendingHabits && !hasPendingTasks) return undefined;

    // The overview alert covers only already-due timed reminders, preventing
    // future reminders from appearing early and avoiding duplicate alarm dialogs.
    pendingReviewHabits.forEach((habit) => {
      firedRemindersRef.current.add(`${habit.id}:${today}`);
      // Pending-on-open review is also an overdue scheduled reminder.
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Time for ${habit.name}`, {
            body: 'A small step is enough. Open Cadence to check in.',
            tag: `cadence-habit-${habit.id}:${today}`,
          });
        } catch { /* The in-app pending reminder remains available. */ }
      }
    });
    pendingReviewTasks.forEach((task) => {
      const key = `${task.id}:${today}`;
      const alreadyAlerted = firedTaskRemindersRef.current.has(key);
      firedTaskRemindersRef.current.add(key);
      if (!alreadyAlerted && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const notification = new Notification('Overdue task: ' + task.title, {
            body: 'This task is still incomplete. Open Cadence to review it.',
            tag: 'cadence-task-overdue-' + task.id + '-' + today,
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
            setPage('Tasks');
          };
        } catch { /* The in-app pending review remains available. */ }
      }
    });
    pendingReviewActiveRef.current = true;
    setReminderSoundStopped(false);
    setPendingReviewOpen(true);
    return undefined;
  }, [splashFinished, workspaceReady, pendingReviewEnabled, pendingReviewHabits, pendingReviewTasks, today]);

  useEffect(() => {
    if (!pendingReviewOpen || reminderSoundStopped) return undefined;
    // Prefer the uploaded soundtrack for an overdue habit; use the chime only
    // when no in-session custom audio is available.
    const customRingtone =
      pendingReviewHabits.map((habit) => habitLocalRingtones[habit.id]).find(Boolean)
      ?? pendingReviewTasks.map((task) => taskLocalRingtones[task.id]).find(Boolean);
    if (customRingtone) {
      startLocalRingtonePlayback(customRingtone);
      return () => customRingtone.audio.pause();
    }
    const play = () => {
      unlockReminderAudio();
      playReminderMelody();
    };
    play();
    const interval = window.setInterval(play, 2800);
    return () => window.clearInterval(interval);
  }, [pendingReviewOpen, reminderSoundStopped, pendingReviewHabits, pendingReviewTasks, habitLocalRingtones, taskLocalRingtones]);

  useEffect(() => {
    const checkReminders = () => {
      if (pendingReviewActiveRef.current) return;
      const now = new Date();
      const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const day = toKey(now);
      // Catch up on reminders that passed while the laptop/browser was asleep or closed.
      // The day-level key prevents the same overdue reminder firing every minute.
      const due = habits.filter((habit) => habit.reminderEnabled && isDue(habit, day) && Boolean(habit.reminderTime) && habit.reminderTime! <= currentTime && !habit.logs[day]);
      const fresh = due.filter((habit) => !firedRemindersRef.current.has(`${habit.id}:${day}`));
      fresh.forEach((habit) => {
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const notification = new Notification(`Time for ${habit.name}`, {
              body: 'A small step is enough. Open Cadence to check in.',
              tag: `cadence-habit-${habit.id}-${day}`,
            });
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          } catch { /* Keep the in-app alarm even if desktop delivery fails. */ }
        }
        // Consume the key only after attempting desktop delivery.
        firedRemindersRef.current.add(`${habit.id}:${day}`);
      });
      if (fresh.length) {
        setReminderSoundStopped(false);
        setActiveReminder((current) => current || {
          habitId: fresh[0].id,
          habitName: fresh[0].name,
          reminderTime: fresh[0].reminderTime || currentTime,
          reminderSoundUrl: fresh[0].reminderSoundUrl,
          localRingtone: habitLocalRingtones[fresh[0].id],
        });
      }

      // Planner tasks can have timed reminders too. Keep them independent from
      // habit reminders so a task still alerts when no habit alarm is configured.
      // Tasks are also recovered if their scheduled minute passed while Cadence was closed.
      const dueTasks = tasks.filter((task) => Boolean(task.time) && task.time! <= currentTime && taskOccursOn(task, day) && !taskIsDone(task, day));
      const freshTasks = dueTasks.filter((task) => !firedTaskRemindersRef.current.has(`${task.id}:${day}`));
      freshTasks.forEach((task) => {
        firedTaskRemindersRef.current.add(`${task.id}:${day}`);
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            const notification = new Notification('Time for ' + task.title, {
              body: 'Your planned time has arrived. Open Cadence and take the next step.',
              tag: 'cadence-task-' + task.id + '-' + day,
            });
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          } catch { /* Scheduled push notifications remain available when configured. */ }
        }
      });
      if (freshTasks.length) {
        setReminderSoundStopped(false);
        // A custom task ringtone must not overlap a previously active habit chime.
        if (freshTasks.length === 1 && taskLocalRingtones[freshTasks[0].id]) setActiveReminder(null);
        setToast(freshTasks.length === 1 ? 'Time for ' + freshTasks[0].title : freshTasks.length + ' tasks are due now.');
        // If a habit is due at the same moment, its alarm already loops;
        // otherwise keep a task alarm open until it is acknowledged.
        if (!fresh.length) {
          setPushArrival((current) => current || {
            kind: 'task',
            title: freshTasks.length === 1 ? 'Time for ' + freshTasks[0].title : freshTasks.length + ' tasks are due now',
            body: freshTasks.length === 1
              ? 'Your planned time has arrived. Start with the smallest useful next step.'
              : 'Several planned tasks are due. Open Cadence to review what is next.',
            taskId: freshTasks.length === 1 ? freshTasks[0].id : undefined,
            reminderSoundUrl: freshTasks.length === 1 ? freshTasks[0].reminderSoundUrl || '' : '',
            localRingtone: freshTasks.length === 1 ? taskLocalRingtones[freshTasks[0].id] : undefined,
          });
        }
      }
    };
    const interval = window.setInterval(checkReminders, 10000);
    checkReminders();
    return () => window.clearInterval(interval);
  }, [habits, tasks, habitLocalRingtones, taskLocalRingtones]);

  useEffect(() => {
    if (!activeReminder || reminderSoundStopped) {
      activeReminder?.localRingtone?.audio.pause();
      return undefined;
    }
    localRingtoneFallbackNotifiedRef.current = false;
    const play = () => {
      if (activeReminder.localRingtone) {
        const audio = activeReminder.localRingtone.audio;
        if (audio.paused || audio.ended) startLocalRingtonePlayback(activeReminder.localRingtone);
      } else playReminderMelody();
    };
    play();
    const interval = window.setInterval(play, 2800);
    return () => {
      window.clearInterval(interval);
      if (activeReminder.localRingtone) {
        const audio = activeReminder.localRingtone.audio;
        audio.pause();
        audio.loop = false;
        try { audio.currentTime = 0; } catch { /* Ignore non-seekable audio. */ }
      }
    };
  }, [activeReminder, reminderSoundStopped]);

  useEffect(() => {
    if (!pushArrival || reminderSoundStopped) {
      if (pushArrival?.localRingtone) {
        pushArrival.localRingtone.audio.pause();
        pushArrival.localRingtone.audio.loop = false;
        try { pushArrival.localRingtone.audio.currentTime = 0; } catch { /* Ignore non-seekable audio. */ }
      }
      if (pushArrival?.kind === 'focus') {
        if (focusAlarmAudioRef.current) focusAlarmAudioRef.current.pause();
        if (focusCompletionAudioRef.current) focusCompletionAudioRef.current.pause();
      }
      return undefined;
    }
    focusAudioFallbackNotifiedRef.current = false;
    localRingtoneFallbackNotifiedRef.current = false;
    const play = () => {
      if (pushArrival.kind === 'focus') startFocusAlarmPlayback();
      else if (pushArrival.localRingtone) {
        const audio = pushArrival.localRingtone.audio;
        if (audio.paused || audio.ended) startLocalRingtonePlayback(pushArrival.localRingtone);
      } else playReminderMelody();
    };
    play();
    const interval = window.setInterval(play, 2800);
    return () => {
      window.clearInterval(interval);
      if (pushArrival.kind === 'focus') {
        if (focusAlarmAudioRef.current) {
          focusAlarmAudioRef.current.pause();
          focusAlarmAudioRef.current.loop = false;
          try { focusAlarmAudioRef.current.currentTime = 0; } catch { /* Ignore non-seekable media. */ }
        }
        if (focusCompletionAudioRef.current) {
          focusCompletionAudioRef.current.pause();
          focusCompletionAudioRef.current.loop = false;
          try { focusCompletionAudioRef.current.currentTime = 0; } catch { /* Ignore non-seekable media. */ }
        }
      } else if (pushArrival.localRingtone) {
        const audio = pushArrival.localRingtone.audio;
        audio.pause();
        audio.loop = false;
        try { audio.currentTime = 0; } catch { /* Ignore non-seekable audio. */ }
      }
    };
  }, [pushArrival, reminderSoundStopped, focusRingtoneKind, focusRingtoneData, focusLocalAudioUrl]);

  useEffect(() => () => {
    if (snoozeTimeoutRef.current !== null) window.clearTimeout(snoozeTimeoutRef.current);
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
    if (focusAlarmAudioRef.current) {
      focusAlarmAudioRef.current.pause();
      focusAlarmAudioRef.current.loop = false;
      focusAlarmAudioRef.current = null;
    }
    for (const ringtone of localRingtoneRegistryRef.current) releaseLocalRingtone(ringtone);
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
  const todayHabitCompletion = dueHabits.length ? Math.round((doneToday / dueHabits.length) * 100) : null;
  const lastSevenHabitStats = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const key = shiftKey(today, index - 6);
    const due = habits.filter((habit) => isDue(habit, key));
    const done = due.filter((habit) => Boolean(habit.logs[key])).length;
    const checkIns = habits.reduce((count, habit) => count + (habit.logs[key] ? 1 : 0), 0);
    const activeStreaks = habits.filter((habit) => getCurrentStreak(habit, key) > 0).length;
    return { key, due: due.length, done, percent: due.length ? Math.round((done / due.length) * 100) : null as number | null, checkIns, activeStreaks };
  }), [habits, today]);
  const lastTwentyOneCheckins = useMemo(() => Array.from({ length: 21 }, (_, index) => {
    const key = shiftKey(today, index - 20);
    const count = habits.reduce((sum, habit) => sum + (habit.logs[key] ? 1 : 0), 0);
    return { key, count };
  }), [habits, today]);
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
    setHabitRingtoneFile(null);
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
    setHabitRingtoneFile(null);
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
    if (habitDraft.reminderEnabled && habitRingtoneFile) {
      const previousRingtone = habitLocalRingtones[next.id];
      if (previousRingtone) releaseLocalRingtone(previousRingtone);
      const uploadedRingtone = createLocalRingtone(habitRingtoneFile);
      setHabitLocalRingtones((current) => ({ ...current, [next.id]: uploadedRingtone }));
    } else if (habitDraft.reminderEnabled && reminderMedia) {
      const previousRingtone = habitLocalRingtones[next.id];
      if (previousRingtone) releaseLocalRingtone(previousRingtone);
      setHabitLocalRingtones((current) => {
        const updated = { ...current };
        delete updated[next.id];
        return updated;
      });
    }
    setHabitRingtoneFile(null);
    const wasEditing = Boolean(existing);
    const reminderMessage = habitDraft.reminderEnabled
      ? ' Reminder set for ' + formatReminderTime(habitDraft.reminderTime) + '; keep Cadence open for alerts.'
      : '';
    setHabitDraft({ ...emptyHabitDraft });
    setHabitRingtoneFile(null);
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
  const deleteTask = (taskId: string) => {
    const ringtone = taskLocalRingtones[taskId];
    if (ringtone) releaseLocalRingtone(ringtone);
    setTaskLocalRingtones((current) => {
      const updated = { ...current };
      delete updated[taskId];
      return updated;
    });
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setToast('Task removed.');
  };

  const addPlannerTask = (draft: import('./Planner').PlannerTaskDraft) => {
    const reminderMedia = parseReminderMedia(draft.reminderSoundUrl);
    if (draft.reminderSoundUrl?.trim() && !reminderMedia) {
      setToast('Add a valid YouTube or Spotify track, album, or playlist link.');
      return false;
    }
    const id = `t-${crypto.randomUUID()}`;
    const nextTask: Task = {
      id,
      title: draft.title,
      date: draft.date,
      time: draft.time,
      category: draft.category,
      recurrence: draft.recurrence,
      priority: draft.priority,
      estimate: draft.estimate,
      completed: false,
      completedDates: [],
      ...(reminderMedia ? { reminderSoundUrl: reminderMedia.originalUrl } : {}),
    };
    setTasks((current) => [...current, nextTask]);
    if (draft.reminderSoundFile) {
      const ringtone = createLocalRingtone(draft.reminderSoundFile);
      setTaskLocalRingtones((current) => ({ ...current, [id]: ringtone }));
    }
    setToast('Added to your calendar');
    return true;
  };
  const syncRemoteFocusTimer = async (action: 'focus-start' | 'focus-stop', seconds = 0) => {
    if (!supabase || !authSession || !backgroundPushEnabled) return;
    try {
      const focusLabel = tasks.find((task) => task.id === focusTaskId)?.title || 'Focus session';
      const { error } = await supabase.functions.invoke('cadence-push', {
        body: { action, seconds, label: focusLabel },
      });
      if (error) throw error;
    } catch {
      setToast('The local focus timer still works, but its background alert could not be scheduled. Check push settings.');
    }
  };
  const toggleFocusTimer = () => {
    unlockReminderAudio();
    if (!focusRunning && focusSeconds > 0) primeFocusAlarmAudio();
    if (focusSeconds === 0) {
      resetFocus();
      return;
    }
    if (focusRunning) {
      setFocusRunning(false);
      void syncRemoteFocusTimer('focus-stop');
    } else {
      setFocusRunning(true);
      void syncRemoteFocusTimer('focus-start', focusSeconds);
    }
  };
  const resetFocus = (minutes = focusPreset) => {
    setFocusRunning(false);
    void syncRemoteFocusTimer('focus-stop');
    setFocusPreset(minutes);
    setFocusSeconds(minutes * 60);
  };
  const applyCustomFocusDuration = () => {
    const minutes = Number(focusCustomMinutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
      setToast('Choose a whole number between 1 and 180 minutes.');
      return;
    }
    resetFocus(minutes);
    setToast(`Your ${minutes}-minute focus block is ready.`);
  };
  const timeText = `${String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:${String(focusSeconds % 60).padStart(2, '0')}`;
  const timerProgress = 1 - focusSeconds / (focusPreset * 60 || 1);

  if (!splashFinished) {
    return <div className="auth-loading-screen cadence-splash-screen" role="status" aria-label="Loading Cadence">
      <div className="cadence-splash-mark"><img className="cadence-splash-icon" src="/cadence-icon.svg" alt="Cadence waveform" /></div>
      <img className="cadence-splash-wordmark" src="/cadence-wordmark.svg" alt="Cadence" />
      <span className="cadence-splash-progress" aria-hidden="true"><span /></span>
    </div>;
  }

  if (supabaseConfigured && passwordRecovery) return <AuthScreen initialMode="update" />;
    if (supabaseConfigured && !authReady) {
    return <div className="auth-loading-screen"><div className="auth-loading-mark"><img className="cadence-mark-svg" src="/cadence-icon.svg" alt="Cadence waveform" /></div><h1>Preparing your workspace</h1><p>Securely loading your routines and task history…</p></div>;
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
        <div className="sidebar-section-head"><span>Your routines</span><IconButton label="Create a habit" onClick={openCreateHabit}><Plus size={15} /></IconButton></div>
        <div className="routine-list">
          {habits.slice(0, 5).map((habit) => (
            <button className="routine-mini" key={habit.id} type="button" onClick={() => { setPage('Habits'); setFilter(habit.category); }}>
              <span className="mini-emoji tone-violet"><HabitGlyph habit={habit} size={13} /></span><span>{habit.name}</span><span className={`mini-check ${habit.logs[today] ? 'checked' : ''}`}>{habit.logs[today] ? <Check size={11} /> : ''}</span>
            </button>
          ))}
          {habits.length === 0 && <p className="sidebar-empty">Your first routine starts here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="profile-row">
            <button type="button" className="profile-identity" onClick={openProfileSettings} aria-label="Customize username and profile logo" title="Customize profile">
              <span className={`avatar profile-avatar ${profilePhoto ? 'profile-avatar-photo-mode' : profileLogo === 'initials' ? 'profile-avatar-initials-mode' : 'profile-avatar-symbol-mode'}`}>{profilePhoto ? <img className="profile-avatar-photo" src={profilePhoto} alt="" /> : <ProfileGlyph logo={profileLogo} name={profileDisplayName} size={17} />}</span>
              <span className="profile-copy"><b>{profileDisplayName}</b><small>{authSession ? 'Synced workspace' : 'Personal edition'}</small></span>
            </button>
            {authSession && supabase
              ? <button type="button" className="profile-signout" aria-label="Sign out" title="Sign out" onClick={() => { void supabase?.auth.signOut(); }}><LogOut size={15}/></button>
              : <button type="button" className="profile-edit-trigger" aria-label="Customize profile" title="Customize profile" onClick={openProfileSettings}><Pencil size={15} /></button>}
          </div>
          <div className="sidebar-tools">
            <button type="button" onClick={() => setDark((current) => !current)}><span>{dark ? <Sun size={15} /> : <Moon size={15} />}</span>{dark ? 'Soft violet appearance' : 'Midnight appearance'}</button>
            <button type="button" className="pending-alert-setting" aria-pressed={pendingReviewEnabled} title="Show a looping alert for unfinished tasks and habits whenever Cadence opens" onClick={() => {
              const nextEnabled = !pendingReviewEnabled;
              setPendingReviewEnabled(nextEnabled);
              try { window.localStorage.setItem('cadence-pending-review-enabled', String(nextEnabled)); } catch { /* The current session preference still applies. */ }
              if (!nextEnabled) {
                pendingReviewActiveRef.current = false;
                setPendingReviewOpen(false);
                setReminderSoundStopped(false);
              }
              setToast(nextEnabled ? 'Pending-on-open alerts enabled.' : 'Pending-on-open alerts disabled.');
            }}><span><Bell size={15} /></span>Pending alerts: {pendingReviewEnabled ? 'On' : 'Off'}</button>
            {!supabaseConfigured && <span className="local-mode-note">LOCAL MODE · CLOUD NOT CONNECTED</span>}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{page}</b></div>
          <div className="topbar-actions"><span className="local-save" title={cloudError || cloudStatus}><span className="save-dot" /> {cloudStatus}</span><IconButton label={backgroundPushEnabled ? 'Background alerts enabled' : 'Enable background alerts'} onClick={() => { if (backgroundPushEnabled) { setPage('Focus'); setToast('Background alerts are enabled on this device. Manage them in the Focus settings.'); } else { void enableBackgroundPushNotifications(); } }}><Bell size={17} /></IconButton><button className="date-chip" type="button" onClick={() => setPage('Today')}><CalendarDays size={15} />{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<ChevronDown size={13} /></button></div>
        </header>

        <div key={page} className="page-transition-shell">
        {page === 'Today' && <>
          <section className="today-analytics-overview" aria-label="Habit analytics overview">
            <div className="analytics-page-header today-analytics-page-header">
              <div>
                <div className="analytics-kicker"><i /> YOUR ROUTINE DATA</div>
                <h1>Habit <span>Analytics</span></h1>
                <p>Consistency, made visible. Review your patterns and make the next action easier.</p>
              </div>
              <div className="analytics-header-actions">
                
                <button type="button" className="analytics-plain-button" onClick={() => setPage('Planner')}><CalendarDays size={13} /> Planner <ArrowUpRight size={12} /></button>
                <button type="button" className="primary-button" onClick={openCreateHabit}><Plus size={14} /> New routine</button>
              </div>
            </div>

            <nav className="analytics-view-tabs today-overview-tabs" aria-label="Workspace sections">
              <button type="button" className="active" aria-current="page" onClick={() => setPage('Today')}><BarChart3 size={12} /> Overview</button>
              <button type="button" onClick={() => setPage('Habits')}><Target size={12} /> Routines</button>
              <button type="button" onClick={() => setPage('Planner')}><CalendarDays size={12} /> Calendar</button>
              <button type="button" onClick={() => setPage('Focus')}><Focus size={12} /> Focus sessions</button>
              <button type="button" onClick={() => setPage('Insights')}><Activity size={12} /> Reports</button>
            </nav>

            <div className="analytics-metric-grid today-analytics-metrics">
              <article className="analytics-metric-card analytics-metric-primary">
                <div className="analytics-metric-label">DAILY COMPLETION <span className="analytics-metric-icon tone-blue"><Activity size={12} /></span></div>
                <div className="analytics-metric-value">{todayHabitCompletion === null ? '—' : todayHabitCompletion}{todayHabitCompletion !== null && <small>%</small>}</div>
                <div className="analytics-metric-bottom"><span>{doneToday} of {dueHabits.length} routines complete</span></div>
                <div className="analytics-metric-line" role="img" aria-label="Daily habit completion for the last seven days">{lastSevenHabitStats.map((day) => <i key={day.key} className={day.percent === null ? 'is-empty' : ''} title={day.key + ': ' + (day.percent === null ? 'no habits scheduled' : day.percent + '% complete')} style={{ height: (day.percent === null ? 3 : Math.max(4, Math.round(day.percent * .22 + 3))) + 'px' }} />)}</div>
              </article>

              <article className="analytics-metric-card">
                <div className="analytics-metric-label">7-DAY CONSISTENCY <span className="analytics-metric-icon tone-pink"><CalendarDays size={12} /></span></div>
                <div className="analytics-metric-value">{consistency}<small>%</small></div>
                <div className="analytics-metric-bottom"><span>Across the last seven days</span></div>
                <div className="analytics-mini-bars" role="img" aria-label="Daily completion contributing to seven-day consistency">{lastSevenHabitStats.map((day) => <i key={day.key} className={day.percent === null ? 'is-empty' : ''} title={day.key + ': ' + (day.percent === null ? 'no habits scheduled' : day.percent + '% complete')} style={{ height: (day.percent === null ? 3 : Math.max(4, Math.round(day.percent * .23 + 3))) + 'px' }} />)}</div>
              </article>

              <article className="analytics-metric-card">
                <div className="analytics-metric-label">ACTIVE STREAKS <span className="analytics-metric-icon tone-violet"><Flame size={12} /></span></div>
                <div className="analytics-metric-value">{String(activeStreaks).padStart(2, '0')}<small>routines</small></div>
                <div className="analytics-metric-bottom"><span>Habits in motion</span></div>
                <div className="analytics-streak-steps" role="img" aria-label="Active streaks over the last seven days">{lastSevenHabitStats.map((day) => <i key={day.key} className={!habits.length ? 'is-empty' : ''} title={day.key + ': ' + day.activeStreaks + ' active streaks'} style={{ height: (habits.length ? Math.max(4, Math.round((day.activeStreaks / Math.max(1, ...lastSevenHabitStats.map((item) => item.activeStreaks))) * 21)) : 3) + 'px' }} />)}</div>
              </article>

              <article className="analytics-metric-card">
                <div className="analytics-metric-label">TOTAL CHECK-INS <span className="analytics-metric-icon tone-violet"><CheckCheck size={12} /></span></div>
                <div className="analytics-metric-value">{totalWins}<small>total</small></div>
                <div className="analytics-metric-bottom"><span>Every rep counts</span></div>
                <div className="analytics-checkin-grid" role="img" aria-label="Habit check-ins by day for the last 21 days">{lastTwentyOneCheckins.map((day) => <i key={day.key} className={day.count ? 'is-filled' : ''} style={{ opacity: day.count ? .35 + .65 * Math.min(1, day.count / Math.max(1, habits.length)) : .24 }} title={day.key + ': ' + day.count + ' check-ins'} />)}</div>
              </article>
            </div>

            <div className="analytics-main-grid today-analytics-main-grid">
              <MomentumChart habits={habits} today={today} />
              <div className="analytics-side-stack today-analytics-side-stack">
                <section className="analytics-side-card today-analytics-progress-card">
                  <div className="analytics-card-heading">
                    <div><span className="analytics-section-index">01 / TODAY</span><h2>Daily progress</h2></div>
                    <span className="analytics-live-tag"><i /> LIVE</span>
                  </div>
                  <div className="analytics-daily-ring" style={{ '--daily-percent': (todayHabitCompletion ?? 0) + '%' } as CSSProperties}>
                    <div><b>{todayHabitCompletion === null ? '—' : todayHabitCompletion}{todayHabitCompletion !== null && <small>%</small>}</b><span>COMPLETE</span></div>
                  </div>
                  <div className="analytics-today-stats">
                    <span>Completed <b>{doneToday}</b></span>
                    <span>Remaining <b>{Math.max(0, dueHabits.length - doneToday)}</b></span>
                  </div>
                  <button type="button" className="analytics-side-link" onClick={() => setPage('Habits')}>Review today's routines <ArrowRight size={13} /></button>
                </section>

                <section className="analytics-side-card analytics-next-card today-analytics-next-card">
                  <div className="analytics-card-heading">
                    <div><span className="analytics-section-index">02 / NEXT ACTION</span><h2>Keep momentum</h2></div>
                    <span className="analytics-spark-icon"><Zap size={13} /></span>
                  </div>
                  {nextHabit ? <>
                    <p>{nextHabit.name}</p>
                    <div className="analytics-next-meta">{nextHabit.category} routine{nextHabit.minimum ? ' · ' + nextHabit.minimum : ''}</div>
                    <button type="button" className="analytics-side-link" onClick={() => setPage('Habits')}>Open this routine <ArrowRight size={13} /></button>
                  </> : nextTask ? <>
                    <p>{nextTask.title}</p>
                    <div className="analytics-next-meta">{nextTask.category || 'Personal'} task · {nextTask.estimate} min</div>
                    <button type="button" className="analytics-side-link" onClick={() => setPage('Tasks')}>Open this task <ArrowRight size={13} /></button>
                  </> : <>
                    <p>You're all caught up.</p>
                    <div className="analytics-next-meta">No unfinished actions scheduled right now.</div>
                    <button type="button" className="analytics-side-link" onClick={openCreateHabit}>Plan a small win <ArrowRight size={13} /></button>
                  </>}
                </section>
              </div>
            </div>
          </section>

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
          <footer className="analytics-footer"><span><img className="cadence-footer-lockup" src="/cadence-icon.svg" alt="Cadence" width="36" height="36" /> <i>/</i> PERSONAL PERFORMANCE SYSTEM</span><span>YOUR PROGRESS, WITHOUT THE NOISE.</span></footer>
        </>}
  
        {page === 'Tasks' && <TasksPage tasks={tasks} today={today} onToggleTask={toggleTask} onAddTask={addPlannerTask} onDeleteTask={deleteTask} />}

        {page === 'Planner' && <PlannerPage habits={habits} tasks={tasks} today={today} onToggleHabit={toggleHabit} onToggleTask={toggleTask} onAddTask={addPlannerTask} />}

        {page === 'Habits' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> BUILD YOUR BASELINE</div><h1>Habits, <span>by design.</span></h1><p className="welcome-sub">Make good actions easier to start and easier to repeat.</p></div><button className="primary-button" type="button" onClick={openCreateHabit}><Plus size={16} /> Create habit</button></section>
          <section className="analytics-metric-grid today-analytics-metrics habits-overview-cards" aria-label="Routine overview">
            <article className="analytics-metric-card">
              <div className="analytics-metric-label">ACTIVE ROUTINES <span className="analytics-metric-icon tone-violet"><Target size={12} /></span></div>
              <div className="analytics-metric-value">{String(habits.length).padStart(2, '0')}</div>
              <div className="analytics-metric-bottom"><span>In your personal system</span><b className="analytics-trend-positive">{habits.length ? 'ACTIVE' : 'READY'}</b></div>
              <div className="analytics-streak-steps" role="img" aria-label={habits.length + ' active routines'}>{lastSevenHabitStats.map((day) => <i key={day.key} className={!habits.length ? 'is-empty' : ''} style={{ height: (habits.length ? Math.max(4, Math.round((day.activeStreaks / Math.max(1, ...lastSevenHabitStats.map((item) => item.activeStreaks))) * 19)) : 3) + 'px' }} />)}</div>
            </article>
            <article className="analytics-metric-card">
              <div className="analytics-metric-label">CHECKED IN TODAY <span className="analytics-metric-icon tone-pink"><CheckCheck size={12} /></span></div>
              <div className="analytics-metric-value">{doneToday}<small>/ {dueHabits.length}</small></div>
              <div className="analytics-metric-bottom"><span>Scheduled check-ins completed</span><b className="analytics-trend-positive">TODAY</b></div>
              <div className="analytics-metric-line" role="img" aria-label={doneToday + ' of ' + dueHabits.length + ' habits checked in today'}>{lastSevenHabitStats.map((day) => <i key={day.key} className={day.percent === null ? 'is-empty' : ''} title={day.key + ': ' + (day.percent === null ? 'no habits scheduled' : day.percent + '% complete')} style={{ height: (day.percent === null ? 3 : Math.max(4, Math.round(day.percent * .22 + 3))) + 'px' }} />)}</div>
            </article>
            <article className="analytics-metric-card analytics-metric-primary">
              <div className="analytics-metric-label">WEEKLY CONSISTENCY <span className="analytics-metric-icon tone-violet"><CalendarDays size={12} /></span></div>
              <div className="analytics-metric-value">{consistency}<small>%</small></div>
              <div className="analytics-metric-bottom"><span>Across scheduled routines</span><b className="analytics-trend-positive">WEEKLY</b></div>
              <div className="analytics-mini-bars" role="img" aria-label="Daily completion contributing to weekly consistency">{lastSevenHabitStats.map((day) => <i key={day.key} className={day.percent === null ? 'is-empty' : ''} title={day.key + ': ' + (day.percent === null ? 'no habits scheduled' : day.percent + '% complete')} style={{ height: (day.percent === null ? 3 : Math.max(4, Math.round(day.percent * .23 + 3))) + 'px' }} />)}</div>
            </article>
          </section>
          <section className="panel habits-library"><div className="panel-heading"><div><div className="panel-overline">YOUR PERSONAL SYSTEM</div><h3>All routines <span className="heading-count">{habits.length}</span></h3></div><div className="filter-pills"><button type="button" className={filter === 'All' ? 'selected' : ''} onClick={() => setFilter('All')}>All</button>{categories.map((cat) => <button type="button" key={cat} className={filter === cat ? 'selected' : ''} onClick={() => setFilter(cat)}>{cat}</button>)}</div></div><div className="library-list">{filteredHabits.map((habit) => <HabitDetail key={habit.id} habit={habit} today={today} onToggle={() => toggleHabit(habit.id)} onEdit={() => openEditHabit(habit)} onDelete={() => { setHabits((current) => current.filter((item) => item.id !== habit.id)); setToast('Habit removed'); }} />)}{filteredHabits.length === 0 && <EmptyState title="Nothing in this category yet" body="A good system starts small. Add a routine when you’re ready." action="Add habit" onAction={openCreateHabit} />}</div></section>
          <WeeklyTracker habits={habits} today={today} onToggle={toggleHabit} />
          <section className="principle-grid"><Principle icon={<Zap size={18} />} tag="MAKE IT EASY" title="Shrink the first step" copy="Choose a minimum version so starting takes less effort than avoiding it." /><Principle icon={<CalendarDays size={18} />} tag="MAKE IT OBVIOUS" title="Attach it to a cue" copy="Give your habit a reliable place in the day: after coffee, before lunch, or when you close your laptop." /><Principle icon={<Trophy size={18} />} tag="MAKE IT VISIBLE" title="Record each rep" copy="A small check-in creates feedback. Review the pattern, then adjust the plan—not your self-worth." /></section>
        </>}

        {page === 'Insights' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> THE PATTERNS BEHIND PROGRESS</div><h1>Notice what <span>works.</span></h1><p className="welcome-sub">Use the evidence you create to make tomorrow easier.</p></div><div className="review-date-chip"><CalendarDays size={15} /> Last 7 days</div></section>
          <section className="insights-stat-grid"><StatCard icon={<Activity size={17} />} label="Consistency" value={habits.length ? `${consistency}%` : '—'} detail={habits.length ? "Of scheduled habit check-ins" : "Add a routine to establish a baseline"} tone="lime" /><StatCard icon={<CheckCheck size={17} />} label="Logged actions" value={String(totalWins)} detail="Across your habit history" tone="violet" /><StatCard icon={<Flame size={17} />} label="Active routines" value={String(activeStreaks)} detail="With a current streak" tone="orange" /></section>
          <div className="insight-activity"><MonthlyActivityCalendar habits={habits} tasks={tasks} today={today} onToggleHabit={toggleHabit} onToggleTask={toggleTask} /></div>
          <div className="content-grid insight-bottom"><section className="panel"><div className="panel-heading"><div><div className="panel-overline">WHAT THE DATA SAYS</div><h3>Your strongest routines</h3></div><Trophy size={18} className="muted-icon" /></div><div className="ranking-list">{[...habits].sort((a, b) => getBestStreak(b, today) - getBestStreak(a, today)).slice(0, 4).map((habit, index) => <div className="ranking-row" key={habit.id}><span className="rank-number">0{index + 1}</span><span className="rank-emoji tone-violet"><HabitGlyph habit={habit} size={16} /></span><span className="rank-name"><b>{habit.name}</b><small>{habit.category} · {habit.frequency.toLowerCase()}</small></span><span className="rank-streak"><Flame size={13} /> {getCurrentStreak(habit, today)} days</span><div className="rank-bar"><span style={{ width: `${Math.min(100, getBestStreak(habit, today) / Math.max(1, bestStreak) * 100)}%` }} /></div></div>)}{habits.length === 0 && <p className="quiet-empty">Add routines to start seeing patterns.</p>}</div></section><section className="panel reflection-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-overline">YOUR NEXT EXPERIMENT</div>
                <h3>{experimentMode === 'pending' && experimentHabit ? `Make ${experimentHabit.name} easier to start` : experimentMode === 'complete' ? 'You showed up. Keep it gentle.' : experimentHabit ? 'Set tomorrow’s cue now' : 'Start with one small routine'}</h3>
              </div>
              <Sparkles size={17} className="accent-icon" />
            </div>
            <div className="reflection-quote">
              {experimentMode === 'pending' && experimentHabit ? <>
                <span className="reflection-quote-label">A SMALL IF–THEN PLAN FOR YOU</span>
                <span>“After {experimentCue}, I’ll {experimentAction}.”</span>
              </> : experimentMode === 'complete' ? <>
                <span>“Missing one opportunity to perform the behaviour did not materially affect the habit formation process.”</span>
                <small>— Lally et al. (2010)</small>
              </> : <>
                <span className="reflection-quote-label">TRY THIS FORMAT</span>
                <span>“After [a cue that already happens], I’ll [one small action].”</span>
              </>}
            </div>
            <div className="experiment-row">
              <span className="experiment-number">01</span>
              <div>
                <b>{experimentMode === 'pending' ? 'Attach it to a real cue' : experimentMode === 'complete' ? 'Keep tomorrow familiar' : 'Choose a moment that already exists'}</b>
                <p>{experimentMode === 'pending' ? `Try ${experimentHabit?.name ?? 'your routine'} after ${experimentCue}. A specific moment means you don’t have to decide from scratch each time.` : experimentMode === 'complete' ? 'Use roughly the same cue tomorrow. In real-world habit research, repeating a behaviour in a consistent context was associated with increasing automaticity over time.' : 'Choose an everyday anchor—after breakfast, after class, or when you close your laptop—and pair one tiny action with it.'}</p>
              </div>
            </div>
            <div className="experiment-row">
              <span className="experiment-number">02</span>
              <div>
                <b>{experimentMode === 'complete' ? 'A missed day is not a reset' : 'Make the first rep easy'}</b>
                <p>{experimentMode === 'pending' ? `Start with ${experimentAction}. You can do more if you feel like it; the small version is enough to get started.` : experimentMode === 'complete' ? 'If a day slips, return at the next normal cue rather than trying to “make up” for it. One missed opportunity is not proof you have failed.' : experimentHabit ? `Start with ${experimentAction}; keep the first version easy enough to repeat on a busy day.` : 'Add one routine and give it a cue plus a two-minute minimum. You can refine it once the start feels natural.'}</p>
              </div>
            </div>
            <div className="experiment-row">
              <span className="experiment-number">03</span>
              <div>
                <b>{experimentMode === 'complete' ? 'Protect the setup, not a perfect streak' : 'Use the data, not guilt'}</b>
                <p>{experimentMode === 'complete' ? 'Notice what made today easier—time, place, or preparation—and keep that part for tomorrow.' : 'If it slips, treat that as information. Make the cue easier to notice or shrink the first step; you don’t need a perfect run to continue.'}</p>
              </div>
            </div>
            <div className="research-source-links" aria-label="Research sources for this advice">
              <span>Evidence, not a guarantee</span>
              <a href="https://doi.org/10.1002/ejsp.674" target="_blank" rel="noreferrer">Lally et al. · 2010</a>
              <a href="https://doi.org/10.1016/S0065-2601(06)38002-1" target="_blank" rel="noreferrer">Gollwitzer &amp; Sheeran · 2006</a>
            </div>
            <button className="secondary-button full-button" type="button" onClick={() => setPage('Habits')}>Tune my habits <ArrowRight size={15} /></button>
          </section></div>
          <section className="research-note"><div className="research-icon"><BookOpen size={17} /></div><div><b>Grounded in behavior research</b><p>Progress monitoring, context cues, and specific if–then plans are established approaches—not guarantees. This tracker turns them into repeatable prompts.</p></div><button type="button" onClick={() => setToast('Research references are included in the project README.')}><CircleHelp size={16} /> About the method</button></section>
        </>}

        {page === 'Focus' && <>
          <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> ONE THING AT A TIME</div><h1>Make space for <span>deep work.</span></h1><p className="welcome-sub">Pick a task, choose a block, and give it your full attention.</p></div><div className="focus-session-badge"><span className="save-dot" /> {focusSessions} sessions completed</div></section>
          <section className="focus-page-grid"><div className="panel focus-large-panel"><div className="focus-large-top"><span className="section-kicker"><span className="kicker-mark"><Timer size={13} /></span> FOCUS TIMER</span><span className="live-pill"><span /> {focusRunning ? 'IN SESSION' : 'READY WHEN YOU ARE'}</span></div><div className="focus-large-ring" style={{ '--timer-progress': `${timerProgress * 100}%` } as CSSProperties}><div className="focus-ring-inner"><span className="focus-time">{timeText}</span><span className="focus-caption">{focusRunning ? 'STAY PRESENT' : 'YOUR NEXT BLOCK'}</span></div></div><div className="timer-presets large-presets">{[15, 25, 50].map((minutes) => <button type="button" key={minutes} className={focusPreset === minutes ? 'selected' : ''} onClick={() => resetFocus(minutes)}>{minutes} min</button>)}</div>
            <section className="focus-timer-settings" aria-label="Custom focus timer and completion sound">
              <div className="focus-settings-heading"><div><span className="panel-overline">MAKE IT YOURS</span><b>Timer &amp; completion sound</b></div><span className="focus-settings-note">1–180 minutes</span></div>
              <div className="focus-settings-grid">
                <div className="focus-setting-block">
                  <label className="focus-control-label" htmlFor="focus-custom-minutes">Custom session</label>
                  <div className="focus-custom-duration-row">
                    <input id="focus-custom-minutes" type="number" inputMode="numeric" min="1" max="180" step="1" value={focusCustomMinutes} disabled={focusRunning} onChange={(event) => setFocusCustomMinutes(event.target.value)} aria-label="Custom focus duration in minutes" />
                    <button type="button" className="secondary-button" disabled={focusRunning} onClick={applyCustomFocusDuration}>Set</button>
                  </div>
                </div>
                <div className="focus-setting-block">
                  <label className="focus-control-label" htmlFor="focus-ringtone-kind">When the timer ends</label>
                  <select id="focus-ringtone-kind" value={focusRingtoneKind} onChange={(event) => {
                    const kind = event.target.value as 'chime' | 'bell' | 'pulse' | 'custom';
                    setFocusRingtoneKind(kind);
                    try { window.localStorage.setItem('cadence-focus-ringtone-kind', kind); } catch { /* Storage may be unavailable. */ }
                  }}>
                    <option value="chime">Cadence chime</option>
                    <option value="bell">Double bell</option>
                    <option value="pulse">Soft digital pulse</option>
                    <option value="custom">Spotify / YouTube link</option>
                  </select>
                </div>
              </div>
              {focusRingtoneKind === 'custom' && <div className="focus-music-link-row">
                <div className="focus-upload-label">Use a streaming link or your own audio</div>
                <label className="focus-upload-label" htmlFor="focus-audio-upload">Upload audio (up to 50 MB)</label>
                <input id="focus-audio-upload" type="file" accept="audio/*" onChange={handleFocusAudioUpload} aria-describedby="focus-audio-upload-help" />
                <p id="focus-audio-upload-help" className="focus-sound-note">MP3, M4A, WAV, or another browser-supported audio format, up to 50 MB. Uploaded audio is available for this browser session; choose the file again after refreshing.</p>
                {focusLocalAudioUrl && <div className="focus-music-saved">
                  <span className="focus-music-provider">{focusLocalAudioName}</span>
                  <button type="button" className="text-button" onClick={() => {
                    if (focusAlarmAudioRef.current) { focusAlarmAudioRef.current.pause(); focusAlarmAudioRef.current.loop = false; focusAlarmAudioRef.current.removeAttribute('src'); focusAlarmAudioRef.current.load(); focusAlarmAudioRef.current = null; }
                    if (focusCompletionAudioRef.current) { focusCompletionAudioRef.current.pause(); focusCompletionAudioRef.current.loop = false; }
                    if (focusLocalAudioUrl) URL.revokeObjectURL(focusLocalAudioUrl);
                    setFocusLocalAudioUrl(''); setFocusLocalAudioName('');
                  }}>Remove audio</button>
                </div>}
                {focusLocalAudioUrl && <audio ref={focusCompletionAudioRef} controls preload="metadata" src={focusLocalAudioUrl} style={{ width: '100%', marginTop: 10 }} />}
                <div className="focus-music-link-row">
                <label className="focus-upload-label" htmlFor="focus-music-link">Spotify or YouTube link</label>
                <div className="focus-music-link-control">
                  <input
                    id="focus-music-link"
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    placeholder="https://open.spotify.com/track/… or youtu.be/…"
                    value={focusRingtoneDraft}
                    onChange={(event) => setFocusRingtoneDraft(event.target.value)}
                    aria-describedby="focus-music-link-help"
                  />
                  <button type="button" className="secondary-button" onClick={saveFocusMusicLink}>Save link</button>
                </div>
                <p id="focus-music-link-help" className="focus-sound-note">Paste a Spotify track, album, or playlist link, or a YouTube video link. The player opens here in Cadence. Spotify and YouTube may require you to press Play.</p>
                {focusRingtoneData && parseReminderMedia(focusRingtoneData) && <div className="focus-music-saved">
                  <span className="focus-music-provider">{focusRingtoneName || parseReminderMedia(focusRingtoneData)?.provider} soundtrack saved</span>
                  <button type="button" className="text-button" onClick={removeFocusMusicLink}>Remove link</button>
                </div>}
                {focusMusicPreviewOpen && parseReminderMedia(focusRingtoneData) && <div className="focus-music-embed" aria-label="Focus soundtrack preview">
                  <iframe
                    src={parseReminderMedia(focusRingtoneData)?.embedUrl}
                    title={'Focus soundtrack from ' + (parseReminderMedia(focusRingtoneData)?.provider || 'music service')}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                  <a href={parseReminderMedia(focusRingtoneData)?.originalUrl} target="_blank" rel="noreferrer">
                    Open in {parseReminderMedia(focusRingtoneData)?.provider} <ArrowUpRight size={13} />
                  </a>
                </div>}
                </div>
              </div>}
              <div className="focus-sound-actions">
                <button type="button" className="secondary-button" onClick={previewFocusRingtone}>{focusRingtoneKind === 'custom' ? 'Preview soundtrack' : 'Preview sound'}</button>
              </div>
              {focusRingtoneKind === 'custom'
                ? <p className="focus-sound-note">When the timer ends, Cadence shows your selected player in the completion alert. To avoid surprise autoplay, start playback with the player’s Play button.</p>
                : <p className="focus-sound-note">Built-in sounds can play immediately when browser audio is permitted. External music services control their own playback.</p>}
              <div className="focus-background-push-row">
                <div>
                  <b>Background alerts</b>
                  <p>{backgroundPushEnabled ? 'Enabled on this device for habits, timed tasks, and Focus sessions.' : !backgroundPushAvailable ? 'Your browser does not support background push alerts.' : authSession ? 'Receive scheduled alerts even when Cadence is closed.' : 'Sign in to enable alerts across your devices.'}</p>
                </div>
                <button type="button" className="secondary-button" disabled={backgroundPushBusy || !backgroundPushAvailable || !authSession} onClick={() => { void (backgroundPushEnabled ? disableBackgroundPushNotifications() : enableBackgroundPushNotifications()); }}>
                  {backgroundPushBusy ? 'Please wait…' : backgroundPushEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
              <p className="focus-sound-note">Cadence keeps the alarm repeating until you choose Stop alarm. Uploaded audio loops directly in the browser. Spotify and YouTube attempt autoplay in the completion alert, but their players or Chrome may block it; Cadence repeats its own audible alarm as a fallback. Keep Cadence open in a browser tab and allow sound for the most reliable result.</p>
            </section>
            <div className="focus-large-actions"><button className="primary-button" type="button" onClick={toggleFocusTimer}>{focusRunning ? 'Pause focus' : focusSeconds === 0 ? 'Start another' : 'Start focusing'} {focusRunning ? <span className="pause-glyph">Ⅱ</span> : <ArrowRight size={16} />}</button><button className="secondary-button" type="button" onClick={() => resetFocus() }><RotateCcw size={15} /> Reset</button></div><p className="timer-reassurance"><ShieldCheck size={15} /> Missed a block? Nothing is lost. Restart with the next minute.</p></div><div className="focus-side-column"><section className="panel choose-task-panel"><div className="panel-overline">YOUR NEXT PRIORITY</div><h3>What will you work on?</h3><p>Choose one task. Everything else can wait for this block.</p>{todayTasks.filter((task) => !task.completed).map((task) => <button key={task.id} type="button" className={`focus-task-choice ${focusTaskId === task.id ? 'selected' : ''}`} onClick={() => { setFocusTaskId(task.id); setToast(`Focus target selected: ${task.title}`); }}><span className="todo-box" /><span><b>{task.title}</b><small>{task.estimate} min · {task.priority} priority</small></span><ArrowUpRight size={15} /></button>)}{todayTasks.filter((task) => !task.completed).length === 0 && <p className="quiet-empty">Your task list is clear. Enjoy the breathing room.</p>}<button className="text-button" type="button" onClick={() => setPage('Tasks')}>Manage today’s tasks <ArrowRight size={14} /></button></section><section className="panel focus-rule-panel"><span className="rule-icon"><Leaf size={17} /></span><div className="panel-overline">A GENTLER RULE</div><h3>Return your attention.</h3><p>Focus isn’t never getting distracted. It’s noticing and coming back—without making a story out of it.</p></section></div></section>
        </>}
        </div>
      </main>

      {showHabitModal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowHabitModal(false); setEditingHabitId(null); setHabitRingtoneFile(null); setHabitDraft({ ...emptyHabitDraft }); } }}><section className="habit-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-top"><div><div className="panel-overline">START SMALL, STAY CONSISTENT</div><h2 id="modal-title">{editingHabitId ? 'Edit habit' : 'Create a habit'}</h2><p>{editingHabitId ? 'Update your routine without losing its history.' : 'Design the start, not just the finish line.'}</p></div><IconButton label="Close modal" onClick={() => setShowHabitModal(false)}><X size={18} /></IconButton></div><form onSubmit={addHabit}><label className="field-label">Habit name<input autoFocus value={habitDraft.name} onChange={(event) => setHabitDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="e.g. Practice coding" maxLength={70} required /></label><label className="field-label">Area of life<div className="category-select">{categories.map((category) => <button type="button" key={category} className={habitDraft.category === category ? `selected ${categoryTone[category]}` : ''} onClick={() => setHabitDraft((draft) => ({ ...draft, category }))}><CategoryGlyph category={category} size={15} />{category}</button>)}</div></label><label className="field-label">Frequency<select value={habitDraft.frequency} onChange={(event) => setHabitDraft((draft) => ({ ...draft, frequency: event.target.value as Frequency }))}>{frequencies.map((frequency) => <option key={frequency}>{frequency}</option>)}</select></label>
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
                <input type="url" value={habitDraft.reminderSoundUrl} onChange={(event) => { setHabitRingtoneFile(null); setHabitDraft((draft) => ({ ...draft, reminderSoundUrl: event.target.value })); }} placeholder="https://open.spotify.com/track/…" autoComplete="url" />
              </label>
              <label className="field-label reminder-sound-label">Upload audio (up to 20 MB)
                <input id="habit-ringtone-upload" type="file" accept="audio/*" onChange={handleHabitRingtoneUpload} aria-describedby="habit-ringtone-help" />
                <span className="field-hint">{habitRingtoneFile ? 'Selected: ' + habitRingtoneFile.name : editingHabitId && habitLocalRingtones[editingHabitId] ? 'Current upload: ' + habitLocalRingtones[editingHabitId].name : 'MP3, M4A, WAV, or another browser-supported audio format.'}</span>
              </label>
              {editingHabitId && habitLocalRingtones[editingHabitId] && !habitRingtoneFile && <button type="button" className="text-button" onClick={() => { const current = habitLocalRingtones[editingHabitId]; if (current) releaseLocalRingtone(current); setHabitLocalRingtones((items) => { const updated = { ...items }; delete updated[editingHabitId]; return updated; }); setHabitRingtoneFile(null); setHabitDraft((draft) => ({ ...draft, reminderSoundUrl: '' })); }}>Remove uploaded audio</button>}
              <p id="habit-ringtone-help" className="reminder-music-help">Uploaded audio is available for this browser session, just like Focus. YouTube and Spotify attempt autoplay when the reminder appears; browsers may block it, so the repeating Cadence alarm remains as a fallback until you stop it or mark the habit done.</p>
              <div className="reminder-notification-option">
                <span className="reminder-permission-status">{notificationPermission === 'granted' ? 'Desktop notifications enabled' : notificationPermission === 'denied' ? 'Browser notifications are blocked' : notificationPermission === 'unsupported' ? 'Desktop notifications unavailable' : 'Allow desktop notifications'}</span>
                <button type="button" className="secondary-button notification-permission-button" onClick={() => { void enableDesktopNotifications(); }}>{notificationPermission === 'granted' ? 'Enabled' : notificationPermission === 'denied' ? 'How to allow' : notificationPermission === 'unsupported' ? 'Not supported' : 'Enable'}</button>
              </div>
              <div className="reminder-notification-option background-push-option">
                <span className="reminder-permission-status">
                  {backgroundPushEnabled ? 'Background alerts enabled on this device' : !backgroundPushAvailable ? 'Background push is not supported in this browser' : authSession ? 'Receive scheduled alerts while Cadence is closed' : 'Sign in to enable background alerts'}
                </span>
                <button type="button" className="secondary-button notification-permission-button" disabled={backgroundPushBusy || !backgroundPushAvailable || !authSession} onClick={() => { void (backgroundPushEnabled ? disableBackgroundPushNotifications() : enableBackgroundPushNotifications()); }}>
                  {backgroundPushBusy ? 'Please wait…' : backgroundPushEnabled ? 'Disable' : 'Enable background alerts'}
                </button>
              </div>
              <p className="reminder-footnote">Background push delivers system notifications for scheduled habits, tasks, and Focus sessions while the browser is closed or in the background. Click a notification to open Cadence. Browsers cannot be forced to launch the app or autoplay custom music while closed; system notification sound depends on your device settings.</p>
              <p className="reminder-footnote">While Cadence is open, in-app reminders can play the selected sound. Use Stop sound to silence the looping habit alarm, or Mark done to close it.</p>
            </div>}
          </section>
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => { setShowHabitModal(false); setEditingHabitId(null); setHabitRingtoneFile(null); setHabitDraft({ ...emptyHabitDraft }); }}>Cancel</button><button className="primary-button" type="submit">{editingHabitId ? <><Check size={15} /> Save changes</> : <><Plus size={15} /> Create habit</>}</button></div></form></section></div>}
      {pendingReviewOpen && <div className="reminder-alarm-backdrop pending-review-backdrop" role="presentation">
        <section className="reminder-alarm pending-review-alarm" role="alertdialog" aria-modal="true" aria-labelledby="pending-review-title">
          <span className="reminder-alarm-icon"><Bell size={22} /></span>
          <span className="reminder-alarm-kicker">CADENCE · PENDING CHECK-IN</span>
          <h2 id="pending-review-title">Your unfinished work is waiting.</h2>
          <p>Before you move on, take a look at what is still pending today. The reminder will return the next time you open Cadence if these items remain unfinished.</p>
          {pendingReviewHabits.length > 0 && <section className="pending-review-group" aria-label="Pending habits">
            <div className="pending-review-group-heading"><b>Habits to complete</b><span>{pendingReviewHabits.length} pending</span></div>
            <ul>{pendingReviewHabits.slice(0, 5).map((habit) => <li key={habit.id}><span className="pending-review-item-icon">{habit.emoji || '✦'}</span><span><b>{habit.name}</b><small>{habit.reminderTime ? 'Scheduled for ' + formatReminderTime(habit.reminderTime) : 'Due today'}</small></span></li>)}</ul>
            {pendingReviewHabits.length > 5 && <small className="pending-review-more">+{pendingReviewHabits.length - 5} more habits</small>}
          </section>}
          {pendingReviewTasks.length > 0 && <section className="pending-review-group" aria-label="Pending tasks">
            <div className="pending-review-group-heading"><b>Tasks to finish</b><span>{pendingReviewTasks.length} pending</span></div>
            <ul>{pendingReviewTasks.slice(0, 5).map((task) => <li key={task.id}><span className="pending-review-item-icon"><ListTodo size={15}/></span><span><b>{task.title}</b><small>{task.date < today ? 'Overdue' : task.time ? 'Scheduled for ' + formatReminderTime(task.time) : 'Due today'}</small></span></li>)}</ul>
            {pendingReviewTasks.length > 5 && <small className="pending-review-more">+{pendingReviewTasks.length - 5} more tasks</small>}
          </section>}
          <p className="pending-review-count">{pendingReviewHabits.length + pendingReviewTasks.length} item{pendingReviewHabits.length + pendingReviewTasks.length === 1 ? '' : 's'} still need your attention.</p>
          <div className="reminder-sound-controls">
            <button type="button" className="reminder-stop-button" onClick={() => setReminderSoundStopped(true)}>{reminderSoundStopped ? 'Music Closed' : 'Close Music'}</button>
            <button type="button" className="reminder-replay-button" onClick={() => { setReminderSoundStopped(false); unlockReminderAudio(); playReminderMelody(); }}>Replay sound</button>
          </div>
          <div className="reminder-alarm-actions">
            {pendingReviewHabits.length > 0 && <button type="button" className="secondary-button" onClick={() => { pendingReviewActiveRef.current = false; setPendingReviewOpen(false); setReminderSoundStopped(false); setPage('Habits'); }}>Review habits</button>}
            {pendingReviewTasks.length > 0 && <button type="button" className="secondary-button" onClick={() => { pendingReviewActiveRef.current = false; setPendingReviewOpen(false); setReminderSoundStopped(false); setPage('Tasks'); }}>Review tasks</button>}
            <button type="button" className="primary-button" onClick={() => { pendingReviewActiveRef.current = false; setPendingReviewOpen(false); setReminderSoundStopped(false); setPage('Today'); }}>I’ll take care of these</button>
          </div>
          <p className="reminder-footnote">Audio may require one click if your browser blocks autoplay. Disabling “Pending alerts” in the sidebar turns off this on-open reminder without affecting scheduled habit and task alarms.</p>
        </section>
      </div>}
      {activeReminder && <div className="reminder-alarm-backdrop" role="presentation">
        <section className="reminder-alarm" role="alertdialog" aria-modal="true" aria-labelledby="reminder-alarm-title">
          <span className="reminder-alarm-icon"><Bell size={22} /></span>
          <span className="reminder-alarm-kicker">CADENCE REMINDER · {formatReminderTime(activeReminder.reminderTime)}</span>
          <h2 id="reminder-alarm-title">Time for {activeReminder.habitName}</h2>
          <p>A small step counts. Check in now, or snooze this reminder for ten minutes.</p>
          {activeReminder.localRingtone && !reminderSoundStopped && <section className="reminder-media-player" aria-label="Uploaded reminder audio">
            <div className="reminder-media-heading"><span className="reminder-media-wave"><CadenceMark /></span><div><b>{activeReminder.localRingtone.name}</b><small>Uploaded ringtone · browser-session audio</small></div></div>
            <p className="reminder-music-help">Your selected track loops until you stop the reminder or mark the habit done.</p>
          </section>}
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
          <div className="reminder-sound-controls">{activeReminder.localRingtone && !reminderSoundStopped && <button type="button" className="reminder-replay-button" onClick={() => { const ringtone = activeReminder.localRingtone; if (ringtone) { ringtone.audio.pause(); try { ringtone.audio.currentTime = 0; } catch { /* Ignore non-seekable audio. */ } setReminderSoundStopped(false); startLocalRingtonePlayback(ringtone); } }}>Play uploaded ringtone again</button>}{activeReminderMedia && !reminderSoundStopped && <button type="button" className="reminder-replay-button" onClick={() => { setReminderSoundStopped(false); setReminderMediaReload((value) => value + 1); }}>Play soundtrack again</button>}<button type="button" className="reminder-stop-button" onClick={() => setReminderSoundStopped(true)}>{reminderSoundStopped ? 'Music Closed' : 'Close Music'}</button></div>
        </section>
      </div>}
      {pushArrival && <div className="reminder-alarm-backdrop" role="presentation">
        <section className="reminder-alarm" role="alertdialog" aria-modal="true" aria-labelledby="push-arrival-title">
          <span className="reminder-alarm-icon"><Bell size={22} /></span>
          <span className="reminder-alarm-kicker">CADENCE BACKGROUND REMINDER</span>
          <h2 id="push-arrival-title">{pushArrival.title}</h2>
          <p>{pushArrival.body}</p>
          {pushArrival.kind === 'task' && pushArrival.localRingtone && <section className="reminder-media-player" aria-label="Uploaded task ringtone"><div className="reminder-media-heading"><span className="reminder-media-wave"><CadenceMark /></span><div><b>{pushArrival.localRingtone.name}</b><small>Uploaded task ringtone · browser-session audio</small></div></div><p className="reminder-music-help">Your selected track loops until you stop the alarm.</p></section>}
          {pushArrival.kind === 'task' && pushArrivalMedia && !reminderSoundStopped && <div className="focus-music-embed focus-completion-embed" aria-label="Task reminder soundtrack"><iframe src={pushArrivalMedia.embedUrl} title={'Task reminder soundtrack from ' + pushArrivalMedia.provider} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /><a href={pushArrivalMedia.originalUrl} target="_blank" rel="noreferrer">Open in {pushArrivalMedia.provider} <ArrowUpRight size={13} /></a></div>}
          {pushArrival.kind === 'focus' && focusRingtoneKind === 'custom' && !focusLocalAudioUrl && parseReminderMedia(focusRingtoneData) && <div className="focus-music-embed focus-completion-embed" aria-label="Focus completion soundtrack">
            <iframe
              src={parseReminderMedia(focusRingtoneData)?.embedUrl}
              title={'Focus completion soundtrack from ' + (parseReminderMedia(focusRingtoneData)?.provider || 'music service')}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
            <a href={parseReminderMedia(focusRingtoneData)?.originalUrl} target="_blank" rel="noreferrer">
              Open in {parseReminderMedia(focusRingtoneData)?.provider} <ArrowUpRight size={13} />
            </a>
          </div>}
          <div className="reminder-alarm-actions">
            <button type="button" className="secondary-button" onClick={() => {
              unlockReminderAudio();
              setReminderSoundStopped(false);
              if (pushArrival.kind === 'focus') startFocusAlarmPlayback();
              else if (pushArrival.localRingtone) startLocalRingtonePlayback(pushArrival.localRingtone);
              else playReminderMelody();
            }}>Play alert sound</button>
            <button type="button" className="primary-button" onClick={() => {
              setPage(pushArrival.kind === 'focus' ? 'Focus' : 'Tasks');
              setPushArrival(null);
            }}>Open {pushArrival.kind === 'focus' ? 'Focus' : 'Tasks'}</button>
          </div>
          {pushArrival.kind === 'task' && <div className="reminder-sound-controls">{pushArrival.localRingtone && !reminderSoundStopped && <button type="button" className="reminder-replay-button" onClick={() => { const ringtone = pushArrival.localRingtone; if (ringtone) { ringtone.audio.pause(); try { ringtone.audio.currentTime = 0; } catch { /* Ignore non-seekable audio. */ } setReminderSoundStopped(false); startLocalRingtonePlayback(ringtone); } }}>Play uploaded ringtone again</button>}{pushArrivalMedia && <a className="reminder-replay-button" href={pushArrivalMedia.originalUrl} target="_blank" rel="noreferrer">Open soundtrack <ArrowUpRight size={13} /></a>}</div>}
          <p className="reminder-footnote">The alarm keeps repeating until you press Close Music. Uploaded audio loops in Cadence; streaming players may block autoplay, so a repeating Cadence alarm tone is used as a fallback.</p>
          <button type="button" className="reminder-stop-button" onClick={() => setReminderSoundStopped(true)}>{reminderSoundStopped ? 'Music Closed' : 'Close Music'}</button>
        </section>
      </div>}
      {showProfileModal && <div className="profile-settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProfileModal(false); }}>
        <section className="profile-settings-modal" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
          <div className="profile-settings-header">
            <div><span className="panel-overline">YOUR CADENCE PROFILE</span><h2 id="profile-settings-title">Make it yours.</h2><p>Choose the name and mark that represent you.</p></div>
            <button type="button" className="profile-settings-close" onClick={() => setShowProfileModal(false)} aria-label="Close profile settings"><X size={17} /></button>
          </div>
          <form className="profile-settings-form" onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
            <label className="profile-settings-label">Username
              <input value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} maxLength={32} autoComplete="nickname" placeholder="What should we call you?" required autoFocus />
              <small>Up to 32 characters. This is the name shown in your sidebar.</small>
            </label>
            <div className="profile-photo-editor">
              <div className="profile-photo-preview">{profilePhotoDraft ? <img src={profilePhotoDraft} alt="Profile photo preview" /> : <ProfileGlyph logo={profileLogoDraft} name={profileNameDraft.trim() || 'Your workspace'} size={27} />}</div>
              <div className="profile-photo-controls">
                <b>Profile photo</b>
                <small>Upload a photo or keep a symbol. Images are cropped and compressed to fit.</small>
                <div className="profile-photo-actions">
                  <label className="secondary-button profile-photo-upload" htmlFor="profile-photo-input"><Upload size={14} /> Upload photo</label>
                  <input id="profile-photo-input" className="profile-photo-file-input" type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; void handleProfilePhotoFile(file); event.currentTarget.value = ''; }} />
                  {profilePhotoDraft && <button className="text-button profile-photo-remove" type="button" onClick={() => setProfilePhotoDraft('')}>Remove photo</button>}
                </div>
              </div>
            </div>
            <div className="profile-logo-section">
              <div className="profile-logo-section-heading"><b>Profile logo</b><span>Choose a symbol instead</span></div>
              <div className="profile-logo-grid">
                {PROFILE_LOGO_CHOICES.map((choice) => <button key={choice.key} type="button" className={`profile-logo-choice ${profileLogoDraft === choice.key ? 'is-selected' : ''}`} aria-pressed={profileLogoDraft === choice.key} onClick={() => setProfileLogoDraft(choice.key)}>
                  <span className="profile-logo-choice-icon"><ProfileGlyph logo={choice.key} name={profileNameDraft.trim() || 'Your workspace'} size={18} /></span>
                  <small>{choice.label}</small>
                </button>)}
              </div>
            </div>
            <p className="profile-settings-note">{authSession ? 'Your username, logo, and compressed photo are saved to your account.' : 'Your username, logo, and photo are saved in this browser.'}</p>
            <div className="profile-settings-actions">
              <button type="button" className="secondary-button" onClick={() => setShowProfileModal(false)} disabled={profileSaveBusy}>Cancel</button>
              <button type="submit" className="primary-button" disabled={profileSaveBusy}>{profileSaveBusy ? 'Saving…' : <><Check size={15} /> Save profile</>}</button>
            </div>
          </form>
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
    <path className="cadence-wave-path" pathLength={100} d="M2 23 C7 23 8 23 11 20 C14 17 14 10 18 10 C22 10 22 34 27 34 C31 34 32 6 36 6 C39 6 40 21 42 21" fill="none" stroke="url(#cadence-wave-stroke)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function StatCard({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: string }) {
  return <div className="stat-card insights-stat-card"><div className="stat-top"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-indicator"><ArrowUpRight size={14} /></span></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div></div>;
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
    // Keep all values inside a padded 16–84% plot area so endpoint markers never crowd the frame.
    return { key, day, x: (index + 0.5) * (857 / 14), y: percent === null ? 84 : 84 - percent * 0.68, percent, scheduled, completed };
  });
  const chartedPoints = chartPoints.filter((point) => point.percent !== null);
  // Use straight segments instead of cubic curves so the trend stays crisp
  // and completion peaks have a clean, flat-edged appearance.
  const linePath = chartedPoints.reduce((path, point, index) => {
    return path + (index === 0 ? "M " : " L ") + point.x + " " + point.y;
  }, "");
  const firstChartPoint = chartedPoints[0];
  const lastChartPoint = chartedPoints[chartedPoints.length - 1];
  const areaPath = firstChartPoint && lastChartPoint ? linePath + " L " + lastChartPoint.x + " 84 L " + firstChartPoint.x + " 84 Z" : "";
  const chartId = habit.id.replace(/[^a-zA-Z0-9_-]/g, "");
  return <article className="habit-detail-card">
    <div className="habit-detail-row">
      <div className="detail-main">
        <div className="detail-title-row"><span className="detail-emoji tone-violet"><HabitGlyph habit={habit} size={20} /></span><b>{habit.name}</b><span className={"category-tag " + categoryTone[habit.category]}>{habit.category}</span><span className="frequency-tag">{habit.frequency === 'Custom' ? 'Custom days' : habit.frequency}</span>{habit.durationMonths ? <span className="habit-duration-tag">{habit.durationMonths} mo plan</span> : null}</div>
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
              {[16, 50, 84].map((y) => <line key={y} x1="0" y1={y} x2="857" y2={y} className="habit-chart-grid-line" />)}
              {areaPath && <path d={areaPath} fill={"url(#cadence-habit-area-" + chartId + ")"} className="habit-activity-area" />}
              {linePath && <path d={linePath} fill="none" stroke={"url(#cadence-habit-line-" + chartId + ")"} className="habit-activity-line" pathLength={1} />}
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