// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartCanvas } from './ChartCanvas';
import type { ChartModel } from '../types';

const createRuntime = vi.hoisted(() => vi.fn());
vi.mock('../adapters/echartsAdapter', () => ({ createEChartsRuntime: createRuntime }));
const model: ChartModel = { kind: 'bar', title: 'Values', categories: [{ name: 'A', value: 1 }], summary: '1 个分类' };
beforeEach(() => createRuntime.mockImplementation(() => ({ setModel: vi.fn(), resize: vi.fn(), dispose: vi.fn() })));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe('chart canvas lifecycle', () => {
  it('updates and clears the model without recreating the engine', () => {
    const view = render(<ChartCanvas model={model} />); const runtime = createRuntime.mock.results[0].value;
    const empty = { ...model, kind: 'empty' as const, summary: '没有可统计字段' }; view.rerender(<ChartCanvas model={empty} />);
    expect(runtime.setModel).toHaveBeenLastCalledWith(empty); expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(screen.getByText('没有可统计字段')).toBeTruthy(); view.unmount(); expect(runtime.dispose).toHaveBeenCalledTimes(1);
  });
  it('reports initialization errors and offers a working retry', () => {
    createRuntime.mockImplementationOnce(() => { throw new Error('Renderer unavailable'); });
    render(<ChartCanvas model={model} />); expect(screen.getByRole('alert').textContent).toContain('Renderer unavailable');
    fireEvent.click(screen.getByText('重试图表')); expect(screen.queryByRole('alert')).toBeNull(); expect(createRuntime.mock.results[1].value.setModel).toHaveBeenCalledWith(model);
  });
  it('reports render failures and disposes every StrictMode engine instance once', () => {
    const view = render(<StrictMode><ChartCanvas model={model} /></StrictMode>);
    expect(createRuntime).toHaveBeenCalledTimes(2);
    act(() => { createRuntime.mock.calls[1][1](new Error('Render failed')); }); expect(screen.getByRole('alert').textContent).toContain('Render failed');
    view.unmount(); createRuntime.mock.results.forEach(result => expect(result.value.dispose).toHaveBeenCalledTimes(1));
  });
});
