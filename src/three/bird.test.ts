import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BIRD_HEIGHT_MM, BIRD_SPAN_MM, createBird } from './bird';

describe('createBird', () => {
  it('matches spec height and wingspan in mm', () => {
    const bird = createBird();
    bird.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(bird);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeCloseTo(BIRD_HEIGHT_MM, 0);
    expect(size.z).toBeCloseTo(BIRD_SPAN_MM, 0);
  });
});
