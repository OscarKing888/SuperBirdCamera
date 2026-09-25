import * as THREE from 'three';
import { makeTextSprite } from './rulers';
import type { LensGeometry } from '../types';

export interface DimStack {
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

const DIM_COLOR = 0xd8b45a;
const TEXT_COLOR = '#f0d98a';

function dimLine(pts: THREE.Vector3[], stack: DimStack, parent: THREE.Group): void {
  const mat = new THREE.LineBasicMaterial({
    color: DIM_COLOR,
    transparent: true,
    opacity: 0.95,
  });
  stack.materials.push(mat);
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  stack.geometries.push(geo);
  parent.add(new THREE.LineSegments(geo, mat));
}

function label(text: string, pos: THREE.Vector3, scale: number, stack: DimStack, parent: THREE.Group): void {
  const sprite = makeTextSprite(text);
  // makeTextSprite 使用固定配色；这里仅改透明度可读性
  sprite.position.copy(pos);
  sprite.scale.set(scale * 3.2, scale * 0.8, 1);
  parent.add(sprite);
  stack.materials.push(sprite.material as THREE.Material);
  void TEXT_COLOR;
}

/**
 * 单向尺寸线：从 a 到 b，offset 为垂直于尺寸轴的偏移，axis: 'x'|'y'|'z'
 */
function linearDim(
  a: THREE.Vector3,
  b: THREE.Vector3,
  offsetDir: THREE.Vector3,
  offset: number,
  text: string,
  stack: DimStack,
  parent: THREE.Group,
  scale: number,
): void {
  const off = offsetDir.clone().normalize().multiplyScalar(offset);
  const a2 = a.clone().add(off);
  const b2 = b.clone().add(off);
  const tick = Math.max(scale * 0.35, 2);

  // 界线
  const ext = [
    a.clone(),
    a2.clone().add(offsetDir.clone().normalize().multiplyScalar(tick * 0.5)),
    b.clone(),
    b2.clone().add(offsetDir.clone().normalize().multiplyScalar(tick * 0.5)),
  ];
  dimLine(ext, stack, parent);

  // 尺寸线 + 端头短横
  const dir = b2.clone().sub(a2).normalize();
  const side = new THREE.Vector3(-dir.y, dir.x, dir.z);
  if (side.lengthSq() < 1e-6) side.set(0, 1, 0);
  side.normalize();
  const t1a = a2.clone().add(side.clone().multiplyScalar(tick));
  const t1b = a2.clone().add(side.clone().multiplyScalar(-tick));
  const t2a = b2.clone().add(side.clone().multiplyScalar(tick));
  const t2b = b2.clone().add(side.clone().multiplyScalar(-tick));
  dimLine([a2, b2, t1a, t1b, t2a, t2b], stack, parent);

  const mid = a2.clone().add(b2).multiplyScalar(0.5);
  label(text, mid.add(offsetDir.clone().normalize().multiplyScalar(tick * 1.6)), scale, stack, parent);
}

/**
 * 每支镜头的外观尺寸标注：
 * - 总长 L（沿光轴）
 * - 前口径 Ø
 * - 卡口/后端口径
 * - 入瞳 Ø（参考）
 */
export function addLensDimensions(
  parent: THREE.Group,
  geo: LensGeometry,
  stack: DimStack,
): void {
  const L = geo.lengthTotal;
  const dF = geo.dFront;
  const dR = geo.dRear;
  const dMount = geo.segments.find((s) => s.kind === 'mount')?.diameter ?? dR;
  const scale = Math.max(dF * 0.02, 4);
  const yDim = dF * 0.5 + scale * 3.2;
  const xDim = dF * 0.5 + scale * 3.2;

  // 总长：上方，沿 +Y 偏移
  linearDim(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, L),
    new THREE.Vector3(0, 1, 0),
    yDim,
    `L ${L.toFixed(1)} mm`,
    stack,
    parent,
    scale,
  );

  // 前口径：前端截面，沿 +X
  const frontZ = L * 0.985;
  linearDim(
    new THREE.Vector3(-dF / 2, 0, frontZ),
    new THREE.Vector3(dF / 2, 0, frontZ),
    new THREE.Vector3(1, 0, 0),
    xDim,
    `Ø前 ${dF.toFixed(1)} mm`,
    stack,
    parent,
    scale,
  );

  // 卡口/后端口径
  const rearZ = Math.min(L * 0.02, 4);
  linearDim(
    new THREE.Vector3(-dMount / 2, 0, rearZ),
    new THREE.Vector3(dMount / 2, 0, rearZ),
    new THREE.Vector3(-1, 0, 0),
    xDim * 0.55,
    `Ø卡 ${dMount.toFixed(1)} mm`,
    stack,
    parent,
    scale * 0.85,
  );

  // 入瞳参考（画在下侧）
  const dE = geo.dEntrance;
  linearDim(
    new THREE.Vector3(-dE / 2, 0, L * 0.55),
    new THREE.Vector3(dE / 2, 0, L * 0.55),
    new THREE.Vector3(0, -1, 0),
    dF * 0.18 + scale * 1.5,
    `Ø入瞳 ${dE.toFixed(1)} mm`,
    stack,
    parent,
    scale * 0.85,
  );

  // 后端直径 dRear 作短标注（侧面）
  linearDim(
    new THREE.Vector3(-dR / 2, 0, L * 0.12),
    new THREE.Vector3(dR / 2, 0, L * 0.12),
    new THREE.Vector3(0, -1, 0),
    dF * 0.32 + scale * 1.2,
    `Ø后 ${dR.toFixed(1)} mm`,
    stack,
    parent,
    scale * 0.8,
  );
}
