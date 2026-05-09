import React, { createContext, useContext, useState, ReactNode } from 'react';

type Ctx = {
  menu: ReactNode | null;
  setMenu: (node: ReactNode | null) => void;
};

const HeaderAvatarMenuContext = createContext<Ctx>({ menu: null, setMenu: () => {} });

export const HeaderAvatarMenuProvider = ({ children }: { children: ReactNode }) => {
  const [menu, setMenu] = useState<ReactNode | null>(null);
  return (
    <HeaderAvatarMenuContext.Provider value={{ menu, setMenu }}>
      {children}
    </HeaderAvatarMenuContext.Provider>
  );
};

export const useHeaderAvatarMenu = () => useContext(HeaderAvatarMenuContext);