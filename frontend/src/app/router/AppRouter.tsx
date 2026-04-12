import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../../features/auth/pages/LoginPage';
import { ProtectedRoute } from '../../features/auth/components/ProtectedRoute';
import { DashboardPage } from '../../features/dashboard/pages/DashboardPage';
import { AdminPage } from '../../features/admin/pages/AdminPage';
import { SimulationPage } from '../../features/simulation/pages/SimulationPage';
import { VehiclesPage } from '../../features/vehicles/pages/VehiclesPage';
import { ForbiddenPage } from '../../shared/pages/ForbiddenPage';

const DocumentationPage = lazy(async () => {
  const module = await import('../../features/docs/pages/DocumentationPage');
  return { default: module.DocumentationPage };
});

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/simulacion"
          element={
            <ProtectedRoute requiredRole="admin">
              <SimulationPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/vehiculos"
          element={
            <ProtectedRoute requiredRole="admin">
              <VehiclesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/documentacion"
          element={
            <ProtectedRoute requiredRole="admin">
              <Suspense
                fallback={
                  <main className="min-h-screen bg-slate-50 p-6 sm:p-8">
                    <section className="rounded-[28px] border border-cyan-100/80 bg-white p-6 shadow-sm">
                      <p className="text-sm font-semibold text-slate-500">Cargando documentacion API...</p>
                    </section>
                  </main>
                }
              >
                <DocumentationPage />
              </Suspense>
            </ProtectedRoute>
          }
        />

        <Route path="/forbidden" element={<ForbiddenPage />} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}