import { describe, expect, it } from "vitest";
import { compute, evaluate, FormulaError, parse, variablesOf } from "../src/formula.js";

const v = { a: 10, b: 4, c: 2, d: -3, e: 0, f: 1.5, g: 100, h: 7 };

describe("formula parser", () => {
  it.each([
    ["1 + 2 * 3", 7],
    ["(1 + 2) * 3", 9],
    ["a - b - c", 4],
    ["a / b / c", 1.25],
    ["2 ^ 3 ^ 2", 512],
    ["-a ^ 2", -100],
    ["--a", 10],
    ["a % b", 2],
    ["max(a, b, c)", 10],
    ["min(a, b, d)", -3],
    ["avg(a, b, c, e)", 4],
    ["sum(a, b, c, d, e, f, g, h)", 121.5],
    ["abs(d)", 3],
    ["round(f)", 2],
    ["round(10 / 3, 2)", 3.33],
    ["clamp(g, 0, 50)", 50],
    ["sqrt(16) + floor(f) + ceil(f)", 7],
    ["1e3 / g", 10],
    [".5 * a", 5],
    ["A + B", 14],
  ])("%s = %d", (src, expected) => {
    expect(compute(src, v).value).toBeCloseTo(expected as number, 6);
  });

  it("lists the variables used", () => {
    expect([...variablesOf(parse("max(a, c) - h"))].sort()).toEqual(["a", "c", "h"]);
  });

  it.each([
    ["", "empty"],
    ["1 +", "ended"],
    ["(1 + 2", "Expected"],
    ["foo(1)", "Unknown function"],
    ["x + 1", "Unknown name"],
    ["1 2", "Unexpected"],
    ["a; process.exit()", "Unexpected character"],
    ["constructor", "Unknown name"],
    ["round()", "arguments"],
    ["clamp(1, 2)", "arguments"],
    ["a".repeat(201), "longer"],
  ])("rejects %j", (src, message) => {
    expect(() => parse(src)).toThrow(FormulaError);
    expect(compute(src, v).error).toMatch(message);
  });

  it("rejects deep nesting", () => {
    expect(compute("(".repeat(40) + "1" + ")".repeat(40), v).error).toMatch("nested");
  });

  it("returns null for missing inputs and non-finite results", () => {
    expect(compute("a + b", { a: 1 }).value).toBeNull();
    expect(compute("a / e", v).value).toBeNull();
    expect(compute("sqrt(d)", v).value).toBeNull();
    expect(evaluate(parse("a"), { a: null })).toBeNull();
  });

  it("never evaluates code", () => {
    for (const src of ["this", "globalThis", "a.constructor", "a[0]", "`x`", "a => a", "eval(1)", "Function(1)"]) {
      expect(compute(src, v).value).toBeNull();
      expect(compute(src, v).error).not.toBeNull();
    }
  });
});
