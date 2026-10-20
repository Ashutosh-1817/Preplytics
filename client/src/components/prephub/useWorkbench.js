import { useCallback, useEffect, useState } from 'react';
import { readJson, writeJson } from './prephubStorage.js';

// Two "slots": the file being read and the note being written. Tabs are just
// the list of things opened. In split view both slots show side by side.
const EMPTY = { tabs: [], activeNote: null, activeFile: null, focus: 'note' };

const lastOf = (tabs, kind) => {
  for (let i = tabs.length - 1; i >= 0; i -= 1) if (tabs[i].kind === kind) return tabs[i].id;
  return null;
};

const fixFocus = (focus, activeNote, activeFile) => {
  if (focus === 'note' && !activeNote && activeFile) return 'file';
  if (focus === 'file' && !activeFile && activeNote) return 'note';
  return focus;
};

function useWorkbench(nodeId, notes, files) {
  const key = `prephub:tabs:${nodeId}`;

  const [state, setState] = useState(() => {
    const saved = readJson(key, null);
    return saved && Array.isArray(saved.tabs) ? { ...EMPTY, ...saved } : EMPTY;
  });

  useEffect(() => {
    writeJson(key, state);
  }, [key, state]);

  // Drop tabs whose note or file no longer exists (deleted here or elsewhere)
  useEffect(() => {
    if (!notes || !files) return;

    const noteIds = new Set(notes.map((n) => n._id));
    const fileIds = new Set(files.filter((f) => f.fileType !== 'document').map((f) => f._id));

    setState((prev) => {
      const tabs = prev.tabs.filter((t) => (t.kind === 'note' ? noteIds.has(t.id) : fileIds.has(t.id)));
      const activeNote = noteIds.has(prev.activeNote) ? prev.activeNote : lastOf(tabs, 'note');
      const activeFile = fileIds.has(prev.activeFile) ? prev.activeFile : lastOf(tabs, 'file');
      const focus = fixFocus(prev.focus, activeNote, activeFile);

      const unchanged =
        tabs.length === prev.tabs.length &&
        activeNote === prev.activeNote &&
        activeFile === prev.activeFile &&
        focus === prev.focus;

      return unchanged ? prev : { tabs, activeNote, activeFile, focus };
    });
  }, [notes, files]);

  const openItem = useCallback((kind, id) => {
    setState((prev) => ({
      tabs: prev.tabs.some((t) => t.kind === kind && t.id === id) ? prev.tabs : [...prev.tabs, { kind, id }],
      activeNote: kind === 'note' ? id : prev.activeNote,
      activeFile: kind === 'file' ? id : prev.activeFile,
      focus: kind,
    }));
  }, []);

  const closeTab = useCallback((kind, id) => {
    setState((prev) => {
      const tabs = prev.tabs.filter((t) => !(t.kind === kind && t.id === id));
      const activeNote = prev.activeNote === id && kind === 'note' ? lastOf(tabs, 'note') : prev.activeNote;
      const activeFile = prev.activeFile === id && kind === 'file' ? lastOf(tabs, 'file') : prev.activeFile;
      return { tabs, activeNote, activeFile, focus: fixFocus(prev.focus, activeNote, activeFile) };
    });
  }, []);

  return { ...state, openItem, closeTab };
}

export default useWorkbench;