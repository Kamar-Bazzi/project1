import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import PatientDashboardPage from "./pages/patient/PatientDashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<LoginPage />} />

        <Route path="/register" element={<RegisterPage />} />

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
      </Routes>
    </BrowserRouter>
  );
}