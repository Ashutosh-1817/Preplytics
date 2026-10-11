

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
import Research from '../pages/Research.jsx';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

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
      </Route>
    </Routes>
  );
}

export default AppRoutes;