import * as THREE from 'three';
import { BIRD_HEIGHT_MM } from './bird';

export interface RulerBundle {
  group: THREE.Group;
  /** 将身高标尺挪到鸟的位置旁 */
  setBirdMarker: (x: number, z: number) => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
}

export function createRulers(): RulerBundle {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // 地面网格：10mm 细 / 100mm 粗
  const fine = new THREE.GridHelper(2000, 200, 0x3a4558, 0x2a3344);
  fine.position.y = 0;
  group.add(fine);
  disposables.push(fine.geometry);

  const coarse = new THREE.GridHelper(2000, 20, 0x6a7a95, 0x4a5568);
  coarse.position.y = 0.2;
  group.add(coarse);
  disposables.push(coarse.geometry);

  // X 向毫米标尺条
  const barMat = new THREE.LineBasicMaterial({ color: 0xd8b45a });
  disposables.push(barMat);
  const points: THREE.Vector3[] = [];
  const labels: THREE.Sprite[] = [];
  const x0 = -400;
  const x1 = 800;
  points.push(new THREE.Vector3(x0, 0.5, -80), new THREE.Vector3(x1, 0.5, -80));

  for (let x = x0; x <= x1; x += 10) {
    const isHundred = Math.abs(x % 100) < 1e-6;
    const isFifty = Math.abs(x % 50) < 1e-6;
    const h = isHundred ? 18 : isFifty ? 12 : 6;
    points.push(new THREE.Vector3(x, 0.5, -80), new THREE.Vector3(x, 0.5, -80 + h));
  }

  const rulerGeo = new THREE.BufferGeometry().setFromPoints(points);
  disposables.push(rulerGeo);
  group.add(new THREE.LineSegments(rulerGeo, barMat));

  for (let x = x0; x <= x1; x += 100) {
    const sprite = makeTextSprite(`${x}`);
    sprite.position.set(x, 28, -80);
    labels.push(sprite);
    group.add(sprite);
    disposables.push(sprite.material as THREE.Material);
  }

  // 纵轴标尺（Z 向）：与 X 标尺在 0 点垂直相交
  // 交点 (0, y, -80) 即 X 标尺的 0 mm 处
  const yR = 0.5;
  const zCross = -80;
  const z0 = -400;
  const z1 = 1200;
  const zPts: THREE.Vector3[] = [];
  zPts.push(new THREE.Vector3(0, yR, z0), new THREE.Vector3(0, yR, z1));
  for (let z = z0; z <= z1; z += 10) {
    const isHundred = Math.abs(z % 100) < 1e-6;
    const isFifty = Math.abs(z % 50) < 1e-6;
    const h = isHundred ? 18 : isFifty ? 12 : 6;
    // 刻度偏向 +X，与 X 尺刻度（偏 +Z）成直角
    zPts.push(new THREE.Vector3(0, yR, z), new THREE.Vector3(h, yR, z));
  }
  // 0 点十字标记（与横尺垂直）
  const cross = 22;
  zPts.push(
    new THREE.Vector3(-cross, yR, zCross),
    new THREE.Vector3(cross, yR, zCross),
    new THREE.Vector3(0, yR, zCross - cross),
    new THREE.Vector3(0, yR, zCross + cross),
  );
  const zRulerGeo = new THREE.BufferGeometry().setFromPoints(zPts);
  disposables.push(zRulerGeo);
  group.add(new THREE.LineSegments(zRulerGeo, barMat));

  for (let z = z0; z <= z1; z += 100) {
    const sprite = makeTextSprite(`${z}`);
    sprite.position.set(28, yR + 22, z);
    labels.push(sprite);
    group.add(sprite);
    disposables.push(sprite.material as THREE.Material);
  }
  const originLabel = makeTextSprite('0');
  originLabel.position.set(-24, yR + 22, zCross);
  labels.push(originLabel);
  group.add(originLabel);
  disposables.push(originLabel.material as THREE.Material);

  // 鸟旁身高标尺（可随鸟平移）
  const heightPts = [
    new THREE.Vector3(-20, 0, 0),
    new THREE.Vector3(-20, BIRD_HEIGHT_MM, 0),
    new THREE.Vector3(-26, 0, 0),
    new THREE.Vector3(-14, 0, 0),
    new THREE.Vector3(-26, BIRD_HEIGHT_MM, 0),
    new THREE.Vector3(-14, BIRD_HEIGHT_MM, 0),
  ];
  const hGeo = new THREE.BufferGeometry().setFromPoints(heightPts);
  disposables.push(hGeo);
  const heightBar = new THREE.LineSegments(hGeo, barMat);
  group.add(heightBar);
  const hLabel = makeTextSprite(`${BIRD_HEIGHT_MM}mm`);
  hLabel.position.set(-50, BIRD_HEIGHT_MM + 10, 0);
  group.add(hLabel);
  disposables.push(hLabel.material as THREE.Material);

  return {
    group,
    setBirdMarker(x, z) {
      heightBar.position.set(x, 0, z);
      hLabel.position.set(x - 50, BIRD_HEIGHT_MM + 10, z);
    },
    setVisible: (on: boolean) => {
      group.visible = on;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function makeTextSprite(text: string): THREE.Sprite {
  // Node 单测环境无 document：用占位 Sprite，保证几何可构建
  if (typeof document === 'undefined') {
    const mat = new THREE.SpriteMaterial({ color: 0xe8d48a, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(60, 15, 1);
    sprite.name = text;
    return sprite;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(10, 14, 22, 0.65)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#e8d48a';
    ctx.font = '28px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(60, 15, 1);
  sprite.name = text;
  return sprite;
}
