import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';   // our design system
import './styles/theme.css';   // palette, typography, shell, auth
import App from './App.jsx';

import './styles/polish.css'; // UI polish layer, keep after App so it wins the cascade
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);