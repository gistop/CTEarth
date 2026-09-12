// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataViewProvider, useDataView } from './DataViewProvider';
import { createDataViewFilterStore } from './dataViewFilterStore';
import { createDataViewDataset } from './testing/dataViewFixtures';

afterEach(() => cleanup());
function Probe({ indexes = [1, 1, 0] }: { indexes?: number[] }) {
  const { select, filters, filter } = useDataView('roads');
  return <><button onClick={() => select('roads', indexes)}>Select</button><button onClick={() => filters.update('roads', { query: 'Beta' })}>Filter</button><output>{filter.query}</output></>;
}
describe('shared data-view provider', () => {
  it('deduplicates and copies selection requests and uses updated callbacks', () => {
    const first = vi.fn(); const second = vi.fn(); const dataset = createDataViewDataset(); const indexes = [1, 1, 0];
    const element = (onSelect: typeof first) => <DataViewProvider datasets={[dataset]} onSelect={onSelect}><Probe indexes={indexes} /></DataViewProvider>;
    const view = render(element(first)); fireEvent.click(screen.getByText('Select')); expect(first).toHaveBeenCalledWith('roads', [0, 1]);
    view.rerender(element(second)); fireEvent.click(screen.getByText('Select')); expect(second).toHaveBeenCalledWith('roads', [0, 1]); expect(indexes).toEqual([1, 1, 0]);
  });
  it('supports injected filter commands, prunes removals, and isolates provider instances', () => {
    const filters = createDataViewFilterStore(); const dataset = createDataViewDataset();
    const view = render(<DataViewProvider datasets={[dataset]} filters={filters}><Probe /></DataViewProvider>);
    fireEvent.click(screen.getByText('Filter')); expect(filters.get('roads').query).toBe('Beta');
    view.rerender(<DataViewProvider datasets={[]} filters={filters}><Probe /></DataViewProvider>); expect(filters.get('roads').query).toBe('');
    view.unmount(); render(<DataViewProvider datasets={[dataset]}><Probe /></DataViewProvider>); expect(screen.getByRole('status').textContent).toBe('');
  });
});
