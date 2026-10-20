const text = (t) => ({ type: 'text', text: t });
const h2 = (t) => ({ type: 'heading', attrs: { level: 2 }, content: [text(t)] });
const p = (t) => (t ? { type: 'paragraph', content: [text(t)] } : { type: 'paragraph' });
const bullets = (items) => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [p(i)] })),
});
const tasks = (items) => ({
  type: 'taskList',
  content: items.map((i) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(i)] })),
});
const doc = (...content) => ({ type: 'doc', content });

export const NOTE_TEMPLATES = [
  { id: 'blank', label: 'Blank note', title: 'Untitled note', doc: null, text: '' },
  {
    id: 'cornell',
    label: 'Cornell notes',
    title: 'Cornell notes',
    doc: doc(h2('Cues & questions'), p(''), h2('Notes'), p(''), h2('Summary'), p('')),
    text: 'Cues & questions\n\nNotes\n\nSummary',
  },
  {
    id: 'terms',
    label: 'Key terms',
    title: 'Key terms',
    doc: doc(h2('Key terms'), bullets(['Term: definition']), h2('Examples'), p('')),
    text: 'Key terms\nTerm: definition\nExamples',
  },
  {
    id: 'revision',
    label: 'Revision checklist',
    title: 'Revision checklist',
    doc: doc(
      h2('Revision checklist'),
      tasks(['Read the source material', 'Write my own summary', 'Test myself on the key points', 'Revisit what I got wrong'])
    ),
    text: 'Revision checklist\nRead the source material\nWrite my own summary\nTest myself on the key points\nRevisit what I got wrong',
  },
];