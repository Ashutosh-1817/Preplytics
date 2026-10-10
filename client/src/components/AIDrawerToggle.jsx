import { Sparkles } from 'lucide-react';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import './AIDrawerToggle.css';

function AIDrawerToggle() {
  const { isOpen, toggleDrawer } = useAIDrawer();

  if (isOpen) return null;

  return (
    <button className="ai-drawer-toggle" onClick={toggleDrawer} title="Ask AI" aria-label="Open AI assistant">
      <Sparkles size={24} />
    </button>
  );
}

export default AIDrawerToggle;