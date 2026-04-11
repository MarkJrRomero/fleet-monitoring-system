import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { isAuthenticated } from '../services/authService';

type ProtectedRouteProps = {
  children: ReactNode;
  requiredRole?: string;
};

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  void requiredRole;

  return <>{children}</>;
}