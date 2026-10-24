import { MessageSquareText } from 'lucide-react';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import './AIDrawerToggle.css';

function AIDrawerToggle() {
  const { isOpen, toggleDrawer } = useAIDrawer();

  if (isOpen) return null;

  return (
    <button className="ai-drawer-toggle" onClick={toggleDrawer} title="PrepBot" aria-label="Open AI assistant">
      <MessageSquareText size={24} />
    </button>
  );
}

export default AIDrawerToggle;