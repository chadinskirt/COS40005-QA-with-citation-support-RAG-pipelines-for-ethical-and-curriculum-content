// Hash routes in sidebar order. `later` pages are designed in Figma v1.2 but built in a later version.
export const ROUTES = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'majors', label: 'Explore majors', icon: 'compass', later: true },
  { id: 'plan', label: 'Plan semester', icon: 'calendar' },
  { id: 'outlines', label: 'Unit outlines', icon: 'book', later: true },
  { id: 'ask', label: 'Ask the assistant', icon: 'message' },
];
// Links from v1.1 keep working.
export const ALIASES = { profile: 'plan' };
export const APP_TITLE = 'Academic Advising Portal';
