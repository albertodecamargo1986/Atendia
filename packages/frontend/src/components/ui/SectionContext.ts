import { createContext, useContext } from 'react';

/**
 * Informa às páginas que elas estão dentro de uma seção com abas (SectionLayout).
 * Nesse caso o título já aparece no topo da seção e o PageHeader não o repete.
 */
export const SectionContext = createContext<{ embedded: boolean }>({ embedded: false });

export function useSectionEmbedded(): boolean {
  return useContext(SectionContext).embedded;
}
