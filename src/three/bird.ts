import * as THREE from 'three';

/**
 * 低多边形参考鸟（单位 mm）。
 * 体长约 180mm，翼展约 280mm，站立于 y=0 地面。
 */
export function createBird(): THREE.Group {
  const bird = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xc45c26,
    metalness: 0.05,
    roughness: 0.75,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x8b3a18,
    metalness: 0.05,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const beakMat = new THREE.MeshStandardMaterial({
    color: 0xe8c547,
    metalness: 0.1,
    roughness: 0.5,
  });

  // 身体
  const body = new THREE.Mesh(new THREE.SphereGeometry(28, 20, 14), bodyMat);
  body.scale.set(1.35, 0.9, 0.95);
  body.position.set(0, 42, 0);
  bird.add(body);

  // 头
  const head = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 12), bodyMat);
  head.position.set(38, 62, 0);
  bird.add(head);

  // 喙
  const beak = new THREE.Mesh(new THREE.ConeGeometry(5, 18, 8), beakMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(58, 60, 0);
  bird.add(beak);

  // 尾
  const tail = new THREE.Mesh(new THREE.ConeGeometry(10, 36, 6), wingMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-42, 48, 0);
  bird.add(tail);

  // 翼
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(14, 70, 4), wingMat);
    wing.rotation.x = side * (Math.PI / 2.4);
    wing.rotation.z = -Math.PI / 2.8;
    wing.position.set(0, 55, side * 28);
    bird.add(wing);
  }

  // 腿
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 18, 8), legMat);
    leg.position.set(4, 12, side * 10);
    bird.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(14, 2, 6), legMat);
    foot.position.set(8, 3, side * 10);
    bird.add(foot);
  }

  bird.position.set(0, 0, 0);
  return bird;
}
