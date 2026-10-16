import { createContext, useContext, useState, useCallback } from 'react';

const AIDrawerContext = createContext(null);

// scope only matters for a PDF: 'page' = the page being viewed, 'whole' = every page
const EMPTY_CONTEXT = { type: 'none', id: null, label: '', page: null, scope: 'page' };

export function AIDrawerProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  // 'docked' | 'expanded' | 'minimized'. Lives here so other screens
  // (like the PDF viewer) can make room for a docked drawer.
  const [drawerMode, setDrawerMode] = useState('docked');
  const [context, setContext] = useState(EMPTY_CONTEXT);

  const openDrawer = useCallback(() => {
    setIsOpen(true);
    setDrawerMode((mode) => (mode === 'minimized' ? 'docked' : mode));
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setDrawerMode('docked');
  }, []);

  const toggleDrawer = useCallback(() => {
    setIsOpen((open) => !open);
    setDrawerMode('docked');
  }, []);

  // page is only meaningful for file context (the PDF page being read).
  // The viewer calls this on every page turn, so the scope the user picked
  // is kept as long as it is the same file; a different file starts on 'page'.
  const setDrawerContext = useCallback((type, id, label, page = null) => {
    setContext((prev) => ({
      type,
      id,
      label,
      page,
      scope: type === 'file' && prev.type === 'file' && prev.id === id ? prev.scope : 'page',
    }));
  }, []);

  // 'page' | 'whole'. Ignored unless a PDF is the current context.
  const setContextScope = useCallback((scope) => {
    setContext((prev) => (prev.type === 'file' ? { ...prev, scope } : prev));
  }, []);

  const clearDrawerContext = useCallback(() => setContext(EMPTY_CONTEXT), []);

  return (
    <AIDrawerContext.Provider
      value={{
        isOpen,
        drawerMode,
        setDrawerMode,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        context,
        setDrawerContext,
        setContextScope,
        clearDrawerContext,
      }}
    >
      {children}
    </AIDrawerContext.Provider>
  );
}

export const useAIDrawer = () => useContext(AIDrawerContext);