import { describe, expect, it } from "vitest";
import { applyTransform, compose, parseMatrix } from "./transform.js";
import type { Mat3, Vec3 } from "./transform.js";

describe("parseMatrix", () => {
  it("parses 12 space-separated numbers into a row-major 3x3 matrix plus translation", () => {
    const [R, T] = parseMatrix("1 0 0 0 1 0 0 0 1 10 20 30");
    expect(R).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(T).toEqual([10, 20, 30]);
  });

  it("parses a non-identity matrix correctly", () => {
    const [R, T] = parseMatrix("2 0 0 0 3 0 0 0 4 -5 6.5 0");
    expect(R).toEqual([
      [2, 0, 0],
      [0, 3, 0],
      [0, 0, 4],
    ]);
    expect(T).toEqual([-5, 6.5, 0]);
  });
});

describe("applyTransform", () => {
  it("applies an identity rotation plus translation", () => {
    const identity: Mat3 = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    expect(applyTransform([1, 2, 3], identity, [10, 20, 30])).toEqual([11, 22, 33]);
  });

  it("applies a diagonal scale matrix using the row-major v*R convention", () => {
    const scale: Mat3 = [
      [2, 0, 0],
      [0, 3, 0],
      [0, 0, 4],
    ];
    expect(applyTransform([1, 2, 3], scale, [0, 0, 0])).toEqual([2, 6, 12]);
  });
});

describe("compose", () => {
  it("combines two transforms so result(v) = transform1(transform2(v))", () => {
    const R1: Mat3 = [
      [2, 0, 0],
      [0, 2, 0],
      [0, 0, 2],
    ];
    const T1: Vec3 = [1, 0, 0];
    const R2: Mat3 = [
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 3],
    ];
    const T2: Vec3 = [0, 1, 0];

    const [R, T] = compose(R1, T1, R2, T2);
    expect(R).toEqual([
      [6, 0, 0],
      [0, 6, 0],
      [0, 0, 6],
    ]);
    expect(T).toEqual([1, 2, 0]);

    // Cross-check directly: transform1(transform2(v)) should equal applyTransform(v, R, T).
    const v: Vec3 = [5, 7, 9];
    const viaCompose = applyTransform(v, R, T);
    const viaSequential = applyTransform(applyTransform(v, R2, T2), R1, T1);
    expect(viaCompose).toEqual(viaSequential);
  });
});
