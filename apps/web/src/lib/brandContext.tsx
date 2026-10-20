import { hasBranding, type Branding } from '@quizup/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface PageBrand {
  branding: Branding | null;
  hero: boolean;
}

interface BrandContextValue extends PageBrand {
  focus: boolean;
  setPageBrand: (pageBrand: PageBrand) => void;
  setFocus: (focus: boolean) => void;
}

const NO_BRAND: PageBrand = { branding: null, hero: false };

const BrandContext = createContext<BrandContextValue>({
  ...NO_BRAND,
  focus: false,
  setPageBrand: () => undefined,
  setFocus: () => undefined,
});

export function BrandProvider({ children }: { children: ReactNode }) {
  const [pageBrand, setPageBrand] = useState<PageBrand>(NO_BRAND);
  const [focus, setFocus] = useState(false);
  const value = useMemo(
    () => ({ ...pageBrand, focus, setPageBrand, setFocus }),
    [pageBrand, focus],
  );
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): PageBrand {
  const { branding, hero } = useContext(BrandContext);
  return { branding, hero };
}

export function useFocus(): boolean {
  return useContext(BrandContext).focus;
}

export function usePageFocus(active: boolean): void {
  const { setFocus } = useContext(BrandContext);
  useEffect(() => {
    setFocus(active);
    return () => setFocus(false);
  }, [active, setFocus]);
}

export function usePageBrand(branding: Branding | null, hero = false): void {
  const { setPageBrand } = useContext(BrandContext);
  const key = hasBranding(branding) ? JSON.stringify(branding) : '';
  useEffect(() => {
    setPageBrand(key ? { branding: JSON.parse(key) as Branding, hero } : NO_BRAND);
    return () => setPageBrand(NO_BRAND);
  }, [key, hero, setPageBrand]);
}

export function hasVisibleBrand(branding: Branding | null): branding is Branding {
  return Boolean(branding && (branding.institutionName || branding.logoUrl));
}
