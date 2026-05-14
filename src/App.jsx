import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import WarRoom from "./pages/WarRoom";
import Sites from "./pages/Sites";
import SiteDashboard from "./pages/SiteDashboard";
import Login from "./pages/Login";
import { AuthProvider } from "./lib/auth";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<WarRoom />} />
            <Route path="/sites" element={<Sites />} />
            <Route path="/sites/:id" element={<SiteDashboard />} />
            <Route path="*" element={<WarRoom />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
