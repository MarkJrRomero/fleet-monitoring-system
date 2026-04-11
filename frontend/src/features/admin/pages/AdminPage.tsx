export function AdminPage() {
  return (
    <main className="min-h-screen bg-surface p-6 md:p-10">
      <section className="mx-auto grid w-full max-w-3xl gap-3 rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-lg shadow-primary/5">
        <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Panel Admin</h1>
        <p className="text-on-surface-variant">Solo usuarios con rol admin pueden ver esta ruta.</p>
      </section>
    </main>
  );
}