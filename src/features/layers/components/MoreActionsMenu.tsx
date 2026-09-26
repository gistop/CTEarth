import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Cloud, Database, EllipsisVertical, Layers, MapPlus, Plus, Save, X } from 'lucide-react';

export type VectorExportFormat = 'geojson' | 'geopackage';

// 工具栏位于 dockview 面板内，祖先节点均为 overflow: hidden，绝对定位的菜单会被裁在面板里。
// 因此菜单 portal 到 body 并用 fixed 定位，挂在触发按钮下方、向右展开（右侧是地图区）。
const MENU_MIN_WIDTH = 208;
const SUBMENU_MIN_WIDTH = 176;
const SUBMENU_OFFSET = 6;
const VIEWPORT_PADDING = 8;
const ANCHOR_GAP = 5;

type MenuPlacement = {
  top: number;
  left: number;
  /** 右侧空间不足时子菜单向左展开，避免超出视口 */
  flipSubmenu: boolean;
};

export function MoreActionsMenu({
  exportDisabled,
  onExport,
  onCreateMapGroup,
  onCreateBlankLayer,
  onAddBasemapToCurrentMapGroup,
  onUploadGeoParquetUrl,
  onUploadGeoTiffUrl,
}: {
  exportDisabled?: boolean;
  onExport: (format: VectorExportFormat) => void | Promise<void>;
  onCreateMapGroup: () => void | Promise<void>;
  onCreateBlankLayer: () => void | Promise<void>;
  onAddBasemapToCurrentMapGroup: () => void | Promise<void>;
  onUploadGeoParquetUrl: (url: string) => Promise<void>;
  onUploadGeoTiffUrl: (url: string) => Promise<void>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const [isRemoteDialogOpen, setIsRemoteDialogOpen] = useState(false);

  const placeMenu = useCallback(() => {
    const trigger = triggerRef.current;

    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth || MENU_MIN_WIDTH;
    const maxLeft = window.innerWidth - menuWidth - VIEWPORT_PADDING;
    const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, maxLeft));

    setPlacement({
      top: rect.bottom + ANCHOR_GAP,
      left,
      flipSubmenu: left + menuWidth + SUBMENU_OFFSET + SUBMENU_MIN_WIDTH > window.innerWidth - VIEWPORT_PADDING,
    });
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      // 菜单已 portal 到 body，不在 rootRef 内，需单独判断
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    // 首帧按最小宽度估算，渲染后再按实际宽度校正一次
    placeMenu();
    window.addEventListener('resize', placeMenu);

    return () => {
      window.removeEventListener('resize', placeMenu);
    };
  }, [isOpen, placeMenu]);

  const execute = async (action: () => void | Promise<void>) => {
    setIsOpen(false);

    try {
      await action();
    } catch (error) {
      console.error(error);
    }
  };

  const handleRemoteConfirm = async (url: string) => {
    try {
      if (isGeoTiffUrl(url)) {
        await onUploadGeoTiffUrl(url);
      } else {
        await onUploadGeoParquetUrl(url);
      }

      setIsRemoteDialogOpen(false);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div ref={rootRef} className={isOpen ? 'more-actions is-open' : 'more-actions'}>
      <button
        ref={triggerRef}
        className={isOpen ? 'more-actions-trigger is-open' : 'more-actions-trigger'}
        type="button"
        title="更多操作"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }

          placeMenu();
          setIsOpen(true);
        }}
      >
        <EllipsisVertical size={20} />
      </button>
      {isOpen && placement
        ? createPortal(
            <div
              ref={menuRef}
              className="more-actions-menu"
              role="menu"
              aria-label="更多操作"
              style={{ top: placement.top, left: placement.left }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  setIsRemoteDialogOpen(true);
                }}
              >
                <Cloud size={14} />
                <span>添加远程数据…</span>
              </button>
              <div className="more-actions-separator" role="separator" />
              <div className="has-submenu">
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  disabled={exportDisabled}
                >
                  <Save size={14} />
                  <span>另存为</span>
                  <ChevronRight size={14} />
                </button>
                <div
                  className={placement.flipSubmenu ? 'submenu is-flipped' : 'submenu'}
                  role="menu"
                  aria-label="另存为"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={exportDisabled}
                    onClick={() => {
                      void execute(() => onExport('geojson'));
                    }}
                  >
                    <Save size={14} />
                    <span>另存为 GeoJSON…</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={exportDisabled}
                    onClick={() => {
                      void execute(() => onExport('geopackage'));
                    }}
                  >
                    <Database size={14} />
                    <span>另存为 GeoPackage…</span>
                  </button>
                </div>
              </div>
              <div className="more-actions-separator" role="separator" />
              <div className="has-submenu">
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                >
                  <MapPlus size={14} />
                  <span>新建</span>
                  <ChevronRight size={14} />
                </button>
                <div
                  className={placement.flipSubmenu ? 'submenu is-flipped' : 'submenu'}
                  role="menu"
                  aria-label="新建"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void execute(onCreateMapGroup);
                    }}
                  >
                    <MapPlus size={14} />
                    <span>新建项目…</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void execute(onCreateBlankLayer);
                    }}
                  >
                    <Plus size={14} />
                    <span>新建空白 GeoJSON 图层…</span>
                  </button>
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void execute(onAddBasemapToCurrentMapGroup);
                }}
              >
                <Layers size={14} />
                <span>给当前地图添加底图…</span>
              </button>
            </div>,
            document.body,
          )
        : null}
      {isRemoteDialogOpen ? (
        <AddRemoteDataDialog onCancel={() => setIsRemoteDialogOpen(false)} onConfirm={handleRemoteConfirm} />
      ) : null}
    </div>
  );
}

/**
 * 添加远程数据对话框：复用删除确认/新建项目对话框的外壳与交互约定
 * （Esc 取消、Enter 提交、点击遮罩取消、关闭后焦点恢复）。
 */
function AddRemoteDataDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (url: string) => Promise<void>;
}) {
  const [remoteUrl, setRemoteUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef({ remoteUrl, isSubmitting });
  const callbacksRef = useRef({ onCancel, onConfirm });
  stateRef.current = { remoteUrl, isSubmitting };
  callbacksRef.current = { onCancel, onConfirm };

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        callbacksRef.current.onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElementRef.current?.focus();
    };
  }, []);

  const trimmedUrl = remoteUrl.trim();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!trimmedUrl || stateRef.current.isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await callbacksRef.current.onConfirm(trimmedUrl);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="delete-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          callbacksRef.current.onCancel();
        }
      }}
    >
      <section
        className="delete-dialog create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-remote-data-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="delete-dialog-header">
          <div className="delete-dialog-icon" aria-hidden="true">
            <Cloud size={20} strokeWidth={2.2} />
          </div>
          <div className="delete-dialog-heading">
            <h2 id="add-remote-data-dialog-title">添加远程数据</h2>
            <button type="button" className="delete-dialog-close" aria-label="关闭" title="关闭" onClick={onCancel}>
              <X size={18} />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="dialog-form">
            <label className="dialog-field">
              <span>远程地址</span>
              <input
                ref={inputRef}
                value={remoteUrl}
                type="url"
                placeholder="https://.../data.geoparquet 或 image.tif"
                onChange={(event) => setRemoteUrl(event.target.value)}
              />
            </label>
            <p className="dialog-note">支持 GeoParquet（.geoparquet / .parquet）与 COG/GeoTIFF（.tif / .tiff），按地址扩展名自动识别图层类型。</p>
          </div>
          <div className="delete-dialog-actions">
            <button type="button" className="delete-dialog-cancel" onClick={onCancel}>
              取消
            </button>
            <button
              type="submit"
              className="delete-dialog-confirm dialog-submit"
              disabled={!trimmedUrl || isSubmitting}
            >
              {isSubmitting ? '读取中…' : '添加'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function isGeoTiffUrl(value: string) {
  try {
    return /\\.(tif|tiff|geotiff)$/i.test(new URL(value).pathname);
  } catch {
    return /\\.(tif|tiff|geotiff)(?:[?#].*)?$/i.test(value);
  }
}
