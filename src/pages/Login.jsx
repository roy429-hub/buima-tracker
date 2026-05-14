import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Lock, Mail, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { useAuth, signIn } from "../lib/auth";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <FullPageSpinner />;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background brand glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-dark/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          {/* Brand hairline at top */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent" />

          <div className="p-8">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-6">
              <img src="/logo.png" alt="" className="w-10 h-10 object-contain drop-shadow-[0_0_10px_rgba(190,18,60,0.5)]" />
              <div>
                <p className="text-base font-black text-white">BUIMA <span className="text-brand">ENERGY</span></p>
                <p className="text-[10px] font-bold text-brand tracking-[0.2em] uppercase">Tracker · Operations</p>
              </div>
            </div>

            <h1 className="text-2xl font-black text-white mb-1">Sign in</h1>
            <p className="text-sm text-slate-400 mb-6">Authorized Buima Energy personnel only.</p>

            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Email</span>
                <div className="mt-1 flex items-center border border-slate-700 rounded-lg bg-slate-950 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                  <Mail className="w-4 h-4 text-slate-500 ml-3" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    autoComplete="email" required
                    className="flex-1 px-3 py-2.5 text-sm bg-transparent text-white outline-none" />
                </div>
              </label>

              <label className="block">
                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Password</span>
                <div className="mt-1 flex items-center border border-slate-700 rounded-lg bg-slate-950 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                  <Lock className="w-4 h-4 text-slate-500 ml-3" />
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" required
                    className="flex-1 px-3 py-2.5 text-sm bg-transparent text-white outline-none" />
                </div>
              </label>

              {error && (
                <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={submitting || !email || !password}
                className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-2.5 rounded-lg shadow-[0_0_16px_rgba(190,18,60,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-800 flex items-center gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-brand" />
              <span>Enterprise authentication · TLS-encrypted</span>
            </div>
          </div>

          <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-50" />
        </div>

        <p className="text-center text-[10px] text-slate-600 font-mono mt-4">
          © 2026 BUIMA ENERGY · Tracker v0.2
        </p>
      </div>
    </div>
  );
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-brand animate-spin" />
    </div>
  );
}
