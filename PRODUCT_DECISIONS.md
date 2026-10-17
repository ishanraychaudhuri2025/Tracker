# Research → product decisions

This file records why the first version is designed the way it is. It is a product translation of published work, not a validated intervention.

| Evidence / principle | Product decision | Trade-off to revisit |
| --- | --- | --- |
| Stanford's Fogg Behavior Model describes behavior as the convergence of motivation, ability, and prompt. | Put the next action on the Today page, make check-in one click, and ask users to define a minimum version. | Prompts should be user-controlled; we should not add noisy, guilt-inducing reminders. |
| Stanford SPARQ's “Plan to Succeed” summarizes research on implementation intentions and concrete plans. | Habit creation records a reliable cue and previews “If [cue], then I’ll [minimum action].” | A future version could add preferred time/place and obstacles, but should not turn setup into a long form. |
| Harkin et al. (2016) meta-analysis finds goal-progress monitoring interventions improve monitoring and, on average, goal attainment. | Check-ins, weekly consistency, activity heatmap, and visible totals make progress observable. | Keep metrics descriptive; avoid presenting a composite “productivity score” as scientifically validated. |
| Lally et al. (2010) observed large individual differences in time to habit automaticity. | Do not promise a universal number of days to “form a habit”; show personal streaks and history instead. | Streaks can motivate, but must be paired with gentle restarts and not treated as the primary outcome. |
| Wood, Neal and colleagues describe habits as context-triggered repetition. | Attach the behavior to a cue that is likely to recur in the same context. | Let users change cues as their real routine changes. |
| Implementation intentions can help initiation, but intentions alone do not guarantee follow-through. | Give the user a small action and a working focus timer—not just aspirational goal-setting fields. | Later experiments should measure real-world usefulness with consent and privacy protections. |

## Current boundaries

- Reminders are evaluated while Cadence is open. Browser notifications are optional and browser-controlled; notifications are not scheduled after the browser closes.
- JSON restore is an explicit full replacement after validation, not an automatic merge. Backups exclude authentication credentials.
- No social competition by default. Shared accountability should be opt-in and private by default.
- No claims of medical, therapeutic, or clinical benefit.
- No machine-learned recommendations yet. The first step is to gather a useful, user-owned record and let users review it.