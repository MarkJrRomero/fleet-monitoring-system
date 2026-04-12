import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { clearSession as clearStoredSession, login as loginService, readSession } from '../services/authService';
import { Session } from '../types/domain';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const persisted = await readSession();
      if (active) {
        setSession(persisted);
        setLoading(false);
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      signIn: async (username: string, password: string) => {
        const next = await loginService(username, password);
        setSession(next);
      },
      signOut: async () => {
        await clearStoredSession();
        setSession(null);
      }
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
}
