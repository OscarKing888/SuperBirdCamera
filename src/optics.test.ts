import { describe, expect, it } from 'vitest';
import { computeOptics, clamp, lerp } from './optics';
import type { LensInput } from './types';

const baseInput: LensInput = {
  mount: 'e',
  focalMin: 50,
  focalMax: 50,
  apertureMin: 1.4,
  apertureMax: 1.4,
  zoom: 0,
  focusDistance: Infinity,
  teleconverter: 'none',
  reducer: 'none',
  barrelStyle: 'internal',
};

describe('optics helpers', () => {
  it('clamp and lerp', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
});

describe('computeOptics', () => {
  it('computes entrance pupil D = f/N for a fast telephoto', () => {
    const g = computeOptics({
      ...baseInput,
      mount: 'e',
      focalMin: 600,
      focalMax: 600,
      apertureMin: 0.9,
      apertureMax: 0.9,
    });
    expect(g.fEff).toBeCloseTo(600, 6);
    expect(g.nEff).toBeCloseTo(0.9, 6);
    expect(g.dEntrance).toBeCloseTo(600 / 0.9, 6);
    expect(g.dFront).toBeGreaterThanOrEqual(g.dEntrance);
    expect(g.lengthTotal).toBeGreaterThan(0);
    expect(g.segments.find((s) => s.id === 'mount')?.z0).toBe(0);
  });

  it('zoom interpolates focal length and aperture', () => {
    const wide = computeOptics({
      ...baseInput,
      focalMin: 70,
      focalMax: 200,
      apertureMin: 2.8,
      apertureMax: 4,
      zoom: 0,
      barrelStyle: 'external',
    });
    const tele = computeOptics({
      ...baseInput,
      focalMin: 70,
      focalMax: 200,
      apertureMin: 2.8,
      apertureMax: 4,
      zoom: 1,
      barrelStyle: 'external',
    });
    expect(wide.fEff).toBeCloseTo(70, 6);
    expect(tele.fEff).toBeCloseTo(200, 6);
    expect(wide.nEff).toBeCloseTo(2.8, 6);
    expect(tele.nEff).toBeCloseTo(4, 6);
    expect(tele.lMid).toBeGreaterThan(wide.lMid);
  });

  it('internal zoom keeps mid barrel length constant', () => {
    const a = computeOptics({
      ...baseInput,
      focalMin: 70,
      focalMax: 200,
      apertureMin: 2.8,
      apertureMax: 2.8,
      zoom: 0,
      barrelStyle: 'internal',
    });
    const b = computeOptics({
      ...baseInput,
      focalMin: 70,
      focalMax: 200,
      apertureMin: 2.8,
      apertureMax: 2.8,
      zoom: 1,
      barrelStyle: 'internal',
    });
    expect(a.lMid).toBeCloseTo(b.lMid, 6);
  });

  it('teleconverter scales f and N equally and preserves entrance pupil', () => {
    const plain = computeOptics({
      ...baseInput,
      focalMin: 200,
      focalMax: 200,
      apertureMin: 2.8,
      apertureMax: 2.8,
    });
    const tc = computeOptics({
      ...baseInput,
      focalMin: 200,
      focalMax: 200,
      apertureMin: 2.8,
      apertureMax: 2.8,
      teleconverter: 'x2',
    });
    expect(tc.fEff).toBeCloseTo(plain.fEff * 2, 6);
    expect(tc.nEff).toBeCloseTo(plain.nEff * 2, 6);
    expect(tc.dEntrance).toBeCloseTo(plain.dEntrance, 6);
    expect(tc.lAccessory).toBeGreaterThan(0);
    expect(tc.lengthTotal).toBeGreaterThan(plain.lengthTotal);
  });

  it('reducer shortens f and speeds aperture, entrance pupil preserved', () => {
    const plain = computeOptics({
      ...baseInput,
      focalMin: 50,
      focalMax: 50,
      apertureMin: 2,
      apertureMax: 2,
    });
    const red = computeOptics({
      ...baseInput,
      focalMin: 50,
      focalMax: 50,
      apertureMin: 2,
      apertureMax: 2,
      reducer: 'x0.7',
    });
    expect(red.fEff).toBeCloseTo(plain.fEff * 0.7, 6);
    expect(red.nEff).toBeCloseTo(plain.nEff * 0.7, 6);
    expect(red.dEntrance).toBeCloseTo(plain.dEntrance, 6);
  });

  it('segments cover total length without gaps', () => {
    const g = computeOptics({
      ...baseInput,
      focalMin: 24,
      focalMax: 70,
      apertureMin: 2.8,
      apertureMax: 4,
      zoom: 0.3,
    });
    let cursor = 0;
    for (const s of g.segments) {
      expect(s.z0).toBeCloseTo(cursor, 6);
      cursor = s.z1;
    }
    expect(cursor).toBeCloseTo(g.lengthTotal, 6);
  });

  it('rejects invalid parameters', () => {
    expect(() => computeOptics({ ...baseInput, focalMin: 0 })).toThrow();
    expect(() =>
      computeOptics({ ...baseInput, focalMin: 100, focalMax: 50 }),
    ).toThrow();
    expect(() => computeOptics({ ...baseInput, apertureMin: 0.5 })).toThrow();
    expect(() =>
      computeOptics({ ...baseInput, mount: 'nope' as never }),
    ).toThrow();
  });

  it('infinity focus obeys thin lens v=f and beta=0', () => {
    const g = computeOptics({
      ...baseInput,
      focalMin: 600,
      focalMax: 600,
      apertureMin: 0.9,
      apertureMax: 0.9,
      focusDistance: Infinity,
    });
    expect(g.imageDistance).toBeCloseTo(600, 6);
    expect(g.magnification).toBe(0);
    expect(g.bflRef).toBeGreaterThan(0);
  });

  it('prime external barrel keeps fixed mid length', () => {
    const g = computeOptics({
      ...baseInput,
      focalMin: 50,
      focalMax: 50,
      apertureMin: 1.4,
      apertureMax: 1.4,
      zoom: 0,
      barrelStyle: 'external',
    });
    expect(g.lMid).toBeCloseTo(8, 6);
  });
});
