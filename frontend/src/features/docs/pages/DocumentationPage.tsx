import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';
import { ensureSession, getAccessToken } from '../../auth/services/authService';
import { usePageSeo } from '../../../shared/hooks/usePageSeo';

const scalarConfiguration = {
  sources: [
    {
      url: '/openapi/vehicle-service.openapi.json',
      title: 'Vehicle Service',
      slug: 'vehicle-service',
      default: true,
    },
    {
      url: '/openapi/ingestion-service.openapi.json',
      title: 'Ingestion Service',
      slug: 'ingestion-service',
    },
    {
      url: '/openapi/websocket-service.openapi.json',
      title: 'WebSocket Service',
      slug: 'websocket-service',
    },
  ],
  onBeforeRequest: async ({ requestBuilder }: { requestBuilder: { headers: Headers } }) => {
    const hasSession = await ensureSession();
    if (!hasSession) {
      return;
    }

    const token = getAccessToken();
    if (token) {
      requestBuilder.headers.set('Authorization', `Bearer ${token}`);
    }
  },
} as const;

export function DocumentationPage() {
  usePageSeo({
    title: 'SMTF | Documentacion API',
    description: 'Referencia centralizada de los microservicios del sistema usando Scalar.'
  });

  return (
    <main className="scalar-docs-standalone min-h-screen bg-slate-950">
      <ApiReferenceReact configuration={scalarConfiguration} />
    </main>
  );
}