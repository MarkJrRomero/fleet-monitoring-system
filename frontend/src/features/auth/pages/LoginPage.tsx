import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated, loginViaApi } from '../services/authService';

export function LoginPage() {
  const [username, setUsername] = useState('admin_test');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await loginViaApi(username, password);
      window.location.href = '/';
    } catch {
      setError('Usuario o contrasena invalidos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden geometric-bg">
      <div className="mx-auto flex min-h-screen w-full max-w-[420px] items-center justify-center px-6">
        <div className="w-full">
          <div className="brand-shadow rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-8">
            <header className="mb-8">
              <h2 className="font-headline text-xl font-bold text-on-surface">Portal de Operaciones</h2>
              <p className="mt-1 text-sm text-on-tertiary-container">Accede a tu nodo seguro de telemetria.</p>
            </header>

            <form className="space-y-6" onSubmit={onSubmit}>
              <div>
                <label
                  className="ml-1 mb-2 block font-label text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"
                  htmlFor="operator-id"
                >
                  ID de Operador
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <span className="material-symbols-outlined text-sm text-on-tertiary-container">badge</span>
                  </div>
                  <input
                    id="operator-id"
                    name="operator-id"
                    type="text"
                    autoComplete="username"
                    className="input-transition block w-full rounded-xl border border-transparent bg-surface-container-low py-3.5 pl-11 pr-4 text-sm font-medium text-on-surface placeholder:text-on-tertiary-container/50 focus:border-primary/40 focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary/40"
                    placeholder="FLT-7729-00"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <div className="ml-1 mb-2 flex items-center">
                  <label
                    className="block font-label text-[11px] font-bold uppercase tracking-wider text-on-surface-variant"
                    htmlFor="password"
                  >
                    Contrasena
                  </label>
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <span className="material-symbols-outlined text-sm text-on-tertiary-container">lock</span>
                  </div>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    className="input-transition block w-full rounded-xl border border-transparent bg-surface-container-low py-3.5 pl-11 pr-4 text-sm font-medium text-on-surface placeholder:text-on-tertiary-container/50 focus:border-primary/40 focus:bg-surface-container-lowest focus:ring-1 focus:ring-primary/40"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
              </div>

              {error ? (
                <p className="rounded-lg border border-error/25 bg-error-container/20 px-3 py-2 text-xs font-semibold text-on-error-container">
                  {error}
                </p>
              ) : null}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-primary-dim py-4 font-label text-sm font-bold uppercase tracking-[0.2em] text-on-primary transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Validando...' : 'Entrar'}
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}