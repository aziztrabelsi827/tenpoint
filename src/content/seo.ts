export type SeoSection = {
  heading: string;
  body: string[];
  bullets?: string[];
  table?: { columns: string[]; rows: string[][] };
};

export type FaqItem = { q: string; a: string };

export type SeoPageContent = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  eyebrow: string;
  features: { icon: string; title: string; text: string }[];
  sections: SeoSection[];
  faq: FaqItem[];
  related: { href: string; label: string; text: string }[];
};

const CORE_FEATURES = [
  {
    icon: "◱",
    title: "Ten-habit scorecard",
    text: "Rate your day out of 10, with weighted positive habits, negative penalties and repetition targets for habits that happen more than once a day.",
  },
  {
    icon: "▦",
    title: "Spreadsheet grid",
    text: "A Mon–Sun completion grid you can click straight into, plus a weekly score column.",
  },
  {
    icon: "🔥",
    title: "Streaks & heatmaps",
    text: "Current streak, longest streak and a 52-week heatmap for every single habit.",
  },
  {
    icon: "🗒",
    title: "Tasks & planner",
    text: "Priorities, deadlines, categories and statuses on the same sheet as your habits.",
  },
  {
    icon: "▦",
    title: "Habit calendar",
    text: "Month, week and day views that combine tasks, habits, events and daily scores.",
  },
  {
    icon: "◔",
    title: "Pomodoro timer",
    text: "Focus blocks you can attach to a habit or task so focus time shows up in your stats.",
  },
];

export const SEO_PAGES: SeoPageContent[] = [
  {
    slug: "habit-tracker",
    title: "Habit tracker",
    metaTitle: "Habit Tracker — Custom Habits, Streaks & a Daily Rating Out of 10",
    metaDescription:
      "A free daily rating app that scores every day out of 10. Positive habits add to the rating, negative habits subtract from it, and each occurrence is credited individually.",
    h1: "Rate my day — a habit tracker scored out of 10",
    eyebrow: "Habit tracker",
    intro:
      "Most habit trackers count ticks and call it progress. TenPoint rates the day instead, always out of 10. Positive habits such as prayer, study or exercise add up to the rating; negative habits such as phone overuse or late nights subtract from it. Each habit carries its own weight and, crucially, its own repetition target — so five daily prayers stay one habit rather than five. Tick an occurrence, the rating moves. That's the whole loop, and it's the loop that keeps people consistent.",
    features: CORE_FEATURES,
    sections: [
      {
        heading: "Why a ten-habit limit works",
        body: [
          "Habit tracking fails for a predictable reason: the list grows faster than your capacity. Twenty habits feel ambitious in week one and impossible by week three. A hard cap of ten forces a decision about what genuinely matters right now.",
          "Because the scale is fixed at 10, a 7/10 means the same thing in March and in October, whether you track three habits or twenty. Your positive weights should add up to 10 so that completing everything is a perfect day; exceeding 10 simply means some effort goes unused, since the rating is capped.",
        ],
        bullets: [
          "One point per completed habit — no weighting, no negotiation",
          "A daily score of 0–10 that is comparable across months",
          "Habit frequency control for habits that only apply on certain weekdays",
          "Pause a habit without deleting its history",
        ],
      },
      {
        heading: "The weekly grid, explained",
        body: [
          "The centre of the app is a spreadsheet-style table. Habits run down the rows with their weight and daily target, Monday to Sunday runs across the columns, and each cell holds how many occurrences you completed that day. Clicking a cell advances the count — the update is optimistic, so the response is instant.",
          "A footer row totals the daily score under each day so you can spot the shape of your week immediately. Most people discover a pattern quickly: a reliable dip on Wednesdays, or a weekend that quietly erases two habits.",
        ],
        table: {
          columns: ["Habit", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Score"],
          rows: [
            ["Exercise", "✓", "✓", "○", "✓", "✓", "○", "✓", "5/7"],
            ["Reading", "✓", "○", "✓", "✓", "✓", "✓", "○", "5/7"],
            ["Meditation", "✓", "✓", "✓", "○", "✓", "○", "✓", "5/7"],
            ["Daily score", "3", "2", "2", "2", "3", "1", "2", "15"],
          ],
        },
      },
      {
        heading: "What you can measure",
        body: [
          "Every habit gets its own analytics page with a current streak, longest streak, completion percentage, total completions, lifetime points and best month. Switch between week, month, year and all-time views to see the same habit at different resolutions.",
          "Across the whole workspace you get total points, average daily score, overall completion percentage, current and longest streaks, best day, best week and best month — plus a 52-week heatmap and habit-by-habit consistency ranking.",
        ],
      },
      {
        heading: "Getting started takes about two minutes",
        body: [
          "Add your own habits the moment you open the dashboard — give each one a name, icon and colour, choose whether it's positive or negative, set its weight and how many times a day you're aiming for. Rename or delete them at any time, and you're tracking.",
          "Because every habit is fully editable, nothing is locked behind a paywall or a template you can't change. It's your workspace, not a fixed list.",
        ],
      },
    ],
    faq: [
      {
        q: "How many habits can I track?",
        a: "As many as you want — the workspace stores up to 60. Each habit can be positive or negative, carries its own weight between 0.1 and 10, and can target up to 20 occurrences per day. The rating stays on a 0–10 scale regardless of how many habits you track.",
      },
      {
        q: "Can I track habits on specific weekdays only?",
        a: "Yes. Each habit has a frequency setting — every day, weekdays, weekends, specific days or a custom selection. Unscheduled days are skipped rather than counted as misses.",
      },
      {
        q: "Does my data persist between sessions?",
        a: "Yes. Habits, completion history, tasks, calendar events, focus sessions and theme preferences are saved to your secure, sign-in-protected account, so they're there whenever you return on any device.",
      },
      {
        q: "Is there a mobile app?",
        a: "TenPoint is a responsive web app, so it works on phones, tablets and desktops with the same data. On mobile the sidebar becomes a bottom navigation bar.",
      },
    ],
    related: [
      { href: "/daily-habit-tracker", label: "Daily habit tracker", text: "Score each day in points" },
      { href: "/habit-tracker-template", label: "Habit tracker template", text: "Copy the ten-habit grid structure" },
      { href: "/habit-calendar", label: "Habit calendar", text: "See habits on a month, week and day calendar" },
    ],
  },
  {
    slug: "daily-habit-tracker",
    title: "Daily habit tracker",
    metaTitle: "Daily Habit Tracker — Score Every Day Out of 10 Points",
    metaDescription:
      "Rate your day out of 10. Positive habits and measurable tasks add to the rating, negative habits subtract from it, and both earn partial credit for partial progress.",
    h1: "Daily tracker that rates your day out of 10",
    eyebrow: "Daily habit tracker",
    intro:
      "A daily habit tracker only works if opening it is effortless and reading it is instant. TenPoint leads with today: a progress ring showing your score, the habits still missing, today's tasks, today's calendar and how long you've focused. Everything else is one click deeper.",
    features: CORE_FEATURES,
    sections: [
      {
        heading: "Your day, answered in five seconds",
        body: [
          "The dashboard is built to answer a fixed set of questions immediately: How productive was I today? Which habits are done? Which are missing? How consistent have I been? What tasks are outstanding? What's scheduled? How much time have I focused?",
          "Each of those has a dedicated module above the fold, so you never dig for the answer. The habit grid sits directly underneath, and clicking a cell is the primary action of the entire product.",
        ],
        bullets: [
          "Today's progress ring with score, percentage and habit count",
          "Daily streak and all-time longest streak",
          "Today's task completion ratio",
          "Focus time and completed Pomodoro sessions",
          "A 'missing today' strip so the next action is obvious",
        ],
      },
      {
        heading: "How the daily score is calculated",
        body: [
          "Daily rating = positive habit contributions + task contributions − negative penalties, clamped to between 0 and 10. A positive habit contributes (occurrences ÷ target) × weight, so four of five prayers at 2 points earn +1.6. A task contributes (progress ÷ target) × its fixed reward, so 30 minutes of a 2-hour study task worth 1 point earns +0.25. A negative habit costs its penalty per occurrence, so one phone overuse at 0.5 costs −0.5. If your habits earn 8.6, your tasks earn 1 and your penalties are 1.1, the day rates 8.5 / 10.",
          "Points accumulate forever, which is what makes the analytics page useful. Average daily score tells you the shape of a normal day; completion percentage tells you how much of your scheduled capacity you actually used.",
        ],
        table: {
          columns: ["Day", "Completed", "Score", "Note"],
          rows: [
            ["Monday", "9 of 10", "9/10", "Strong start"],
            ["Tuesday", "7 of 10", "7/10", "Missed the evening habits"],
            ["Wednesday", "10 of 10", "10/10", "Perfect day"],
            ["Thursday", "4 of 10", "4/10", "Schedule collapsed"],
            ["Friday", "8 of 10", "8/10", "Recovered"],
          ],
        },
      },
      {
        heading: "Designing for consistency, not intensity",
        body: [
          "Perfect days are celebrated, but they aren't the target. A 7/10 average sustained for six months beats a 10/10 week followed by abandonment. The trend chart on the progress page deliberately shows first-half versus second-half averages so you can see whether you're improving or drifting.",
          "When you finish every scheduled habit, the dashboard switches to a completion state — but nothing nags you if you don't. The tracker records; it doesn't lecture.",
        ],
      },
      {
        heading: "Works with however your day is structured",
        body: [
          "Night shift, irregular weeks, travel — set a habit to weekdays, weekends, specific days or a custom schedule, and only those days count. Pause a habit while you're ill and its history is preserved, so returning doesn't reset your longest streak record.",
          "Combine the daily tracker with the built-in Pomodoro timer to attach focus blocks to a habit, and with the task manager to keep the day's obligations on the same screen.",
        ],
      },
    ],
    faq: [
      {
        q: "What counts as a completed habit?",
        a: "Whatever you decide. Each habit has a description field where you define what one occurrence means — '30 minutes of movement', '10 pages', 'one full prayer'. You also set how many occurrences per day you are aiming for.",
      },
      {
        q: "Can I edit history if I forget to check something off?",
        a: "Yes. The weekly grid lets you navigate back through previous weeks and toggle any cell, so forgotten days can be corrected.",
      },
      {
        q: "What happens on a perfect day?",
        a: "The dashboard shows a completion state and the day is added to your perfect-days total, which is tracked on the analytics page.",
      },
      {
        q: "Is the daily score the same as a completion percentage?",
        a: "No. The daily rating is positive contributions minus negative penalties, clamped to between 0 and 10. Completion percentage is a separate measure that compares the occurrences you actually did against everything you had targeted in the selected period.",
      },
    ],
    related: [
      { href: "/habit-tracker", label: "Habit tracker", text: "The full ten-habit scorecard" },
      { href: "/daily-planner", label: "Daily planner", text: "Plan tasks alongside your habits" },
      { href: "/productivity-tracker", label: "Productivity tracker", text: "Analyse trends and consistency" },
    ],
  },
  {
    slug: "productivity-tracker",
    title: "Productivity tracker",
    metaTitle: "Productivity Tracker — Habits, Tasks, Focus Time & Analytics",
    metaDescription:
      "Track habits, tasks, calendar events and focus time in one dashboard, and rate every day out of 10 with streaks and trend analytics.",
    h1: "Productivity tracker for habits, tasks and focus time",
    eyebrow: "Productivity tracker",
    intro:
      "Productivity isn't one number — it's habits held steady, tasks actually finished, and attention defended. TenPoint tracks all three in a single workspace and rolls them into one daily score you can trend over months and years.",
    features: CORE_FEATURES,
    sections: [
      {
        heading: "Three inputs, one dashboard",
        body: [
          "Habits give you the long arc. Tasks give you the day. Focus time tells you whether you actually protected the attention you planned. Separately these live in three apps nobody opens consistently; together they take about thirty seconds to review — and the day is always rated out of 10.",
          "The dashboard shows today's habit score, today's task completion ratio, today's calendar, and focus time with completed Pomodoro sessions — all on one screen.",
        ],
      },
      {
        heading: "Analytics that answer real questions",
        body: [
          "The analytics page covers total points, average daily score, completion percentage, current and longest streaks, best day, best week and best month. Filter by 7 days, 30 days, 3 months, 6 months, 1 year or all time.",
          "Charts include daily score over time, weekly and monthly score totals, a 52-week heatmap, a habit-by-habit consistency ranking, and a first-half versus second-half trend comparison that tells you whether you're improving or coasting.",
        ],
        bullets: [
          "Total points and average daily score",
          "Best day, best week and best month",
          "Habit comparison ranked by consistency",
          "52-week heatmap of every tracked day",
          "Focus time totals per day, week and range",
        ],
      },
      {
        heading: "Task management without the ceremony",
        body: [
          "Tasks have a title, notes, priority, deadline, category, status and an optional link to a habit. Statuses move from To do to In progress to Completed. Filter by today, upcoming, overdue, all open or completed, and search by text.",
          "Linking a task to a habit is what makes the system cohere: 'Finish chapter 4' links to Study, so the work you did and the habit you maintained stop being two separate records.",
        ],
        table: {
          columns: ["Metric", "What it tells you", "Where it lives"],
          rows: [
            ["Daily rating", "How good today was, out of 10", "Dashboard"],
            ["Average rating", "What a normal day looks like, out of 10", "Progress"],
            ["Completion percentage", "How much scheduled capacity you used", "Analytics"],
            ["Current streak", "Consecutive days with at least one point", "Dashboard & analytics"],
            ["Focus time", "Minutes of protected attention", "Timer & analytics"],
          ],
        },
      },
      {
        heading: "Built to be fast",
        body: [
          "Optimistic updates mean clicking a habit cell never waits for the network — the score, streak and charts recompute locally and sync in the background. Charts are rendered as inline SVG rather than a heavyweight charting bundle, which keeps the page light and interactions smooth on mobile.",
          "There are no animated dashboards to wait for. The information is already there when the page paints.",
        ],
      },
    ],
    faq: [
      {
        q: "Does the productivity tracker include task management?",
        a: "Yes. Tasks have priorities, deadlines, categories, notes, statuses and optional habit links, with filters for today, upcoming, overdue and completed.",
      },
      {
        q: "Can I track focus time?",
        a: "Yes. The built-in Pomodoro timer logs completed focus sessions, and you can attach each session to a habit or task. Focus totals appear on the dashboard, timer and analytics pages.",
      },
      {
        q: "How far back does the analytics data go?",
        a: "Analytics are computed from your full history. The default window loads 18 months of completions; the heatmap shows the last 52 weeks and the monthly chart covers 12 months.",
      },
      {
        q: "Can I use it just for habits and ignore tasks?",
        a: "Absolutely. Every module is independent — the habit scorecard works fine on its own.",
      },
    ],
    related: [
      { href: "/habit-tracker", label: "Habit tracker", text: "The ten-habit scorecard" },
      { href: "/pomodoro-timer", label: "Pomodoro timer", text: "Log focus sessions per habit" },
      { href: "/habit-tracker-template", label: "Habit tracker template", text: "Start from a proven structure" },
    ],
  },
  {
    slug: "pomodoro-timer",
    title: "Pomodoro timer",
    metaTitle: "Pomodoro Timer — Free Focus Timer with Habit & Task Tracking",
    metaDescription:
      "A free customisable Pomodoro timer with focus, short break and long break modes. Log sessions, track total focus time and attach blocks to habits or tasks.",
    h1: "Pomodoro timer that logs your focus time",
    eyebrow: "Pomodoro timer",
    intro:
      "A timer is only useful if the result is recorded. This Pomodoro timer defaults to 25 minutes of focus, a 5-minute short break and a 15-minute long break, and writes every completed session into your history — with an optional link to the habit or task you were working on.",
    features: CORE_FEATURES,
    sections: [
      {
        heading: "The default cycle",
        body: [
          "A focus session runs 25 minutes. When it ends, a short break of 5 minutes starts. After four focus sessions the timer automatically switches to a long break of 15 minutes, then returns to focus. This is the classic Pomodoro cycle and it works well as a starting point.",
          "Every duration is editable. Prefer 50/10 blocks? Set focus to 50 and short break to 10. Prefer 90-minute deep work sessions with 20-minute walks? Set focus to 90 and long break to 20. Sessions before a long break can be set between 2 and 8.",
        ],
        table: {
          columns: ["Mode", "Default", "Range", "Purpose"],
          rows: [
            ["Focus", "25 min", "1–180 min", "One uninterrupted block of work"],
            ["Short break", "5 min", "1–60 min", "Reset between focus sessions"],
            ["Long break", "15 min", "1–90 min", "Recovery after a set of sessions"],
            ["Sessions per set", "4", "2–8", "How often a long break triggers"],
          ],
        },
      },
      {
        heading: "Connecting a session to real work",
        body: [
          "Before starting a session, pick a habit or an open task from the two selectors under the dial. The session is then logged against that target, so your analytics can show that 62% of your focus time went to Study and 20% went to Coding.",
          "This is the difference between a timer and a productivity tracker. Knowing you focused for two hours is mildly interesting; knowing which habit those two hours served is actionable.",
        ],
      },
      {
        heading: "Start, pause, reset, skip",
        body: [
          "The four controls are deliberately simple. Start and pause toggle the current block. Reset returns the current block to its full duration without logging anything. Skip ends the block immediately — a skipped focus session is not counted as completed, so your focus totals stay honest.",
          "Today's focus time and session count update as soon as a session completes, and a seven-day bar chart shows minutes focused per day.",
        ],
        bullets: [
          "Large tabular-numeral readout that's readable from across a desk",
          "Circular progress ring around the dial",
          "Today's focus time and completed session count",
          "Seven-day focus minutes chart",
          "Recent session history with habit attribution",
        ],
      },
      {
        heading: "Why short blocks work",
        body: [
          "A 25-minute block is short enough that starting is easy and long enough to reach useful concentration. The fixed end point gives you permission to ignore everything else, because the commitment has a known size.",
          "The breaks matter as much as the focus. Stepping away — rather than switching to another tab — is what makes the fourth session as productive as the first. The timer's break hints are deliberately physical: stand up, stretch, look away.",
        ],
      },
    ],
    faq: [
      {
        q: "What are the default Pomodoro durations?",
        a: "25 minutes of focus, a 5-minute short break, a 15-minute long break, and a long break after four focus sessions. All four values are customisable.",
      },
      {
        q: "Do skipped sessions count towards my focus time?",
        a: "No. Only completed focus sessions are logged, so your focus totals reflect time you actually sustained.",
      },
      {
        q: "Can I attach a focus session to a habit?",
        a: "Yes. Choose a habit or an open task before starting, and the session is attributed to it in your history.",
      },
      {
        q: "Does the timer keep running if I close the tab?",
        a: "The timer runs while the page is open. Completed sessions are saved the moment they finish.",
      },
    ],
    related: [
      { href: "/productivity-tracker", label: "Productivity tracker", text: "Where focus time appears in analytics" },
      { href: "/daily-planner", label: "Daily planner", text: "Plan the blocks before you run them" },
      { href: "/habit-tracker", label: "Habit tracker", text: "Attach focus to a daily habit" },
    ],
  },
  {
    slug: "daily-planner",
    title: "Daily planner",
    metaTitle: "Daily Planner — Plan Tasks, Habits & Events Together",
    metaDescription:
      "A daily planner that combines your habit score, tasks, calendar events and focus blocks so you can plan and review the whole day on one screen.",
    h1: "Daily planner for habits, tasks and events",
    eyebrow: "Daily planner",
    intro:
      "A daily planner usually means a second place to write down what you already wrote somewhere else. Here the plan and the record live together: what you intended to do, what you actually completed, and how the day scored — all on one page.",
    features: CORE_FEATURES,
    sections: [
      {
        heading: "Plan the day in three lists",
        body: [
          "The dashboard's plan section shows today's tasks with status and priority, today's calendar events in time order, and a 'missing today' strip listing the habits still unchecked. Overdue tasks are flagged so they surface before today's work.",
          "This layout means the next action is always visible without opening a second app or scrolling through a week.",
        ],
      },
      {
        heading: "The calendar does the scheduling",
        body: [
          "Switch between month, week and day views. Each day cell shows its score, a progress bar, open tasks and events, colour-coded so tasks, habits and events are visually distinct. Click a day to open its panel and add a task or event directly.",
          "Tasks are draggable — pick one up and drop it on another day to reschedule it. That one interaction handles most of what replanning actually involves.",
        ],
        table: {
          columns: ["Item", "Colour signal", "Where it's created"],
          rows: [
            ["Task", "Primary accent bar", "Tasks page or calendar day panel"],
            ["Habit completion", "Habit's own accent colour", "Habit grid or day panel"],
            ["Event", "Colour by type", "Calendar day panel"],
            ["Focus block", "Purple accent", "Timer page"],
          ],
        },
      },
      {
        heading: "Statuses that match how work moves",
        body: [
          "Tasks move from To do to In progress to Completed. The status can be advanced with one click from the task row, so keeping the board accurate doesn't become its own task.",
          "Priorities are low, medium and high, with a visible colour dot. Categories — work, personal, health, learning, home, finance — keep the list scannable when it gets long.",
        ],
        bullets: [
          "Filters for today, upcoming, overdue, all open and completed",
          "Priority and text search filters",
          "Deadline-aware highlighting for overdue work",
          "Task-to-habit links so related work is connected",
          "Full create, edit, delete and status cycling",
        ],
      },
      {
        heading: "End-of-day review",
        body: [
          "Because habits, tasks, events and focus time are all recorded, the day's review is a read rather than a reconstruction. Open the dashboard, look at the ring, look at the missing strip, check the task ratio, then close it.",
          "Over a week that becomes a habit in itself — and the weekly totals chart on the analytics page shows whether the planning is actually working.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I create tasks for future dates?",
        a: "Yes. Set any deadline date on a task, or open a calendar day and add the task directly to that date.",
      },
      {
        q: "Can I reschedule by dragging?",
        a: "Yes. In month or week view, drag a task onto another day and the deadline updates immediately.",
      },
      {
        q: "Does the planner include time-based events?",
        a: "Yes. Events have a title, type, start time, end time and notes, and appear in the calendar and on the dashboard for today.",
      },
      {
        q: "How do habits appear in the planner?",
        a: "Each calendar day shows the habits scheduled for that weekday, with checkboxes to complete them and a running daily score.",
      },
    ],
    related: [
      { href: "/habit-calendar", label: "Habit calendar", text: "Month, week and day views" },
      { href: "/daily-habit-tracker", label: "Daily habit tracker", text: "Score the day in points" },
      { href: "/pomodoro-timer", label: "Pomodoro timer", text: "Fill the planned blocks with focus" },
    ],
  },
  {
    slug: "habit-calendar",
    title: "Habit calendar",
    metaTitle: "Habit Calendar — Track Habits on a Month, Week & Day Calendar",
    metaDescription:
      "View habits, tasks, events and daily scores on a month, week or day calendar. Click a date to see completions, scheduled habits, events and focus time.",
    h1: "Habit calendar with month, week and day views",
    eyebrow: "Habit calendar",
    intro:
      "A habit calendar answers a question a list can't: where did this actually break? Seeing your completions laid out on a month grid makes the gaps obvious — the skipped Sunday runs, the mid-week dip, the week that vanished.",
    features: CORE_FEATURES,
    sections: [
      {
        heading: "Three views, one dataset",
        body: [
          "Month view gives the shape of a whole month, with each cell showing its daily score, a progress bar, open tasks and events. Week view tightens to seven days. Day view becomes an agenda with scheduled habits, tasks and events in order.",
          "All three views read from the same underlying records, so nothing needs to be re-entered when you change resolution.",
        ],
        bullets: [
          "Month grid with per-day score and progress bar",
          "Week view for close-up planning",
          "Day agenda with habits, tasks and events",
          "Colour-coded task, event and focus indicators",
          "Drag-and-drop task rescheduling",
        ],
      },
      {
        heading: "Click a day to see everything",
        body: [
          "Selecting a date opens a panel with that day's score and percentage, focus time and session count, every scheduled habit with a toggle, all events in time order, and the task list with completion status.",
          "This is where the habit calendar earns its name: you can complete a habit from the calendar, two weeks in the past or a week ahead, without leaving the page.",
        ],
        table: {
          columns: ["Day", "Score", "Habits", "Events", "Focus"],
          rows: [
            ["Mon 3 Mar", "8/10", "8 completed", "Standup, Gym", "1h 45m"],
            ["Tue 4 Mar", "6/10", "6 completed", "Standup", "0h 50m"],
            ["Wed 5 Mar", "10/10", "10 completed", "—", "2h 10m"],
            ["Thu 6 Mar", "4/10", "4 completed", "Dentist", "0h 25m"],
          ],
        },
      },
      {
        heading: "Heatmaps for the long view",
        body: [
          "Beyond the calendar, every habit has its own analytics page with a yearly heatmap: one square per day, shaded by whether the habit was completed. Squint at a year of squares and you can see the texture of your consistency.",
          "The workspace-level heatmap shades by daily score instead, so a 4/10 day is visibly lighter than a 10/10 day. Both run across the last 52 weeks.",
        ],
      },
      {
        heading: "Distinguishing tasks, habits and events",
        body: [
          "Tasks use the primary accent and carry a priority dot. Events are colour-coded by type — work, personal, focus, health. Habit completion uses the habit's own accent colour, so a green Exercise square and a blue Reading square are distinguishable at a glance.",
          "This matters on a dense day. A calendar that renders everything identically is a calendar you have to read rather than scan.",
        ],
      },
    ],
    faq: [
      {
        q: "Can I complete habits from the calendar?",
        a: "Yes. Select any date and toggle each scheduled habit directly from the day panel, including past and future dates.",
      },
      {
        q: "Does the calendar show tasks and events as well as habits?",
        a: "Yes. Each day shows open tasks, events and a daily score, with events colour-coded by type.",
      },
      {
        q: "Can I create a task from the calendar?",
        a: "Yes. Open a day's panel and use the '+ Task' button to add a task already assigned to that date.",
      },
      {
        q: "What is the difference between the calendar and the heatmap?",
        a: "The calendar is for planning and per-day detail. The heatmap is for the long view — 52 weeks of completions at a glance, per habit or for your overall daily score.",
      },
    ],
    related: [
      { href: "/daily-planner", label: "Daily planner", text: "Plan the day around your habits" },
      { href: "/habit-tracker", label: "Habit tracker", text: "The weekly completion grid" },
      { href: "/habit-tracker-template", label: "Habit tracker template", text: "A structure you can copy" },
    ],
  },
  {
    slug: "habit-tracker-template",
    title: "Habit tracker template",
    metaTitle: "Habit Tracker Template — A Free Daily Scorecard Rated Out of 10",
    metaDescription:
      "A free daily rating template: positive and negative habits with weights and repetition targets, a Mon–Sun grid, and a rating always out of 10. Use it as loaded or reshape it entirely.",
    h1: "Habit tracker template you can actually keep",
    eyebrow: "Habit tracker template",
    intro:
      "Templates usually fail because they're either so generic they mean nothing or so specific they don't fit your life. This one fixes the structure — positive and negative habit rows, weights that total 10, repetition targets, seven day columns — and leaves every value editable. Build it as your own daily scorecard.",
    features: CORE_FEATURES,
    sections: [
      {
        heading: "The template",
        body: [
          "The template is a starting arrangement you can keep or reshape entirely: positive and negative habit rows, weights that total 10, repetition targets and seven day columns. Add your own habits to match your own priorities.",
          "Nothing here is fixed. Rename any row, swap the icon, change the colour, rewrite the description, restrict it to certain weekdays, or delete it and add your own.",
        ],
        table: {
          columns: ["Habit", "Type", "Weight", "Target / day", "Max effect"],
          rows: [
            ["Exercise", "Positive", "+2", "3 sessions", "+2"],
            ["Prayer", "Positive", "+2", "5 prayers", "+2"],
            ["Study", "Positive", "+2", "1 block", "+2"],
            ["Reading", "Positive", "+1", "1 session", "+1"],
            ["Meditation", "Positive", "+1", "1 session", "+1"],
            ["Sleep", "Positive", "+2", "1 night", "+2"],
            ["Phone overuse", "Negative", "−0.5 each", "unlimited", "−0.5 per occurrence"],
          ],
        },
      },
      {
        heading: "How to fill it in",
        body: [
          "Start with fewer habits than you think you can handle. Six or seven is a realistic opening set; the remaining slots can be filled later once the first set is stable. Deleting rows is free and adding them back takes seconds.",
          "Write thresholds that are unambiguous. 'Read' is a judgement call; 'read 10 pages' is a fact. A habit tracker only works when you're honest about whether today counted, and honest requires specific.",
        ],
        bullets: [
          "Define a binary threshold for every habit",
          "Keep six or seven rows to start",
          "Set weekday frequency for habits that aren't daily",
          "Pick distinct accent colours so rows scan quickly",
          "Review the weekly score column every Sunday",
        ],
      },
      {
        heading: "Weekly review routine",
        body: [
          "Once a week, open the habit grid and read the Score column. Anything above 70% is working. Anything below 40% needs a decision: shrink the threshold, move it to fewer weekdays, or accept it isn't a priority right now and pause it.",
          "Then look at the daily score footer. If one weekday is consistently weak, that's usually a schedule problem rather than a willpower problem, and it's better fixed by changing the plan than by trying harder.",
        ],
      },
      {
        heading: "What the template generates",
        body: [
          "Because the template feeds the same engine as everything else, you immediately get current and longest streaks, completion percentage, total completions, lifetime points, best month, a 52-week heatmap, weekly and monthly charts, and a per-habit analytics page.",
          "You get the analysis a paper template can't give you, with the same amount of effort as ticking a box.",
        ],
      },
    ],
    faq: [
      {
        q: "Is the template free?",
        a: "Yes. There is nothing to pay — create an account and the starter set of seven habits loads automatically the first time you open the dashboard.",
      },
      {
        q: "Can I change the habits in the template?",
        a: "Every row is editable — name, icon, colour, description, weekday frequency and order. You can also delete rows and add your own up to a maximum of ten.",
      },
      {
        q: "Can I track more than seven habits?",
        a: "Yes — there is no product limit on how many habits you track. The template starts with seven because the weights total 10, but you can delete them all and track three, or add twenty more and rebalance the weights.",
      },
      {
        q: "Can I use the template on paper?",
        a: "You can copy the table structure above into any notebook. The digital version adds streak maths, heatmaps and analytics you'd otherwise do by hand.",
      },
    ],
    related: [
      { href: "/habit-tracker", label: "Habit tracker", text: "How the scorecard works" },
      { href: "/habit-calendar", label: "Habit calendar", text: "See the template on a calendar" },
      { href: "/daily-habit-tracker", label: "Daily habit tracker", text: "Daily scoring explained" },
    ],
  },
];

export function getSeoPage(slug: string): SeoPageContent | undefined {
  return SEO_PAGES.find((p) => p.slug === slug);
}
