import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? entry.name === 'testing' ? [] : files(join(directory, entry.name))
    : /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [join(directory, entry.name)] : []);
}
function imports(file: string) {
  return [...readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
}
function eagerPackages(file: string, visited = new Set<string>()): string[] {
  if (visited.has(file)) return [];
  visited.add(file);
  return [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].flatMap(match => {
    const dependency = match[1];
    if (!dependency.startsWith('.')) return [dependency];
    const base = resolve(dirname(file), dependency);
    const target = [base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')].find(existsSync);
    return target ? eagerPackages(target, visited) : [];
  });
}

describe('data-view module boundaries', () => {
  it.each(['attributes', 'charts'])('%s does not depend on the sibling UI, GIS store or Dockview', module => {
    const sibling = module === 'attributes' ? 'charts' : 'attributes';
    for (const file of files(join(sourceRoot, 'features', module))) {
      for (const dependency of imports(file)) expect(dependency, file).not.toMatch(new RegExp(`(^|/)${sibling}(/|$)|gisStore|dockview-react`));
    }
  });
  it('keeps shared data-view code independent of business features and engines', () => {
    for (const file of files(join(sourceRoot, 'shared', 'data-views'))) {
      imports(file).forEach(dependency => expect(dependency, file).not.toMatch(/features\/|gisStore|echarts|dockview|maplibre|^ol\//));
    }
  });
  it('does not eagerly load ECharts or the table engine through public entries', () => {
    for (const module of ['attributes', 'charts']) {
      expect(eagerPackages(join(sourceRoot, 'features', module, 'index.ts')).filter(dependency => /echarts|@tanstack/.test(dependency))).toEqual([]);
    }
  });
});
