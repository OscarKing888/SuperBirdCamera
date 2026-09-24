import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeOptics } from '../optics';
import { buildLensMeshes } from './lensBuilder';

describe('buildLensMeshes super-tele', () => {
  it('builds 300mm+ shell and interior without throwing', () => {
    const geo = computeOptics({
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
    const bundle = buildLensMeshes(geo);
    expect(bundle.solidRoot.children.length).toBeGreaterThan(4);
    expect(bundle.interiorRoot.children.length).toBeGreaterThan(4);
    const box = new THREE.Box3().setFromObject(bundle.group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(geo.lengthTotal * 0.8);
    expect(size.x).toBeGreaterThan(geo.dFront * 0.5);
    bundle.dispose();
  });
});
