import { describe, expect, it } from 'vitest';
import { compileAttributeFields, createAttributeFieldDraft } from './attributeFieldService';
import type { AttributeFieldDraft } from '../types';

const draft = (patch: Partial<AttributeFieldDraft> = {}): AttributeFieldDraft => ({ ...createAttributeFieldDraft([], 'draft'), ...patch });

describe('attribute field definitions', () => {
  it('suggests a unique name and normalizes names without changing text defaults', () => {
    expect(createAttributeFieldDraft(['Field_1', 'field_2'], 'next').name).toBe('field_3');
    expect(compileAttributeFields([draft({ name: ' 人口_2026 ', alias: ' 人口 ', defaultValue: '  abc  ' })], [])[0]).toEqual({
      name: '人口_2026', alias: '人口', type: 'text', nullable: true, defaultValue: '  abc  ', length: 255,
    });
  });

  it.each([
    ['integer', '2147483647', 2147483647], ['integer', '-2147483648', -2147483648],
    ['decimal', '1.25e2', 125], ['boolean', 'false', false], ['date', '2024-02-29', '2024-02-29'],
  ] as const)('parses a valid %s default', (type, value, expected) => {
    expect(compileAttributeFields([draft({ type, defaultValue: value, nullable: false })], [])[0]).toMatchObject({ defaultValue: expected, length: null });
  });

  it.each([
    { name: '' }, { name: '1field' }, { name: 'has space' }, { name: '__proto__' }, { name: 'constructor' },
    { type: 'integer', defaultValue: '2147483648' }, { type: 'integer', defaultValue: '1.5' },
    { type: 'decimal', defaultValue: 'Infinity' }, { type: 'decimal', defaultValue: '1e999' },
    { type: 'decimal', defaultValue: '0x10' }, { type: 'decimal', defaultValue: '   ' },
    { type: 'boolean', defaultValue: 'yes' }, { type: 'date', defaultValue: '2025-02-29' },
    { nullable: false, defaultValue: '' }, { length: '0' }, { length: '1.5' }, { length: '65536' },
    { length: '2', defaultValue: 'abc' }, { alias: 'a'.repeat(129) },
  ] satisfies Partial<AttributeFieldDraft>[])('rejects invalid input %j', patch => {
    expect(() => compileAttributeFields([draft(patch)], [])).toThrow();
  });

  it('rejects duplicate names against existing fields and within the batch', () => {
    expect(() => compileAttributeFields([draft({ name: 'Name' })], ['name'])).toThrow('已存在');
    expect(() => compileAttributeFields([draft(), draft({ id: 'other', name: 'FIELD_1' })], [])).toThrow('已存在');
    expect(() => compileAttributeFields([], [])).toThrow('至少一个字段');
  });

  it('keeps nullable defaults as null and counts Unicode characters for text length', () => {
    expect(compileAttributeFields([draft()], [])[0].defaultValue).toBeNull();
    expect(compileAttributeFields([draft({ defaultValue: '😀', length: '1' })], [])[0].defaultValue).toBe('😀');
  });
});
