import type { MountId } from './mounts';

export type TeleconverterId = 'none' | 'x1.4' | 'x2';
export type ReducerId = 'none' | 'x0.7' | 'x0.5';
export type BarrelStyle = 'internal' | 'external';

export interface LensInput {
  mount: MountId;
  focalMin: number;
  focalMax: number;
  /** 最大光圈 f 数（进光量最大，数值最小） */
  apertureMin: number;
  /** 最小光圈 f 数（或变焦长焦端光圈） */
  apertureMax: number;
  /** 变焦位置 0–1，定焦忽略 */
  zoom: number;
  /** 对焦距离 mm；Infinity 表示无穷远 */
  focusDistance: number;
  teleconverter: TeleconverterId;
  reducer: ReducerId;
  barrelStyle: BarrelStyle;
  name?: string;
}

export type SegmentKind =
  | 'mount'
  | 'accessory'
  | 'rear'
  | 'mid'
  | 'front'
  | 'frontGlass';

export interface LensSegment {
  id: string;
  label: string;
  /** 起点：卡口安装面 z=0，光轴 +z 指向物方 */
  z0: number;
  z1: number;
  diameter: number;
  kind: SegmentKind;
}

export interface LensGeometry {
  input: LensInput;
  fBase: number;
  fEff: number;
  nEff: number;
  dEntrance: number;
  dFront: number;
  dRear: number;
  dMid: number;
  lengthTotal: number;
  lMount: number;
  lAccessory: number;
  lRear: number;
  lMid: number;
  lFront: number;
  frontGlassThickness: number;
  focusTravel: number;
  zoomSpan: number;
  fovH: number;
  magnification: number;
  imageDistance: number;
  /** 机械后焦距参考 mm */
  bflRef: number;
  segments: LensSegment[];
}
