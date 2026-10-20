import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import {
  Undo2, Redo2, Heading1, Heading2, Heading3, Bold, Italic, Underline, Strikethrough, Highlighter,
  List, ListOrdered, ListChecks, Quote, Code, Braces, Minus, Link2, Eraser,
} from 'lucide-react';
import { createNoteExtensions } from '../editor/noteExtensions.js';

const TEXT_COLORS = ['#6C5CE7', '#00CEC9', '#FF7675', '#F59E0B', '#10B981'];
const HIGHLIGHTS = ['#FDE68A', '#A7F3D0', '#FBCFE8'];

// onMouseDown preventDefault keeps the text selection while clicking a button
function Tb({ title, onClick, active = false, disabled = false, children }) {
  return (
    <button
      type="button"
      className={`ph-tb ${active ? 'ph-tb-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="ph-tb-sep" aria-hidden="true" />;

function PrepNoteEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: createNoteExtensions('Write your notes here…'),
    content: content || '',
    editorProps: { attributes: { class: 'ph-prose', spellcheck: 'true' } },
    onUpdate: ({ editor: ed }) => onChange({ json: ed.getJSON(), text: ed.getText() }),
  });

  // TipTap 3 doesn't re-render on every transaction, so read the active formats explicitly
  const s = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive('bold'),
            italic: ed.isActive('italic'),
            underline: ed.isActive('underline'),
            strike: ed.isActive('strike'),
            highlight: ed.isActive('highlight'),
            code: ed.isActive('code'),
            h1: ed.isActive('heading', { level: 1 }),
            h2: ed.isActive('heading', { level: 2 }),
            h3: ed.isActive('heading', { level: 3 }),
            bullet: ed.isActive('bulletList'),
            ordered: ed.isActive('orderedList'),
            task: ed.isActive('taskList'),
            quote: ed.isActive('blockquote'),
            codeBlock: ed.isActive('codeBlock'),
            link: ed.isActive('link'),
            canUndo: ed.can().undo(),
            canRedo: ed.can().redo(),
          }
        : null,
  });

  if (!editor || !s) return null;

  const chain = () => editor.chain().focus();

  const handleLink = () => {
    const previous = editor.getAttributes('link').href || '';
    const input = window.prompt('Link address (leave empty to remove the link)', previous || 'https://');
    if (input === null) return;

    const url = input.trim();
    if (!url) {
      chain().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    chain().extendMarkRange('link').setLink({ href }).run();
  };

  return (
    <div className="ph-editor">
      <div className="ph-toolbar" role="toolbar" aria-label="Formatting">
        <Tb title="Undo" onClick={() => chain().undo().run()} disabled={!s.canUndo}><Undo2 size={15} /></Tb>
        <Tb title="Redo" onClick={() => chain().redo().run()} disabled={!s.canRedo}><Redo2 size={15} /></Tb>
        <Sep />
        <Tb title="Heading 1" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></Tb>
        <Tb title="Heading 2" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></Tb>
        <Tb title="Heading 3" active={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></Tb>
        <Sep />
        <Tb title="Bold" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold size={15} /></Tb>
        <Tb title="Italic" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic size={15} /></Tb>
        <Tb title="Underline" active={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline size={15} /></Tb>
        <Tb title="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough size={15} /></Tb>
        <Tb title="Inline code" active={s.code} onClick={() => chain().toggleCode().run()}><Code size={15} /></Tb>
        <Sep />
        <Highlighter size={14} className="ph-tb-label" aria-hidden="true" />
        {HIGHLIGHTS.map((color) => (
          <button
            key={color}
            type="button"
            className="ph-swatch"
            style={{ background: color }}
            title="Highlight"
            aria-label={`Highlight ${color}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().toggleHighlight({ color }).run()}
          />
        ))}
        <Sep />
        {TEXT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className="ph-swatch ph-swatch-text"
            style={{ background: color }}
            title="Text colour"
            aria-label={`Text colour ${color}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => chain().setColor(color).run()}
          />
        ))}
        <Tb title="Clear text colour" onClick={() => chain().unsetColor().run()}><Eraser size={14} /></Tb>
        <Sep />
        <Tb title="Bullet list" active={s.bullet} onClick={() => chain().toggleBulletList().run()}><List size={16} /></Tb>
        <Tb title="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={16} /></Tb>
        <Tb title="Checklist" active={s.task} onClick={() => chain().toggleTaskList().run()}><ListChecks size={16} /></Tb>
        <Sep />
        <Tb title="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}><Quote size={15} /></Tb>
        <Tb title="Code block" active={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><Braces size={15} /></Tb>
        <Tb title="Divider" onClick={() => chain().setHorizontalRule().run()}><Minus size={15} /></Tb>
        <Tb title="Link" active={s.link} onClick={handleLink}><Link2 size={15} /></Tb>
      </div>

      <EditorContent editor={editor} className="ph-editor-body" />
    </div>
  );
}

export default PrepNoteEditor;