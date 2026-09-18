export type RasterCalculatorSource = {
  name: string;
  width: number;
  height: number;
  geoTransform: number[];
  nodata?: number;
  epsg?: number;
  pixels: Float64Array;
};

export type RasterCalculatorPlan = {
  width: number;
  height: number;
  geoTransform: number[];
  epsg?: number;
  nodata?: number;
  referencedNames: string[];
  evaluate(): { pixels: Float64Array; validCount: number };
};

export type RasterCalculatorValidation = { ok: true; referencedNames: string[] };
export type RasterCalculatorRejection = { ok: false; error: string };

type Evaluator = (index: number) => number;

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'raster'; name: string }
  | { kind: 'unary'; op: '-' | '!'; operand: Node }
  | { kind: 'binary'; op: BinaryOperator; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] };

type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';

type Token =
  | { type: 'number'; value: number; position: number }
  | { type: 'raster'; name: string; position: number }
  | { type: 'ident'; name: string; position: number }
  | { type: 'punct'; value: string; position: number };

const FUNCTION_ARITY: Record<string, [number, number]> = {
  abs: [1, 1],
  sqrt: [1, 1],
  ln: [1, 1],
  log: [1, 2],
  log10: [1, 1],
  exp: [1, 1],
  pow: [2, 2],
  min: [1, 8],
  max: [1, 8],
  floor: [1, 1],
  ceil: [1, 1],
  round: [1, 1],
  con: [2, 3],
  isnull: [1, 1],
};

const TWO_CHAR_OPERATORS = ['||', '&&', '==', '!=', '<=', '>='];
const SINGLE_CHAR_OPERATORS = '+-*/%()<>,!';

export function validateRasterExpression(
  expression: string,
  sources: ReadonlyArray<RasterCalculatorSource>,
): RasterCalculatorValidation | RasterCalculatorRejection {
  try {
    const analysis = analyzeRasterExpression(expression, sources);
    return { ok: true, referencedNames: analysis.referencedNames };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function planRasterCalculator(
  expression: string,
  sources: ReadonlyArray<RasterCalculatorSource>,
): { ok: true; plan: RasterCalculatorPlan } | RasterCalculatorRejection {
  let analysis: { node: Node; sourceByName: Map<string, RasterCalculatorSource>; referenced: RasterCalculatorSource[]; referencedNames: string[] };
  try {
    analysis = analyzeRasterExpression(expression, sources);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const anchor = analysis.referenced[0];
  const cleanedPixels = new WeakMap<RasterCalculatorSource, Float64Array>();
  const resolve = (name: string): Float64Array => {
    const source = analysis.sourceByName.get(name) ?? resolveRasterSource(name, sources);
    let pixels = cleanedPixels.get(source);
    if (!pixels) {
      pixels = cleanSourcePixels(source);
      cleanedPixels.set(source, pixels);
    }
    return pixels;
  };
  const root = compileNode(analysis.node, resolve);
  const outputNodata = commonNodata(analysis.referenced);

  return {
    ok: true,
    plan: {
      width: anchor.width,
      height: anchor.height,
      geoTransform: anchor.geoTransform,
      epsg: anchor.epsg,
      nodata: outputNodata,
      referencedNames: analysis.referencedNames,
      evaluate: () => {
        const pixels = new Float64Array(anchor.width * anchor.height);
        pixels.fill(outputNodata ?? Number.NaN);
        let validCount = 0;
        for (let index = 0; index < pixels.length; index++) {
          const value = root(index);
          if (Number.isFinite(value) && value !== outputNodata) {
            pixels[index] = value;
            validCount++;
          }
        }
        return { pixels, validCount };
      },
    },
  };
}

function analyzeRasterExpression(expression: string, sources: ReadonlyArray<RasterCalculatorSource>) {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error('请输入地图代数表达式。');
  }

  const node = parseRasterExpression(trimmed);
  checkFunctionCalls(node);

  const referenced: RasterCalculatorSource[] = [];
  const referencedNames: string[] = [];
  const sourceByName = new Map<string, RasterCalculatorSource>();
  collectRasterReferences(node, (name) => {
    if (sourceByName.has(name)) {
      return;
    }
    const source = resolveRasterSource(name, sources);
    if (referenced.length > 0) {
      ensureSameGrid(referenced[0], source, name);
    }
    referenced.push(source);
    referencedNames.push(name);
    sourceByName.set(name, source);
  });

  if (referenced.length === 0) {
    throw new Error('表达式至少需要引用一个栅格，例如 "dem.tif" * 2。');
  }

  return { node, sourceByName, referenced, referencedNames };
}

function parseRasterExpression(expression: string): Node {
  const tokens = tokenize(expression);
  let position = 0;

  const fail = (message: string): never => {
    throw new Error(`表达式语法错误：${message}`);
  };
  const peek = () => tokens[position];
  const isPunct = (value: string) => {
    const token = tokens[position];
    return token?.type === 'punct' && token.value === value;
  };
  const describe = (token: Token | undefined) => {
    if (!token) {
      return '表达式结尾';
    }
    if (token.type === 'punct') {
      return `"${token.value}"`;
    }
    if (token.type === 'number') {
      return `数字 ${token.value}`;
    }
    return `"${token.name}"`;
  };
  const expectPunct = (value: string) => {
    if (!isPunct(value)) {
      fail(`期望 "${value}"，但遇到 ${describe(peek())}。`);
    }
    position++;
  };

  function parseOr(): Node {
    let left = parseAnd();
    while (isPunct('||')) {
      position++;
      left = { kind: 'binary', op: '||', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): Node {
    let left = parseEquality();
    while (isPunct('&&')) {
      position++;
      left = { kind: 'binary', op: '&&', left, right: parseEquality() };
    }
    return left;
  }

  function parseEquality(): Node {
    let left = parseComparison();
    while (isPunct('==') || isPunct('!=')) {
      const op = (peek() as { value: BinaryOperator }).value;
      position++;
      left = { kind: 'binary', op, left, right: parseComparison() };
    }
    return left;
  }

  function parseComparison(): Node {
    let left = parseAdditive();
    while (isPunct('<') || isPunct('<=') || isPunct('>') || isPunct('>=')) {
      const op = (peek() as { value: BinaryOperator }).value;
      position++;
      left = { kind: 'binary', op, left, right: parseAdditive() };
    }
    return left;
  }

  function parseAdditive(): Node {
    let left = parseMultiplicative();
    while (isPunct('+') || isPunct('-')) {
      const op = (peek() as { value: BinaryOperator }).value;
      position++;
      left = { kind: 'binary', op, left, right: parseMultiplicative() };
    }
    return left;
  }

  function parseMultiplicative(): Node {
    let left = parseUnary();
    while (isPunct('*') || isPunct('/') || isPunct('%')) {
      const op = (peek() as { value: BinaryOperator }).value;
      position++;
      left = { kind: 'binary', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary(): Node {
    if (isPunct('-')) {
      position++;
      return { kind: 'unary', op: '-', operand: parseUnary() };
    }
    if (isPunct('!')) {
      position++;
      return { kind: 'unary', op: '!', operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const token = peek();
    if (!token) {
      fail('表达式不完整。');
    }
    if (token.type === 'number') {
      position++;
      return { kind: 'number', value: token.value };
    }
    if (token.type === 'raster') {
      position++;
      return { kind: 'raster', name: token.name };
    }
    if (token.type === 'ident') {
      position++;
      if (!isPunct('(')) {
        fail(`栅格名称需要写在双引号内（例如 "${token.name}"），函数调用需要括号（例如 ${token.name}(x)）。`);
      }
      position++;
      const args: Node[] = [];
      if (!isPunct(')')) {
        args.push(parseOr());
        while (isPunct(',')) {
          position++;
          args.push(parseOr());
        }
      }
      expectPunct(')');
      return { kind: 'call', name: token.name, args };
    }
    if (isPunct('(')) {
      position++;
      const node = parseOr();
      expectPunct(')');
      return node;
    }
    return fail(`意外的符号 ${describe(token)}。`);
  }

  const node = parseOr();
  if (position < tokens.length) {
    fail(`表达式末尾有多余内容 ${describe(peek())}。`);
  }
  return node;
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const fail = (message: string): never => {
    throw new Error(`表达式语法错误：${message}`);
  };

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
    if (char === '"' || char === "'") {
      const end = expression.indexOf(char, index + 1);
      if (end < 0) {
        fail('栅格名称的引号没有闭合。');
      }
      const name = expression.slice(index + 1, end).trim();
      if (!name) {
        fail('引号内没有栅格名称。');
      }
      tokens.push({ type: 'raster', name, position: index });
      index = end + 1;
      continue;
    }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(expression[index + 1] ?? ''))) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(expression.slice(index));
      tokens.push({ type: 'number', value: Number(match?.[0]), position: index });
      index += match?.[0].length ?? 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expression.slice(index));
      tokens.push({ type: 'ident', name: match?.[0] ?? char, position: index });
      index += match?.[0].length ?? 1;
      continue;
    }
    const two = expression.slice(index, index + 2);
    if (TWO_CHAR_OPERATORS.includes(two)) {
      tokens.push({ type: 'punct', value: two, position: index });
      index += 2;
      continue;
    }
    if (SINGLE_CHAR_OPERATORS.includes(char)) {
      tokens.push({ type: 'punct', value: char, position: index });
      index++;
      continue;
    }
    fail(`无法识别的字符"${char}"。`);
  }
  return tokens;
}

function checkFunctionCalls(node: Node) {
  if (node.kind === 'call') {
    const arity = FUNCTION_ARITY[node.name];
    if (!arity) {
      throw new Error(`不支持的函数：${node.name}。支持的函数：${Object.keys(FUNCTION_ARITY).join('、')}。`);
    }
    if (node.args.length < arity[0] || node.args.length > arity[1]) {
      const expected = arity[0] === arity[1] ? `${arity[0]}` : `${arity[0]} 到 ${arity[1]}`;
      throw new Error(`函数 ${node.name} 需要 ${expected} 个参数，实际收到 ${node.args.length} 个。`);
    }
    node.args.forEach(checkFunctionCalls);
    return;
  }
  if (node.kind === 'unary') {
    checkFunctionCalls(node.operand);
    return;
  }
  if (node.kind === 'binary') {
    checkFunctionCalls(node.left);
    checkFunctionCalls(node.right);
  }
}

function collectRasterReferences(node: Node, visit: (name: string) => void) {
  if (node.kind === 'raster') {
    visit(node.name);
    return;
  }
  if (node.kind === 'unary') {
    collectRasterReferences(node.operand, visit);
    return;
  }
  if (node.kind === 'binary') {
    collectRasterReferences(node.left, visit);
    collectRasterReferences(node.right, visit);
    return;
  }
  if (node.kind === 'call') {
    node.args.forEach((arg) => collectRasterReferences(arg, visit));
  }
}

function resolveRasterSource(name: string, sources: ReadonlyArray<RasterCalculatorSource>): RasterCalculatorSource {
  const exact = sources.find((source) => source.name === name);
  if (exact) {
    return exact;
  }
  const base = baseRasterName(name);
  const relaxed = sources.filter((source) => baseRasterName(source.name) === base);
  if (relaxed.length > 0) {
    return relaxed[0];
  }
  const available = sources.slice(0, 8).map((source) => `"${source.name}"`).join('、');
  throw new Error(`表达式中引用的栅格不存在："${name}"。${sources.length > 0 ? `可用栅格：${available}${sources.length > 8 ? ' 等' : ''}。` : '请先添加 GeoTIFF 栅格。'}`);
}

function baseRasterName(name: string) {
  return name.replace(/\.(tif|tiff)$/i, '');
}

function ensureSameGrid(anchor: RasterCalculatorSource, source: RasterCalculatorSource, name: string) {
  const gridLabel = (candidate: RasterCalculatorSource) => `${candidate.width} x ${candidate.height}`;
  if (anchor.width !== source.width || anchor.height !== source.height) {
    throw new Error(`栅格 "${name}" 的尺寸（${gridLabel(source)}）与 "${anchor.name}"（${gridLabel(anchor)}）不一致，无法逐像元计算。`);
  }
  if (!sameGeoTransform(anchor.geoTransform, source.geoTransform)) {
    throw new Error(`栅格 "${name}" 与 "${anchor.name}" 的地理网格（GeoTransform）不一致，无法逐像元计算。`);
  }
}

function sameGeoTransform(left: number[], right: number[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => Math.abs(value - right[index]) <= 1e-9 * Math.max(1, Math.abs(value)));
}

function commonNodata(referenced: readonly RasterCalculatorSource[]) {
  const values = referenced.map((source) => source.nodata);
  if (values.some((value) => value === undefined)) {
    return undefined;
  }
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

function cleanSourcePixels(source: RasterCalculatorSource): Float64Array {
  const pixels = source.pixels;
  const cleaned = new Float64Array(pixels.length);
  for (let index = 0; index < pixels.length; index++) {
    const value = pixels[index];
    cleaned[index] = source.nodata !== undefined && value === source.nodata ? Number.NaN : value;
  }
  return cleaned;
}

function compileNode(node: Node, resolve: (name: string) => Float64Array): Evaluator {
  switch (node.kind) {
    case 'number': {
      const value = node.value;
      return () => value;
    }
    case 'raster': {
      const pixels = resolve(node.name);
      return (index) => pixels[index];
    }
    case 'unary': {
      const operand = compileNode(node.operand, resolve);
      if (node.op === '-') {
        return (index) => -operand(index);
      }
      return (index) => {
        const value = operand(index);
        return Number.isNaN(value) ? Number.NaN : value === 0 ? 1 : 0;
      };
    }
    case 'binary': {
      return compileBinary(node, resolve);
    }
    case 'call': {
      return compileCall(node, resolve);
    }
  }
}

function compileBinary(node: Extract<Node, { kind: 'binary' }>, resolve: (name: string) => Float64Array): Evaluator {
  const left = compileNode(node.left, resolve);
  const right = compileNode(node.right, resolve);
  switch (node.op) {
    case '+':
      return (index) => left(index) + right(index);
    case '-':
      return (index) => left(index) - right(index);
    case '*':
      return (index) => left(index) * right(index);
    case '/':
    case '%':
      return (index) => {
        const divisor = right(index);
        if (divisor === 0) {
          return Number.NaN;
        }
        return node.op === '/' ? left(index) / divisor : left(index) % divisor;
      };
    case '<':
    case '<=':
    case '>':
    case '>=':
    case '==':
    case '!=': {
      const compare = COMPARISONS[node.op];
      return (index) => {
        const a = left(index);
        const b = right(index);
        return Number.isNaN(a) || Number.isNaN(b) ? Number.NaN : compare(a, b);
      };
    }
    case '&&':
      return (index) => {
        const a = left(index);
        const b = right(index);
        return Number.isNaN(a) || Number.isNaN(b) ? Number.NaN : a !== 0 && b !== 0 ? 1 : 0;
      };
    case '||':
      return (index) => {
        const a = left(index);
        const b = right(index);
        return Number.isNaN(a) || Number.isNaN(b) ? Number.NaN : a !== 0 || b !== 0 ? 1 : 0;
      };
  }
}

const COMPARISONS: Record<string, (a: number, b: number) => number> = {
  '<': (a, b) => (a < b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0),
  '>': (a, b) => (a > b ? 1 : 0),
  '>=': (a, b) => (a >= b ? 1 : 0),
  '==': (a, b) => (a === b ? 1 : 0),
  '!=': (a, b) => (a !== b ? 1 : 0),
};

function compileCall(node: Extract<Node, { kind: 'call' }>, resolve: (name: string) => Float64Array): Evaluator {
  const args = node.args.map((arg) => compileNode(arg, resolve));
  const map1 = (fn: (value: number) => number): Evaluator => {
    const [value] = args;
    return (index) => fn(value(index));
  };
  const mapFinite2 = (fn: (a: number, b: number) => number): Evaluator => {
    const [a, b] = args;
    return (index) => {
      const left = a(index);
      const right = b(index);
      return Number.isNaN(left) || Number.isNaN(right) ? Number.NaN : fn(left, right);
    };
  };
  const mapVariadic = (fn: (a: number, b: number) => number): Evaluator => (index) => {
    let result = args[0](index);
    for (let position = 1; position < args.length; position++) {
      const value = args[position](index);
      if (Number.isNaN(result) || Number.isNaN(value)) {
        return Number.NaN;
      }
      result = fn(result, value);
    }
    return result;
  };

  switch (node.name) {
    case 'con': {
      const [condition, onTrue, onFalse] = args;
      return (index) => {
        const flag = condition(index);
        if (Number.isNaN(flag)) {
          return Number.NaN;
        }
        return flag !== 0 ? onTrue(index) : onFalse ? onFalse(index) : Number.NaN;
      };
    }
    case 'isnull': {
      const [value] = args;
      return (index) => (Number.isNaN(value(index)) ? 1 : 0);
    }
    case 'abs':
      return map1(Math.abs);
    case 'sqrt':
      return map1(Math.sqrt);
    case 'ln':
      return map1(Math.log);
    case 'log10':
      return map1(Math.log10);
    case 'exp':
      return map1(Math.exp);
    case 'floor':
      return map1(Math.floor);
    case 'ceil':
      return map1(Math.ceil);
    case 'round':
      return map1(Math.round);
    case 'log':
      return args.length === 1 ? map1(Math.log10) : mapFinite2((value, base) => Math.log(value) / Math.log(base));
    case 'pow':
      return mapFinite2(Math.pow);
    case 'min':
      return mapVariadic(Math.min);
    case 'max':
      return mapVariadic(Math.max);
    default:
      throw new Error(`不支持的函数：${node.name}。`);
  }
}
