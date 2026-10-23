import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { gateway } from '@/lib/gateway';

export type ActingPage = {
  id: string;
  name: string;
  cover_image: string | null;
  profile_pic?: string | null;
};

type PageSwitchCtx = {
  actingPage: ActingPage | null;
  switchToPage: (page: ActingPage) => void;
  switchToPersonal: () => void;
};

const PageSwitchContext = createContext<PageSwitchCtx>({
  actingPage: null,
  switchToPage: () => {},
  switchToPersonal: () => {},
});

const STORAGE_KEY = 'tone:actingPage';

const persist = (page: ActingPage | null) => {
  try {
    if (page) localStorage.setItem(STORAGE_KEY, JSON.stringify(page));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
};

export const PageSwitchProvider = ({ children }: { children: ReactNode }) => {
  const [actingPage, setActingPage] = useState<ActingPage | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const switchToPage = useCallback((page: ActingPage) => {
    setActingPage(page);
    persist(page);
  }, []);

  const switchToPersonal = useCallback(() => {
    setActingPage(null);
    persist(null);
  }, []);

  // The selection is persisted in localStorage, so on a fresh load it is a
  // snapshot from whenever the user last switched. A Page's name, cover and
  // (especially) profile_pic can change in the meantime, and older snapshots
  // predate profile_pic entirely — which would leave the composer showing the
  // wrong/owner's avatar. Rehydrate the stored page from the Gateway once so the
  // identity avatar always reflects the Page's current picture; a failed or
  // empty lookup leaves the local copy untouched (guests / offline must not
  // lose their selection).
  useEffect(() => {
    if (!actingPage?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await gateway
          .from('pages')
          .select('id, name, cover_image, profile_pic')
          .eq('id', actingPage.id)
          .maybeSingle();
        if (cancelled || !data) return;
        const row = data as unknown as {
          id: string;
          name: string;
          cover_image: string | null;
          profile_pic: string | null;
        };
        const fresh: ActingPage = {
          id: row.id,
          name: row.name,
          cover_image: row.cover_image ?? null,
          profile_pic: row.profile_pic ?? null,
        };
        setActingPage(fresh);
        persist(fresh);
      } catch {
        // Keep the local snapshot; nothing the user can do about a failed sync.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run only when the selected page changes, not on every field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actingPage?.id]);

  return (
    <PageSwitchContext.Provider value={{ actingPage, switchToPage, switchToPersonal }}>
      {children}
    </PageSwitchContext.Provider>
  );
};

export const usePageSwitch = () => useContext(PageSwitchContext);
