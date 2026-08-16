/** Single source of truth for hub tool cards. Add new subprojects here. */
export const tools = [
  {
    slug: "class-timetable-v2",
    name: "Class Timetable",
    description: "Map sections to subjects and staff, then schedule",
    status: "live",
    href: "class-timetable-v2/",
    icon: "📅",
  },
  {
    slug: "lesson-plan-manager",
    name: "Teaching Lesson Plan Manager",
    description: "Plan semesters, teaching sessions, and syllabus coverage",
    status: "under-development",
    href: "lesson-plan-manager/",
    icon: "📚",
  },
  {
    slug: "wordhunt",
    name: "Classroom Word Hunt",
    description: "Run engaging word-search activities for your class",
    status: "live",
    href: "wordhunt/",
    icon: "🔎",
  },
  {
    slug: "word-builder",
    name: "Classroom Word Builder",
    description: "Project letter tiles and build vocabulary words together",
    status: "live",
    href: "word-builder/",
    icon: "🔤",
  },
  {
    slug: "more-tools",
    name: "More tools",
    description: "Additional utilities for teachers — on the way",
    status: "coming-soon",
    href: null,
    icon: "🔧",
  },
];

export const brand = {
  siteName: "Teacher's Toolkit",
  creatorName: "Phanindra",
  creatorTitle: "Educator & Developer",
  githubUrl: "https://github.com/asvnphanindra/teachersToolkit",
  tagline: "Simple tools for smarter planning",
  headline: "Plan with confidence",
  subtext: "Browser-based utilities that cut hours of manual timetable verification.",
  bio: [
    "I build practical, browser-based tools to reduce the administrative burden on teachers and academic planners.",
    "Teacher's Toolkit started from a simple goal: spend less time cross-checking schedules and more time supporting students.",
    "Each tool is designed to be free, straightforward, and respectful of your time — no installs, no unnecessary complexity.",
  ],
};
