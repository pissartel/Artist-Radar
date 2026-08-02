"use client";

import { createContext, useContext } from "react";

interface ProductFeaturesContextValue {
  // Developer-facing debug UI (Heads Up warnings panel, Raw JSON tab) —
  // server-derived (see lib/server/debugUI.ts), never computed client-side.
  debugUIVisible: boolean;
}

const ProductFeaturesContext = createContext<ProductFeaturesContextValue>({
  debugUIVisible: false,
});

interface ProductFeaturesProviderProps {
  debugUIVisible: boolean;
  children: React.ReactNode;
}

export default function ProductFeaturesProvider({ debugUIVisible, children }: ProductFeaturesProviderProps) {
  return (
    <ProductFeaturesContext.Provider value={{ debugUIVisible }}>
      {children}
    </ProductFeaturesContext.Provider>
  );
}

export function useProductFeatures(): ProductFeaturesContextValue {
  return useContext(ProductFeaturesContext);
}
