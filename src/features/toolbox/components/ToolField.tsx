import { FolderOpen, Settings } from 'lucide-react';

export function ToolField({
  label,
  required = false,
  action,
  children,
}: {
  label: string;
  required?: boolean;
  action?: 'folder' | 'settings';
  children: React.ReactNode;
}) {
  return (
    <label className="tool-field">
      <span>
        {required && <strong>*</strong>}
        {label}
      </span>
      <div className="tool-field-control">
        {children}
        {action === 'folder' && (
          <button type="button" title="浏览" aria-label={`浏览${label}`}>
            <FolderOpen size={17} />
          </button>
        )}
        {action === 'settings' && (
          <button type="button" title="设置" aria-label={`设置${label}`}>
            <Settings size={17} />
          </button>
        )}
      </div>
    </label>
  );
}
