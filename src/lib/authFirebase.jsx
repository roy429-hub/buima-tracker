// Firebase Auth provider — drop-in replacement for ./auth.jsx.
//
// Exports the same four names with the same signatures (AuthProvider, useAuth,
// signIn, signOut), so App.jsx, Layout.jsx, ProtectedRoute.jsx and Login.jsx
// import "@auth" and never know which backend is in play. See vite.config.js.
//
// As with the Supabase version there is NO signup path: staff accounts are
// created by hand (Firebase console → Authentication → Users), matching the
// rule in CLAUDE.md §3.

import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as fbSignOut,
} from "firebase/auth";
import { auth } from "./firestore";

const AuthContext = createContext({ user: null, loading: true });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged fires once with the restored session (or null) as soon
    // as the SDK finishes reading persisted state, so it covers what the
    // Supabase version needed a separate getSession() call for.
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setLoading(false);
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export async function signIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOut() {
  await fbSignOut(auth);
}

/** Email a password-reset link.
 *
 * Needed for more than forgetfulness: Supabase password hashes could not be
 * carried over to Firebase, so at cutover every account exists with a random
 * password nobody knows. This is how staff get in the first time.
 *
 * Resolves without telling the caller whether the address has an account —
 * Login.jsx shows the same message either way, so the form cannot be used to
 * discover who works here.
 */
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    // auth/user-not-found and auth/invalid-email are swallowed on purpose.
    // Anything else (network, misconfiguration) is a real failure worth showing.
    const code = err && err.code;
    if (code !== "auth/user-not-found" && code !== "auth/invalid-email") throw err;
  }
}
