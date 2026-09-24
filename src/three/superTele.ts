import * as THREE from 'three';
import type { LensGeometry } from '../types';

export interface BuildStack {
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

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

function tube(
  r0: number,
  r1: number,
  len: number,
  mat: THREE.Material,
  radial = 56,
): THREE.Mesh {
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

function knurl(
  stack: BuildStack,
  parent: THREE.Group,
  diameter: number,
  length: number,
  zCenter: number,
  tooth = 0.7,
): void {
  const r = diameter / 2;
  const mat = new THREE.MeshStandardMaterial({ color: BLACK, metalness: 0.06, roughness: 0.92 });
  stack.materials.push(mat);
  pushMesh(stack, parent, tube(r, r, length, mat, 56), zCenter);

  const toothGeo = new THREE.BoxGeometry(tooth, length * 0.92, tooth * 2.0);
  stack.geometries.push(toothGeo);
  const inst = new THREE.InstancedMesh(toothGeo, mat, 52);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 52; i += 1) {
    const a = (i / 52) * Math.PI * 2;
    dummy.position.set(Math.cos(a) * (r + tooth * 0.08), Math.sin(a) * (r + tooth * 0.08), zCenter);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = false;
  parent.add(inst);
}

/**
 * 300mm+ 外观侧视轮廓（对齐结构示意图 / GM 白炮）：
 * 前遮光罩 → 大前筒 → 阶梯收腰 → 功能/对焦环 → 三脚架套环段 →
 * 开关面板后筒 → 插入式滤镜槽收腰 → 卡口。
 */
export function buildSuperTeleShell(
  parent: THREE.Group,
  geo: LensGeometry,
  stack: BuildStack,
): void {
  const L = geo.lengthTotal;
  const dF = geo.dFront;
  const dR = geo.dRear;
  const mountSeg = geo.segments.find((s) => s.kind === 'mount');
  const mountD = mountSeg?.diameter ?? dR;
  const lMount = Math.max(10, geo.lMount);

  const white = new THREE.MeshStandardMaterial({ color: WHITE, metalness: 0.16, roughness: 0.5 });
  const whiteHi = new THREE.MeshStandardMaterial({ color: WHITE_HI, metalness: 0.12, roughness: 0.46 });
  const black = new THREE.MeshStandardMaterial({ color: BLACK, metalness: 0.08, roughness: 0.72 });
  const metal = new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.88, roughness: 0.28 });
  stack.materials.push(white, whiteHi, black, metal);

  // 直径分段（相对 dFront）：罩 / 前筒 / 环段 / 套环段 / 后筒 / 滤镜段 / 卡口
  const rHood = dF * 0.5;
  const rFront = dF * 0.47;
  const rRing = dF * 0.40;
  const rCollar = dF * 0.34;
  const rRear = Math.max(dR * 0.5, dF * 0.28);
  const rFilter = rRear * 0.92;
  const rMount = mountD * 0.5;

  // —— 前遮光罩（黑，侧视最左/最大） ——
  const hoodLen = Math.min(36, L * 0.07);
  pushMesh(stack, parent, tube(rHood, rHood * 0.98, hoodLen, black), L - hoodLen / 2);
  pushMesh(stack, parent, tube(rHood * 0.98, rHood * 0.94, 5, black), L - hoodLen - 2.5);
  // 前口内遮光
  pushMesh(stack, parent, tube(rHood * 0.72, rHood * 0.7, 10, black), L - 6);

  // —— 大前筒（白） ——
  const frontLen = L * 0.32;
  const frontZ0 = L - hoodLen - 6 - frontLen;
  pushMesh(stack, parent, tube(rFront, rFront * 0.98, frontLen, white), frontZ0 + frontLen / 2);

  // G 徽标
  const badgeMat = new THREE.MeshStandardMaterial({ color: G_BADGE, metalness: 0.15, roughness: 0.45 });
  stack.materials.push(badgeMat);
  const badge = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 1.4), badgeMat);
  badge.position.set(0, rFront * 0.98, frontZ0 + frontLen * 0.4);
  parent.add(badge);
  stack.geometries.push(badge.geometry);
  const badgeInner = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 1.6), whiteHi);
  badgeInner.position.set(0, rFront * 0.98, frontZ0 + frontLen * 0.4 + 0.2);
  parent.add(badgeInner);
  stack.geometries.push(badgeInner.geometry);
  stack.materials.push(whiteHi);

  // 肩部台阶（前筒 → 环段）
  const step1 = 6;
  pushMesh(stack, parent, tube(rFront * 0.96, rRing, step1, white), frontZ0 - step1 / 2);

  // —— 功能环 + 对焦环（黑橡胶） ——
  const ringZ1 = frontZ0 - step1;
  const funcLen = Math.min(22, L * 0.04);
  const focusLen = Math.min(110, L * 0.22);
  const focusZ1 = ringZ1;
  knurl(stack, parent, rRing * 2 + 0.8, funcLen, focusZ1 - funcLen / 2, 0.5);
  knurl(stack, parent, rRing * 2 + 1.4, focusLen, focusZ1 - funcLen - focusLen / 2 + 1, 0.8);

  // 对焦锁定按钮（环段侧向）
  const btnMat = black;
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 3, 16), btnMat);
  btn.rotation.z = Math.PI / 2;
  btn.position.set(0, -rRing, focusZ1 - funcLen - focusLen * 0.35);
  parent.add(btn);
  stack.geometries.push(btn.geometry);
  stack.materials.push(btnMat);

  // —— 套环段（白，含三脚架套环 + 大旋钮 + L 脚架座） ——
  const collarZ1 = focusZ1 - funcLen - focusLen + 2;
  const collarLen = Math.max(50, L * 0.12);
  const collarZ0 = collarZ1 - collarLen;
  pushMesh(stack, parent, tube(rCollar, rCollar * 0.97, collarLen, whiteHi), collarZ0 + collarLen / 2);

  // 套环环体
  pushMesh(stack, parent, tube(rCollar + 1.2, rCollar + 1.2, 10, whiteHi), collarZ0 + collarLen * 0.45);
  // 大旋钮
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 5, 22), whiteHi);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(rCollar + 5, 2, collarZ0 + collarLen * 0.45);
  parent.add(knob);
  stack.geometries.push(knob.geometry);
  stack.materials.push(whiteHi);
  const knobGrain = new THREE.Mesh(new THREE.TorusGeometry(6, 0.4, 6, 24), black);
  knobGrain.rotation.y = Math.PI / 2;
  knobGrain.position.copy(knob.position);
  knobGrain.position.x += 2.5;
  parent.add(knobGrain);
  stack.geometries.push(knobGrain.geometry);
  stack.materials.push(black);

  // L 形脚架座（向下再向前/向后，呼应剖面图）
  const arm = new THREE.Mesh(new THREE.BoxGeometry(11, 42, 16), whiteHi);
  arm.position.set(0, -rCollar - 20, collarZ0 + collarLen * 0.55);
  parent.add(arm);
  stack.geometries.push(arm.geometry);
  stack.materials.push(whiteHi);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(13, 7, Math.min(90, L * 0.18)), whiteHi);
  beam.position.set(0, -rCollar - 42, collarZ0 + collarLen * 0.55 + Math.min(30, L * 0.04));
  parent.add(beam);
  stack.geometries.push(beam.geometry);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(11, 2.5, Math.min(86, L * 0.17)), black);
  pad.position.set(0, -rCollar - 46, beam.position.z);
  parent.add(pad);
  stack.geometries.push(pad.geometry);
  stack.materials.push(black);

  // 皮带孔（金属环）
  const lug = new THREE.Mesh(new THREE.TorusGeometry(4.5, 1.5, 8, 16), metal);
  lug.rotation.y = Math.PI / 2;
  lug.position.set(rCollar * 0.85, rCollar * 0.55, collarZ0 + collarLen * 0.7);
  parent.add(lug);
  stack.geometries.push(lug.geometry);
  stack.materials.push(metal);

  // —— 后筒：开关面板簇 ——
  const rearZ1 = collarZ0;
  const rearLen = Math.max(36, rearZ1 - lMount - 18);
  const rearZ0 = lMount + 14;
  pushMesh(stack, parent, tube(rRear, rRear * 0.93, rearLen, white), rearZ0 + rearLen / 2);

  const panelMat = new THREE.MeshStandardMaterial({ color: 0xcecac2, metalness: 0.08, roughness: 0.55 });
  stack.materials.push(panelMat);
  const swMat = new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.15, roughness: 0.55 });
  stack.materials.push(swMat);
  // 两列开关面板
  for (let col = 0; col < 2; col += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.5, 18, 14), panelMat);
    panel.position.set(rRear * 0.92, 0, rearZ0 + rearLen * (0.35 + col * 0.3));
    // 靠侧面
    panel.position.x = rRear * 0.9;
    parent.add(panel);
    stack.geometries.push(panel.geometry);
    for (let i = 0; i < 3; i += 1) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(2, 4.5, 5.5), swMat);
      sw.position.set(rRear * 0.98, 5 - i * 5.5, rearZ0 + rearLen * (0.35 + col * 0.3));
      parent.add(sw);
      stack.geometries.push(sw.geometry);
    }
  }

  // —— 插入式滤镜段 + 收腰 ——
  const filterLen = 16;
  pushMesh(stack, parent, tube(rRear * 0.9, rFilter, 8, white), lMount + 20);
  pushMesh(stack, parent, tube(rFilter, rFilter * 0.98, filterLen, white), lMount + 14);
  const slotMat = new THREE.MeshStandardMaterial({ color: 0x4a4c52, metalness: 0.35, roughness: 0.5 });
  stack.materials.push(slotMat);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 18), slotMat);
  slot.position.set(0, rFilter * 0.55, lMount + 14);
  parent.add(slot);
  stack.geometries.push(slot.geometry);
  const slotTab = new THREE.Mesh(new THREE.BoxGeometry(6, 2.5, 8), black);
  slotTab.position.set(0, rFilter * 0.55 + 7, lMount + 14);
  parent.add(slotTab);
  stack.geometries.push(slotTab.geometry);
  stack.materials.push(black);

  // —— 卡口 ——
  pushMesh(stack, parent, tube(rFilter * 0.95, rMount, 5, white), lMount + 4);
  pushMesh(stack, parent, tube(rMount, rMount * 0.92, lMount, metal), lMount / 2);
  pushMesh(stack, parent, tube(rMount * 0.55, rMount * 0.55, 1.2, black), 0.6);
  // 触点
  const contacts = new THREE.Mesh(new THREE.BoxGeometry(12, 2, lMount * 0.4), metal);
  contacts.position.set(0, rMount * 0.7, lMount * 0.55);
  parent.add(contacts);
  stack.geometries.push(contacts.geometry);
  stack.materials.push(metal);
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
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const x = t * radius;
    const sag = convex * (1 - Math.sqrt(Math.max(0, 1 - (x / Math.max(radius, 0.001)) ** 2))) * half * 1.8;
    pts.push(new THREE.Vector2(Math.max(0.001, x), half - sag * 0.3 + edgeThickness * 0.5 * t));
  }
  for (let i = segs; i >= 0; i -= 1) {
    const t = i / segs;
    const x = t * radius;
    const sag = convex * (1 - Math.sqrt(Math.max(0, 1 - (x / Math.max(radius, 0.001)) ** 2))) * half * 1.8;
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
  // Lathe 绕 Y；+Y → 光轴 +Z
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/**
 * 内部镜组剖面（卡口 z=0 → 前玉 z=L），对齐结构示意图配色：
 * 前大弯月(清) → 黄胶合三片 → 橙弯月 → 中继小透镜×2 → 绿后组×5 → 后端平板。
 */
export function buildOpticalInterior(
  parent: THREE.Group,
  geo: LensGeometry,
  stack: BuildStack,
): void {
  const L = geo.lengthTotal;
  const dF = geo.dFront;
  const clearR = dF * 0.42;

  const place = (mesh: THREE.Mesh, z: number) => pushMesh(stack, parent, mesh, z);

  // 前大弯月
  place(lensElement(clearR, dF * 0.028, dF * 0.006, 1.5, EL_CLEAR), L * 0.88);

  // 黄胶合组（示意图中部三片大黄镜）
  const yR = clearR * 0.42;
  const yT = dF * 0.02;
  place(lensElement(yR, yT, yT * 0.3, 1.5, EL_YELLOW), L * 0.56);
  place(lensElement(yR * 0.96, yT, yT * 0.3, 1.1, EL_YELLOW), L * 0.56 - yT * 1.4);
  place(lensElement(yR * 0.82, yT * 0.85, yT * 0.2, 0.7, EL_YELLOW), L * 0.56 - yT * 2.7);

  // 橙弯月
  place(lensElement(clearR * 0.3, yT * 0.7, 1.5, -1.8, EL_ORANGE), L * 0.46);

  // 中继小透镜
  place(lensElement(clearR * 0.2, yT * 0.45, 1, 1.1, EL_CLEAR), L * 0.36);
  place(lensElement(clearR * 0.18, yT * 0.4, 1, 0.9, EL_CLEAR), L * 0.33);

  // 绿后组（密排小镜）
  const gR = clearR * 0.16;
  for (let i = 0; i < 5; i += 1) {
    place(
      lensElement(gR * (1 - i * 0.04), yT * 0.32, 0.5, 0.8 + i * 0.15, EL_GREEN),
      L * 0.26 - i * yT * 0.45,
    );
  }

  // 后端保护玻璃
  const plateMat = new THREE.MeshStandardMaterial({
    color: EL_PLATE,
    metalness: 0.15,
    roughness: 0.3,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });
  stack.materials.push(plateMat);
  const plate = tube(clearR * 0.14, clearR * 0.14, 1.4, plateMat, 32);
  place(plate, L * 0.1);

  // 光轴
  const axisMat = new THREE.LineBasicMaterial({ color: 0x9aafc4, transparent: true, opacity: 0.55 });
  stack.materials.push(axisMat);
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -lPad()),
    new THREE.Vector3(0, 0, L + lPad()),
  ]);
  stack.geometries.push(axisGeo);
  parent.add(new THREE.Line(axisGeo, axisMat));
}

function lPad(): number {
  return 8;
}

export function isSuperTele(geo: LensGeometry): boolean {
  return geo.fBase >= 300 || geo.fEff >= 300;
}
