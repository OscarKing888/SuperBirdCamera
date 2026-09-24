import * as THREE from 'three';
import type { LensGeometry, LensSegment } from '../types';

export interface LensMeshBundle {
  group: THREE.Group;
  solidRoot: THREE.Group;
  wireRoot: THREE.Group;
  geometry: LensGeometry;
  dispose: () => void;
}

const SEGMENT_COLORS: Record<LensSegment['kind'], number> = {
  mount: 0xb0bac8,
  accessory: 0x8e9bb0,
  rear: 0x5a6578,
  mid: 0x4a5568,
  front: 0x3d475c,
  frontGlass: 0x6ec8ff,
};

function barrelMaterial(kind: LensSegment['kind']): THREE.Material {
  if (kind === 'frontGlass') {
    return new THREE.MeshPhysicalMaterial({
      color: SEGMENT_COLORS.frontGlass,
      metalness: 0.05,
      roughness: 0.08,
      transmission: 0.55,
      thickness: 1.2,
      transparent: true,
      opacity: 0.92,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: SEGMENT_COLORS[kind],
    metalness: kind === 'mount' || kind === 'accessory' ? 0.75 : 0.45,
    roughness: kind === 'mount' ? 0.32 : 0.42,
  });
}

function makeCylinder(
  diameter: number,
  length: number,
  material: THREE.Material,
): THREE.Mesh {
  // Three.js 圆柱默认沿 Y，转到光轴 +Z
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, 64, 1, false),
    material,
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function makeFrontGlass(diameter: number, thickness: number): THREE.Mesh {
  // 球冠近似前玉：曲率半径 R≈0.9·D（规格）
  // Three.js 球冠原点在曲率中心，需平移使冠体沿光轴占据 [0, thickness] 再居中
  const radius = Math.max(diameter * 0.9, thickness * 2);
  const capHeight = radius * (1 - Math.cos(0.55));
  const sphere = new THREE.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, 0.55);
  sphere.translate(0, -radius * Math.cos(0.55), 0);
  sphere.scale(1, thickness / capHeight, 1);
  sphere.translate(0, -thickness / 2, 0);
  const mat = barrelMaterial('frontGlass');
  const mesh = new THREE.Mesh(sphere, mat);
  // +Y 冠轴 → 光轴 +Z
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function addFocusRidges(group: THREE.Group, seg: LensSegment): void {
  if (seg.kind !== 'mid' && seg.kind !== 'front') return;
  const count = seg.kind === 'mid' ? 5 : 3;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x11151f,
    metalness: 0.2,
    roughness: 0.8,
  });
  for (let i = 0; i < count; i += 1) {
    const z = seg.z0 + ((i + 0.5) / count) * (seg.z1 - seg.z0);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(seg.diameter / 2 + 0.4, 0.35, 8, 48),
      mat,
    );
    ring.position.z = z;
    group.add(ring);
  }
}

export function buildLensMeshes(geo: LensGeometry): LensMeshBundle {
  const group = new THREE.Group();
  const solidRoot = new THREE.Group();
  const wireRoot = new THREE.Group();
  group.add(solidRoot, wireRoot);

  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  for (const seg of geo.segments) {
    const length = seg.z1 - seg.z0;
    const midZ = (seg.z0 + seg.z1) / 2;
    let mesh: THREE.Mesh;
    if (seg.kind === 'frontGlass') {
      mesh = makeFrontGlass(seg.diameter, length);
      materials.push(mesh.material as THREE.Material);
    } else {
      const mat = barrelMaterial(seg.kind);
      materials.push(mat);
      mesh = makeCylinder(seg.diameter, length, mat);
      addFocusRidges(solidRoot, seg);
    }
    mesh.position.z = midZ;
    mesh.frustumCulled = false;
    solidRoot.add(mesh);
    geometries.push(mesh.geometry);

    const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
    geometries.push(wireGeo);
    const wire = new THREE.LineSegments(
      wireGeo,
      new THREE.LineBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: 0.85 }),
    );
    wire.position.copy(mesh.position);
    wire.rotation.copy(mesh.rotation);
    wire.scale.copy(mesh.scale);
    wireRoot.add(wire);
    materials.push(wire.material as THREE.Material);
  }

  // 卡口简易缺口环
  const mountSeg = geo.segments[0];
  if (mountSeg) {
    const notchMat = new THREE.MeshStandardMaterial({ color: 0x11151f, metalness: 0.4, roughness: 0.6 });
    materials.push(notchMat);
    for (let i = 0; i < 3; i += 1) {
      const notch = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 2), notchMat);
      const a = (i / 3) * Math.PI * 2;
      const r = mountSeg.diameter / 2;
      notch.position.set(Math.cos(a) * r, Math.sin(a) * r, mountSeg.z0 + 1.5);
      notch.rotation.z = a;
      solidRoot.add(notch);
    }
  }

  // 尺寸标注：长度
  const dimMat = new THREE.LineBasicMaterial({ color: 0xd8b45a });
  materials.push(dimMat);
  const dimY = geo.dFront / 2 + 18;
  const lengthPts = [
    new THREE.Vector3(0, dimY, 0),
    new THREE.Vector3(0, dimY, geo.lengthTotal),
    new THREE.Vector3(-6, dimY, 0),
    new THREE.Vector3(6, dimY, 0),
    new THREE.Vector3(-6, dimY, geo.lengthTotal),
    new THREE.Vector3(6, dimY, geo.lengthTotal),
  ];
  const dimGeo = new THREE.BufferGeometry().setFromPoints(lengthPts);
  geometries.push(dimGeo);
  group.add(new THREE.LineSegments(dimGeo, dimMat));

  // 前口径标注
  const frontZ = geo.segments[geo.segments.length - 1]?.z0 ?? geo.lengthTotal;
  const fr = geo.dFront / 2;
  const widthPts = [
    new THREE.Vector3(-fr, 0, frontZ + 4),
    new THREE.Vector3(fr, 0, frontZ + 4),
  ];
  const widthGeo = new THREE.BufferGeometry().setFromPoints(widthPts);
  geometries.push(widthGeo);
  group.add(new THREE.Line(widthGeo, dimMat));

  wireRoot.visible = false;
  group.traverse((obj) => {
    obj.frustumCulled = false;
  });

  return {
    group,
    solidRoot,
    wireRoot,
    geometry: geo,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/** 顶视对齐时，按模式计算 X/Z 平移，使指定基准面共面 */
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
      // 前玉顶 z = lengthTotal 对齐 → 整体前移 (base.length - len)
      return new THREE.Vector3(0, 0, base.length - len);
    case 'center':
      return new THREE.Vector3(0, 0, (base.length - len) / 2);
  }
}
