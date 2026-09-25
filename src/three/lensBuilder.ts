import * as THREE from 'three';
import type { LensGeometry, LensSegment } from '../types';
import {
  buildOpticalInterior,
  buildSuperTeleShell,
  isSuperTele,
  type BuildStack,
} from './superTele';
import { addLensDimensions } from './dimensions';

export interface LensMeshBundle {
  group: THREE.Group;
  solidRoot: THREE.Group;
  wireRoot: THREE.Group;
  /** 300mm+ 内部镜组（剖面） */
  interiorRoot: THREE.Group;
  /** 尺寸标注（总长/前口径/卡口径/入瞳） */
  dimRoot: THREE.Group;
  geometry: LensGeometry;
  dispose: () => void;
}

type LensClass = 'wide-prime' | 'standard-prime' | 'zoom' | 'tele' | 'super-tele';

const PALETTE = {
  barrel: 0x1a1c20,
  barrelAlt: 0x22252b,
  barrelWhite: 0xd8d2c8,
  barrelWhiteAlt: 0xe4dfd4,
  rubber: 0x0e0f12,
  metal: 0xc5ccd6,
  metalDark: 0x8a93a2,
  accent: 0xc23b22,
  gold: 0xc9a227,
  glass: 0x2f6f8a,
  label: 0xd8b45a,
};

function classifyLens(geo: LensGeometry): LensClass {
  const f = geo.fBase;
  const isZoom = geo.input.focalMax > geo.input.focalMin + 1e-6;
  if (isZoom) return 'zoom';
  if (f >= 300) return 'super-tele';
  if (f >= 135) return 'tele';
  if (f < 40) return 'wide-prime';
  return 'standard-prime';
}

function matBarrel(color = PALETTE.barrel, roughness = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.22,
    roughness,
  });
}

function matRubber(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.rubber,
    metalness: 0.05,
    roughness: 0.92,
  });
}

function matMetal(color = PALETTE.metal, roughness = 0.28): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.9,
    roughness,
  });
}

function matGlass(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: PALETTE.glass,
    metalness: 0.08,
    roughness: 0.04,
    transmission: 0.78,
    thickness: 1.5,
    transparent: true,
    opacity: 0.88,
    ior: 1.52,
    envMapIntensity: 1.35,
  });
}

function bodyColor(cls: LensClass): { main: number; alt: number } {
  if (cls === 'super-tele') {
    return { main: PALETTE.barrelWhite, alt: PALETTE.barrelWhiteAlt };
  }
  return { main: PALETTE.barrel, alt: PALETTE.barrelAlt };
}

function makeTube(
  r0: number,
  r1: number,
  length: number,
  material: THREE.Material,
  radial = 64,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r0, r1, length, radial, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function makeRing(
  radius: number,
  tube: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 64), material);
  return mesh;
}

function makeFrontGlass(diameter: number, thickness: number): THREE.Mesh {
  const radius = Math.max(diameter * 0.9, thickness * 2);
  const capHeight = radius * (1 - Math.cos(0.55));
  const sphere = new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, 0.55);
  sphere.translate(0, -radius * Math.cos(0.55), 0);
  sphere.scale(1, thickness / capHeight, 1);
  sphere.translate(0, -thickness / 2, 0);
  const mesh = new THREE.Mesh(sphere, matGlass());
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/** 橡胶环细齿（现代镜头对焦/变焦环纹） */
function makeKnurledRing(
  diameter: number,
  length: number,
  z: number,
  materials: THREE.Material[],
  geometries: THREE.BufferGeometry[],
  parent: THREE.Group,
  tooth = 0.55,
): void {
  const r = diameter / 2;
  const baseMat = matRubber();
  materials.push(baseMat);
  const base = makeTube(r, r, length, baseMat);
  base.position.z = z + length / 2;
  parent.add(base);
  geometries.push(base.geometry);

  const toothMat = matRubber();
  materials.push(toothMat);
  const teeth = 48;
  const toothGeo = new THREE.BoxGeometry(tooth, length * 0.92, tooth * 1.8);
  geometries.push(toothGeo);
  const instanced = new THREE.InstancedMesh(toothGeo, toothMat, teeth);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < teeth; i += 1) {
    const a = (i / teeth) * Math.PI * 2;
    dummy.position.set(
      Math.cos(a) * (r + tooth * 0.12),
      Math.sin(a) * (r + tooth * 0.12),
      z + length / 2,
    );
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);
  }
  instanced.instanceMatrix.needsUpdate = true;
  instanced.frustumCulled = false;
  parent.add(instanced);
}

function addAccentRings(
  parent: THREE.Group,
  materials: THREE.Material[],
  geometries: THREE.BufferGeometry[],
  diameter: number,
  zs: number[],
  color: number,
  tube = 0.35,
): void {
  const mat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.65,
    roughness: 0.35,
  });
  materials.push(mat);
  for (const z of zs) {
    const ring = makeRing(diameter / 2 + 0.15, tube, mat);
    ring.position.z = z;
    parent.add(ring);
    geometries.push(ring.geometry);
  }
}

function addMountAssembly(
  parent: THREE.Group,
  materials: THREE.Material[],
  geometries: THREE.BufferGeometry[],
  geo: LensGeometry,
): void {
  const seg = geo.segments.find((s) => s.kind === 'mount');
  if (!seg) return;
  const r = seg.diameter / 2;
  const len = seg.z1 - seg.z0;

  // 金属卡口座
  const mountMat = matMetal(PALETTE.metal, 0.22);
  materials.push(mountMat);
  const mount = makeTube(r, r * 0.96, len, mountMat);
  mount.position.z = seg.z0 + len / 2;
  parent.add(mount);
  geometries.push(mount.geometry);

  // 卡爪
  const flangeMat = matMetal(PALETTE.metalDark, 0.35);
  materials.push(flangeMat);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + 0.2;
    const flange = new THREE.Mesh(new THREE.BoxGeometry(10, 3.2, Math.min(6, len * 0.7)), flangeMat);
    flange.position.set(Math.cos(a) * r, Math.sin(a) * r, seg.z0 + len * 0.45);
    flange.rotation.z = a;
    parent.add(flange);
  }

  // 电子触点
  const contactMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.85,
    roughness: 0.3,
  });
  materials.push(contactMat);
  const contacts = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, len * 0.35), contactMat);
  contacts.position.set(0, r * 0.55, seg.z0 + len * 0.55);
  parent.add(contacts);

  // 卡口阴影环
  const shadowMat = matRubber();
  materials.push(shadowMat);
  const shadow = makeTube(r * 0.88, r * 0.88, 1.2, shadowMat);
  shadow.position.z = seg.z0 + 0.6;
  parent.add(shadow);
  geometries.push(shadow.geometry);
}

function addFrontAssembly(
  parent: THREE.Group,
  materials: THREE.Material[],
  geometries: THREE.BufferGeometry[],
  geo: LensGeometry,
  cls: LensClass,
): void {
  const front = geo.segments.find((s) => s.kind === 'front');
  const glass = geo.segments.find((s) => s.kind === 'frontGlass');
  if (!front || !glass) return;

  const dFront = geo.dFront;
  const rFront = dFront / 2;
  const filterR = glass.diameter / 2;
  const cols = bodyColor(cls);

  // 前筒（长焦更接近遮光罩一体筒）
  const bodyMat = matBarrel(cols.main, 0.5);
  materials.push(bodyMat);
  const hoodLike = cls === 'super-tele' || cls === 'tele';
  const body = makeTube(rFront, rFront * (hoodLike ? 0.93 : 0.97), front.z1 - front.z0, bodyMat);
  body.position.z = (front.z0 + front.z1) / 2;
  parent.add(body);
  geometries.push(body.geometry);

  // 前端遮光唇 / 卡扣环
  const lipMat = matBarrel(cols.alt, 0.48);
  materials.push(lipMat);
  const lipLen = hoodLike ? Math.min(18, (front.z1 - front.z0) * 0.22) : 5;
  const lip = makeTube(rFront * 1.01, rFront * 0.9, lipLen, lipMat);
  lip.position.z = front.z1 - lipLen / 2;
  parent.add(lip);
  geometries.push(lip.geometry);

  // 内遮光筒
  const shadeMat = matBarrel(0x12141a, 0.8);
  materials.push(shadeMat);
  const shade = makeTube(filterR + 3.5, filterR + 2.2, Math.max(6, lipLen * 0.8), shadeMat);
  shade.position.z = glass.z0 - 2;
  parent.add(shade);
  geometries.push(shade.geometry);

  // 滤镜螺纹
  const threadMat = matMetal(PALETTE.metalDark, 0.4);
  materials.push(threadMat);
  const thread = makeTube(filterR + 1.0, filterR + 1.0, 3.2, threadMat);
  thread.position.z = glass.z0 - 0.8;
  parent.add(thread);
  geometries.push(thread.geometry);

  // 镀膜前玉
  const glassMesh = makeFrontGlass(glass.diameter, glass.z1 - glass.z0);
  glassMesh.position.z = (glass.z0 + glass.z1) / 2 + 0.3;
  parent.add(glassMesh);
  materials.push(glassMesh.material as THREE.Material);
  geometries.push(glassMesh.geometry);

  const coating = new THREE.Mesh(
    new THREE.CircleGeometry(filterR * 0.9, 48),
    new THREE.MeshPhysicalMaterial({
      color: 0x7ad0ff,
      metalness: 0.15,
      roughness: 0.02,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  coating.position.z = glass.z1 + 0.15;
  parent.add(coating);
  materials.push(coating.material as THREE.Material);
  geometries.push(coating.geometry);

  // 装饰铭牌环：变焦金圈 / 长焦红圈 / 标头银圈
  const accentColor =
    cls === 'zoom' ? PALETTE.gold : cls === 'super-tele' ? PALETTE.metalDark : PALETTE.accent;
  addAccentRings(parent, materials, geometries, dFront, [front.z0 + 2.5, front.z0 + 6], accentColor, 0.28);
}

function addTripodCollar(
  parent: THREE.Group,
  materials: THREE.Material[],
  geometries: THREE.BufferGeometry[],
  geo: LensGeometry,
): void {
  const mid = geo.segments.find((s) => s.kind === 'mid') ?? geo.segments.find((s) => s.kind === 'front');
  if (!mid) return;
  const r = mid.diameter / 2 + 1.2;
  const z = mid.z0 + (mid.z1 - mid.z0) * 0.35;
  const mat = matMetal(PALETTE.metalDark, 0.4);
  materials.push(mat);
  const collar = makeTube(r, r, 10, mat, 48);
  collar.position.z = z;
  parent.add(collar);
  geometries.push(collar.geometry);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(18, 6, 12), mat);
  foot.position.set(0, -r - 2, z);
  parent.add(foot);

  const screw = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 4, 16),
    matMetal(PALETTE.metal, 0.25),
  );
  screw.position.set(0, -r - 5, z);
  parent.add(screw);
}

function addControlSwitchPanel(
  parent: THREE.Group,
  materials: THREE.Material[],
  geo: LensGeometry,
): void {
  const rear = geo.segments.find((s) => s.kind === 'rear');
  if (!rear) return;
  const r = rear.diameter / 2;
  const z = rear.z0 + (rear.z1 - rear.z0) * 0.55;
  const panelMat = matBarrel(0x2a2e35, 0.55);
  materials.push(panelMat);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 18, 28), panelMat);
  panel.position.set(r * 0.92, 0, z);
  parent.add(panel);

  const swMat = matRubber();
  materials.push(swMat);
  for (let i = 0; i < 2; i += 1) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6, 8), swMat);
    sw.position.set(r * 0.98, 5 - i * 10, z);
    parent.add(sw);
  }
}

function addWireShell(
  solid: THREE.Group,
  wire: THREE.Group,
  materials: THREE.Material[],
  geometries: THREE.BufferGeometry[],
): void {
  solid.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    // 跳过细碎齿、开关与镀膜片，避免线框噪声
    const gtype = obj.geometry.type;
    if (gtype === 'BoxGeometry' || gtype === 'CircleGeometry') return;
    const wireGeo = new THREE.WireframeGeometry(obj.geometry);
    geometries.push(wireGeo);
    const line = new THREE.LineSegments(
      wireGeo,
      new THREE.LineBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.55 }),
    );
    line.position.copy(obj.position);
    line.rotation.copy(obj.rotation);
    line.scale.copy(obj.scale);
    wire.add(line);
    materials.push(line.material as THREE.Material);
  });
}



function buildBarrelBody(
  parent: THREE.Group,
  materials: THREE.Material[],
  geometries: THREE.BufferGeometry[],
  geo: LensGeometry,
  cls: LensClass,
): void {
  const find = (kind: LensSegment['kind']) => geo.segments.find((s) => s.kind === kind);
  const rear = find('rear');
  const mid = find('mid');
  const front = find('front');
  const acc = find('accessory');
  const cols = bodyColor(cls);

  if (acc) {
    const mat = matMetal(PALETTE.metalDark, 0.4);
    materials.push(mat);
    const m = makeTube(acc.diameter / 2, acc.diameter / 2 * 0.95, acc.z1 - acc.z0, mat);
    m.position.z = (acc.z0 + acc.z1) / 2;
    parent.add(m);
    geometries.push(m.geometry);
    addAccentRings(parent, materials, geometries, acc.diameter, [acc.z0 + 1], PALETTE.gold, 0.25);
  }

  // 后组：卡口后缘 → 对焦环前
  if (rear) {
    const d = rear.diameter;
    const r = d / 2;
    const len = rear.z1 - rear.z0;
    const bodyMat = matBarrel(cols.main, 0.52);
    materials.push(bodyMat);

    // 阶梯：靠近卡口略收
    const neckLen = Math.min(10, len * 0.2);
    const neck = makeTube(r * 0.88, r * 0.96, neckLen, bodyMat);
    neck.position.z = rear.z0 + neckLen / 2;
    parent.add(neck);
    geometries.push(neck.geometry);

    const barrel = makeTube(r, r * 0.98, len - neckLen, bodyMat);
    barrel.position.z = rear.z0 + neckLen + (len - neckLen) / 2;
    parent.add(barrel);
    geometries.push(barrel.geometry);

    // 对焦环（靠后）
    const focusLen = clampLen(len * 0.34, 8, 24);
    makeKnurledRing(d + 1.2, focusLen, rear.z1 - focusLen - 1, materials, geometries, parent);
    addAccentRings(
      parent,
      materials,
      geometries,
      d,
      [rear.z0 + neckLen + 0.8],
      cls === 'super-tele' ? PALETTE.metalDark : PALETTE.metalDark,
      0.22,
    );
    addControlSwitchPanel(parent, materials, geo);
  }

  // 中组：变焦环 + 身管
  if (mid) {
    const d = mid.diameter;
    const r = d / 2;
    const len = mid.z1 - mid.z0;
    const bodyMat = matBarrel(cols.alt, 0.55);
    materials.push(bodyMat);

    const isZoom = cls === 'zoom';
    const ringLen = isZoom ? clampLen(len * 0.42, 12, 36) : clampLen(len * 0.3, 8, 18);
    const ringZ0 = isZoom ? mid.z0 + len * 0.12 : mid.z0 + len * 0.25;

    const pre = makeTube(r, r, Math.max(0.5, ringZ0 - mid.z0), bodyMat);
    pre.position.z = mid.z0 + Math.max(0.5, ringZ0 - mid.z0) / 2;
    parent.add(pre);
    geometries.push(pre.geometry);

    makeKnurledRing(d + 1.4, ringLen, ringZ0, materials, geometries, parent, 0.65);

    const postZ = ringZ0 + ringLen;
    const postLen = Math.max(0.5, mid.z1 - postZ);
    const post = makeTube(r * 0.99, r * 0.95, postLen, bodyMat);
    post.position.z = postZ + postLen / 2;
    parent.add(post);
    geometries.push(post.geometry);

    // 外变焦：露出第二节镜筒
    if (geo.input.barrelStyle === 'external' && isZoom) {
      const extMat = matBarrel(cols.main, 0.5);
      materials.push(extMat);
      const extR = r * 0.86;
      const ext = makeTube(extR, extR * 0.94, postLen * 0.55, extMat);
      ext.position.z = postZ + postLen * 0.35;
      parent.add(ext);
      geometries.push(ext.geometry);
    }

    addAccentRings(
      parent,
      materials,
      geometries,
      d,
      [mid.z0 + 1, mid.z1 - 1],
      isZoom ? PALETTE.gold : PALETTE.metalDark,
      0.24,
    );
  }

  // 前组肩部过渡（长焦更明显的“炮口”收腰）
  if (front && mid) {
    const shoulderLen = cls === 'super-tele' || cls === 'tele' ? 8 : 4;
    const d0 = mid.diameter / 2;
    const d1 = front.diameter / 2;
    const mat = matBarrel(cols.main, 0.5);
    materials.push(mat);
    const shoulder = makeTube(d0 * 0.97, d1 * 0.98, shoulderLen, mat);
    shoulder.position.z = front.z0 - shoulderLen / 2 + 0.5;
    if (front.z0 - mid.z1 > -2) {
      parent.add(shoulder);
      geometries.push(shoulder.geometry);
    }
  }

  if (cls === 'tele' || cls === 'super-tele') {
    addTripodCollar(parent, materials, geometries, geo);
  }
}

function clampLen(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function buildLensMeshes(geo: LensGeometry): LensMeshBundle {
  const group = new THREE.Group();
  const solidRoot = new THREE.Group();
  const wireRoot = new THREE.Group();
  const interiorRoot = new THREE.Group();
  const dimRoot = new THREE.Group();
  group.add(solidRoot, wireRoot, interiorRoot, dimRoot);

  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const cls = classifyLens(geo);
  const stack: BuildStack = { materials, geometries };

  if (isSuperTele(geo) || cls === 'super-tele') {
    // 300mm+：GM 白炮外壳 + 可切换内部镜组
    buildSuperTeleShell(solidRoot, geo, stack);
    buildOpticalInterior(interiorRoot, geo, stack);
    addLensDimensions(dimRoot, geo, stack);
    addWireShell(solidRoot, wireRoot, materials, geometries);
  } else {
    addMountAssembly(solidRoot, materials, geometries, geo);
    buildBarrelBody(solidRoot, materials, geometries, geo, cls);
    addFrontAssembly(solidRoot, materials, geometries, geo, cls);
    addLensDimensions(dimRoot, geo, stack);
    addWireShell(solidRoot, wireRoot, materials, geometries);
  }

  wireRoot.visible = false;
  interiorRoot.visible = false;
  group.traverse((obj) => {
    obj.frustumCulled = false;
  });

  return {
    group,
    solidRoot,
    wireRoot,
    interiorRoot,
    dimRoot,
    geometry: geo,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

export function applyAlignOffset(
  bundle: LensMeshBundle,
  alignMode: 'mount' | 'front' | 'center',
  base: { length: number },
): THREE.Vector3 {
  const len = bundle.geometry.lengthTotal;
  switch (alignMode) {
    case 'mount':
      return new THREE.Vector3(0, 0, 0);
    case 'front':
      return new THREE.Vector3(0, 0, base.length - len);
    case 'center':
      return new THREE.Vector3(0, 0, (base.length - len) / 2);
  }
}
