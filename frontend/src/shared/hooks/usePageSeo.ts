import { useEffect } from 'react';

type UsePageSeoOptions = {
  title: string;
  description?: string;
};

const DEFAULT_TITLE = 'SMTF';
const DEFAULT_DESCRIPTION = 'Sistema de monitoreo de flotas en tiempo real.';

export function usePageSeo({ title, description }: UsePageSeoOptions) {
  useEffect(() => {
    document.title = title;

    const metaDescription =
      document.querySelector<HTMLMetaElement>('meta[name="description"]') ||
      (() => {
        const tag = document.createElement('meta');
        tag.setAttribute('name', 'description');
        document.head.appendChild(tag);
        return tag;
      })();

    metaDescription.setAttribute('content', description || DEFAULT_DESCRIPTION);

    return () => {
      document.title = DEFAULT_TITLE;
      metaDescription.setAttribute('content', DEFAULT_DESCRIPTION);
    };
  }, [title, description]);
}
