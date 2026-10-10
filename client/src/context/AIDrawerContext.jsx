

import { createContext, useContext, useState, useCallback } from 'react';

const AIDrawerContext = createContext(null);

const EMPTY_CONTEXT = { type: 'none', id: null, label: '', page: null };

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

  // page is only meaningful for file context (the PDF page being read)
  const setDrawerContext = useCallback((type, id, label, page = null) => {
    setContext({ type, id, label, page });
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
        clearDrawerContext,
      }}
    >
      {children}
    </AIDrawerContext.Provider>
  );
}

export const useAIDrawer = () => useContext(AIDrawerContext);