# Streako Elite

A research-informed, local-first habit and task tracker. This is an original implementation inspired by common streak-tracker patterns; it does not include Streako's proprietary source code, assets, or backend.

## What is here

- **Planner:** selectable weekly and monthly calendars, date navigation, day-by-day activity summaries, and clickable checklists.
- **Recurring activities:** schedule tasks daily, on weekdays/weekends, weekly, or monthly; each occurrence has its own completion state.
- **Time and life-area grouping:** organize tasks by Morning / Afternoon / Evening / Anytime or by Study, Work, Health, Personal, and Admin.
- **Progress matrix:** weekly habit tick marks plus daily and monthly visual progress.
- **Problem-to-solution plan:** see [docs/PROBLEM_SOLUTION_MAP.md](docs/PROBLEM_SOLUTION_MAP.md) for the user problems, design responses, reference listings, and research basis.

- **Today dashboard:** check habits off, see daily progress, review current/best streaks, and track a small task list.
- **Habit design:** create routines with a category, cadence, reliable cue, and a minimum version. The form turns those inputs into an if–then plan.
- **Focus room:** a working 15 / 25 / 50-minute focus timer, pause/resume, reset, and completed-session count.
- **Insights:** completion heatmap, consistency calculation, routine rankings, and a weekly behavior-design reflection.
- **Responsive UI:** desktop sidebar, mobile layout, dark/light appearance, accessible labels, reduced-motion support.
- **Local persistence:** habits, task state, and check-ins persist in this browser using `localStorage`.

## Run locally

Requirements: Node.js 20.19+ (Node 22 LTS is a good choice) and npm.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). To make a production build:

```bash
npm run build
npm run preview
```

The first open seeds example routines and sample check-in history so the interface is useful immediately. Data lives in the current browser only; there is no account system, server database, cross-device sync, or scheduled notification backend yet. A future production release should add authentication, a database, backups/export, and server-side reminder scheduling before it is used as a multi-device personal tracker.

## Publish to GitHub

The source is maintained in [ishanraychaudhuri2025/Tracker](https://github.com/ishanraychaudhuri2025/Tracker). To push local changes from your machine, install GitHub CLI, sign in once, then run the included script from the project folder:

```bash
gh auth login
./scripts/publish-to-github.sh Tracker
```

The script targets the existing `Tracker` repository and pushes the current branch to `main`. Pass a different repository name as the first argument only when you intentionally want another destination.

## Behavior-design principles

The product deliberately emphasizes consistency over streak perfection:

1. **Prompt + ability + motivation:** keep the next action visible, lower the effort with a minimum version, and use progress as feedback.
2. **Context cues:** habits can be tied to a reliable moment such as after breakfast or before closing a laptop.
3. **Implementation intentions:** habit creation captures the form “If [cue], then I’ll [small action].”
4. **Self-monitoring:** check-ins and the activity heatmap make behavior visible without implying that a missed day is a moral failure.
5. **Flexible habit formation:** no universal “21-day” promise; automaticity varies substantially by behavior and person.

These are design hypotheses based on published behavior research, not a claim that this application has itself been clinically or experimentally validated.

## Research starting points

- **Stanford Behavior Design Lab — Fogg Behavior Model.** Behavior occurs when motivation, ability, and a prompt converge. This informs visible prompts and the “minimum version” field. https://behaviordesign.stanford.edu/resources/fogg-behavior-model
- **Harkin, Webb, Chang et al. (2016), _Does monitoring goal progress promote goal attainment? A meta-analysis of the experimental evidence_, Psychological Bulletin 142(2), 198–229.** The meta-analysis covered 138 studies with 19,951 participants and reported a positive average effect of progress-monitoring interventions on goal attainment. DOI: https://doi.org/10.1037/bul0000025
- **Stanford SPARQ — Plan to Succeed.** Summarizes an implementation-intentions study in which students who specified concrete completion strategies were more likely to submit the assignment than controls. The page describes plans for time, place, and action. https://sparq.stanford.edu/solutions/plan-succeed
- **Gollwitzer & Sheeran (2006), _Implementation Intentions and Goal Achievement: A Meta-analysis of Effects and Processes_, Advances in Experimental Social Psychology 38, 69–119.** Reviews if–then plans specifying when, where, and how to act. DOI: https://doi.org/10.1016/S0065-2601(06)38002-1
- **Lally, van Jaarsveld, Potts & Wardle (2010), _How are habits formed: Modelling habit formation in the real world_, European Journal of Social Psychology 40(6), 998–1009.** Habit automaticity followed individual curves; estimated times varied widely. DOI: https://doi.org/10.1002/ejsp.674
- **Neal, Wood & Quinn (2006), _Habits—A Repeat Performance_, Current Directions in Psychological Science 15(4), 198–202.** Reviews how stable context cues can trigger repeated actions. DOI: https://doi.org/10.1111/j.1467-8721.2006.00435.x
- **Wood, Mazar & Neal (2022), _Habits and Goals in Human Behavior: Separate but Interacting Systems_, Perspectives on Psychological Science 17(2), 590–605.** Explores how habits and goals can interact. DOI: https://doi.org/10.1177/1745691621994226

## Current scope / next milestones

1. Verify the build in CI and add focused tests for scheduling, streak calculations, and date-boundary cases.
2. Add account-backed persistence and a database (Postgres/Supabase or equivalent), plus row-level authorization.
3. Add time-zone-aware reminders, export/import, and privacy-friendly backups.
4. Add optional opt-in accountability, careful gamification, and a weekly review flow.
5. Deploy only after the build, basic accessibility, and data-handling model are reviewed.

## License

MIT for this original code scaffold. Third-party packages retain their own licenses.