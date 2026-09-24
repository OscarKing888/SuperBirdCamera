import * as THREE from 'three';

export interface RulerBundle {
  group: THREE.Group;
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

  // 鸟旁身高标尺
  const heightPts = [
    new THREE.Vector3(-120, 0, 60),
    new THREE.Vector3(-120, 120, 60),
    new THREE.Vector3(-126, 0, 60),
    new THREE.Vector3(-114, 0, 60),
    new THREE.Vector3(-126, 120, 60),
    new THREE.Vector3(-114, 120, 60),
  ];
  const hGeo = new THREE.BufferGeometry().setFromPoints(heightPts);
  disposables.push(hGeo);
  group.add(new THREE.LineSegments(hGeo, barMat));
  const hLabel = makeTextSprite('120mm');
  hLabel.position.set(-150, 130, 60);
  group.add(hLabel);
  disposables.push(hLabel.material as THREE.Material);

  return {
    group,
    setVisible: (on: boolean) => {
      group.visible = on;
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export function makeTextSprite(text: string): THREE.Sprite {
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
  return sprite;
}
