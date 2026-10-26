import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';

// ONE list of extensions for EVERY note editor in the app. A note saved with
// checklists or highlights would silently lose them if another editor opened
// and re-saved it without knowing those node types.
export const createNoteExtensions = (placeholder = 'Start writing…') => [
  StarterKit, // includes headings, lists, quotes, code, links, underline, undo/redo
  TextStyle,
  Color,
  Placeholder.configure({ placeholder }),
  Highlight.configure({ multicolor: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
    TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }), // tables from PrepBot answers
  TableRow,
  TableHeader,
  TableCell,
];
