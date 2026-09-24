export type MountId =
  | 'e'
  | 'rf'
  | 'ef'
  | 'f'
  | 'l'
  | 'm'
  | 'm42'
  | 'pl'
  | 'ft'
  | 'x';

export interface MountSpec {
  id: MountId;
  name: string;
  /** 法兰距 mm：卡口安装面到像面 */
  flangeDistance: number;
  /** 卡口喉径 mm */
  throatDiameter: number;
  /** 卡口座外径 mm */
  outerDiameter: number;
}

export const MOUNTS: Record<MountId, MountSpec> = {
  e: { id: 'e', name: 'Sony E', flangeDistance: 18.0, throatDiameter: 46.1, outerDiameter: 50.0 },
  rf: { id: 'rf', name: 'Canon RF', flangeDistance: 20.0, throatDiameter: 54.0, outerDiameter: 58.0 },
  ef: { id: 'ef', name: 'Canon EF', flangeDistance: 44.0, throatDiameter: 54.0, outerDiameter: 58.0 },
  f: { id: 'f', name: 'Nikon F', flangeDistance: 46.5, throatDiameter: 44.0, outerDiameter: 50.0 },
  l: { id: 'l', name: 'Leica L', flangeDistance: 20.0, throatDiameter: 51.6, outerDiameter: 55.0 },
  m: { id: 'm', name: 'Leica M', flangeDistance: 27.8, throatDiameter: 44.0, outerDiameter: 50.0 },
  m42: { id: 'm42', name: 'M42', flangeDistance: 45.5, throatDiameter: 44.0, outerDiameter: 48.0 },
  pl: { id: 'pl', name: 'ARRI PL', flangeDistance: 52.0, throatDiameter: 61.0, outerDiameter: 65.0 },
  ft: { id: 'ft', name: 'M4/3', flangeDistance: 19.25, throatDiameter: 20.0, outerDiameter: 38.0 },
  x: { id: 'x', name: 'Fujifilm X', flangeDistance: 17.7, throatDiameter: 43.5, outerDiameter: 48.0 },
};

export const MOUNT_IDS = Object.keys(MOUNTS) as MountId[];

export function getMount(id: string): MountSpec {
  const mount = MOUNTS[id as MountId];
  if (!mount) {
    throw new Error(`未知卡口: ${id}`);
  }
  return mount;
}
