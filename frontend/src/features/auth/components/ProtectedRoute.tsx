import { Navigate } from 'react-router-dom';
import { ReactNode, useEffect, useState } from 'react';
import { ensureSession } from '../services/authService';

type ProtectedRouteProps = {
  children: ReactNode;
  requiredRole?: string;
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSessionValid, setIsSessionValid] = useState(false);

  useEffect(() => {
    let active = true;

    const validateSession = async () => {
      const valid = await ensureSession();
      if (!active) {
        return;
      }

      setIsSessionValid(valid);
      setIsLoadingSession(false);
    };

    void validateSession();

    return () => {
      active = false;
    };
  }, []);

  if (isLoadingSession) {
    return null;
  }

  if (!isSessionValid) {
    return <Navigate to="/login" replace />;
  }

  void requiredRole;

  return <>{children}</>;
}