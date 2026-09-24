import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createBird } from './bird';
import { createRulers, makeTextSprite } from './rulers';
import {
  applyAlignOffset,
  buildLensMeshes,
  type LensMeshBundle,
} from './lensBuilder';
import type { LensGeometry } from '../types';

export type AlignMode = 'mount' | 'front' | 'center';
export type ViewPreset = 'perspective' | 'top' | 'front' | 'side';

export interface SceneApi {
  setLenses(items: LensGeometry[], wireFlags?: boolean[]): void;
  setAlignMode(mode: AlignMode): void;
  setWireframeOverlay(on: boolean): void;
  setLensWireframe(index: number, on: boolean): void;
  setRulersVisible(on: boolean): void;
  setView(preset: ViewPreset): void;
  resize(): void;
  dispose(): void;
}

export function createScene(container: HTMLElement): SceneApi {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1420);

  const camera = new THREE.PerspectiveCamera(40, 1, 1, 50000);
  camera.position.set(420, 280, 520);
  let ortho: THREE.OrthographicCamera | null = null;
  let activeCam: THREE.PerspectiveCamera | THREE.OrthographicCamera = camera;
  let sceneRadius = 400;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(120, 40, 120);

  scene.add(new THREE.AmbientLight(0xb8c8e0, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(280, 420, 320);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xa8c0ff, 0.65);
  fill.position.set(-360, 140, -220);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9ad8ff, 0.85);
  rim.position.set(80, 240, -420);
  scene.add(rim);
  const under = new THREE.DirectionalLight(0x6a8ccc, 0.25);
  under.position.set(0, -200, 100);
  scene.add(under);

  const rulers = createRulers();
  scene.add(rulers.group);

  const bird = createBird();
  bird.position.set(-220, 0, 40);
  scene.add(bird);

  let alignMode: AlignMode = 'mount';
  let wireframeOverlay = false;
  const lensWire = new Map<number, boolean>();
  let bundles: LensMeshBundle[] = [];
  const labelSprites: THREE.Sprite[] = [];

  function clearLabels(): void {
    for (const s of labelSprites) {
      scene.remove(s);
      (s.material as THREE.Material).dispose();
    }
    labelSprites.length = 0;
  }

  function clearLenses(): void {
    clearLabels();
    for (const b of bundles) {
      scene.remove(b.group);
      b.dispose();
    }
    bundles = [];
  }

  function frameScene(): void {
    let minX = -240;
    let maxX = 400;
    let minY = 0;
    let maxY = 160;
    let minZ = -120;
    let maxZ = 420;

    if (bundles.length > 0) {
      minX = Infinity;
      maxX = -Infinity;
      minY = 0;
      maxY = -Infinity;
      minZ = Infinity;
      maxZ = -Infinity;
      let cursorX = 0;
      for (const b of bundles) {
        const width = b.geometry.dFront;
        const cx = cursorX + width / 2;
        cursorX += width + 80;
        const len = b.geometry.lengthTotal;
        const zOff = b.group.position.z;
        minX = Math.min(minX, cx - width / 2);
        maxX = Math.max(maxX, cx + width / 2);
        maxY = Math.max(maxY, width);
        minZ = Math.min(minZ, zOff);
        maxZ = Math.max(maxZ, zOff + len);
      }
      // 鸟与标尺预留
      minX = Math.min(minX, bird.position.x - 80);
      maxX = Math.max(maxX, 400);
      minZ = Math.min(minZ, -120, bird.position.z - 80);
      maxZ = Math.max(maxZ, bird.position.z + 120, maxZ + 40);
    }

    const sizeX = Math.max(maxX - minX, 80);
    const sizeY = Math.max(maxY - minY, 80);
    const sizeZ = Math.max(maxZ - minZ, 80);
    const center = new THREE.Vector3(
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2,
    );
    const radius = Math.max(sizeX, sizeY, sizeZ) * 0.5;
    sceneRadius = radius;
    const dist = Math.max(radius * 1.7, 320);
    controls.target.copy(center);
    camera.position.set(center.x + dist * 0.72, center.y + dist * 0.48, center.z + dist * 0.88);
    camera.near = Math.max(0.5, dist * 0.005);
    camera.far = dist * 30;
    camera.updateProjectionMatrix();
    controls.update();
  }

  function layout(): void {
    if (bundles.length === 0) {
      clearLabels();
      return;
    }
    clearLabels();
    const base = {
      length: Math.max(...bundles.map((b) => b.geometry.lengthTotal)),
    };
    const gap = 140;
    let cursorX = 0;
    bundles.forEach((bundle, index) => {
      const offset = applyAlignOffset(bundle, alignMode, base);
      const width = bundle.geometry.dFront;
      bundle.group.position.set(cursorX + width / 2, 0, offset.z);
      cursorX += width + gap;

      const forced = lensWire.get(index) ?? false;
      bundle.wireRoot.visible = wireframeOverlay || forced;
      bundle.solidRoot.visible = !forced || wireframeOverlay;

      const g = bundle.geometry;
      const label = makeTextSprite(
        `${g.input.name ?? `镜头${index + 1}`} · ${g.fEff.toFixed(0)}mm · f/${g.nEff.toFixed(2)} · Ø${g.dFront.toFixed(0)} · L${g.lengthTotal.toFixed(0)}`,
      );
      label.position.set(bundle.group.position.x, g.dFront + 40, g.lengthTotal * 0.5);
      label.scale.set(Math.max(80, g.dFront * 0.35), Math.max(20, g.dFront * 0.09), 1);
      labelSprites.push(label);
      scene.add(label);
    });

    const birdX = -Math.max(180, bundles[0]?.geometry.dFront ?? 180);
    const birdZ = Math.max(200, base.length * 0.35);
    bird.position.set(birdX, 0, birdZ);
    rulers.setBirdMarker(birdX, birdZ);
    frameScene();
  }

  function setLenses(items: LensGeometry[], wireFlags?: boolean[]): void {
    clearLenses();
    if (wireFlags) {
      lensWire.clear();
      wireFlags.forEach((on, i) => {
        if (on) lensWire.set(i, true);
      });
    }
    bundles = items.map((g) => buildLensMeshes(g));
    for (const b of bundles) scene.add(b.group);
    layout();
  }

  function enableOrtho(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    const half = Math.max(sceneRadius * 1.15, 150);
    if (!ortho) {
      ortho = new THREE.OrthographicCamera(
        -half * aspect,
        half * aspect,
        half,
        -half,
        0.1,
        50000,
      );
    }
    ortho.left = -half * aspect;
    ortho.right = half * aspect;
    ortho.top = half;
    ortho.bottom = -half;
    ortho.near = 0.1;
    ortho.far = 50000;
    ortho.position.copy(camera.position);
    ortho.up.copy(camera.up);
    ortho.quaternion.copy(camera.quaternion);
    ortho.updateProjectionMatrix();
    activeCam = ortho;
    controls.object = ortho;
  }

  function enablePerspective(): void {
    camera.fov = 40;
    camera.updateProjectionMatrix();
    activeCam = camera;
    controls.object = camera;
  }

  let raf = 0;
  function tick(): void {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, activeCam);
  }
  tick();

  return {
    setLenses,
    setAlignMode(mode) {
      alignMode = mode;
      layout();
    },
    setWireframeOverlay(on) {
      wireframeOverlay = on;
      layout();
    },
    setLensWireframe(index, on) {
      if (on) lensWire.set(index, true);
      else lensWire.delete(index);
      layout();
    },
    setRulersVisible(on) {
      rulers.setVisible(on);
    },
    setView(preset) {
      frameScene();
      const target = controls.target.clone();
      const dist = camera.position.distanceTo(target);
      switch (preset) {
        case 'perspective':
          enablePerspective();
          camera.up.set(0, 1, 0);
          camera.position.set(target.x + dist * 0.72, target.y + dist * 0.48, target.z + dist * 0.88);
          camera.lookAt(target);
          activeCam = camera;
          controls.object = camera;
          break;
        case 'top':
          camera.up.set(0, 0, -1);
          camera.position.set(target.x, target.y + dist * 4, target.z + 0.001);
          camera.lookAt(target);
          enableOrtho(container.clientWidth, container.clientHeight);
          break;
        case 'front':
          camera.up.set(0, 1, 0);
          camera.position.set(target.x, target.y + dist * 0.15, target.z + dist * 4);
          camera.lookAt(target);
          enableOrtho(container.clientWidth, container.clientHeight);
          break;
        case 'side':
          camera.up.set(0, 1, 0);
          camera.position.set(target.x + dist * 4, target.y + dist * 0.15, target.z);
          camera.lookAt(target);
          enableOrtho(container.clientWidth, container.clientHeight);
          break;
      }
      controls.update();
    },
    resize() {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      if (ortho && activeCam === ortho) {
        enableOrtho(w, h);
      }
      renderer.setSize(w, h);
    },
    dispose() {
      cancelAnimationFrame(raf);
      clearLenses();
      lensWire.clear();
      rulers.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
