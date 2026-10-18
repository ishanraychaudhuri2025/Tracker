import { useMemo, useState } from 'react';
import type { FormEvent, CSSProperties } from 'react';
import {
  Activity, BookOpen, Brain, CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, Clock3, Code2, Compass, Coffee, Droplets, Dumbbell, Flower2, Heart,
  LayoutGrid, ListFilter, PenTool, Plus, Repeat2, X, Zap,
} from 'lucide-react';
import type { Habit, Recurrence, Task, TaskCategory } from './types';

function PlannerHabitGlyph({ habit }: { habit: Habit }) {
  const name = habit.name.toLowerCase();
  const props = { size: 14, strokeWidth: 1.8, 'aria-hidden': true as const };
  if (/(work.?out|gym|exercise|fitness|training|strength|lift)/.test(name)) return <Dumbbell {...props} />;
  if (/(relax|meditat|breath|mindful|calm|reflection|gratitude)/.test(name)) return <Flower2 {...props} />;
  if (/(read|book|study|learn|language|course|lecture)/.test(name)) return <BookOpen {...props} />;
  if (/(code|program|develop|software|coding|algorithm)/.test(name)) return <Code2 {...props} />;
  if (/(write|journal|draw|design|craft|create|sketch)/.test(name)) return <PenTool {...props} />;
  if (/(water|hydrate|drink)/.test(name)) return <Droplets {...props} />;
  if (/(coffee|morning|routine)/.test(name)) return <Coffee {...props} />;
  if (/(walk|run|steps|outdoor|nature|stretch)/.test(name)) return <Activity {...props} />;
  if (/(family|friend|connect|care|health)/.test(name)) return <Heart {...props} />;
  if (habit.category === 'Mind') return <Brain {...props} />;
  if (habit.category === 'Body') return <Dumbbell {...props} />;
  if (habit.category === 'Craft') return <PenTool {...props} />;
  return <Compass {...props} />;
}

export type PlannerTaskDraft = {
  title: string;
  date: string;
  time: string;
  category: TaskCategory;
  recurrence: Recurrence;
  priority: Task['priority'];
  estimate: number;
};

type PlannerPageProps = {
  habits: Habit[];
  tasks: Task[];
  today: string;
  onToggleHabit: (habitId: string, dayKey: string) => void;
  onToggleTask: (taskId: string, dayKey: string) => void;
  onAddTask: (draft: PlannerTaskDraft) => void;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CATEGORIES: TaskCategory[] = ['Study', 'Work', 'Health', 'Personal'];
const RECURRENCES: Recurrence[] = ['None', 'Daily', 'Weekdays', 'Weekends', 'Weekly', 'Monthly'];

function toKey(date: Date) {
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function fromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
function shiftKey(key: string, shift: number) {
  const date = fromKey(key);
  date.setDate(date.getDate() + shift);
  return toKey(date);
}
function startOfWeek(key: string) {
  const weekday = fromKey(key).getDay();
  return shiftKey(key, -((weekday + 6) % 7));
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function prettyDate(key: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) {
  return fromKey(key).toLocaleDateString('en-US', options);
}
function habitEndKey(habit: Habit) {
  const durationMonths = Number(habit.durationMonths || 0);
  const durationStart = habit.durationStartedAt || habit.createdAt;
  if (!durationMonths || !durationStart) return null;
  const [year, month, day] = durationStart.split('-').map(Number);
  const monthIndex = year * 12 + (month - 1) + durationMonths;
  const endYear = Math.floor(monthIndex / 12);
  const endMonthIndex = monthIndex % 12;
  const lastDay = new Date(endYear, endMonthIndex + 1, 0, 12).getDate();
  return toKey(new Date(endYear, endMonthIndex, Math.min(day, lastDay), 12));
}
function dueHabitOn(habit: Habit, key: string) {
  if (habit.createdAt && key < habit.createdAt) return false;
  const durationStart = habit.durationStartedAt || habit.createdAt;
  if (habit.durationMonths && durationStart && key < durationStart) return false;
  const endKey = habitEndKey(habit);
  if (endKey && key >= endKey) return false;
  const day = fromKey(key).getDay();
  if (habit.frequency === 'Weekdays') return day >= 1 && day <= 5;
  if (habit.frequency === 'Weekends') return day === 0 || day === 6;
  if (habit.frequency === '3× / week') return [2, 4, 6].includes(day);
  if (habit.frequency === 'Custom') return Boolean(habit.scheduleDays?.includes(day));
  return true;
}

export function taskOccursOn(task: Task, key: string) {
  if (key < task.date) return false;
  const recurrence = task.recurrence ?? 'None';
  if (recurrence === 'None') return key === task.date;
  const date = fromKey(key);
  const original = fromKey(task.date);
  if (recurrence === 'Daily') return true;
  if (recurrence === 'Weekdays') return date.getDay() >= 1 && date.getDay() <= 5;
  if (recurrence === 'Weekends') return date.getDay() === 0 || date.getDay() === 6;
  if (recurrence === 'Weekly') return date.getDay() === original.getDay();
  if (recurrence === 'Monthly') return date.getDate() === Math.min(original.getDate(), daysInMonth(date.getFullYear(), date.getMonth()));
  return false;
}
export function taskIsDone(task: Task, key: string) {
  if ((task.recurrence ?? 'None') !== 'None') return Boolean(task.completedDates?.includes(key));
  return task.date === key && task.completed;
}

function timeLabel(time?: string) {
  if (!time) return 'Flexible';
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function timeGroup(task: Task) {
  if (!task.time) return 'Anytime';
  const hour = Number(task.time.split(':')[0]);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}
function taskTone(category?: TaskCategory) {
  return 'planner-tone-' + (category ?? 'Personal').toLowerCase();
}

export function PlannerPage({ habits, tasks, today, onToggleHabit, onToggleTask, onAddTask }: PlannerPageProps) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [mode, setMode] = useState<'Week' | 'Month'>('Week');
  const [groupBy, setGroupBy] = useState<'Time' | 'Category'>('Time');
  const [categoryFilter, setCategoryFilter] = useState<'All' | TaskCategory>('All');
  const [showCreate, setShowCreate] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTime, setDraftTime] = useState('09:00');
  const [draftCategory, setDraftCategory] = useState<TaskCategory>('Study');
  const [draftRecurrence, setDraftRecurrence] = useState<Recurrence>('None');
  const [draftPriority, setDraftPriority] = useState<Task['priority']>('Normal');
  const [draftEstimate, setDraftEstimate] = useState(25);

  const selected = fromKey(selectedDate);
  const monthTitle = selected.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => shiftKey(startOfWeek(selectedDate), index)), [selectedDate]);
  const monthCells = useMemo(() => {
    const first = toKey(new Date(selected.getFullYear(), selected.getMonth(), 1, 12));
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, index) => shiftKey(start, index));
  }, [selected.getFullYear(), selected.getMonth()]);

  const habitsDue = habits.filter((habit) => dueHabitOn(habit, selectedDate));
  const scheduledTasks = tasks.filter((task) => taskOccursOn(task, selectedDate));
  const doneHabits = habitsDue.filter((habit) => Boolean(habit.logs[selectedDate])).length;
  const doneTasks = scheduledTasks.filter((task) => taskIsDone(task, selectedDate)).length;
  const totalItems = habitsDue.length + scheduledTasks.length;
  const totalDone = doneHabits + doneTasks;
  const completion = totalItems ? Math.round((totalDone / totalItems) * 100) : 0;
  const isFuture = selectedDate > today;

  const summaryFor = (key: string) => {
    const due = habits.filter((habit) => dueHabitOn(habit, key));
    const dueTasks = tasks.filter((task) => taskOccursOn(task, key));
    const finished = due.filter((habit) => Boolean(habit.logs[key])).length + dueTasks.filter((task) => taskIsDone(task, key)).length;
    const total = due.length + dueTasks.length;
    return { finished, total, percent: total ? Math.round((finished / total) * 100) : 0, taskCount: dueTasks.length, habitCount: due.length };
  };

  const moveWeek = (amount: number) => setSelectedDate((current) => shiftKey(current, amount * 7));
  const moveMonth = (amount: number) => {
    const current = fromKey(selectedDate);
    const year = current.getFullYear();
    const month = current.getMonth() + amount;
    const day = Math.min(current.getDate(), daysInMonth(year, month));
    setSelectedDate(toKey(new Date(year, month, day, 12)));
  };
  const openCreate = () => {
    setDraftTitle('');
    setDraftTime('09:00');
    setShowCreate(true);
  };
  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    onAddTask({
      title,
      date: selectedDate,
      time: draftTime,
      category: draftCategory,
      recurrence: draftRecurrence,
      priority: draftPriority,
      estimate: Math.max(5, Number(draftEstimate) || 25),
    });
    setDraftTitle('');
    setShowCreate(false);
  };

  const filteredTasks = categoryFilter === 'All' ? scheduledTasks : scheduledTasks.filter((task) => (task.category ?? 'Personal') === categoryFilter);
  const groupedTasks: { label: string; items: Task[] }[] = groupBy === 'Time'
    ? ['Morning', 'Afternoon', 'Evening', 'Anytime'].map((label) => ({ label, items: filteredTasks.filter((task) => timeGroup(task) === label).sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')) }))
    : CATEGORIES.map((label) => ({ label, items: filteredTasks.filter((task) => ((task.category ?? 'Personal') === label || (label === 'Personal' && task.category === 'Admin'))).sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99')) }));

  return <div className="planner-page">
    <section className="page-intro planner-page-intro">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> YOUR LIFE, IN ONE PLACE</div>
        <h1>Make room for <span>what matters.</span></h1>
        <p className="welcome-sub">A flexible map of your time, routines, and next small wins.</p>
      </div>
      <button className="primary-button planner-create-cta" type="button" onClick={openCreate}><Plus size={16} /> Add activity</button>
    </section>

    <section className="panel planner-calendar-panel">
      <div className="planner-calendar-head">
        <div className="planner-heading-copy">
          <div className="panel-overline">YOUR CALENDAR</div>
          <h3>{monthTitle}<span className="heading-count">{mode === 'Week' ? 'WEEK VIEW' : 'MONTH VIEW'}</span></h3>
          <p>{mode === 'Week' ? 'Week of ' + prettyDate(weekDays[0], { month: 'short', day: 'numeric' }) + ' – ' + prettyDate(weekDays[6], { month: 'short', day: 'numeric' }) : 'Select any date to see its plan and check-ins.'}</p>
        </div>
        <div className="planner-calendar-actions">
          <div className="planner-segment" role="group" aria-label="Calendar view">
            <button type="button" className={mode === 'Week' ? 'selected' : ''} onClick={() => setMode('Week')}><CalendarRange size={14} /> Week</button>
            <button type="button" className={mode === 'Month' ? 'selected' : ''} onClick={() => setMode('Month')}><LayoutGrid size={14} /> Month</button>
          </div>
          <div className="planner-date-nav">
            <button type="button" aria-label="Previous period" onClick={() => mode === 'Week' ? moveWeek(-1) : moveMonth(-1)}><ChevronLeft size={16}/></button>
            <button type="button" onClick={() => setSelectedDate(today)}>Today</button>
            <button type="button" aria-label="Next period" onClick={() => mode === 'Week' ? moveWeek(1) : moveMonth(1)}><ChevronRight size={16}/></button>
          </div>
        </div>
      </div>

      {mode === 'Week' ? <div className="planner-week-grid">
        {weekDays.map((key) => {
          const summary = summaryFor(key);
          const active = key === selectedDate;
          return <button type="button" key={key} className={'planner-week-day ' + (active ? 'is-selected ' : '') + (key === today ? 'is-today' : '')} onClick={() => setSelectedDate(key)} aria-pressed={active}>
            <span className="planner-week-day-name">{prettyDate(key, { weekday: 'short' })}</span>
            <b className="planner-week-day-number">{fromKey(key).getDate()}</b>
            <span className="planner-week-day-meter"><i style={{ height: (summary.percent || 3) + '%' }} /></span>
            <span className="planner-week-day-count">{summary.finished}/{summary.total} done</span>
            <span className="planner-week-day-dots"><i className="task-dot"/><i className="habit-dot"/><small>{summary.taskCount} tasks · {summary.habitCount} habits</small></span>
          </button>;
        })}
      </div> : <div className="planner-month-grid">
        {WEEKDAYS.map((day) => <div className="planner-month-weekday" key={day}>{day}</div>)}
        {monthCells.map((key) => {
          const summary = summaryFor(key);
          const active = key === selectedDate;
          const outside = fromKey(key).getMonth() !== selected.getMonth();
          return <button type="button" key={key} className={'planner-month-day ' + (active ? 'is-selected ' : '') + (key === today ? 'is-today ' : '') + (outside ? 'outside-month' : '')} onClick={() => setSelectedDate(key)} aria-pressed={active} aria-label={prettyDate(key) + ': ' + summary.finished + ' of ' + summary.total + ' items done'}>
            <span className="planner-month-date">{fromKey(key).getDate()}</span>
            <span className="planner-month-count">{summary.total ? summary.finished + '/' + summary.total : '—'}</span>
            <span className="planner-month-meter"><i style={{ width: summary.percent + '%' }} /></span>
            <span className="planner-month-markers">{Array.from({ length: Math.min(4, summary.total) }, (_, index) => <i key={index} className={index < summary.finished ? 'done' : ''} />)}</span>
          </button>;
        })}
      </div>}

      <div className="planner-legend">
        <span><i className="planner-legend-dot done"/> Logged / completed</span>
        <span><i className="planner-legend-dot planned"/> Planned activity</span>
        <span><i className="planner-legend-dot today"/> Today</span>
      </div>
    </section>

    <div className="planner-day-summary">
      <div className="planner-summary-main">
        <div className="panel-overline">{selectedDate === today ? 'YOUR PLAN FOR TODAY' : selectedDate < today ? 'LOOKING BACK' : 'PLAN AHEAD'}</div>
        <h2>{prettyDate(selectedDate)}</h2>
        <p>{isFuture ? 'Set yourself up gently. Future habits unlock on the day.' : totalItems === 0 ? 'A little breathing room is part of a good plan.' : totalDone + ' of ' + totalItems + ' planned check-ins and tasks completed.'}</p>
      </div>
      <div className="planner-summary-progress" style={{ '--planner-progress': completion + '%' } as CSSProperties}><div><b>{completion}%</b><small>COMPLETE</small></div></div>
      <div className="planner-summary-metrics"><div><span>Routines</span><b>{doneHabits}/{habitsDue.length}</b></div><div><span>Tasks</span><b>{doneTasks}/{scheduledTasks.length}</b></div></div>
    </div>

    <section className="planner-activity-layout">
      <div className="panel planner-activities-panel">
        <div className="panel-heading planner-activities-head">
          <div><div className="panel-overline">CHECK OFF AS YOU GO</div><h3>Activities <span className="heading-count">{scheduledTasks.length + habitsDue.length}</span></h3></div>
          <button type="button" className="secondary-button planner-add-inline" onClick={openCreate}><Plus size={14}/> Add</button>
        </div>

        <div className="planner-list-controls">
          <div className="planner-filter-chips" aria-label="Filter tasks by category">
            <button type="button" className={categoryFilter === 'All' ? 'active' : ''} onClick={() => setCategoryFilter('All')}>All</button>
            {CATEGORIES.map((category) => <button type="button" className={categoryFilter === category ? 'active' : ''} key={category} onClick={() => setCategoryFilter(category)}>{category}</button>)}
          </div>
          <label className="planner-groupby"><ListFilter size={13}/><span>Group</span><select value={groupBy} onChange={(event) => setGroupBy(event.target.value as 'Time' | 'Category')}><option value="Time">By time</option><option value="Category">By category</option></select></label>
        </div>

        {habitsDue.length > 0 && categoryFilter === 'All' && <div className="planner-habits-section">
          <div className="planner-group-heading"><span className="planner-group-icon habit-group-icon"><Zap size={14}/></span><div><b>Habits & routines</b><small>Small actions that build consistency</small></div><span className="planner-group-count">{doneHabits}/{habitsDue.length}</span></div>
          <div className="planner-habit-checklist">
            {habitsDue.map((habit) => {
              const checked = Boolean(habit.logs[selectedDate]);
              return <div className={'planner-habit-row ' + (checked ? 'is-complete' : '')} key={habit.id}>
                <button type="button" className={'planner-check ' + (checked ? 'checked' : '')} disabled={isFuture} onClick={() => onToggleHabit(habit.id, selectedDate)} aria-label={(checked ? 'Undo' : 'Complete') + ' ' + habit.name}><span>{checked ? <Check size={13} strokeWidth={3}/> : null}</span></button>
                <span className={'planner-habit-symbol tone-' + habit.color} aria-hidden="true"><PlannerHabitGlyph habit={habit} /></span>
                <div className="planner-activity-copy"><b>{habit.name}</b><small>{habit.cue || habit.minimum}</small></div>
                <span className="planner-activity-tag">{habit.category}</span>
              </div>;
            })}
          </div>
        </div>}

        {groupedTasks.filter((group) => group.items.length > 0).map((group) => <div className="planner-task-group" key={group.label}>
          <div className="planner-group-heading"><span className={'planner-group-icon ' + (group.label === 'Morning' ? 'planner-tone-study' : group.label === 'Afternoon' ? 'planner-tone-work' : group.label === 'Evening' ? 'planner-tone-health' : 'planner-tone-personal')}>{groupBy === 'Time' ? <Clock3 size={14}/> : <ListFilter size={14}/>}</span><div><b>{group.label}</b><small>{groupBy === 'Time' ? 'Tasks in this part of the day' : 'Tasks in this area of life'}</small></div><span className="planner-group-count">{group.items.filter((task) => taskIsDone(task, selectedDate)).length}/{group.items.length}</span></div>
          <div className="planner-task-list">
            {group.items.map((task) => {
              const checked = taskIsDone(task, selectedDate);
              return <div className={'planner-task-row ' + (checked ? 'is-complete' : '')} key={task.id}>
                <button type="button" className={'planner-check ' + (checked ? 'checked' : '')} onClick={() => onToggleTask(task.id, selectedDate)} aria-label={(checked ? 'Reopen' : 'Complete') + ' ' + task.title}><span>{checked ? <Check size={13} strokeWidth={3}/> : null}</span></button>
                <div className="planner-activity-copy"><b>{task.title}</b><small><Clock3 size={11}/> {timeLabel(task.time)} <i/> {task.estimate} min <i/> {task.priority} priority</small></div>
                <span className={'planner-activity-tag ' + taskTone(task.category)}>{task.category ?? 'Personal'}</span>
                {(task.recurrence ?? 'None') !== 'None' && <span className="planner-repeat-tag" title={'Repeats: ' + task.recurrence}><Repeat2 size={11}/>{task.recurrence}</span>}
              </div>;
            })}
          </div>
        </div>)}

        {habitsDue.length === 0 && scheduledTasks.length === 0 && <div className="planner-empty-state"><span><CalendarDays size={22}/></span><b>Space for something meaningful</b><p>Add a task, schedule a recurring routine, or let this day stay open.</p><button className="text-button" type="button" onClick={openCreate}><Plus size={14}/> Add your first activity</button></div>}
        {scheduledTasks.length > 0 && filteredTasks.length === 0 && <div className="planner-empty-filter">No tasks in this category for this day.</div>}
      </div>

      <aside className="planner-side-column">
        {showCreate ? <section className="panel planner-form-panel">
          <div className="panel-heading"><div><div className="panel-overline">ADD TO YOUR PLAN</div><h3>New activity</h3></div><button type="button" className="icon-button" aria-label="Close form" onClick={() => setShowCreate(false)}><X size={15}/></button></div>
          <form onSubmit={submitCreate} className="planner-create-form">
            <label className="planner-field"><span>Activity name</span><input autoFocus value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="e.g. Review lecture notes" required maxLength={90}/></label>
            <div className="planner-field-row"><label className="planner-field"><span>Date</span><input type="date" value={selectedDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }}/></label><label className="planner-field"><span>Time</span><input type="time" value={draftTime} onChange={(event) => setDraftTime(event.target.value)}/></label></div>
            <div className="planner-field-row"><label className="planner-field"><span>Area</span><select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value as TaskCategory)}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label className="planner-field"><span>Repeat</span><select value={draftRecurrence} onChange={(event) => setDraftRecurrence(event.target.value as Recurrence)}>{RECURRENCES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
            <div className="planner-field-row"><label className="planner-field"><span>Priority</span><select value={draftPriority} onChange={(event) => setDraftPriority(event.target.value as Task['priority'])}><option>Low</option><option>Normal</option><option>High</option></select></label><label className="planner-field"><span>Minutes</span><input type="number" min={5} max={600} step={5} value={draftEstimate} onChange={(event) => setDraftEstimate(Number(event.target.value) || 25)}/></label></div>
            {draftRecurrence !== 'None' && <div className="planner-repeat-preview"><Repeat2 size={14}/><span>Repeats {draftRecurrence.toLowerCase()} from {prettyDate(selectedDate, { month: 'short', day: 'numeric' })}. Completion is tracked separately for each occurrence.</span></div>}
            <button type="submit" className="primary-button planner-save-button"><Check size={15}/> Save activity</button>
          </form>
        </section> : <section className="panel planner-quick-add">
          <div className="planner-quick-icon"><Plus size={16}/></div><div><div className="panel-overline">MAKE IT REAL</div><h3>Put it on the calendar.</h3><p>Capture it now. Decide the details once, then let Streako remember the repeat.</p><button type="button" className="secondary-button" onClick={openCreate}><Plus size={14}/> Create activity</button></div>
        </section>}

        <section className="panel planner-principle">
          <div className="planner-principle-icon"><Repeat2 size={16}/></div><div className="panel-overline">LESS RE-PLANNING</div><h3>Let the routine return.</h3><p>Recurring activities appear automatically on the right dates. Each day's checkbox is independent, so completing today's workout won't mark tomorrow's complete.</p>
        </section>
        <section className="panel planner-focus-note">
          <div className="planner-focus-kicker"><span className="save-dot"/> YOUR NEXT STEP</div>
          <b>{scheduledTasks.find((task) => !taskIsDone(task, selectedDate))?.title ?? habitsDue.find((habit) => !habit.logs[selectedDate])?.name ?? 'Protect a little breathing room.'}</b>
          <p>{scheduledTasks.some((task) => !taskIsDone(task, selectedDate)) ? 'Choose one small task and start with a short focus block.' : habitsDue.some((habit) => !habit.logs[selectedDate]) ? 'Your smallest version counts. Start there.' : 'You have space. Use it intentionally or enjoy the pause.'}</p>
        </section>
      </aside>
    </section>
    <footer className="page-footer"><span><CalendarDays size={13}/> One plan, many views.</span><span>Week and month views share your habit and task data.</span></footer>
  </div>;
}
