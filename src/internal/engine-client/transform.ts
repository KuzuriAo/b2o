export type Vec3 = [number, number, number];
export type Mat3 = [Vec3, Vec3, Vec3];

/**
 * Parse a 3MF transform string: 12 space-separated numbers -- row-major
 * 3x3 rotation/scale matrix (rows 0-2) then a translation (last 3).
 *
 * Ported from `parse_matrix` in bbs2u1.py (lines 376-382).
 */
export function parseMatrix(transformStr: string): [Mat3, Vec3] {
  const t = transformStr.split(/\s+/).filter(Boolean).map(Number);
  const R: Mat3 = [
    [t[0], t[1], t[2]],
    [t[3], t[4], t[5]],
    [t[6], t[7], t[8]],
  ];
  const T: Vec3 = [t[9], t[10], t[11]];
  return [R, T];
}

/**
 * Apply an (R, T) affine transform to a 3-vector using Bambu's row-major
 * convention: `v * R + T`, not `R * v`.
 *
 * Ported from `apply_transform` in bbs2u1.py (lines 385-391).
 */
export function applyTransform(v: Vec3, R: Mat3, T: Vec3): Vec3 {
  const [x, y, z] = v;
  return [
    R[0][0] * x + R[1][0] * y + R[2][0] * z + T[0],
    R[0][1] * x + R[1][1] * y + R[2][1] * z + T[1],
    R[0][2] * x + R[1][2] * y + R[2][2] * z + T[2],
  ];
}

/**
 * Combine two transforms so `result(v) = transform1(transform2(v))` --
 * i.e. combine an item's plate-placement transform with a sub-component's
 * own transform.
 *
 * Ported from `compose` in bbs2u1.py (lines 394-399).
 */
export function compose(R1: Mat3, T1: Vec3, R2: Mat3, T2: Vec3): [Mat3, Vec3] {
  const R = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) => [0, 1, 2].reduce((sum, k) => sum + R2[i][k] * R1[k][j], 0)),
  ) as Mat3;
  const T = applyTransform(T2, R1, T1);
  return [R, T];
}
