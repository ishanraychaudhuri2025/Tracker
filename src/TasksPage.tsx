import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, ListTodo,
  Plus, Search, Trash2, X, Zap,
} from 'lucide-react';
import type { Recurrence, Task, TaskCategory } from './types';
import type { PlannerTaskDraft } from './Planner';
import { taskIsDone, taskOccursOn } from './Planner';

type TaskFilter = 'All' | 'Today' | 'Upcoming' | 'Overdue' | 'Completed';

type TasksPageProps = {
  tasks: Task[];
  today: string;
  onToggleTask: (taskId: string, dayKey?: string) => void;
  onAddTask: (draft: PlannerTaskDraft) => void;
  onDeleteTask: (taskId: string) => void;
};

const categories: TaskCategory[] = ['Study', 'Work', 'Health', 'Personal', 'Admin'];
const recurrences: Recurrence[] = ['None', 'Daily', 'Weekdays', 'Weekends', 'Weekly', 'Monthly'];
const filters: TaskFilter[] = ['All', 'Today', 'Upcoming', 'Overdue', 'Completed'];

function keyDate(key: string) {
  return new Date(key + 'T12:00:00');
}
function formatDate(key: string) {
  return keyDate(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatTime(time?: string) {
  if (!time) return 'Flexible time';
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function currentTaskDone(task: Task, today: string) {
  const key = taskOccursOn(task, today) ? today : task.date;
  return taskIsDone(task, key);
}
function hasAnyCompletion(task: Task) {
  return (task.recurrence ?? 'None') === 'None'
    ? task.completed
    : Boolean(task.completedDates?.length);
}

export default function TasksPage({ tasks, today, onToggleTask, onAddTask, onDeleteTask }: TasksPageProps) {
  const [filter, setFilter] = useState<TaskFilter>('All');
  const [category, setCategory] = useState<'All' | TaskCategory>('All');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('09:00');
  const [taskCategory, setTaskCategory] = useState<TaskCategory>('Study');
  const [recurrence, setRecurrence] = useState<Recurrence>('None');
  const [priority, setPriority] = useState<Task['priority']>('Normal');
  const [estimate, setEstimate] = useState(25);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const stats = useMemo(() => {
    const dueToday = tasks.filter((task) => taskOccursOn(task, today));
    const openToday = dueToday.filter((task) => !taskIsDone(task, today));
    const overdue = tasks.filter((task) => (task.recurrence ?? 'None') === 'None' && task.date < today && !task.completed);
    const completed = tasks.filter((task) => hasAnyCompletion(task));
    return { total: tasks.length, openToday: openToday.length, overdue: overdue.length, completed: completed.length };
  }, [tasks, today]);

  const shownTasks = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return tasks.filter((task) => {
      const isDueToday = taskOccursOn(task, today);
      const isDoneToday = taskIsDone(task, isDueToday ? today : task.date);
      const isDone = hasAnyCompletion(task);
      const isOverdue = (task.recurrence ?? 'None') === 'None' && task.date < today && !task.completed;
      if (filter === 'Today' && !isDueToday) return false;
      if (filter === 'Upcoming' && task.date <= today) return false;
      if (filter === 'Overdue' && !isOverdue) return false;
      if (filter === 'Completed' && !(isDone || isDoneToday)) return false;
      if (category !== 'All' && (task.category ?? 'Personal') !== category) return false;
      if (normalized && !task.title.toLowerCase().includes(normalized)) return false;
      return true;
    }).sort((a, b) => {
      const aDone = currentTaskDone(a, today);
      const bDone = currentTaskDone(b, today);
      if (aDone !== bDone) return Number(aDone) - Number(bDone);
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.time || '99:99').localeCompare(b.time || '99:99');
    });
  }, [tasks, today, filter, category, search]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAddTask({
      title: title.trim(),
      date,
      time,
      category: taskCategory,
      recurrence,
      priority,
      estimate: Math.max(5, Math.min(600, Number(estimate) || 25)),
    });
    setTitle('');
    setDate(today);
    setTime('09:00');
    setTaskCategory('Study');
    setRecurrence('None');
    setPriority('Normal');
    setEstimate(25);
    setShowCreate(false);
  };

  return <div className="tasks-page">
    <section className="page-intro tasks-page-intro">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> CLARITY OVER CLUTTER</div>
        <h1>Tasks, <span>with intent.</span></h1>
        <p className="welcome-sub">Make the next action obvious. Organize the work, then move one thing forward.</p>
      </div>
      <button className="primary-button" type="button" onClick={() => { setDate(today); setShowCreate(true); }}><Plus size={16}/> Add task</button>
    </section>

    <section className="tasks-summary-grid">
      <article className="tasks-summary-card"><span className="tasks-summary-icon"><ListTodo size={17}/></span><small>OPEN TODAY</small><b>{stats.openToday}</b><span>Tasks ready for action</span></article>
      <article className="tasks-summary-card"><span className="tasks-summary-icon violet"><Clock3 size={17}/></span><small>OVERDUE</small><b>{stats.overdue}</b><span>One step at a time</span></article>
      <article className="tasks-summary-card"><span className="tasks-summary-icon cyan"><CheckCircle2 size={17}/></span><small>COMPLETED</small><b>{stats.completed}</b><span>Wins recorded so far</span></article>
      <article className="tasks-summary-card tasks-summary-note"><Zap size={18}/><div><b>Keep it achievable.</b><p>Give tasks an estimate and a clear priority. Small, finishable actions make plans easier to follow.</p></div></article>
    </section>

    <section className="panel tasks-board">
      <div className="panel-heading tasks-board-heading">
        <div><div className="panel-overline">YOUR ACTION LIST</div><h3>All tasks <span className="heading-count">{tasks.length}</span></h3></div>
        <span className="tasks-board-count">{shownTasks.length} shown</span>
      </div>
      <div className="tasks-toolbar">
        <div className="tasks-filter-tabs" role="group" aria-label="Filter tasks">
          {filters.map((item) => <button type="button" key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}{item === 'Today' && stats.openToday > 0 ? <span>{stats.openToday}</span> : null}{item === 'Overdue' && stats.overdue > 0 ? <span>{stats.overdue}</span> : null}</button>)}
        </div>
        <div className="tasks-search-filter">
          <label className="tasks-search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks…" aria-label="Search tasks"/></label>
          <select value={category} onChange={(event) => setCategory(event.target.value as 'All' | TaskCategory)} aria-label="Filter by category"><option value="All">All areas</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </div>

      <div className="tasks-list">
        {shownTasks.map((task) => {
          const scheduledToday = taskOccursOn(task, today);
          const activeKey = scheduledToday ? today : task.date;
          const done = taskIsDone(task, activeKey);
          const overdue = (task.recurrence ?? 'None') === 'None' && task.date < today && !task.completed;
          const future = task.date > today && !scheduledToday;
          return <article className={'tasks-list-row ' + (done ? 'is-completed ' : '') + (overdue ? 'is-overdue ' : '')} key={task.id}>
            <button type="button" className={'tasks-check ' + (done ? 'checked' : '')} disabled={future} onClick={() => onToggleTask(task.id, activeKey)} aria-label={(done ? 'Undo ' : 'Complete ') + task.title} title={future ? 'Available on its scheduled date' : done ? 'Mark as open' : 'Mark as complete'}>{done ? <Check size={15} strokeWidth={2.8}/> : null}</button>
            <div className="tasks-list-copy">
              <b>{task.title}</b>
              <div className="tasks-list-meta">
                <span className={'tasks-category-tag tasks-cat-' + (task.category ?? 'Personal').toLowerCase()}>{task.category ?? 'Personal'}</span>
                <span><Clock3 size={12}/>{formatTime(task.time)} · {task.estimate} min</span>
                <span><CalendarDays size={12}/>{scheduledToday ? 'Today' : formatDate(task.date)}</span>
                {(task.recurrence ?? 'None') !== 'None' && <span className="tasks-repeat-tag">{task.recurrence}</span>}
              </div>
            </div>
            <span className={'tasks-priority priority-' + task.priority.toLowerCase()}>{task.priority}</span>
            <span className={'tasks-state ' + (done ? 'done' : overdue ? 'overdue' : '')}>{done ? 'COMPLETE' : overdue ? 'OVERDUE' : future ? 'UP NEXT' : 'OPEN'}</span>
            <button type="button" className="tasks-delete" aria-label={'Delete task ' + task.title} title="Delete task" onClick={() => setDeleteTarget(task.id)}><Trash2 size={15}/></button>
          </article>;
        })}
        {shownTasks.length === 0 && <div className="tasks-empty"><span><CheckCircle2 size={24}/></span><b>{tasks.length ? 'Nothing matches this view.' : 'Start with one clear next step.'}</b><p>{tasks.length ? 'Try another filter or search term.' : 'Add a task and choose when it belongs in your day.'}</p><button className="secondary-button" type="button" onClick={() => setShowCreate(true)}><Plus size={14}/> Create your first task</button></div>}
      </div>
      <div className="tasks-board-footer"><span><span className="tasks-footer-dot"/> Your tasks stay in sync with Planner.</span><button type="button" onClick={() => setFilter('All')}>Clear filters <ArrowUpRight size={13}/></button></div>
    </section>

    {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
      <section className="habit-modal tasks-create-modal" role="dialog" aria-modal="true" aria-labelledby="task-create-title">
        <div className="modal-top"><div><div className="panel-overline">MAKE IT CONCRETE</div><h2 id="task-create-title">Add a task</h2><p>Define the action, when it belongs, and how long it needs.</p></div><button className="icon-button" type="button" aria-label="Close add task" onClick={() => setShowCreate(false)}><X size={18}/></button></div>
        <form onSubmit={submit}>
          <label className="field-label">Task title<input autoFocus required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Finish DBMS revision"/></label>
          <div className="habit-configuration-grid">
            <label className="field-label">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required/></label>
            <label className="field-label">Time<input type="time" value={time} onChange={(event) => setTime(event.target.value)}/></label>
          </div>
          <div className="habit-configuration-grid">
            <label className="field-label">Area<select value={taskCategory} onChange={(event) => setTaskCategory(event.target.value as TaskCategory)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="field-label">Repeat<select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Recurrence)}>{recurrences.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="habit-configuration-grid">
            <label className="field-label">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Task['priority'])}><option>Low</option><option>Normal</option><option>High</option></select></label>
            <label className="field-label">Estimate (minutes)<input type="number" min="5" max="600" step="5" value={estimate} onChange={(event) => setEstimate(Number(event.target.value) || 25)}/></label>
          </div>
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary-button" type="submit"><Plus size={15}/> Save task</button></div>
        </form>
      </section>
    </div>}

    {deleteTarget && <div className="modal-backdrop tasks-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
      <section className="tasks-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="task-delete-title">
        <span className="tasks-delete-mark"><Trash2 size={19}/></span><h2 id="task-delete-title">Delete this task?</h2><p>This removes it from Tasks and Planner. Completed history for this task will also be removed.</p>
        <div><button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)}>Keep task</button><button type="button" className="tasks-danger-button" onClick={() => { onDeleteTask(deleteTarget); setDeleteTarget(null); }}>Delete task</button></div>
      </section>
    </div>}
  </div>;
}
