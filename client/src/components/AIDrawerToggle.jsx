import { useLocation } from 'react-router-dom';
import { MessageSquareText } from 'lucide-react';
import { useAIDrawer } from '../context/AIDrawerContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// The floating PrepBot button. Only shown to signed-in users, hidden while the drawer is open,
// and hidden inside PrepHub because PrepHub has its own PrepBot card.
function AIDrawerToggle() {
  const { isOpen, toggleDrawer } = useAIDrawer();
  const { user } = useAuth();
  const { pathname } = useLocation();

  if (isOpen || !user || pathname.startsWith('/prephub')) return null;

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