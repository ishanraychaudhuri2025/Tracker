import type { Habit, Task } from '../types';

export interface WorkspaceBackup {
  format: 'cadence-workspace-backup';
  schemaVersion: 1;
  exportedAt: string;
  data: {
    habits: Habit[];
    tasks: Task[];
    focusSessions: number;
    preferences: { dark: boolean; focusMinutes: number; focusSoundUrl: string };
  };
}

type WorkspaceSnapshot = {
  habits: Habit[];
  tasks: Task[];
  focusSessions: number;
  preferences: { dark: boolean; focusMinutes: number; focusSoundUrl: string };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const habitCategories = ['Mind', 'Body', 'Craft', 'Life'];
const habitFrequencies = ['Daily', 'Weekdays', 'Weekends', '3× / week', 'Custom'];
const taskPriorities = ['Low', 'Normal', 'High'];
const taskRecurrences = ['None', 'Daily', 'Weekdays', 'Weekends', 'Weekly', 'Monthly'];

const isHabit = (value: unknown): value is Habit => {
  if (!isRecord(value)) return false;
  const logs = value.logs;
  return isString(value.id)
    && isString(value.name)
    && isString(value.emoji)
    && habitCategories.includes(String(value.category))
    && habitFrequencies.includes(String(value.frequency))
    && isString(value.cue)
    && isString(value.minimum)
    && isRecord(logs)
    && Object.values(logs).every((entry) => typeof entry === 'boolean')
    && isString(value.createdAt)
    && isString(value.color)
    && (value.reminderEnabled === undefined || typeof value.reminderEnabled === 'boolean')
    && (value.reminderTime === undefined || isString(value.reminderTime))
    && (value.reminderSoundUrl === undefined || isString(value.reminderSoundUrl))
    && (value.scheduleDays === undefined || (Array.isArray(value.scheduleDays) && value.scheduleDays.every((day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6)))
    && (value.durationMonths === undefined || value.durationMonths === null || (typeof value.durationMonths === 'number' && Number.isFinite(value.durationMonths) && value.durationMonths >= 0))
    && (value.durationStartedAt === undefined || isString(value.durationStartedAt))
    && (value.timerMinutes === undefined || (typeof value.timerMinutes === 'number' && Number.isFinite(value.timerMinutes) && value.timerMinutes >= 0));
};

const isTask = (value: unknown): value is Task => {
  if (!isRecord(value)) return false;
  return isString(value.id)
    && isString(value.title)
    && typeof value.completed === 'boolean'
    && taskPriorities.includes(String(value.priority))
    && typeof value.estimate === 'number'
    && Number.isFinite(value.estimate)
    && value.estimate >= 0
    && isString(value.date)
    && (value.category === undefined || ['Study', 'Work', 'Health', 'Personal', 'Admin'].includes(String(value.category)))
    && (value.time === undefined || isString(value.time))
    && (value.recurrence === undefined || taskRecurrences.includes(String(value.recurrence)))
    && (value.completedDates === undefined || (Array.isArray(value.completedDates) && value.completedDates.every(isString)));
};

export function createWorkspaceBackup(snapshot: WorkspaceSnapshot): WorkspaceBackup {
  return {
    format: 'cadence-workspace-backup',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      habits: snapshot.habits,
      tasks: snapshot.tasks,
      focusSessions: snapshot.focusSessions,
      preferences: { dark: snapshot.preferences.dark, focusMinutes: snapshot.preferences.focusMinutes, focusSoundUrl: snapshot.preferences.focusSoundUrl },
    },
  };
}

export function parseWorkspaceBackup(source: string): WorkspaceBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error('This file is not valid JSON. Choose a Cadence backup file.');
  }

  if (!isRecord(parsed) || parsed.format !== 'cadence-workspace-backup') {
    throw new Error('This file is not a Cadence workspace backup.');
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error('This backup version is not supported by this version of Cadence.');
  }
  if (!isString(parsed.exportedAt) || !isRecord(parsed.data)) {
    throw new Error('The backup is missing required metadata or workspace data.');
  }

  const { habits, tasks, focusSessions, preferences } = parsed.data;
  if (!Array.isArray(habits) || !habits.every(isHabit)) {
    throw new Error('The backup contains invalid habit data. Your current workspace has not been changed.');
  }
  if (!Array.isArray(tasks) || !tasks.every(isTask)) {
    throw new Error('The backup contains invalid task data. Your current workspace has not been changed.');
  }
  if (typeof focusSessions !== 'number' || !Number.isSafeInteger(focusSessions) || focusSessions < 0) {
    throw new Error('The backup contains an invalid focus-session count.');
  }
  if (!isRecord(preferences) || typeof preferences.dark !== 'boolean') {
    throw new Error('The backup contains invalid appearance preferences.');
  }
  const focusMinutes = preferences.focusMinutes === undefined ? 25 : preferences.focusMinutes;
  const focusSoundUrl = preferences.focusSoundUrl === undefined ? '' : preferences.focusSoundUrl;
  if (typeof focusMinutes !== 'number' || !Number.isInteger(focusMinutes) || focusMinutes < 1 || focusMinutes > 240) {
    throw new Error('The backup contains an invalid focus timer duration.');
  }
  if (typeof focusSoundUrl !== 'string' || focusSoundUrl.length > 2048) {
    throw new Error('The backup contains an invalid focus ringtone setting.');
  }
  if (habits.length > 10000 || tasks.length > 50000) {
    throw new Error('This backup is larger than the supported workspace limit.');
  }

  return {
    format: 'cadence-workspace-backup',
    schemaVersion: 1,
    exportedAt: parsed.exportedAt,
    data: {
      habits,
      tasks,
      focusSessions,
      preferences: { dark: preferences.dark, focusMinutes, focusSoundUrl },
    },
  };
}
