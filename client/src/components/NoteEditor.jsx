// src/components/NoteEditor.jsx
// FULL FILE — replace everything currently in this file with this.

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import './NoteEditor.css';
import { createNoteExtensions } from './editor/noteExtensions.js';

const TEXT_COLORS = ['#0E1128', '#5443D6', '#0E8A5E', '#D63B48', '#C77A0B', '#007A76'];

function NoteEditor({ content, onChange }) {
  const editor = useEditor({
    extensions: createNoteExtensions('Start writing…'),
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange({
        json: editor.getJSON(),
        text: editor.getText(),
      });
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="note-editor">
      <div className="note-toolbar">
        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('bold') ? 'toolbar-btn-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>

        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('italic') ? 'toolbar-btn-active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          style={{ fontStyle: 'italic' }}
        >
          I
        </button>

        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'toolbar-btn-active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>

        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('bulletList') ? 'toolbar-btn-active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>

        <button
          type="button"
          className={`toolbar-btn ${editor.isActive('orderedList') ? 'toolbar-btn-active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>

        <span className="toolbar-divider" />

        {TEXT_COLORS.map((colorValue) => (
          <button
            key={colorValue}
            type="button"
            className="toolbar-color"
            style={{ background: colorValue }}
            onClick={() => editor.chain().focus().setColor(colorValue).run()}
          />
        ))}
      </div>

      <EditorContent editor={editor} className="note-editor-content" />
    </div>
  );
}

export default NoteEditor;