export type Category = 'Mind' | 'Body' | 'Craft' | 'Life';
export type Frequency = 'Daily' | 'Weekdays' | 'Weekends' | '3× / week';

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
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'Low' | 'Normal' | 'High';
  estimate: number;
  date: string;
}

export type Page = 'Today' | 'Habits' | 'Insights' | 'Focus';