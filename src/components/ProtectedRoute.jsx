import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { refreshFromDB, isLoaded, subscribe } from "../lib/storage";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [dataReady, setDataReady] = useState(isLoaded());
  const [error, setError] = useState("");

  // After login, prime the cache from Supabase
  useEffect(() => {
    if (!user) return;
    if (isLoaded()) { setDataReady(true); return; }
    refreshFromDB()
      .then(() => setDataReady(true))
      .catch(e => setError(e.message || String(e)));
    const unsub = subscribe(() => setDataReady(true));
    return unsub;
  }, [user]);

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-center p-8">
      <div className="max-w-md text-slate-300">
        <p className="text-red-400 font-bold mb-2">Could not load data</p>
        <p className="text-xs text-slate-500 font-mono mb-4">{error}</p>
        <p className="text-xs text-slate-500">
          Most likely cause: the SQL schema hasn't been run yet in your Supabase project.
          Open <code className="px-1 bg-slate-800 rounded">db/init.sql</code> and run it in
          the Supabase SQL Editor.
        </p>
      </div>
    </div>
  );
  if (!dataReady) return <FullPageSpinner label="Loading operations data…" />;
  return children;
}

function FullPageSpinner({ label }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 text-brand animate-spin" />
      {label && <p className="text-xs text-slate-500 font-mono">{label}</p>}
    </div>
  );
}
