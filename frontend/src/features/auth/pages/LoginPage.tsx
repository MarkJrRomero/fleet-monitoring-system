import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { usePageSeo } from '../../../shared/hooks/usePageSeo';
import { isAuthenticated, loginViaApi } from '../services/authService';

export function LoginPage() {
  usePageSeo({
    title: 'SMTF | Inicio de sesion',
    description: 'Accede al panel de monitoreo de flotas SMTF.'
  });

  const [username, setUsername] = useState('admin_test');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bannerLoaded, setBannerLoaded] = useState(false);

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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Usuario o contrasena invalidos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-surface via-surface-container-low to-surface-container p-4 sm:p-6 lg:p-10">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center justify-center sm:min-h-[calc(100vh-3rem)] lg:min-h-[calc(100vh-5rem)]">
        <section className="grid w-full overflow-hidden rounded-[34px] border border-outline-variant/25 bg-surface-container-lowest shadow-[0_24px_70px_rgba(15,23,42,0.18)] md:grid-cols-2">
          <div className="flex items-center justify-center px-8 py-10 sm:px-12 lg:px-16">
            <div className="w-full max-w-sm">
              <header className="mb-10 text-center">
                <div className="mb-4 flex justify-center">
                  <img
                    src="/assets/logos/logo.png"
                    alt="Logo SMTF"
                    className="h-24 w-24 object-contain"
                    decoding="async"
                  />
                </div>
                <h1 className="font-headline text-4xl font-black tracking-tight text-on-surface">Bienvenido</h1>
                <p className="mt-1 text-sm text-on-surface-variant">Inicia sesion para acceder al panel administrativo de monitoreo.</p>
              </header>

              <form className="space-y-4" onSubmit={onSubmit}>
                <label className="block" htmlFor="operator-id">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Correo o username</span>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/60" />
                    <input
                      id="operator-id"
                      name="operator-id"
                      type="text"
                      autoComplete="username"
                      className="block w-full rounded-full border border-outline-variant/40 bg-surface-container-low py-3 pl-11 pr-4 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:bg-surface focus:outline-none"
                      placeholder="tu@email.com"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      required
                    />
                  </div>
                </label>

                <label className="block" htmlFor="password">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Contrasena</span>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant/60" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="block w-full rounded-full border border-outline-variant/40 bg-surface-container-low py-3 pl-11 pr-11 text-sm font-medium text-on-surface placeholder:text-on-surface-variant/60 focus:border-primary focus:bg-surface focus:outline-none"
                      placeholder="Ingresa tu contrasena"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                      className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant/70 transition hover:bg-surface hover:text-on-surface"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>

                {error ? (
                  <p className="rounded-xl border border-error/30 bg-error-container/25 px-3 py-2 text-xs font-semibold text-error">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-3 block w-full rounded-full bg-primary px-4 py-3 text-sm font-bold text-on-primary transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading ? 'Validando...' : 'Iniciar sesion'}
                </button>
              </form>
            </div>
          </div>

          <div className="relative hidden min-h-[520px] overflow-hidden md:block">
            <div
              className={`absolute inset-0 bg-gradient-to-br from-primary/20 via-surface-container to-secondary/20 transition-opacity duration-500 ${bannerLoaded ? 'opacity-0' : 'opacity-100'}`}
            />
            <img
              alt="Panel visual de acceso"
              className={`h-full w-full object-cover transition-all duration-700 ${bannerLoaded ? 'scale-100 blur-0 opacity-100' : 'scale-[1.03] blur-md opacity-80'}`}
              decoding="async"
              loading="lazy"
              src="/assets/images/login-banner.jpg"
              onLoad={() => setBannerLoaded(true)}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/20 via-transparent to-transparent" />
          </div>
        </section>
      </div>
    </main>
  );
}