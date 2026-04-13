import { usePageSeo } from '../hooks/usePageSeo';

export function ForbiddenPage() {
  usePageSeo({
    title: 'SMTF | Acceso denegado',
    description: 'No tienes permisos para acceder al modulo solicitado en SMTF.'
  });

  return (
    <main className="min-h-screen bg-surface p-6 md:p-10">
      <section className="mx-auto grid w-full max-w-3xl gap-3 rounded-2xl border border-error/20 bg-surface-container-lowest p-6 shadow-lg shadow-error/5">
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Acceso denegado</h1>
        <p className="text-on-surface-variant">No tienes permisos para ver esta ruta.</p>
      </section>
    </main>
  );
}