import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "user" | "doctor";

export interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signUp: (
    email: string,
    password: string,
    role: AppRole,
    displayName?: string
  ) => Promise<{ data: any; error: any }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider — mount once at the app root ─────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    role: null,
    loading: true,
  });

  const fetchRole = useCallback(
    async (userId: string): Promise<AppRole | null> => {
      const { data, error } = await supabase.rpc("get_user_role", {
        _user_id: userId,
      });
      if (error) {
        console.error("[Auth] Failed to fetch role:", error);
        return null;
      }
      return data as AppRole | null;
    },
    []
  );

  useEffect(() => {
    let isMounted = true;
    // Tracks which role-fetch is the latest so stale responses are discarded
    let latestRequestId = 0;

    const resolveSession = (session: Session | null) => {
      if (!isMounted) return;

      if (!session?.user) {
        setState({ user: null, session: null, role: null, loading: false });
        return;
      }

      // If the same user is already authenticated (e.g. TOKEN_REFRESHED on tab focus),
      // don't flip loading back to true — that would unmount the dashboard and wipe state.
      // Only show loading spinner for a genuinely new sign-in (different or no prior user).
      setState((prev) => ({
        ...prev,
        user: session.user,
        session,
        loading: prev.user?.id === session.user.id ? false : true,
      }));

      const myId = ++latestRequestId;

      void fetchRole(session.user.id)
        .then((role) => {
          if (!isMounted || myId !== latestRequestId) return;
          setState({ user: session.user, session, role, loading: false });
        })
        .catch(() => {
          if (!isMounted || myId !== latestRequestId) return;
          setState({ user: session.user, session, role: null, loading: false });
        });
    };

    // onAuthStateChange is the single source of truth.
    // It fires INITIAL_SESSION immediately with the stored session (or null),
    // so a separate getSession() call is NOT needed and would cause double role-fetches.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveSession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  const signUp = (
    email: string,
    password: string,
    role: AppRole,
    displayName?: string
  ) =>
    supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role, display_name: displayName || email },
        emailRedirectTo: window.location.origin,
      },
    });

  const signIn = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange will also fire SIGNED_OUT, but set immediately for responsiveness
    setState({ user: null, session: null, role: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook — consumes the shared context (no independent state) ─────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
