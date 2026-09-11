export type NavItem = { href: string; label: string; icon: string; hint: string };

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: "◱", hint: "Today at a glance" },
  { href: "/habits", label: "Habits", icon: "☰", hint: "Your 10 daily habits" },
  { href: "/tasks", label: "Tasks", icon: "✓", hint: "Plan and prioritise" },
  { href: "/calendar", label: "Calendar", icon: "▦", hint: "Month, week & day" },
  { href: "/timer", label: "Timer", icon: "◔", hint: "Pomodoro focus" },
  { href: "/stats", label: "Progress", icon: "◔", hint: "Analytics & trends" },
  { href: "/settings", label: "Settings", icon: "⚙", hint: "Themes & preferences" },
];
