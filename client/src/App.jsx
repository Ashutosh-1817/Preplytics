
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { AIDrawerProvider } from './context/AIDrawerContext.jsx';
import AppRoutes from './routes/AppRoutes.jsx';
import AIDrawer from './components/AIDrawer.jsx';
import AIDrawerToggle from './components/AIDrawerToggle.jsx';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AIDrawerProvider>
          <AppRoutes />
          <AIDrawer />
          <AIDrawerToggle />
        </AIDrawerProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;