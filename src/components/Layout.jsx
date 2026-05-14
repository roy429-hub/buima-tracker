import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Globe, MapPinned, ShieldCheck, ChevronRight, LogOut, User } from "lucide-react";
import { useAuth, signOut } from "../lib/auth";

export default function Layout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navItems = [
    { to: "/",      label: "War Room",     icon: Globe },
    { to: "/sites", label: "Installations", icon: MapPinned },
  ];
  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-200">
      {/* ── HEADER (white, premium) ─────────────────────── */}
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-[64px] flex items-center justify-between">
          {/* LEFT — Brand */}
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Buima" className="w-9 h-9 object-contain drop-shadow-sm" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-black tracking-tight text-slate-900">
                BUIMA <span className="text-brand">ENERGY</span>
              </span>
              <span className="text-[10px] font-bold text-brand tracking-[0.2em] uppercase">
                Tracker · Operations
              </span>
            </div>
            <span className="hidden md:flex ml-2 px-2.5 py-1 rounded-md bg-brand-light border border-rose-200 items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-brand" />
              <span className="text-[10px] font-bold text-brand tracking-wider uppercase">Enterprise</span>
            </span>
          </div>

          {/* RIGHT — Nav + user menu */}
          <div className="flex items-center gap-3">
            <nav className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === "/"}
                  className={({ isActive }) =>
                    `px-3 sm:px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      isActive
                        ? "bg-brand text-white shadow-sm"
                        : "text-slate-600 hover:text-brand"
                    }`
                  }>
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </NavLink>
              ))}
            </nav>
            {user && (
              <div className="hidden md:flex items-center gap-2 border-l border-slate-200 pl-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-700 font-mono max-w-[160px] truncate">{user.email}</span>
                </div>
                <button onClick={handleSignOut} title="Sign out"
                  className="text-slate-400 hover:text-brand p-1.5 rounded-md hover:bg-slate-100">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
        {/* subtle brand hairline at bottom for richness */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-60" />
      </header>

      {/* ── MAIN ──────────────────────────────────────── */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Outlet />
      </main>

      {/* ── FOOTER (white, refined) ─────────────────────── */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-60" />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
            <div>
              <p className="text-sm font-black text-slate-900">BUIMA <span className="text-brand">ENERGY</span></p>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-xs leading-relaxed">
                Operating proprietary B.E.S.T (Battery Energy Storage Tile) systems with integrated DC fast charging across global installation sites.
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-700 mb-2">Operations</p>
            <ul className="space-y-1 text-xs">
              <li className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="w-3 h-3 text-brand" />
                <span>Real-time charging telemetry</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="w-3 h-3 text-brand" />
                <span>Multi-currency portfolio analytics</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="w-3 h-3 text-brand" />
                <span>Investor-grade reporting</span>
              </li>
            </ul>
          </div>
          <div className="md:text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-700 mb-2">System</p>
            <p className="text-xs text-slate-500 font-mono">Tracker v0.1 · Phase 1</p>
            <p className="text-xs text-slate-500 font-mono">Build {new Date().toISOString().slice(0,10)}</p>
            <p className="text-[10px] text-slate-400 mt-3">© 2026 Buima Energy · All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
