import * as THREE from 'three';
import type { LensGeometry } from '../types';

export interface BuildStack {
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

/**
 * 参考剖面图归一化轴向比例 u = z / L
 * （u=0 卡口面，u=1 前玉顶；对应参考图右→左）
 */
export const AXIAL = {
  mountEnd: 0.0,
  filterEnd: 0.08,
  rearEnd: 0.28,
  collarEnd: 0.45,
  ringEnd: 0.62,
  stepEnd: 0.66,
  frontEnd: 0.92,
  hoodEnd: 1.0,
  /** 镜组中心 u */
  elPlate: 0.12,
  elGreen: [0.16, 0.2, 0.23, 0.26, 0.28] as const,
  elClear: [0.34, 0.37] as const,
  elOrange: 0.43,
  elYellow: [0.52, 0.54, 0.56] as const,
  elFront: 0.92,
} as const;

/** 半径相对 D_front（几何中 r = dF * k，外径 = 2k * D_front） */
export const RADIAL = {
  hood: 0.52,
  front: 0.5,
  ring: 0.36,
  collar: 0.31,
  rear: 0.26,
  filter: 0.22,
  mount: 0.2,
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

function tube(r0: number, r1: number, len: number, mat: THREE.Material, radial = 48): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, radial, 1, false), mat);
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

/** 沿 u∈[u0,u1] 放置圆柱段，中心在区间中点 */
function segment(
  stack: BuildStack,
  parent: THREE.Group,
  r0: number,
  r1: number,
  u0: number,
  u1: number,
  L: number,
  mat: THREE.Material,
  radial = 48,
): void {
  const len = Math.max(0.4, (u1 - u0) * L);
  const z0 = uZ(u0, L);
  const zc = z0 + len / 2;
  pushMesh(stack, parent, tube(r0, r1, len, mat, radial), zc);
}

function knurlU(
  stack: BuildStack,
  parent: THREE.Group,
  diameter: number,
  u0: number,
  u1: number,
  L: number,
  tooth = 0.7,
): void {
  const r = diameter / 2;
  const len = Math.max(0.4, (u1 - u0) * L);
  const zc = uZ(u0, L) + len / 2;
  const mat = new THREE.MeshStandardMaterial({ color: BLACK, metalness: 0.06, roughness: 0.92 });
  stack.materials.push(mat);
  pushMesh(stack, parent, tube(r, r, len, mat, 52), zc);

  const toothGeo = new THREE.BoxGeometry(tooth, len * 0.9, tooth * 2);
  stack.geometries.push(toothGeo);
  const count = 52;
  const inst = new THREE.InstancedMesh(toothGeo, mat, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * (r + tooth * 0.08), Math.sin(a) * (r + tooth * 0.08), zc);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  parent.add(inst);
}

/** 300mm+ 外壳：分段严格按 AXIAL/RADIAL（参考剖面图比例） */
export function buildSuperTeleShell(
  parent: THREE.Group,
  geo: LensGeometry,
  stack: BuildStack,
): void {
  const L = geo.lengthTotal;
  const dF = geo.dFront;
  const mountSeg = geo.segments.find((s) => s.kind === 'mount');
  const mountD = mountSeg?.diameter ?? geo.dRear;

  const white = new THREE.MeshStandardMaterial({ color: WHITE, metalness: 0.16, roughness: 0.5 });
  const whiteHi = new THREE.MeshStandardMaterial({ color: WHITE_HI, metalness: 0.12, roughness: 0.46 });
  const black = new THREE.MeshStandardMaterial({ color: BLACK, metalness: 0.08, roughness: 0.72 });
  const metal = new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.88, roughness: 0.28 });
  stack.materials.push(white, whiteHi, black, metal);

  const r = (k: number) => dF * k;
  const rMount = Math.max(mountD * 0.5, r(RADIAL.mount));

  // 卡口 0–0.03 + 滤镜/收腰 0.03–0.08
  segment(stack, parent, rMount, rMount * 0.92, 0, 0.03, L, metal, 40);
  pushMesh(stack, parent, tube(rMount * 0.5, rMount * 0.5, 1.2, black), 0.6);
  segment(stack, parent, r(RADIAL.filter), r(RADIAL.filter) * 0.98, 0.03, 0.06, L, white, 40);
  segment(stack, parent, r(RADIAL.rear) * 0.9, r(RADIAL.filter), 0.055, 0.08, L, white, 40);
  // 插入式滤镜槽
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x4a4c52, metalness: 0.35, roughness: 0.5 });
  stack.materials.push(slotMat);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(5, 12, L * 0.035), slotMat);
  slot.position.set(0, r(RADIAL.filter) * 0.55, uZ(0.055, L));
  parent.add(slot);
  stack.geometries.push(slot.geometry);
  const slotTab = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, L * 0.02), black);
  slotTab.position.set(0, r(RADIAL.filter) * 0.55 + 7, uZ(0.055, L));
  parent.add(slotTab);
  stack.geometries.push(slotTab.geometry);
  stack.materials.push(black);

  // 后筒开关 0.08–0.28
  segment(stack, parent, r(RADIAL.rear), r(RADIAL.rear) * 0.97, 0.08, 0.28, L, white, 48);
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xcecac2, metalness: 0.08, roughness: 0.55 });
  const swMat = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.15, roughness: 0.55 });
  stack.materials.push(panelMat, swMat);
  for (let col = 0; col < 2; col += 1) {
    const u = 0.12 + col * 0.08;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 18, L * 0.05), panelMat);
    panel.position.set(r(RADIAL.rear) * 0.9, 0, uZ(u, L));
    parent.add(panel);
    stack.geometries.push(panel.geometry);
    for (let i = 0; i < 3; i += 1) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(2, 4.5, L * 0.018), swMat);
      sw.position.set(r(RADIAL.rear) * 0.98, 5 - i * 5.5, uZ(u, L));
      parent.add(sw);
      stack.geometries.push(sw.geometry);
    }
  }

  // 套环段 0.28–0.45
  segment(stack, parent, r(RADIAL.collar), r(RADIAL.collar) * 0.97, 0.28, 0.45, L, whiteHi, 48);
  pushMesh(stack, parent, tube(r(RADIAL.collar) + 1.2, r(RADIAL.collar) + 1.2, 10, whiteHi), uZ(0.36, L));
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 5, 22), whiteHi);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(r(RADIAL.collar) + 5, 2, uZ(0.36, L));
  parent.add(knob);
  stack.geometries.push(knob.geometry);
  stack.materials.push(whiteHi);

  // L 脚架座（参考图脚在 u≈0.25–0.42 下方）
  const arm = new THREE.Mesh(new THREE.BoxGeometry(11, 42, 16), whiteHi);
  arm.position.set(0, -r(RADIAL.collar) - 20, uZ(0.36, L));
  parent.add(arm);
  stack.geometries.push(arm.geometry);
  stack.materials.push(whiteHi);
  const beamLen = Math.min(90, L * 0.18);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 7, beamLen), whiteHi);
  beam.position.set(0, -r(RADIAL.collar) - 42, uZ(0.33, L));
  parent.add(beam);
  stack.geometries.push(beam.geometry);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(11, 2.5, beamLen * 0.95), black);
  pad.position.set(0, -r(RADIAL.collar) - 46, uZ(0.33, L));
  parent.add(pad);
  stack.geometries.push(pad.geometry);
  stack.materials.push(black);

  // 皮带孔
  const lug = new THREE.Mesh(new THREE.TorusGeometry(4.5, 1.5, 8, 16), metal);
  lug.rotation.y = Math.PI / 2;
  lug.position.set(r(RADIAL.collar) * 0.85, r(RADIAL.collar) * 0.55, uZ(0.4, L));
  parent.add(lug);
  stack.geometries.push(lug.geometry);
  stack.materials.push(metal);

  // 功能环 + 对焦环 0.45–0.62（功能环靠前 u 0.58–0.62，对焦环 0.45–0.58）
  knurlU(stack, parent, r(RADIAL.ring) * 2 + 0.8, 0.58, 0.62, L, 0.5);
  knurlU(stack, parent, r(RADIAL.ring) * 2 + 1.4, 0.45, 0.58, L, 0.8);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 3, 16), black);
  btn.rotation.z = Math.PI / 2;
  btn.position.set(0, -r(RADIAL.ring), uZ(0.5, L));
  parent.add(btn);
  stack.geometries.push(btn.geometry);
  stack.materials.push(black);
  // 环段在环之间补白筒
  segment(stack, parent, r(RADIAL.ring), r(RADIAL.ring), 0.45, 0.62, L, white, 40);

  // 台阶 0.62–0.66
  segment(stack, parent, r(RADIAL.ring), r(RADIAL.front), 0.62, 0.66, L, white, 48);

  // 大前筒 0.66–0.92
  segment(stack, parent, r(RADIAL.front), r(RADIAL.front) * 0.98, 0.66, 0.92, L, white, 52);
  const badgeMat = new THREE.MeshStandardMaterial({ color: G_BADGE, metalness: 0.15, roughness: 0.45 });
  stack.materials.push(badgeMat);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 1.4), badgeMat);
  badge.position.set(0, r(RADIAL.front) * 0.98, uZ(0.78, L));
  parent.add(badge);
  stack.geometries.push(badge.geometry);
  const badgeInner = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 1.6), whiteHi);
  badgeInner.position.set(0, r(RADIAL.front) * 0.98, uZ(0.78, L) + 0.2);
  parent.add(badgeInner);
  stack.geometries.push(badgeInner.geometry);
  stack.materials.push(whiteHi);

  // 遮光罩 0.92–1.00
  segment(stack, parent, r(RADIAL.hood), r(RADIAL.hood) * 0.98, 0.92, 1.0, L, black, 52);
  pushMesh(stack, parent, tube(r(RADIAL.hood) * 0.7, r(RADIAL.hood) * 0.68, 8, black), uZ(0.96, L));
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

/** 内部镜组：中心 u 严格按 AXIAL.el* */
export function buildOpticalInterior(
  parent: THREE.Group,
  geo: LensGeometry,
  stack: BuildStack,
): void {
  const L = geo.lengthTotal;
  const dF = geo.dFront;
  const clearR = dF * 0.42;
  const yR = clearR * 0.42;
  const yT = dF * 0.02;

  const place = (mesh: THREE.Mesh, u: number) => pushMesh(stack, parent, mesh, uZ(u, L));

  place(lensElement(clearR, dF * 0.028, dF * 0.006, 1.5, EL_CLEAR), AXIAL.elFront);

  // 黄胶合三片
  place(lensElement(yR, yT, yT * 0.3, 1.5, EL_YELLOW), AXIAL.elYellow[0]);
  place(lensElement(yR * 0.96, yT, yT * 0.3, 1.1, EL_YELLOW), AXIAL.elYellow[1]);
  place(lensElement(yR * 0.82, yT * 0.85, yT * 0.2, 0.7, EL_YELLOW), AXIAL.elYellow[2]);

  place(lensElement(clearR * 0.3, yT * 0.7, 1.5, -1.8, EL_ORANGE), AXIAL.elOrange);

  place(lensElement(clearR * 0.2, yT * 0.45, 1, 1.1, EL_CLEAR), AXIAL.elClear[0]);
  place(lensElement(clearR * 0.18, yT * 0.4, 1, 0.9, EL_CLEAR), AXIAL.elClear[1]);

  const gR = clearR * 0.16;
  AXIAL.elGreen.forEach((u, i) => {
    place(lensElement(gR * (1 - i * 0.04), yT * 0.32, 0.5, 0.8 + i * 0.15, EL_GREEN), u);
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
  place(tube(clearR * 0.14, clearR * 0.14, 1.4, plateMat, 32), AXIAL.elPlate);

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
