import { ArrowLeft, Play, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ToolDetailTabId } from '../types';

export function ToolDetailShell({
  activeTab,
  environment,
  isRunning,
  onBack,
  onChangeTab,
  onReset,
  onRun,
  parameters,
  runDisabled,
  title,
}: {
  activeTab: ToolDetailTabId;
  environment: ReactNode;
  isRunning: boolean;
  onBack: () => void;
  onChangeTab: (tab: ToolDetailTabId) => void;
  onReset: () => void;
  onRun: () => void;
  parameters: ReactNode;
  runDisabled: boolean;
  title: string;
}) {
  return (
    <section className="tool-detail">
      <div className="tool-detail-header">
        <button type="button" title="返回工具树" aria-label="返回工具树" onClick={onBack}>
          <ArrowLeft size={19} />
        </button>
        <h3>{title}</h3>
        <button type="button" title="工具选项" aria-label="工具选项">
          <SlidersHorizontal size={18} />
        </button>
      </div>
      <div className="tool-detail-tabs" role="tablist" aria-label={`${title}设置`}>
        <button
          className={activeTab === 'parameters' ? 'is-selected' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'parameters'}
          onClick={() => onChangeTab('parameters')}
        >
          参数
        </button>
        <button
          className={activeTab === 'environment' ? 'is-selected' : ''}
          type="button"
          role="tab"
          aria-selected={activeTab === 'environment'}
          onClick={() => onChangeTab('environment')}
        >
          环境
        </button>
      </div>
      <div className="tool-detail-body">
        {activeTab === 'parameters' ? parameters : environment}
      </div>
      <div className="tool-detail-actions">
        <button type="button" onClick={onReset}>重置</button>
        <button
          className="primary"
          type="button"
          disabled={runDisabled || isRunning}
          onClick={onRun}
        >
          <Play size={15} />
          <span>{isRunning ? '运行中' : '运行'}</span>
        </button>
      </div>
    </section>
  );
}
