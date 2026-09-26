import type { ReactNode } from 'react';

/**
 * 图层工具栏图标。
 *
 * 风格与网格规格来自 font-gis（https://github.com/Viglino/font-gis ，作者 Jean-Marc Viglino）：
 * 100×100 网格、实心填充、圆角 3.5、主笔画宽 7、徽标圆 r17.5、加号臂宽 7。
 * 其中「添加本地数据」直接内联 font-gis v1.0.6 的 fg-layer-add 字形（图标授权 CC BY 4.0）；
 * 「保存」「属性表」该字体集里没有对应字形，按同样规格本地绘制。
 * 不引 webfont、不依赖 CDN，渲染尺寸走 size，100×100 只是内部坐标网格。
 */
type GisIconProps = {
  size?: number;
  className?: string;
};

function GisIcon({ size = 18, className, children }: GisIconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 添加本地数据：font-gis 的 fg-layer-add 字形（叠层 + 右上角加号徽标） */
export function AddLocalDataIcon(props: GisIconProps) {
  return (
    <GisIcon {...props}>
      <path d="M80.5 0c-7.145 0-13.252 4.246-15.977 10.357H28.135a3.5 3.5 0 00-2.668 1.235L.832 40.607a3.5 3.5 0 002.67 5.766l93-.064a3.5 3.5 0 002.666-5.766l-7.87-9.272C95.379 28.073 98 23.11 98 17.5 98 7.805 90.195 0 80.5 0zM77 5h7v9h9v7h-9v9h-7v-9h-9v-7h9V5zm12.91 46.313l-9.178.007 8.211 9.67-77.875.053 8.22-9.682-9.188.008L.832 62.283a3.5 3.5 0 002.67 5.766l93-.065a3.5 3.5 0 002.666-5.765L89.91 51.312zm0 21.593l-9.178.008 8.211 9.67-77.875.053 8.22-9.682-9.188.008L.832 83.877a3.5 3.5 0 002.67 5.766l93-.065a3.5 3.5 0 002.666-5.766L89.91 72.906z" />
    </GisIcon>
  );
}

/** 保存当前图层：软盘（右上角切角、顶部写保护口、底部标签均为镂空） */
export function SaveLayerIcon(props: GisIconProps) {
  return (
    <GisIcon {...props}>
      <path
        fillRule="evenodd"
        d="M68.5 3.5H7A3.5 3.5 0 0 0 3.5 7v86A3.5 3.5 0 0 0 7 96.5h86a3.5 3.5 0 0 0 3.5-3.5V31.5zM26 3.5h30v30H26zM22 58h56a3.5 3.5 0 0 1 3.5 3.5v25a3.5 3.5 0 0 1-3.5 3.5H22a3.5 3.5 0 0 1-3.5-3.5v-25A3.5 3.5 0 0 1 22 58z"
      />
    </GisIcon>
  );
}

/** 打开属性表：表格（表头带 + 两列三行，单元格镂空） */
export function AttributeTableIcon(props: GisIconProps) {
  return (
    <GisIcon {...props}>
      <path
        fillRule="evenodd"
        d="M7 3.5h86a3.5 3.5 0 0 1 3.5 3.5v86a3.5 3.5 0 0 1-3.5 3.5H7a3.5 3.5 0 0 1-3.5-3.5V7A3.5 3.5 0 0 1 7 3.5zM14 14h72v16H14zM14 36h33v12H14zM53 36h33v12H53zM14 54h33v12H14zM53 54h33v12H53zM14 72h33v12H14zM53 72h33v12H53z"
      />
    </GisIcon>
  );
}
