import { createContext, useContext, type ReactNode } from 'react';

export type AttributeSort = {
  field: string;
  direction: 'asc' | 'desc';
};

export type AttributeTableState = {
  query: string;
  showSelectedOnly: boolean;
  sort: AttributeSort | null;
};

export const defaultAttributeTableState: AttributeTableState = {
  query: '',
  showSelectedOnly: false,
  sort: null,
};

type AttributeTableContextValue = {
  getTableState: (layerId: string | null | undefined) => AttributeTableState;
  openAttributeChart: (layerId: string, layerName?: string, field?: string) => void;
  openAttributeTable: (layerId: string, layerName?: string) => void;
  updateTableState: (layerId: string, patch: Partial<AttributeTableState>) => void;
};

const AttributeTableContext = createContext<AttributeTableContextValue | null>(null);

export function AttributeTableProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AttributeTableContextValue;
}) {
  return (
    <AttributeTableContext.Provider value={value}>
      {children}
    </AttributeTableContext.Provider>
  );
}

export function useAttributeTable() {
  const value = useContext(AttributeTableContext);

  if (!value) {
    throw new Error('useAttributeTable must be used inside AttributeTableProvider');
  }

  return value;
}
