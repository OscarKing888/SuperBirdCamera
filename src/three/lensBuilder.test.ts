import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeOptics } from '../optics';
import { buildLensMeshes } from './lensBuilder';
import { AXIAL, RADIAL } from './superTele';

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

  it('keeps optical element centers on reference axial fractions', () => {
    expect(AXIAL.elFront).toBeCloseTo(0.92, 5);
    expect(AXIAL.elYellow[0]).toBeGreaterThanOrEqual(0.52);
    expect(AXIAL.elYellow[2]).toBeLessThanOrEqual(0.56);
    expect(AXIAL.elOrange).toBeCloseTo(0.43, 5);
    expect(AXIAL.elGreen[0]).toBeCloseTo(0.16, 5);
    expect(AXIAL.elGreen[AXIAL.elGreen.length - 1]).toBeCloseTo(0.28, 5);
    expect(AXIAL.elClear[0]).toBeCloseTo(0.34, 5);
    expect(AXIAL.elClear[1]).toBeCloseTo(0.37, 5);
    expect(AXIAL.elPlate).toBeCloseTo(0.12, 5);
    expect(AXIAL.frontEnd).toBeCloseTo(0.92, 5);
    expect(AXIAL.stepEnd).toBeCloseTo(0.66, 5);
    expect(AXIAL.ringEnd).toBeCloseTo(0.62, 5);
  });

  it('radial steps match reference diameter ratios', () => {
    expect(RADIAL.hood).toBeCloseTo(0.52, 5);
    expect(RADIAL.front).toBeCloseTo(0.5, 5);
    expect(RADIAL.rear).toBeCloseTo(0.26, 5);
    expect(RADIAL.front).toBeGreaterThan(RADIAL.ring);
    expect(RADIAL.ring).toBeGreaterThan(RADIAL.collar);
    expect(RADIAL.collar).toBeGreaterThan(RADIAL.rear);
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
