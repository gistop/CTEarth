/**
 * 上传文本（GeoJSON/CSV/DBF）的字节解码策略。
 *
 * 浏览器 TextDecoder 默认按 UTF-8 解码，而国内工具导出的数据常见 GBK/GB2312 编码，
 * 直接按 UTF-8 解码会把中文变成乱码（地图标注、属性面板随之显示乱码）。
 * 这里按 BOM → 严格 UTF-8 → GBK 回退的顺序解码，尽量还原原始文本。
 */

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16_LE_BOM = [0xff, 0xfe];
const UTF16_BE_BOM = [0xfe, 0xff];

export function decodeTextBytes(bytes: Uint8Array): string {
  if (startsWith(bytes, UTF16_LE_BOM)) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }

  if (startsWith(bytes, UTF16_BE_BOM)) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  if (startsWith(bytes, UTF8_BOM)) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  if (isUtf8Compatible(bytes)) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  try {
    return new TextDecoder('gbk').decode(bytes);
  } catch {
    // 运行环境连 GBK 都不支持时，退回默认解码（至少不抛错）
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** 字节流能否被严格 UTF-8 解码；DBF/属性文本用它判断是否需要 GBK 回退 */
export function isUtf8Compatible(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}
