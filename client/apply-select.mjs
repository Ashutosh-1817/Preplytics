// Run once from your client folder:   node apply-select.mjs
// Swaps every native <select> for the new <Select> component. Safe to run twice.
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(process.cwd(), 'src');
if (!fs.existsSync(path.join(SRC, 'components/Select.jsx'))) { console.error('Create src/components/Select.jsx first, and run this from the client folder.'); process.exit(1); }

let warnings = 0;
const edit = (rel, subs, imp) => {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) { warnings += 1; console.warn(`  ! ${rel} not found`); return; }
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes('<select')) { console.log(`  = ${rel} already done`); return; }
  for (const [a, b] of subs) {
    if (!t.includes(a)) { warnings += 1; console.warn(`  ! ${rel}: could not find ${a}`); continue; }
    t = t.replace(a, b);
  }
  t = t.replaceAll('</select>', '</Select>');
  if (t.includes('<select')) { warnings += 1; console.warn(`  ! ${rel}: a <select> is still left`); }
  const lines = t.split('\n');
  let last = 0; lines.forEach((l, i) => { if (l.startsWith('import ')) last = i; });
  lines.splice(last + 1, 0, imp);
  fs.writeFileSync(p, lines.join('\n'));
  console.log(`  ok ${rel}`);
};

edit('components/DurationPicker.jsx', [['<select className="duration-select" value={hours}', '<Select variant="inline" value={hours}'], ['<select className="duration-select" value={minutes}', '<Select variant="inline" value={minutes}']], "import Select from './Select.jsx';");
edit('components/files/FileUploader.jsx', [['<select value={linkGoalId}', '<Select variant="link" aria-label="Link to a goal" value={linkGoalId}']], "import Select from '../Select.jsx';");
edit('components/roadmap/RoadmapPlanParts.jsx', [['<select className="rp-select" aria-label={ariaLabel}', '<Select variant="compact" aria-label={ariaLabel}'], ['<select className="rp-select" aria-label="Kind of study"', '<Select variant="compact" aria-label="Kind of study"'], ['<select className="rp-select" aria-label="Priority"', '<Select variant="compact" aria-label="Priority"']], "import Select from '../Select.jsx';");
edit('pages/Research.jsx', [['<select className="research-select" value={form.timeRange}', '<Select value={form.timeRange}'], ['<select className="research-select" value={form.goalId}', '<Select value={form.goalId}']], "import Select from '../components/Select.jsx';");
// Analytics has its own wrapper and chevron around the select, so the whole block is replaced.
{
  const p = path.join(SRC, 'pages/Analytics.jsx');
  let t = fs.readFileSync(p, 'utf8');
  const re = /<label className="ax-select-wrap">[\s\S]*?<\/label>/;
  if (t.includes('<select') && re.test(t)) {
    t = t.replace(re, `<Select className="ui-select--wide" aria-label="Goal" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="all">All goals</option>
              {goals.map((g) => (
                <option key={g._id} value={g._id}>{g.title}</option>
              ))}
            </Select>`);
    if ((t.match(/ChevronDown/g) || []).length === 1) t = t.replace(/,\s*ChevronDown\b|\bChevronDown\s*,\s*/, (m) => (m.startsWith(',') ? '' : ''));
    const lines = t.split('\n'); let last = 0; lines.forEach((l, i) => { if (l.startsWith('import ')) last = i; });
    lines.splice(last + 1, 0, "import Select from '../components/Select.jsx';");
    fs.writeFileSync(p, lines.join('\n')); console.log('  ok pages/Analytics.jsx');
  } else if (!t.includes('<select')) console.log('  = pages/Analytics.jsx already done');
  else { warnings += 1; console.warn('  ! pages/Analytics.jsx: select block not found'); }
}
edit('pages/Wrapped.jsx', [['<select className="wr-select"', '<Select className="ui-select--wide"']], "import Select from '../components/Select.jsx';");
edit('pages/Calendar.jsx', [['<select className="auth-input goal-select" value', '<Select className="ui-select--wide" aria-label="Goal" value']], "import Select from '../components/Select.jsx';");
edit('pages/Files.jsx', [['<select className="files-select"', '<Select className="ui-select--sort"']], "import Select from '../components/Select.jsx';");

console.log(warnings ? `Done with ${warnings} warning(s) above.` : 'Done. No warnings.');