// Run once from your client folder:   node restyle.mjs
// Restyles the UI to a Modern SaaS Minimalist palette (Crisp Slate, Pure White, Deep Charcoal text, Vibrant Indigo primary), no gradients or glow,
// and swaps every sparkle icon for a plain one. Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');
if (!fs.existsSync(SRC)) { console.error('Run this from the client folder (the one that contains src).'); process.exit(1); }

const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(SRC, rel), text);
const exists = (rel) => fs.existsSync(path.join(SRC, rel));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const allFiles = () => walk(SRC).filter((f) => /\.(css|jsx)$/.test(f)).map((f) => path.relative(SRC, f));

let warnings = 0;
const warn = (msg) => { warnings += 1; console.warn('  ! ' + msg); };

const edit = (rel, pairs) => {
  if (!exists(rel)) return warn(`${rel} not found, skipped`);
  let t = read(rel);
  for (const [re, to] of pairs) {
    if (!re.test(t)) { if (!t.includes(typeof to === 'string' ? to : '\u0000')) warn(`${rel}: pattern not found ${String(re).slice(0, 60)}`); continue; }
    t = t.replace(re, to);
  }
  write(rel, t);
};

// ---------- 1. Design tokens ----------
{
  const rel = 'styles/global.css';
  let s = read(rel);
  const start = s.indexOf(':root {');
  const end = s.indexOf('/* ---------- Reset');
  if (start < 0 || end < 0) { warn('global.css: could not find the token block'); }
  else {
    const tokens = `:root {
  /* Palette: Modern SaaS Minimalist (Crisp Slate #F8FAFC, Pure White #FFFFFF, Deep Charcoal #0F172A, Vibrant Indigo #2563EB). No gradients, no glow. */
  --bg-base: #F8FAFC;
  --surface: #FFFFFF;
  --surface-raised: #F1F5F9;
  --surface-card: #FFFFFF;
  --surface-subtle: #F8FAFC;
  --ink: #0F172A;
  --ink-muted: #475569;
  --border: #CBD5E1;
  --border-subtle: #E2E8F0;

  --signal: #2563EB;        /* Vibrant Indigo: primary */
  --signal-hover: #1D4ED8;  /* Darker Indigo */
  --highlight: #7C3AED;     /* Violet secondary accent */
  --alert: #DC2626;         /* Rich red */

  --amber: #DC2626;
  --clay: #DC2626;
  --success: #16A34A;
  --warm: #D97706;

  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-stat: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5625rem;
  --text-2xl: 2rem;
  --text-3xl: 2.5rem;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 9999px;

  --shadow-card: 0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-card-hover: 0 10px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.1);

  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;

  --glass-bg: #FFFFFF;
  --glass-blur: 0px;
  --glass-border: #CBD5E1;
}

[data-theme="dark"] {
  --bg-base: #090D16;
  --surface: #111827;
  --surface-raised: #1F2937;
  --surface-card: #111827;
  --surface-subtle: #0F172A;
  --ink: #F8FAFC;
  --ink-muted: #94A3B8;
  --border: #334155;
  --border-subtle: #1E293B;

  --signal: #3B82F6;
  --signal-hover: #60A5FA;
  --highlight: #A78BFA;
  --alert: #EF4444;
  --success: #22C55E;

  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.5);
  --shadow-card-hover: 0 10px 25px -5px rgba(0, 0, 0, 0.6);

  --glass-bg: #111827;
  --glass-border: #334155;
}

`;
    s = s.slice(0, start) + tokens + s.slice(end);
    s = s.replace(/(\.btn \{[^}]*?)border-radius: var\(--radius-pill\);/s, '$1border-radius: var(--radius-sm);');
    s = s.replace('.card:hover {\n  box-shadow: var(--shadow-card-hover);\n  transform: translateY(-2px);\n}', '.card:hover {\n  box-shadow: var(--shadow-card-hover);\n}');
    write(rel, s);
  }
}

// ---------- 2. Old color literals -> new palette ----------
const HEX = [[/#6366f1/gi, '#2563EB'], [/#6c5ce7/gi, '#2563EB'], [/#8b5cf6/gi, '#7C3AED'], [/#4f46e5/gi, '#1D4ED8']];
for (const rel of allFiles()) {
  let t = read(rel); const o = t;
  for (const [a, b] of HEX) t = t.replace(a, b);
  if (t !== o) write(rel, t);
}

// ---------- 3. Gradients -> solid ----------
for (const rel of allFiles().filter((f) => f.endsWith('.css'))) {
  const t = read(rel); const n = t.replace(/linear-gradient\([^)]+\)/g, 'var(--signal)');
  if (n !== t) write(rel, n);
}

// ---------- 4. Wrapped + chart colours ----------
edit('components/wrapped/StoryPlayer.jsx', [[/const THEMES = \[.*?\n\];/s, `const THEMES = [
  { bg: '#090D16', orbs: [] },
  { bg: '#111827', orbs: [] },
  { bg: '#1F2937', orbs: [] },
  { bg: '#111827', orbs: [] },
  { bg: '#090D16', orbs: [] },
  { bg: '#111827', orbs: [] },
  { bg: '#1F2937', orbs: [] },
  { bg: '#090D16', orbs: [] },
];`]]);

// ---------- 5. Sparkles -> plain icons ----------
const ICONS = {
  'components/GoalSubjectsModal.jsx': ['ListChecks', 'ListChecks'],
  'components/prephub/TopicPanel.jsx': ['MessageSquareText', 'MessageSquareText'],
  'components/SyllabusPreviewModal.jsx': ['ListTree', 'ListTree'],
  'components/AIDrawerToggle.jsx': ['MessageSquareText', 'MessageSquareText'],
  'components/GoalRoadmapWizard.jsx': ['Route', 'Route'],
  'components/files/AttachFilePopover.jsx': ['MessageSquareText', 'MessageSquareText'],
  'components/files/FileCard.jsx': ['FileCheck2', 'MessageSquareText'],
  'components/files/FileViewer.jsx': ['MessageSquareText', 'MessageSquareText'],
  'components/files/FileAttachments.jsx': ['FileCheck2'],
  'components/RoadmapTree.jsx': ['Route', 'Route'],
  'components/AIDrawer.jsx': ['Bot', 'Bot', 'Bot', 'Bot', 'Bot', 'Bot'],
  'components/wrapped/slides.jsx': ['Award', 'Flag', 'Lightbulb', 'BarChart3'],
  'layouts/AppShell.jsx': ['Award', 'Award'],
  'pages/Research.jsx': ['Lightbulb'],
  'pages/Wrapped.jsx': ['Award', 'Award', 'Award'],
  'pages/GoalDetail.jsx': ['ListChecks', 'ListChecks'],
};

for (const [rel, names] of Object.entries(ICONS)) {
  if (!exists(rel)) continue;
  let t = read(rel); let i = 0;
  t = t.replace(/\bSparkles\b/g, () => names[Math.min(i++, names.length - 1)]);
  write(rel, t);
}

// ---------- 6. Chat button auth check ----------
{
  const rel = 'components/AIDrawerToggle.jsx';
  if (exists(rel)) {
    let t = read(rel);
    if (!t.includes('useAuth')) {
      t = t.replace("import { useAIDrawer } from '../context/AIDrawerContext.jsx';\n", "import { useAIDrawer } from '../context/AIDrawerContext.jsx';\nimport { useAuth } from '../context/AuthContext.jsx';\n");
      t = t.replace(/  const \{ isOpen, toggleDrawer \} = useAIDrawer\(\);\n\n  if \(isOpen\) return null;/, "  const { isOpen, toggleDrawer } = useAIDrawer();\n  const { user } = useAuth();\n  if (isOpen || !user) return null;");
      write(rel, t);
    }
  }
}

console.log(warnings ? `Done with ${warnings} warning(s) above.` : 'Done. No warnings.');