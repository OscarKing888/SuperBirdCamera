import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeOptics } from '../optics';
import { buildLensMeshes } from './lensBuilder';
import { AXIAL, profileRadius } from './superTele';

function sampleTele() {
  return computeOptics({
    mount: 'e',
    focalMin: 600,
    focalMax: 600,
    apertureMin: 0.9,
    apertureMax: 0.9,
    zoom: 0,
    focusDistance: Infinity,
    teleconverter: 'none',
    reducer: 'none',
    barrelStyle: 'internal',
  });
}

describe('buildLensMeshes super-tele', () => {
  it('builds 300mm+ shell and interior without throwing', () => {
    const geo = sampleTele();
    const bundle = buildLensMeshes(geo);
    expect(bundle.solidRoot.children.length).toBeGreaterThan(4);
    expect(bundle.interiorRoot.children.length).toBeGreaterThan(4);
    const box = new THREE.Box3().setFromObject(bundle.group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(geo.lengthTotal * 0.8);
    expect(size.x).toBeGreaterThan(geo.dFront * 0.5);
    bundle.dispose();
  });

  it('keeps optical element centers on measured reference fractions', () => {
    // 剖面图实测：前玉 ~0.95，黄胶合 0.47/0.50/0.53，橙 0.42，绿 0.12–0.20，平板 0.08
    expect(AXIAL.elFront).toBeCloseTo(0.95, 5);
    expect(AXIAL.elYellow[0]).toBeCloseTo(0.47, 5);
    expect(AXIAL.elYellow[1]).toBeCloseTo(0.5, 5);
    expect(AXIAL.elYellow[2]).toBeCloseTo(0.53, 5);
    expect(AXIAL.elOrange).toBeCloseTo(0.42, 5);
    expect(AXIAL.elGreen[0]).toBeCloseTo(0.12, 5);
    expect(AXIAL.elGreen[2]).toBeCloseTo(0.2, 5);
    expect(AXIAL.elPlate).toBeCloseTo(0.08, 5);
    expect(AXIAL.elClear[0]).toBeCloseTo(0.36, 5);
    expect(AXIAL.elClear[1]).toBeCloseTo(0.39, 5);
  });

  it('outer profile is a smooth taper peaking near the front', () => {
    expect(profileRadius(0.9)).toBeCloseTo(0.5, 3);
    expect(profileRadius(0.5)).toBeCloseTo(0.335, 3);
    expect(profileRadius(0.1)).toBeCloseTo(0.25, 3);
    expect(profileRadius(0.1)).toBeLessThan(profileRadius(0.4));
    expect(profileRadius(0.4)).toBeLessThan(profileRadius(0.75));
    expect(profileRadius(0.75)).toBeLessThan(profileRadius(0.9));
  });

  it('interior meshes sit near their u centers along optical axis', () => {
    const geo = sampleTele();
    const bundle = buildLensMeshes(geo);
    bundle.interiorRoot.updateMatrixWorld(true);
    const zs: number[] = [];
    bundle.interiorRoot.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const box = new THREE.Box3().setFromObject(obj);
        zs.push((box.min.z + box.max.z) / 2);
      }
    });
    const L = geo.lengthTotal;
    const near = (u: number) => zs.some((z) => Math.abs(z / L - u) < 0.04);
    expect(near(AXIAL.elFront)).toBe(true);
    expect(near(AXIAL.elYellow[1])).toBe(true);
    expect(near(AXIAL.elOrange)).toBe(true);
    expect(near(AXIAL.elPlate)).toBe(true);
    bundle.dispose();
  });
});
