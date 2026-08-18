import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import SecurityPage from "./pages/auth/SecurityPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import DoctorDashboardPage from "./pages/doctor/DoctorDashboardPage";
import NotificationsPage from "./pages/NotificationsPage";
import MedicationsPage from "./pages/MedicationsPage";
import MeasurementsPage from "./pages/MeasurementsPage";
import HealthPage from "./pages/patient/HealthPage";
import AppointmentsPage from "./pages/patient/AppointmentsPage";
import EmergencyPage from "./pages/patient/EmergencyPage";
import GoalsPage from "./pages/patient/GoalsPage";
import MedicalHistoryPage from "./pages/patient/MedicalHistoryPage";
import PatientDashboardPage from "./pages/patient/PatientDashboardPage";
import PatientProfilePage from "./pages/patient/PatientProfilePage";
import ReportsPage from "./pages/patient/ReportsPage";
import WearablesPage from "./pages/patient/WearablesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/login" element={<LoginPage />} />

        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route
          element={<ProtectedRoute allowedRoles={["PATIENT"]} />}
        >
          <Route
            path="/dashboard"
            element={<PatientDashboardPage />}
          />
          <Route
            path="/medications"
            element={<MedicationsPage />}
          />
          <Route
            path="/measurements"
            element={<MeasurementsPage />}
          />
          <Route
            path="/health"
            element={<HealthPage />}
          />
          <Route
            path="/wearables"
            element={<WearablesPage />}
          />
          <Route
            path="/profile"
            element={<PatientProfilePage />}
          />
          <Route
            path="/appointments"
            element={<AppointmentsPage />}
          />
          <Route path="/history" element={<MedicalHistoryPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/emergency" element={<EmergencyPage />} />
        </Route>

        <Route
          element={<ProtectedRoute allowedRoles={["PATIENT", "DOCTOR", "ADMIN"]} />}
        >
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>

        <Route
          element={<ProtectedRoute allowedRoles={["DOCTOR"]} />}
        >
          <Route
            path="/doctor"
            element={<DoctorDashboardPage />}
          />
        </Route>

        <Route
          element={<ProtectedRoute allowedRoles={["ADMIN"]} />}
        >
          <Route
            path="/admin"
            element={<AdminDashboardPage />}
          />
        </Route>

        <Route
          path="*"
          element={
            <main className="not-found-page">
              <h1>404</h1>
              <p>The requested page was not found.</p>
            </main>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
