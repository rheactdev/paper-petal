import "@tanstack/react-start/server-only";
export const templates = [
  {
    id: "blank",
    name: "A fresh page",
    description: "A little space for anything.",
    tag: "BLANK CANVAS",
  },
  {
    id: "journal",
    name: "Little moments",
    description: "Make room for the everyday.",
    tag: "JOURNAL",
  },
  {
    id: "collage",
    name: "Collected memories",
    description: "Your favourite moments, together.",
    tag: "PHOTO COLLAGE",
  },
  {
    id: "planner",
    name: "A gentle week",
    description: "Plans with a little breathing room.",
    tag: "WEEKLY PLANNER",
  },
  {
    id: "calendar",
    name: "Monthly calendar · 1 page",
    description: "This month, with room for little notes.",
    tag: "BULLET JOURNAL",
  },
  {
    id: "calendar-spread",
    name: "Monthly calendar · 2 pages",
    description: "A roomy spread for this month’s plans.",
    tag: "BULLET JOURNAL",
  },
  {
    id: "calendar-weekly",
    name: "A little week · from your calendar",
    description: "Your plans, on a lovely A5 spread.",
    tag: "GOOGLE CALENDAR",
  },
] as const;
