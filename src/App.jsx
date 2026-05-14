import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import WarRoom from "./pages/WarRoom";
import Sites from "./pages/Sites";
import SiteDashboard from "./pages/SiteDashboard";
import { seedIfEmpty } from "./lib/storage";

export default function App() {
  useEffect(() => { seedIfEmpty(); }, []);
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<WarRoom />} />
          <Route path="/sites" element={<Sites />} />
          <Route path="/sites/:id" element={<SiteDashboard />} />
          <Route path="*" element={<WarRoom />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
