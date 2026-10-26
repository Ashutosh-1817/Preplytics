import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';   // base tokens and reset
import App from './App.jsx';
import './styles/polish.css';   // shared component polish
import './styles/theme.css';    // palette, shell, motion
import './styles/controls.css'; // dropdowns and input fixes. Keep this last.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);