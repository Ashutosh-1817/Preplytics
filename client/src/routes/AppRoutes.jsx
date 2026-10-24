import { Routes, Route } from 'react-router-dom';
import AppShell from '../layouts/AppShell.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Goals from '../pages/Goals.jsx';
import GoalDetail from '../pages/GoalDetail.jsx';
import Notes from '../pages/Notes.jsx';
import Files from '../pages/Files.jsx';
import CalendarPage from '../pages/Calendar.jsx';
import Login from '../pages/Login.jsx';
import Signup from '../pages/Signup.jsx';
import VerifyEmail from '../pages/VerifyEmail.jsx';
import ForgotPassword from '../pages/ForgotPassword.jsx';
import Research from '../pages/Research.jsx';
import Analytics from '../pages/Analytics.jsx';
import Wrapped from '../pages/Wrapped.jsx';
import Profile from '../pages/Profile.jsx';
import PrepHubFrame from '../components/prephub/PrepHubFrame.jsx';
import { lazy, Suspense } from 'react'; 
const PrepHub = lazy(() => import('../pages/PrepHub.jsx'));

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Standalone Full-Screen PrepHub Arena */}
      <Route
        path="/prephub/:nodeId"
        element={
          <ProtectedRoute>
            <PrepHubFrame>
              <Suspense fallback={<div className="skeleton" style={{ height: '100%' }} />}>
                <PrepHub />
              </Suspense>
            </PrepHubFrame>
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/goals/:goalId" element={<GoalDetail />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/files" element={<Files />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/research" element={<Research />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/wrapped" element={<Wrapped />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}

export default AppRoutes;