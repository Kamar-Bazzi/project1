import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import DoctorDashboardPage from "./pages/doctor/DoctorDashboardPage";
import MedicationsPage from "./pages/MedicationsPage";
import MeasurementsPage from "./pages/MeasurementsPage";
import HealthPage from "./pages/patient/HealthPage";
import PatientDashboardPage from "./pages/patient/PatientDashboardPage";
import PatientProfilePage from "./pages/patient/PatientProfilePage";
import WearablesPage from "./pages/patient/WearablesPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        <Route path="/login" element={<LoginPage />} />

        <Route path="/register" element={<RegisterPage />} />

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
