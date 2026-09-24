import * as THREE from 'three';
import type { LensGeometry } from '../types';

export interface BuildStack {
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

/**
 * 参考剖面图实测（u = z/L，u=0 卡口，u=1 前口）。
 * 轮廓为连续收锥 + 中段平台，镜组中心与图中色块对齐。
 */
export const AXIAL = {
  /** 外壳关键点：[u, 半径/D_front] —— 峰值在前口约 0.50 */
  profile: [
    [0.0, 0.175],
    [0.05, 0.205],
    [0.1, 0.25],
    [0.15, 0.285],
    [0.2, 0.29],
    [0.25, 0.31],
    [0.3, 0.335],
    [0.5, 0.335],
    [0.55, 0.365],
    [0.65, 0.4],
    [0.75, 0.445],
    [0.85, 0.475],
    [0.9, 0.5],
    [0.95, 0.485],
    [1.0, 0.48],
  ] as ReadonlyArray<readonly [number, number]>,
  /** 镜组中心 u（实测色块） */
  elFront: 0.95,
  elYellow: [0.47, 0.5, 0.53] as const,
  elOrange: 0.42,
  elClear: [0.36, 0.39] as const,
  elGreen: [0.12, 0.16, 0.2] as const,
  elPlate: 0.08,
  /** 环 / 套环 / 滤镜槽 位置（沿流畅筒身装饰，不打断轮廓） */
  ringFocus: [0.45, 0.58] as const,
  ringFunc: [0.58, 0.63] as const,
  collar: [0.28, 0.4] as const,
  foot: 0.32,
  filterSlot: 0.06,
  badge: 0.78,
  hoodBand: [0.88, 1.0] as const,
} as const;

/** 兼容旧测试名：镜组中心 */
export const ELEMENT_U = {
  elFront: AXIAL.elFront,
  elYellow: AXIAL.elYellow,
  elOrange: AXIAL.elOrange,
  elClear: AXIAL.elClear,
  elGreen: AXIAL.elGreen,
  elPlate: AXIAL.elPlate,
} as const;

const WHITE = 0xd4d0c8;
const WHITE_HI = 0xe6e2da;
const BLACK = 0x15161a;
const METAL = 0xb0b8c4;
const G_BADGE = 0xe35b1e;
const EL_YELLOW = 0xe6c84c;
const EL_ORANGE = 0xe07840;
const EL_CLEAR = 0xe8f2f8;
const EL_GREEN = 0x7dcea0;
const EL_PLATE = 0xd0d8e0;

function uZ(u: number, L: number): number {
  return u * L;
}

function tube(
  rFront: number,
  rRear: number,
  len: number,
  mat: THREE.Material,
  radial = 48,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rFront, rRear, len, radial, 1, false), mat);
  m.rotation.x = Math.PI / 2;
  return m;
}

function pushMesh(stack: BuildStack, parent: THREE.Group, mesh: THREE.Mesh, z: number): void {
  mesh.position.z = z;
  mesh.frustumCulled = false;
  parent.add(mesh);
  stack.geometries.push(mesh.geometry);
  const mat = mesh.material;
  if (Array.isArray(mat)) stack.materials.push(...mat);
  else stack.materials.push(mat);
}

/** 在 u 处取轮廓半径 / D_front（线性插值控制点） */
export function profileRadius(u: number): number {
  const pts = AXIAL.profile;
  const t = Math.min(1, Math.max(0, u));
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [u0, r0] = pts[i];
    const [u1, r1] = pts[i + 1];
    if (t >= u0 && t <= u1) {
      const k = u1 === u0 ? 0 : (t - u0) / (u1 - u0);
      return r0 + (r1 - r0) * k;
    }
  }
  return pts[pts.length - 1][1];
}

/** 连续收锥筒身：按轮廓采样拼圆台，保证侧影流畅 */
function loftBarrel(
  stack: BuildStack,
  parent: THREE.Group,
  L: number,
  dF: number,
  mat: THREE.Material,
  u0: number,
  u1: number,
  steps = 24,
  radiusScale = 1,
): void {
  for (let i = 0; i < steps; i += 1) {
    const a = u0 + ((i + 0) / steps) * (u1 - u0);
    const b = u0 + ((i + 1) / steps) * (u1 - u0);
    const rA = profileRadius(a) * dF * radiusScale;
    const rB = profileRadius(b) * dF * radiusScale;
    const len = Math.max(0.3, (b - a) * L);
    const zc = uZ(a, L) + len / 2;
    pushMesh(stack, parent, tube(rB, rA, len, mat, 40), zc);
  }
}

function knurlBand(
  stack: BuildStack,
  parent: THREE.Group,
  dF: number,
  u0: number,
  u1: number,
  L: number,
  tooth = 0.65,
): void {
  const rMid = profileRadius((u0 + u1) / 2) * dF + 0.35;
  const len = Math.max(0.4, (u1 - u0) * L);
  const zc = uZ(u0, L) + len / 2;
  const mat = new THREE.MeshStandardMaterial({ color: BLACK, metalness: 0.06, roughness: 0.92 });
  stack.materials.push(mat);
  pushMesh(stack, parent, tube(rMid, rMid, len, mat, 48), zc);
  const toothGeo = new THREE.BoxGeometry(tooth, len * 0.9, tooth * 2);
  stack.geometries.push(toothGeo);
  const count = 48;
  const inst = new THREE.InstancedMesh(toothGeo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * (rMid + tooth * 0.05), Math.sin(a) * (rMid + tooth * 0.05), zc);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  parent.add(inst);
}

/** 300mm+ 外壳：连续收锥侧影（对齐参考剖面）+ GM 装饰件 */
export function buildSuperTeleShell(
  parent: THREE.Group,
  geo: LensGeometry,
  stack: BuildStack,
): void {
  const L = geo.lengthTotal;
  const dF = geo.dFront;
  const mountSeg = geo.segments.find((s) => s.kind === 'mount');
  const mountD = mountSeg?.diameter ?? geo.dRear;

  const white = new THREE.MeshStandardMaterial({ color: WHITE, metalness: 0.14, roughness: 0.52 });
  const whiteHi = new THREE.MeshStandardMaterial({ color: WHITE_HI, metalness: 0.1, roughness: 0.48 });
  const black = new THREE.MeshStandardMaterial({ color: BLACK, metalness: 0.08, roughness: 0.72 });
  const metal = new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.88, roughness: 0.28 });
  stack.materials.push(white, whiteHi, black, metal);

  // 主筒身：连续收锥
  loftBarrel(stack, parent, L, dF, white, 0.02, AXIAL.hoodBand[0], 28);
  // 黑遮光段（略加粗外罩）
  loftBarrel(stack, parent, L, dF, black, AXIAL.hoodBand[0], 1.0, 8, 1.03);
  // 罩口内遮光
  const rh = profileRadius(0.96) * dF;
  pushMesh(stack, parent, tube(rh * 0.72, rh * 0.68, L * 0.02, black), uZ(0.96, L));

  // 卡口
  const rMount = Math.max(mountD * 0.5, profileRadius(0) * dF);
  pushMesh(stack, parent, tube(rMount, rMount * 0.9, Math.max(8, L * 0.025), metal), uZ(0.012, L));
  pushMesh(stack, parent, tube(rMount * 0.5, rMount * 0.5, 1.2, black), 0.6);

  // 插入式滤镜槽
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x4a4c52, metalness: 0.35, roughness: 0.5 });
  stack.materials.push(slotMat);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(4.5, 11, L * 0.03), slotMat);
  slot.position.set(0, profileRadius(AXIAL.filterSlot) * dF * 0.7, uZ(AXIAL.filterSlot, L));
  parent.add(slot);
  stack.geometries.push(slot.geometry);

  // G 徽标
  const badgeMat = new THREE.MeshStandardMaterial({ color: G_BADGE, metalness: 0.15, roughness: 0.45 });
  stack.materials.push(badgeMat);
  const rBadge = profileRadius(AXIAL.badge) * dF;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 1.4), badgeMat);
  badge.position.set(0, rBadge * 0.95, uZ(AXIAL.badge, L));
  parent.add(badge);
  stack.geometries.push(badge.geometry);

  // 功能环 + 对焦环
  knurlBand(stack, parent, dF, AXIAL.ringFunc[0], AXIAL.ringFunc[1], L, 0.5);
  knurlBand(stack, parent, dF, AXIAL.ringFocus[0], AXIAL.ringFocus[1], L, 0.75);

  // 对焦锁定
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 3, 16), black);
  btn.rotation.z = Math.PI / 2;
  btn.position.set(0, -profileRadius(0.5) * dF, uZ(0.5, L));
  parent.add(btn);
  stack.geometries.push(btn.geometry);
  stack.materials.push(black);

  // 三脚架套环（沿流畅筒身，不打断侧影）
  const rCol = profileRadius(AXIAL.foot) * dF + 0.8;
  pushMesh(
    stack,
    parent,
    tube(rCol, rCol, Math.max(8, L * 0.03), whiteHi),
    uZ((AXIAL.collar[0] + AXIAL.collar[1]) / 2, L),
  );
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 4.5, 20), whiteHi);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(rCol + 4, 1, uZ(0.36, L));
  parent.add(knob);
  stack.geometries.push(knob.geometry);
  stack.materials.push(whiteHi);

  // L 形脚架座
  const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 38, 14), whiteHi);
  arm.position.set(0, -rCol - 18, uZ(AXIAL.foot, L));
  parent.add(arm);
  stack.geometries.push(arm.geometry);
  stack.materials.push(whiteHi);
  const beamLen = Math.min(80, L * 0.16);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 6.5, beamLen), whiteHi);
  beam.position.set(0, -rCol - 38, uZ(0.3, L));
  parent.add(beam);
  stack.geometries.push(beam.geometry);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, beamLen * 0.95), black);
  pad.position.set(0, -rCol - 42, uZ(0.3, L));
  parent.add(pad);
  stack.geometries.push(pad.geometry);
  stack.materials.push(black);

  // 皮带孔
  const lug = new THREE.Mesh(new THREE.TorusGeometry(4.2, 1.4, 8, 16), metal);
  lug.rotation.y = Math.PI / 2;
  lug.position.set(rCol * 0.8, rCol * 0.5, uZ(0.4, L));
  parent.add(lug);
  stack.geometries.push(lug.geometry);
  stack.materials.push(metal);

  // 开关面板（后段）
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xcecac2, metalness: 0.08, roughness: 0.55 });
  const swMat = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.15, roughness: 0.55 });
  stack.materials.push(panelMat, swMat);
  for (let i = 0; i < 2; i += 1) {
    const u = 0.12 + i * 0.05;
    const r = profileRadius(u) * dF;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 16, L * 0.035), panelMat);
    panel.position.set(r * 0.88, 0, uZ(u, L));
    parent.add(panel);
    stack.geometries.push(panel.geometry);
  }
}

function lensElement(
  radius: number,
  centerThickness: number,
  edgeThickness: number,
  convex: number,
  color: number,
): THREE.Mesh {
  const segs = 28;
  const pts: THREE.Vector2[] = [];
  const half = Math.max(0.4, centerThickness / 2);
  const rr = Math.max(radius, 0.001);
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const x = t * rr;
    const sag = convex * (1 - Math.sqrt(Math.max(0, 1 - (x / rr) ** 2))) * half * 1.8;
    pts.push(new THREE.Vector2(Math.max(0.001, x), half - sag * 0.3 + edgeThickness * 0.5 * t));
  }
  for (let i = segs; i >= 0; i -= 1) {
    const t = i / segs;
    const x = t * rr;
    const sag = convex * (1 - Math.sqrt(Math.max(0, 1 - (x / rr) ** 2))) * half * 1.8;
    pts.push(new THREE.Vector2(Math.max(0.001, x), -half + sag * 0.3 - edgeThickness * 0.5 * t));
  }
  const geo = new THREE.LatheGeometry(pts, 40);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.04,
    roughness: 0.06,
    transmission: 0.5,
    thickness: 0.8,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    ior: 1.55,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** 内部镜组：中心 u 与参考图色块一致，口径随 profile 内收 */
export function buildOpticalInterior(
  parent: THREE.Group,
  geo: LensGeometry,
  stack: BuildStack,
): void {
  const L = geo.lengthTotal;
  const dF = geo.dFront;
  const clearAt = (u: number, k = 0.72) => profileRadius(u) * dF * k;
  const yT = dF * 0.02;

  const place = (mesh: THREE.Mesh, u: number) => pushMesh(stack, parent, mesh, uZ(u, L));

  // 前大弯月（满口径）
  place(
    lensElement(clearAt(AXIAL.elFront, 0.88), dF * 0.03, dF * 0.006, 1.5, EL_CLEAR),
    AXIAL.elFront,
  );

  // 黄胶合三片（u 0.47 / 0.50 / 0.53）
  place(lensElement(clearAt(0.5, 0.78), yT, yT * 0.3, 1.5, EL_YELLOW), AXIAL.elYellow[0]);
  place(lensElement(clearAt(0.5, 0.74), yT, yT * 0.3, 1.1, EL_YELLOW), AXIAL.elYellow[1]);
  place(lensElement(clearAt(0.5, 0.68), yT * 0.85, yT * 0.2, 0.7, EL_YELLOW), AXIAL.elYellow[2]);

  place(lensElement(clearAt(AXIAL.elOrange, 0.55), yT * 0.7, 1.5, -1.8, EL_ORANGE), AXIAL.elOrange);

  place(lensElement(clearAt(0.38, 0.45), yT * 0.45, 1, 1.1, EL_CLEAR), AXIAL.elClear[0]);
  place(lensElement(clearAt(0.37, 0.4), yT * 0.4, 1, 0.9, EL_CLEAR), AXIAL.elClear[1]);

  const gBase = clearAt(0.18, 0.32);
  AXIAL.elGreen.forEach((u, i) => {
    place(lensElement(gBase * (1 - i * 0.05), yT * 0.3, 0.5, 0.8 + i * 0.12, EL_GREEN), u);
  });

  const plateMat = new THREE.MeshStandardMaterial({
    color: EL_PLATE,
    metalness: 0.15,
    roughness: 0.3,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  stack.materials.push(plateMat);
  place(tube(clearAt(AXIAL.elPlate, 0.3), clearAt(AXIAL.elPlate, 0.3), 1.4, plateMat, 32), AXIAL.elPlate);

  const axisMat = new THREE.LineBasicMaterial({ color: 0x9aafc4, transparent: true, opacity: 0.55 });
  stack.materials.push(axisMat);
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -8),
    new THREE.Vector3(0, 0, L + 8),
  ]);
  stack.geometries.push(axisGeo);
  parent.add(new THREE.Line(axisGeo, axisMat));
}

export function isSuperTele(geo: LensGeometry): boolean {
  return geo.fBase >= 300 || geo.fEff >= 300;
}
