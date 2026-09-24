import { getMount } from './mounts';
import type {
  LensGeometry,
  LensInput,
  LensSegment,
  ReducerId,
  TeleconverterId,
} from './types';

const TC_FACTOR: Record<TeleconverterId, number> = {
  none: 1,
  'x1.4': 1.4,
  x2: 2,
};

const REDUCER_FACTOR: Record<ReducerId, number> = {
  none: 1,
  'x0.7': 0.7,
  'x0.5': 0.5,
};

const TC_LENGTH: Record<TeleconverterId, number> = {
  none: 0,
  'x1.4': 22,
  x2: 48,
};

const REDUCER_LENGTH: Record<ReducerId, number> = {
  none: 0,
  'x0.7': 28,
  'x0.5': 35,
};

/** 全画幅半宽 mm */
const SENSOR_HALF_WIDTH = 18;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function computeOptics(input: LensInput): LensGeometry {
  if (!(input.focalMin > 0) || !(input.focalMax > 0)) {
    throw new Error('焦距必须为正数');
  }
  if (input.focalMin > input.focalMax) {
    throw new Error('焦距区间无效：最小值不能大于最大值');
  }
  if (!(input.apertureMin >= 0.7) || !(input.apertureMax >= 0.7)) {
    throw new Error('光圈 f 数不能小于 0.7');
  }
  if (input.apertureMin > input.apertureMax) {
    throw new Error('光圈区间无效：最大光圈不能小于最小光圈');
  }

  const zoom = clamp(input.zoom, 0, 1);
  const tc = TC_FACTOR[input.teleconverter];
  const rd = REDUCER_FACTOR[input.reducer];
  const mount = getMount(input.mount);

  const isZoom = input.focalMax > input.focalMin + 1e-6;
  const focalBase = lerp(input.focalMin, input.focalMax, zoom);
  const fEff = focalBase * tc * rd;

  // 增距镜使光圈变慢，减焦镜使光圈变快
  const nZoom = lerp(input.apertureMin, input.apertureMax, isZoom ? zoom : 0);
  const nEff = nZoom * tc * rd;

  // 入瞳直径在增距/减焦前后保持（同一批前组玻璃）
  const dEntrance = focalBase / nZoom;

  const frontFactor = clamp(1.08 + 0.35 * (1 - focalBase / 85), 1.05, 1.55);
  const dFrontRaw = dEntrance * frontFactor;
  const dFront = Math.max(dFrontRaw, mount.outerDiameter * 1.05);
  const dRear = mount.outerDiameter * 1.15;
  const dMid = lerp(dRear, dFront, 0.45);

  const focusU =
    !Number.isFinite(input.focusDistance) || input.focusDistance <= 0
      ? 2000
      : input.focusDistance;
  const focusTravel = clamp(0.02 * focusU, 0.5, 25);

  const lMount = Math.max(8, mount.flangeDistance * 0.35);
  const lAccessory = TC_LENGTH[input.teleconverter] + REDUCER_LENGTH[input.reducer];

  // 后组筒：机械后焦近似 + 对焦行程
  const lRear = Math.max(mount.flangeDistance * 0.55, 0.18 * fEff) + focusTravel;

  const focalSpan = Math.abs(input.focalMax - input.focalMin);
  const zoomSpanRaw = clamp(
    0.12 * focalSpan + 0.08 * input.focalMax,
    8,
    Math.max(12, 0.55 * fEff),
  );
  const zoomSpan = isZoom ? zoomSpanRaw : 8;
  const lMid =
    input.barrelStyle === 'external'
      ? zoomSpan * (0.35 + 0.65 * zoom)
      : zoomSpan;

  const fEstTotal = input.focalMax * tc * rd;
  const lFront = clamp(
    0.22 * fEff + 0.35 * dFront,
    18,
    Math.max(20, 0.45 * fEstTotal),
  );

  const frontGlassThickness = clamp(0.12 * dFront, 2, 0.2 * Math.max(fEstTotal, 40));

  const lengthTotal =
    lMount + lAccessory + lRear + lMid + lFront + frontGlassThickness;

  const fovH = 2 * Math.atan(SENSOR_HALF_WIDTH / fEff) * (180 / Math.PI);

  // 薄透镜成像：u 为正物距
  const u = focusU;
  const imageDistance = u <= fEff * 1.0001 ? fEff * 2 : (u * fEff) / (u - fEff);
  const magnification = Math.abs(fEff / (u - fEff));

  const segments: LensSegment[] = [];
  let z = 0;

  const push = (seg: Omit<LensSegment, 'z0' | 'z1'> & { length: number }) => {
    const z0 = z;
    const z1 = z + seg.length;
    z = z1;
    const { length: _length, ...rest } = seg;
    segments.push({ ...rest, z0, z1 });
    void _length;
  };

  push({
    id: 'mount',
    label: '卡口座',
    length: lMount,
    diameter: mount.outerDiameter,
    kind: 'mount',
  });

  if (lAccessory > 0) {
    push({
      id: 'accessory',
      label: input.teleconverter !== 'none' ? '增距镜' : '减焦增光镜',
      length: lAccessory,
      diameter: Math.min(dRear * 1.2, dFront),
      kind: 'accessory',
    });
  }

  push({
    id: 'rear',
    label: '后组筒',
    length: lRear,
    diameter: dRear,
    kind: 'rear',
  });
  push({
    id: 'mid',
    label: '中组筒',
    length: lMid,
    diameter: dMid,
    kind: 'mid',
  });
  push({
    id: 'front',
    label: '前组筒',
    length: lFront,
    diameter: dFront,
    kind: 'front',
  });
  push({
    id: 'frontGlass',
    label: '前玉',
    length: frontGlassThickness,
    diameter: dFront * 0.92,
    kind: 'frontGlass',
  });

  return {
    input: { ...input, zoom },
    fBase: focalBase,
    fEff,
    nEff,
    dEntrance,
    dFront,
    dRear,
    dMid,
    lengthTotal,
    lMount,
    lAccessory,
    lRear,
    lMid,
    lFront,
    frontGlassThickness,
    focusTravel,
    zoomSpan,
    fovH,
    magnification,
    imageDistance,
    segments,
  };
}

export function formatLength(mm: number): string {
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${mm.toFixed(1)} mm`;
}
