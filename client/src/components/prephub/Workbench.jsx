import { useEffect, useRef, useState } from 'react';
import { StickyNote, FileText, FileImage, X, Columns2, FilePlus, Upload } from 'lucide-react';
import NotePane from './NotePane.jsx';
import FilePane from './FilePane.jsx';

const SPLIT_MIN_WIDTH = 760;

function EmptyPane({ icon: Icon, title, text, children }) {
  return (
    <div className="ph-empty-pane">
      <Icon size={30} strokeWidth={1.5} />
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="ph-empty-actions">{children}</div>
    </div>
  );
}

function Workbench({ notes, files, wb, split, onToggleSplit, onPatchNote, onSavedNote, onDeleteNote, onCreateNote, onUpload }) {
  const rootRef = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const canSplit = width >= SPLIT_MIN_WIDTH;
  const splitting = split && canSplit;

  const note = notes.find((n) => n._id === wb.activeNote) || null;
  const file = files.find((f) => f._id === wb.activeFile) || null;

  const tabInfo = (tab) => {
    if (tab.kind === 'note') {
      const n = notes.find((x) => x._id === tab.id);
      return n ? { title: n.title || 'Untitled note', Icon: StickyNote } : null;
    }
    const f = files.find((x) => x._id === tab.id);
    return f ? { title: f.fileName, Icon: f.fileType === 'image' ? FileImage : FileText } : null;
  };

  const isShown = (tab) => {
    const isActive = tab.kind === 'note' ? wb.activeNote === tab.id : wb.activeFile === tab.id;
    return isActive && (splitting || wb.focus === tab.kind);
  };

  const notePane = note ? (
    <NotePane key={note._id} note={note} onPatch={onPatchNote} onSaved={onSavedNote} onDelete={onDeleteNote} />
  ) : (
    <EmptyPane icon={StickyNote} title="No note open" text="Open a note from Sources, or start a new one.">
      <button type="button" className="ph-btn ph-btn-primary" onClick={() => onCreateNote('blank')}>
        <FilePlus size={15} /> New note
      </button>
    </EmptyPane>
  );

  const filePane = file ? (
    <FilePane key={file._id} file={file} />
  ) : (
    <EmptyPane icon={FileText} title="No file open" text="Upload a PDF or image, or open one from Sources.">
      <button type="button" className="ph-btn ph-btn-primary" onClick={onUpload}>
        <Upload size={15} /> Upload a file
      </button>
    </EmptyPane>
  );

  const nothingOpen = !note && !file;

  return (
    <div className="ph-workbench" ref={rootRef}>
      <div className="ph-tabs" role="tablist">
        <div className="ph-tabs-scroll">
          {wb.tabs.map((tab) => {
            const info = tabInfo(tab);
            if (!info) return null;
            const shown = isShown(tab);
            return (
              <div key={`${tab.kind}-${tab.id}`} className={`ph-tab ${shown ? 'ph-tab-active' : ''}`} role="tab" aria-selected={shown}>
                <button type="button" className="ph-tab-main" onClick={() => wb.openItem(tab.kind, tab.id)} title={info.title}>
                  <info.Icon size={14} />
                  <span>{info.title}</span>
                </button>
                <button
                  type="button"
                  className="ph-tab-close"
                  onClick={() => wb.closeTab(tab.kind, tab.id)}
                  aria-label={`Close ${info.title}`}
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={`ph-icon-btn ph-split-btn ${splitting ? 'ph-icon-btn-active' : ''}`}
          onClick={onToggleSplit}
          disabled={!canSplit && !split}
          aria-pressed={splitting}
          title={canSplit ? 'Split view: reader beside notes' : 'Split view needs a wider window'}
        >
          <Columns2 size={16} />
        </button>
      </div>

      <div className={`ph-panes ${splitting ? 'ph-panes-split' : ''}`}>
        {nothingOpen && !splitting ? (
          <EmptyPane icon={StickyNote} title="Your study desk is empty" text="Create a note or open a file from Sources to start preparing this topic.">
            <button type="button" className="ph-btn ph-btn-primary" onClick={() => onCreateNote('blank')}>
              <FilePlus size={15} /> New note
            </button>
            <button type="button" className="ph-btn" onClick={onUpload}>
              <Upload size={15} /> Upload a file
            </button>
          </EmptyPane>
        ) : splitting ? (
          <>
            <div className="ph-pane">{filePane}</div>
            <div className="ph-pane">{notePane}</div>
          </>
        ) : (
          <div className="ph-pane">{wb.focus === 'file' ? filePane : notePane}</div>
        )}
      </div>
    </div>
  );
}

export default Workbench;