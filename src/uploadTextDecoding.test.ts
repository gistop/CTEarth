import { describe, expect, it } from 'vitest';
import { decodeTextBytes, isUtf8Compatible } from './uploadTextDecoding';

describe('uploadTextDecoding', () => {
  it('按 UTF-8 解码中文文本', () => {
    expect(decodeTextBytes(new TextEncoder().encode('{"省":"黑龙江"}'))).toBe('{"省":"黑龙江"}');
  });

  it('GBK 字节回退解码为中文', () => {
    // “中文” 的 GBK 编码：D6 D0 CE C4
    expect(decodeTextBytes(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))).toBe('中文');
  });

  it('剥离 UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('省')]);
    expect(decodeTextBytes(bytes)).toBe('省');
  });

  it('识别 UTF-16 LE BOM', () => {
    // “中” U+4E2D 的小端字节
    expect(decodeTextBytes(new Uint8Array([0xff, 0xfe, 0x2d, 0x4e]))).toBe('中');
  });

  it('isUtf8Compatible 区分合法与非法 UTF-8 序列', () => {
    expect(isUtf8Compatible(new TextEncoder().encode('name,值'))).toBe(true);
    expect(isUtf8Compatible(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]))).toBe(false);
  });
});
