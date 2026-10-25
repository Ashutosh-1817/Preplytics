
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');
if (!fs.existsSync(SRC)) { console.error('Run this from the client folder (the one that contains src).'); process.exit(1); }

let warnings = 0;
const edit = (rel, re, to) => {
  const file = path.join(SRC, rel);
  if (!fs.existsSync(file)) { warnings += 1; console.warn(`  ! ${rel} not found, skipped`); return; }
  const text = fs.readFileSync(file, 'utf8');
  if (!re.test(text)) { warnings += 1; console.warn(`  ! ${rel}: colour list not found (already changed?)`); return; }
  fs.writeFileSync(file, text.replace(re, to));
};

edit('components/CreateGoalModal.jsx', /const PRESET_COLORS = \[[^\]]*\];/, "const PRESET_COLORS = ['#5443D6', '#00B2AD', '#C77A0B', '#D63B48', '#0E8A5E', '#2F6FD6'];");
edit('components/NoteEditor.jsx', /const TEXT_COLORS = \[[^\]]*\];?/, "const TEXT_COLORS = ['#0E1128', '#5443D6', '#0E8A5E', '#D63B48', '#C77A0B', '#007A76'];");
edit('components/prephub/PrepNoteEditor.jsx', /const TEXT_COLORS = \[[^\]]*\];?/, "const TEXT_COLORS = ['#0E1128', '#5443D6', '#0E8A5E', '#D63B48', '#C77A0B', '#007A76'];");
edit('components/analytics/AnalyticsCharts.jsx', /const PALETTE = \[[^\]]*\];?/, "const PALETTE = ['#5443D6', '#00B2AD', '#C77A0B', '#D63B48', '#0E8A5E', '#2F6FD6'];");

console.log(warnings ? `Done with ${warnings} warning(s) above.` : 'Done. No warnings.');