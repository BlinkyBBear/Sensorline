/**
 * Safe arithmetic expressions for Formula keys. No eval / Function: a small
 * tokenizer and recursive-descent parser build an AST that is evaluated with a
 * fixed set of operators and functions.
 *
 * Variables: a…h (inputs 1–8). Numbers: 12, 3.5, 1e3.
 * Operators: + - * / % ^ (power, right-assoc), unary -, parentheses.
 * Functions: min, max, avg, sum, abs, round(x[, digits]), floor, ceil, sqrt, clamp(x, lo, hi).
 */

export const VARIABLES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const MAX_LENGTH = 200;

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; x: Node }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "call"; fn: string; args: Node[] };

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

export class FormulaError extends Error {}

const FUNCTIONS: Record<string, { min: number; max: number; run: (xs: number[]) => number }> = {
  min: { min: 1, max: 8, run: (xs) => Math.min(...xs) },
  max: { min: 1, max: 8, run: (xs) => Math.max(...xs) },
  sum: { min: 1, max: 8, run: (xs) => xs.reduce((s, x) => s + x, 0) },
  avg: { min: 1, max: 8, run: (xs) => xs.reduce((s, x) => s + x, 0) / xs.length },
  abs: { min: 1, max: 1, run: ([x]) => Math.abs(x!) },
  floor: { min: 1, max: 1, run: ([x]) => Math.floor(x!) },
  ceil: { min: 1, max: 1, run: ([x]) => Math.ceil(x!) },
  sqrt: { min: 1, max: 1, run: ([x]) => Math.sqrt(x!) },
  round: { min: 1, max: 2, run: ([x, d = 0]) => { const p = 10 ** Math.max(0, Math.min(6, Math.round(d))); return Math.round(x! * p) / p; } },
  clamp: { min: 3, max: 3, run: ([x, lo, hi]) => Math.min(hi!, Math.max(lo!, x!)) },
};

function tokenize(src: string): Token[] {
  if (src.length > MAX_LENGTH) throw new FormulaError(`Formula is longer than ${MAX_LENGTH} characters`);
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i += 1; continue; }
    const num = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) { tokens.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { tokens.push({ t: "id", v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ("+-*/%^(),".includes(ch)) { tokens.push({ t: "op", v: ch }); i += 1; continue; }
    throw new FormulaError(`Unexpected character "${ch}" at ${i + 1}`);
  }
  return tokens;
}

/** Parses a formula into an AST. Throws FormulaError with a readable message. */
export function parse(src: string): Node {
  const tokens = tokenize(src);
  let pos = 0;
  let depth = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => { const t = peek(); return t?.t === "op" && t.v === v; };
  const expect = (v: string) => { if (!isOp(v)) throw new FormulaError(`Expected "${v}"`); pos += 1; };

  const expr = (): Node => {
    let l = term();
    while (isOp("+") || isOp("-")) { const op = (tokens[pos++] as { v: string }).v; l = { k: "bin", op, l, r: term() }; }
    return l;
  };
  const term = (): Node => {
    let l = unary();
    while (isOp("*") || isOp("/") || isOp("%")) { const op = (tokens[pos++] as { v: string }).v; l = { k: "bin", op, l, r: unary() }; }
    return l;
  };
  const unary = (): Node => {
    if (isOp("-")) { pos += 1; return { k: "neg", x: unary() }; }
    if (isOp("+")) { pos += 1; return unary(); }
    return power();
  };
  const power = (): Node => {
    const base = atom();
    if (isOp("^")) { pos += 1; return { k: "bin", op: "^", l: base, r: unary() }; }
    return base;
  };
  const atom = (): Node => {
    if ((depth += 1) > 32) throw new FormulaError("Formula is nested too deeply");
    try {
      const t = peek();
      if (!t) throw new FormulaError("Formula ended unexpectedly");
      if (t.t === "num") { pos += 1; return { k: "num", v: t.v }; }
      if (t.t === "op" && t.v === "(") { pos += 1; const e = expr(); expect(")"); return e; }
      if (t.t === "id") {
        pos += 1;
        if (isOp("(")) {
          const fn = FUNCTIONS[t.v];
          if (!fn) throw new FormulaError(`Unknown function "${t.v}"`);
          pos += 1;
          const args: Node[] = [];
          if (!isOp(")")) { args.push(expr()); while (isOp(",")) { pos += 1; args.push(expr()); } }
          expect(")");
          if (args.length < fn.min || args.length > fn.max) throw new FormulaError(`${t.v}() takes ${fn.min === fn.max ? fn.min : `${fn.min}–${fn.max}`} arguments`);
          return { k: "call", fn: t.v, args };
        }
        if (!(VARIABLES as readonly string[]).includes(t.v)) throw new FormulaError(`Unknown name "${t.v}" (use a–h)`);
        return { k: "var", name: t.v };
      }
      throw new FormulaError(`Unexpected "${t.v}"`);
    } finally {
      depth -= 1;
    }
  };

  if (tokens.length === 0) throw new FormulaError("Formula is empty");
  const tree = expr();
  if (pos < tokens.length) throw new FormulaError(`Unexpected "${(tokens[pos] as { v: unknown }).v}"`);
  return tree;
}

/** Variables used by an AST (for validation feedback). */
export function variablesOf(node: Node, out = new Set<string>()): Set<string> {
  if (node.k === "var") out.add(node.name);
  else if (node.k === "neg") variablesOf(node.x, out);
  else if (node.k === "bin") { variablesOf(node.l, out); variablesOf(node.r, out); }
  else if (node.k === "call") node.args.forEach((a) => variablesOf(a, out));
  return out;
}

/** Evaluates an AST. Returns null if a needed input is missing or the result is not finite. */
export function evaluate(node: Node, vars: Record<string, number | null | undefined>): number | null {
  const run = (n: Node): number => {
    switch (n.k) {
      case "num": return n.v;
      case "var": {
        const v = vars[n.name];
        if (v === null || v === undefined || !Number.isFinite(v)) throw new FormulaError(`Input ${n.name} has no value`);
        return v;
      }
      case "neg": return -run(n.x);
      case "bin": {
        const l = run(n.l), r = run(n.r);
        switch (n.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/": return l / r;
          case "%": return l % r;
          default: return l ** r;
        }
      }
      case "call": return FUNCTIONS[n.fn]!.run(n.args.map(run));
    }
  };
  try {
    const v = run(node);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Parse + evaluate in one go, with an error message instead of throwing. */
export function compute(src: string, vars: Record<string, number | null | undefined>): { value: number | null; error: string | null } {
  try {
    return { value: evaluate(parse(src), vars), error: null };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : String(e) };
  }
}
