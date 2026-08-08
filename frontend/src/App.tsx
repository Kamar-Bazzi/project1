<<<<<<< HEAD
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import PatientDashboardPage from "./pages/patient/PatientDashboardPage";
=======
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MedicationsPage from "./pages/MedicationsPage";
>>>>>>> origin/feature/medications-page

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<LoginPage />} />

        <Route path="/register" element={<RegisterPage />} />
<<<<<<< HEAD

        <Route
          path="/dashboard"
          element={<PatientDashboardPage />}
        />

        <Route
          path="*"
          element={
            <main className="not-found-page">
              <h1>404</h1>
              <p>The requested page was not found.</p>
            </main>
          }
        />
=======
        <Route path="/medications" element={<MedicationsPage />} />
        <Route path="/dashboard" element={<div className="flex justify-center items-center h-screen text-2xl font-bold text-blue-600">Patient Dashboard (Coming Soon)</div>} />
>>>>>>> origin/feature/medications-page
      </Routes>
    </BrowserRouter>
  );
}