import { useEffect } from 'react';

interface PageMetadata {
  title: string;
  description: string;
}

function setMeta(selector: string, attr: string, key: string, content: string): void {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

/**
 * Document metadata for public routes.
 *
 * No social preview image is declared: none has been produced, and pointing
 * og:image at a file that does not exist produces a broken card rather than no
 * card. Canonical is derived from the current origin rather than hardcoded, so
 * it stays correct across environments.
 */
export function usePageMetadata({ title, description }: PageMetadata): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;

    setMeta('meta[name="description"]', 'name', 'description', description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', description);
    setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    setMeta('meta[property="og:url"]', 'property', 'og:url', window.location.href);
    setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary');
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}${window.location.pathname}`;

    return () => {
      document.title = previous;
    };
  }, [title, description]);
}
