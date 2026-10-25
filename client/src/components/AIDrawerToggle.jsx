import { MessageSquareText } from 'lucide-react';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// The floating PrepBot button. Only shown to signed-in users, and hidden while the drawer is open.
function AIDrawerToggle() {
  const { isOpen, toggleDrawer } = useAIDrawer();
  const { user } = useAuth();

  if (isOpen || !user) return null;

  return (
    <button type="button" className="prepbot-fab" onClick={toggleDrawer} title="Ask PrepBot" aria-label="Open PrepBot">
      <span className="prepbot-fab-icon">
        <MessageSquareText size={18} />
        <i aria-hidden="true" />
      </span>
      <span className="prepbot-fab-label">PrepBot</span>
    </button>
  );
}

export default AIDrawerToggle;