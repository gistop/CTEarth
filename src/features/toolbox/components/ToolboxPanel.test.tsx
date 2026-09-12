// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ToolboxCatalog } from '../types';
import { ToolboxPanel } from './ToolboxPanel';

const catalog: ToolboxCatalog = {
  nodes: [{
    id: 'general',
    label: '通用',
    children: [{ id: 'example', label: '示例工具', toolId: 'example' }],
  }],
  tools: [{
    id: 'example',
    title: '示例工具',
    render: ({ onBack }) => <button type="button" onClick={onBack}>返回目录</button>,
  }],
};

describe('ToolboxPanel', () => {
  it('filters, opens, and returns from a registered tool', async () => {
    const user = userEvent.setup();
    render(<ToolboxPanel catalog={catalog} />);

    await user.type(screen.getByRole('textbox', { name: '搜索工具箱' }), '示例');
    await user.click(screen.getByRole('treeitem', { name: '示例工具' }));
    expect(screen.getByRole('button', { name: '返回目录' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '返回目录' }));
    expect(screen.getByRole('tree', { name: '工具箱目录' })).toBeTruthy();
  });
});
