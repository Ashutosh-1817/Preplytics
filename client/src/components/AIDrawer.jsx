

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  Sparkles, History, MessageSquarePlus, Minus, Maximize2, Minimize2, X, ArrowUp,
  AlignLeft, Lightbulb, FilePlus2, ListChecks, FileText, StickyNote, BookOpen, Copy, Check,
  ChevronLeft, MessageSquare, Paperclip,
} from 'lucide-react';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import { askAi, saveAiResultAsNote, fetchConversations, fetchConversationById } from '../services/ai.api.js';
import { textToTiptapDoc } from '../utils/textToTiptapDoc.js';
import AttachFilePopover from './files/AttachFilePopover.jsx';
import './AIDrawer.css';

const QUICK_ACTIONS = [
  { action: 'summarize', label: 'Summarize', Icon: AlignLeft },
  { action: 'explain', label: 'Explain', Icon: Lightbulb },
  { action: 'generate_notes', label: 'Generate notes', Icon: FilePlus2 },
  { action: 'generate_quiz', label: 'Generate quiz', Icon: ListChecks },
];

const CONTEXT_PREFIX = /^(Note|Topic|File):\s*/;
const CONTEXT_ICONS = { note: StickyNote, node: BookOpen, file: FileText };

const deriveChatTitle = (text) => {
  const words = text.trim().split(/\s+/).slice(0, 6).join(' ');
  return words.length > 50 ? words.slice(0, 50) + '…' : words;
};

function AIDrawer() {
  const {
    isOpen, closeDrawer, context, setDrawerContext, clearDrawerContext,
    drawerMode: viewMode, setDrawerMode: setViewMode,
  } = useAIDrawer();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [showAttach, setShowAttach] = useState(false);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // A different note/topic/file starts a fresh thread. Page turns inside
  // the same PDF do not: the conversation continues across pages.
  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setError('');
    setShowHistory(false);
  }, [context.type, context.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  const contextName = context.label.replace(CONTEXT_PREFIX, '');

  const runRequest = async ({ action, message }) => {
    setError('');
    setIsLoading(true);

    if (message) setMessages((prev) => [...prev, { role: 'user', content: message }]);

    try {
      const result = await askAi({
        action,
        contextType: context.type,
        contextId: context.id,
        contextPage: context.type === 'file' ? context.page : null,
        message: message || '',
        conversationId: action === 'chat' ? conversationId : null,
      });

      if (action === 'chat' && result.conversationId) setConversationId(result.conversationId);

      let suggestedTitle;
      if (action === 'chat') {
        suggestedTitle = deriveChatTitle(message || result.result);
      } else {
        const actionLabel = QUICK_ACTIONS.find((q) => q.action === action)?.label || 'AI';
        suggestedTitle = `${actionLabel}: ${contextName}`;
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.result, goalId: result.goalId, nodeId: result.nodeId, suggestedTitle },
      ]);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const submitMessage = () => {
    if (!input.trim() || isLoading) return;
    runRequest({ action: 'chat', message: input.trim() });
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const handleSaveAsNote = async (msg, idx) => {
    try {
      await saveAiResultAsNote({
        content: msg.content,
        contentJSON: textToTiptapDoc(msg.content),
        title: msg.suggestedTitle || 'AI-generated note',
        goalId: msg.goalId,
        nodeId: msg.nodeId,
      });
      setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, saved: true } : m)));
    } catch {
      setError('Could not save this as a note.');
    }
  };

  const handleCopy = async (text, idx) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      setError('Could not copy to clipboard.');
    }
  };

  const handleNewChat = () => {
    setConversationId(null);
    setMessages([]);
    setError('');
    setShowHistory(false);
  };

  const handleToggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    setHistory(null);
    try {
      setHistory(await fetchConversations());
    } catch {
      setHistory([]);
    }
  };

  const handleLoadConversation = async (id) => {
    try {
      const conv = await fetchConversationById(id);
      setConversationId(conv._id);
      setMessages(conv.messages.map((m) => ({ role: m.role, content: m.content })));
      setShowHistory(false);
    } catch {
      setError('Could not load that conversation.');
    }
  };

  const handleAttachSelect = (file) => {
    setDrawerContext('file', file._id, `File: ${file.fileName}`, null);
    setShowAttach(false);
  };

  if (!isOpen) return null;

  if (viewMode === 'minimized') {
    return (
      <button className="ai-drawer-minimized" onClick={() => setViewMode('docked')}>
        <Sparkles size={16} /> Ask AI
        {messages.length > 0 && <span className="ai-minimized-badge">{messages.length}</span>}
      </button>
    );
  }

  const ContextIcon = CONTEXT_ICONS[context.type] || BookOpen;

  const emptyCopy =
    context.type === 'none'
      ? 'Ask a general question, open a note or topic for quick actions, or tap the paperclip to chat about a PDF.'
      : context.type === 'file'
        ? context.page
          ? `Ask about page ${context.page} of "${contextName}", or use a quick action above. Turn the page and ask again.`
          : `The AI reads the start of "${contextName}". Open it in Files to ask about a specific page.`
        : `Ask something about "${contextName}", or use a quick action above.`;

  return (
    <div className={`ai-drawer ai-drawer--${viewMode}`}>
      <div className="ai-header">
        <div className="ai-brand">
          <div className="ai-brand-badge"><Sparkles size={18} /></div>
          <div className="ai-brand-text">
            <span className="ai-brand-title">Ask AI</span>
            {context.type !== 'none' ? (
              <span className="ai-context-chip">
                <ContextIcon size={12} /> {contextName}
                {context.type === 'file' && context.page ? ` · p.${context.page}` : ''}
              </span>
            ) : (
              <span className="ai-brand-sub">General assistant</span>
            )}
          </div>
        </div>

        <div className="ai-header-actions">
          <button className={`ai-icon-btn ${showHistory ? 'ai-icon-btn-active' : ''}`} onClick={handleToggleHistory} title="Chat history">
            <History size={18} />
          </button>
          <button className="ai-icon-btn" onClick={handleNewChat} title="New chat">
            <MessageSquarePlus size={18} />
          </button>
          <button className="ai-icon-btn" onClick={() => setViewMode('minimized')} title="Minimize">
            <Minus size={18} />
          </button>
          <button
            className="ai-icon-btn"
            onClick={() => setViewMode(viewMode === 'expanded' ? 'docked' : 'expanded')}
            title={viewMode === 'expanded' ? 'Restore' : 'Full screen'}
          >
            {viewMode === 'expanded' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
          <button className="ai-icon-btn" onClick={closeDrawer} title="Close">
            <X size={18} />
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="ai-history-panel">
          <button className="ai-history-back" onClick={() => setShowHistory(false)}>
            <ChevronLeft size={16} /> Back to chat
          </button>
          <h4 className="ai-history-heading">Past conversations</h4>

          {history === null && <div className="skeleton" style={{ height: 52, marginBottom: 8 }} />}
          {history?.length === 0 && <p className="text-muted ai-empty-text">No past conversations yet.</p>}

          {history?.map((c) => (
            <button key={c._id} className="ai-history-item" onClick={() => handleLoadConversation(c._id)}>
              <MessageSquare size={16} className="ai-history-icon" />
              <span className="ai-history-meta">
                <span className="ai-history-title">{c.title}</span>
                <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                  {new Date(c.updatedAt).toLocaleDateString()}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {context.type !== 'none' && (
            <div className="ai-quick-actions">
              {QUICK_ACTIONS.map(({ action, label, Icon }) => (
                <button
                  key={action}
                  className="ai-chip-btn"
                  onClick={() => runRequest({ action, message: '' })}
                  disabled={isLoading}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          )}

          <div className="ai-messages" ref={scrollRef}>
            {messages.length === 0 && (
              <div className="ai-empty-state">
                <div className="ai-empty-badge"><Sparkles size={22} /></div>
                <h4>How can I help?</h4>
                <p className="text-muted">{emptyCopy}</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg ai-msg-${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="ai-avatar"><Sparkles size={14} /></div>
                )}

                <div className="ai-msg-body">
                  <div className="ai-bubble">
                    {msg.role === 'assistant' ? (
                      <div className="ai-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>

                  {msg.role === 'assistant' && (
                    <div className="ai-msg-actions">
                      <button className="ai-action-btn" onClick={() => handleCopy(msg.content, i)}>
                        {copiedIdx === i ? <Check size={13} /> : <Copy size={13} />}
                        {copiedIdx === i ? 'Copied' : 'Copy'}
                      </button>
                      <button className="ai-action-btn" onClick={() => handleSaveAsNote(msg, i)} disabled={msg.saved}>
                        {msg.saved ? <Check size={13} /> : <FilePlus2 size={13} />}
                        {msg.saved ? 'Saved' : 'Save as note'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="ai-msg ai-msg-assistant">
                <div className="ai-avatar"><Sparkles size={14} /></div>
                <div className="ai-msg-body">
                  <div className="ai-bubble ai-typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="auth-error ai-error">{error}</p>}

          <div className="ai-composer">
            {showAttach && (
              <AttachFilePopover onSelect={handleAttachSelect} onClose={() => setShowAttach(false)} />
            )}

            {context.type === 'file' && (
              <div className="ai-attached">
                <span className="ai-attached-chip">
                  <FileText size={14} />
                  <span className="ai-attached-name">{contextName}</span>
                  <span
                    className="ai-attached-page"
                    title={context.page ? 'The AI is reading this page' : 'The AI reads the start of the document. Open it in Files to pick a page.'}
                  >
                    {context.page ? `p.${context.page}` : 'start'}
                  </span>
                  <button type="button" onClick={clearDrawerContext} aria-label="Detach file">
                    <X size={13} />
                  </button>
                </span>
              </div>
            )}

            <div className="ai-composer-box">
              <button
                type="button"
                className={`ai-attach-btn ${showAttach ? 'ai-attach-btn-active' : ''}`}
                data-attach-toggle
                onClick={() => setShowAttach((v) => !v)}
                title="Chat about a PDF"
                aria-label="Attach a PDF"
              >
                <Paperclip size={18} />
              </button>

              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                disabled={isLoading}
              />

              <button className="ai-send-btn" onClick={submitMessage} disabled={isLoading || !input.trim()} title="Send">
                <ArrowUp size={18} />
              </button>
            </div>
            <span className="ai-composer-hint">Enter to send · Shift+Enter for a new line</span>
          </div>
        </>
      )}
    </div>
  );
}

export default AIDrawer;