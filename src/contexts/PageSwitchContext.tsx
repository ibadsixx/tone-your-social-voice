import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(page));
    } catch {}
  }, []);

  const switchToPersonal = useCallback(() => {
    setActingPage(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return (
    <PageSwitchContext.Provider value={{ actingPage, switchToPage, switchToPersonal }}>
      {children}
    </PageSwitchContext.Provider>
  );
};

export const usePageSwitch = () => useContext(PageSwitchContext);
