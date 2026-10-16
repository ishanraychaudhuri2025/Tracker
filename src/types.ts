export type Category = 'Mind' | 'Body' | 'Craft' | 'Life';
export type Frequency = 'Daily' | 'Weekdays' | 'Weekends' | '3× / week';
export type TaskCategory = 'Study' | 'Work' | 'Health' | 'Personal' | 'Admin';
export type Recurrence = 'None' | 'Daily' | 'Weekdays' | 'Weekends' | 'Weekly' | 'Monthly';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  category: Category;
  frequency: Frequency;
  cue: string;
  minimum: string;
  logs: Record<string, boolean>;
  createdAt: string;
  color: string;
  reminderEnabled?: boolean;
  reminderTime?: string;
  reminderSoundUrl?: string;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'Low' | 'Normal' | 'High';
  estimate: number;
  date: string;
  category?: TaskCategory;
  time?: string;
  recurrence?: Recurrence;
  completedDates?: string[];
}

export type Page = 'Today' | 'Planner' | 'Habits' | 'Insights' | 'Focus';