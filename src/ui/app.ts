import { MOUNTS, MOUNT_IDS, type MountId } from '../mounts';
import { computeOptics, formatLength } from '../optics';
import type {
  BarrelStyle,
  LensGeometry,
  LensInput,
  ReducerId,
  TeleconverterId,
} from '../types';
import { createScene, type AlignMode, type SceneApi, type ViewPreset } from '../three/scene';

interface AppState {
  lenses: LensGeometry[];
  alignMode: AlignMode;
  wireframeOverlay: boolean;
  lensWire: boolean[];
}

const state: AppState = {
  lenses: [],
  alignMode: 'mount',
  wireframeOverlay: false,
  lensWire: [],
};

let sceneApi: SceneApi;

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="topbar">
      <h1>镜头光学 3D 对比台</h1>
      <span class="badge">物理尺寸推算</span>
      <span class="badge">多镜头并排</span>
      <div class="spacer"></div>
      <label>对齐
        <select id="alignMode">
          <option value="mount">卡口端对齐</option>
          <option value="front">前端对齐</option>
          <option value="center">中心对齐</option>
        </select>
      </label>
      <label><input type="checkbox" id="wireframe" />线框叠加</label>
      <label><input type="checkbox" id="rulers" checked />3D 标尺</label>
      <button id="viewTop" type="button">顶视图</button>
      <button id="viewPersp" type="button">透视</button>
      <button id="viewFront" type="button">前视</button>
      <button id="viewSide" type="button">侧视</button>
      <button id="resetCam" type="button">复位相机</button>
    </header>
    <aside class="panel">
      <h2>镜头参数</h2>
      <div class="field"><label>名称</label><input id="name" placeholder="可选" /></div>
      <div class="field"><label>卡口</label>
        <select id="mount">${MOUNT_IDS.map((id: MountId) => `<option value="${id}">${MOUNTS[id].name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>焦距类型</label>
        <select id="focalKind">
          <option value="zoom">变焦</option>
          <option value="prime">定焦</option>
        </select>
      </div>
      <div class="field"><label>焦距 mm</label>
        <div class="row-2">
          <input id="focalMin" type="number" min="1" step="0.1" value="70" />
          <input id="focalMax" type="number" min="1" step="0.1" value="200" />
        </div>
      </div>
      <div class="field"><label>光圈 f/</label>
        <div class="row-2">
          <input id="apertureMin" type="number" min="0.7" step="0.1" value="2.8" title="最大光圈" />
          <input id="apertureMax" type="number" min="0.7" step="0.1" value="4" title="最小/长焦光圈" />
        </div>
      </div>
      <div class="field"><label>变焦位置</label>
        <input id="zoom" type="range" min="0" max="1" step="0.01" value="0" />
      </div>
      <div class="field"><label>对焦距离</label>
        <input id="focusDistance" type="text" value="inf" placeholder="mm 或 inf" />
      </div>
      <div class="field"><label>增距镜</label>
        <select id="tc">
          <option value="none">无</option>
          <option value="x1.4">1.4×</option>
          <option value="x2">2×</option>
        </select>
      </div>
      <div class="field"><label>减焦镜</label>
        <select id="reducer">
          <option value="none">无</option>
          <option value="x0.7">0.7×</option>
          <option value="x0.5">0.5×</option>
        </select>
      </div>
      <div class="field"><label>镜筒</label>
        <select id="barrel">
          <option value="internal">内变焦</option>
          <option value="external">外变焦</option>
        </select>
      </div>
      <div class="error" id="formError"></div>
      <div class="actions">
        <button id="addLens" type="button">添加镜头</button>
        <button id="presetDemo" type="button">载入示例两组</button>
        <button id="presetGallery" type="button">现代图鉴</button>
        <button id="clearAll" type="button">清空</button>
      </div>
      <div class="meta" id="opticsMeta">填写参数后将显示光学推算摘要。</div>
    </aside>
    <main class="viewport" id="viewport"></main>
    <section class="cards" id="cards"></section>
  `;

  const viewport = root.querySelector<HTMLElement>('#viewport');
  if (!viewport) throw new Error('viewport missing');
  sceneApi = createScene(viewport);

  const el = <T extends HTMLElement>(id: string): T => {
    const node = root.querySelector<T>(`#${id}`);
    if (!node) throw new Error(`missing #${id}`);
    return node;
  };

  const name = el<HTMLInputElement>('name');
  const mount = el<HTMLSelectElement>('mount');
  const focalKind = el<HTMLSelectElement>('focalKind');
  const focalMin = el<HTMLInputElement>('focalMin');
  const focalMax = el<HTMLInputElement>('focalMax');
  const apertureMin = el<HTMLInputElement>('apertureMin');
  const apertureMax = el<HTMLInputElement>('apertureMax');
  const zoom = el<HTMLInputElement>('zoom');
  const focusDistance = el<HTMLInputElement>('focusDistance');
  const tc = el<HTMLSelectElement>('tc');
  const reducer = el<HTMLSelectElement>('reducer');
  const barrel = el<HTMLSelectElement>('barrel');
  const formError = el<HTMLDivElement>('formError');
  const opticsMeta = el<HTMLDivElement>('opticsMeta');
  const cards = el<HTMLElement>('cards');

  function parseFocus(value: string): number {
    const t = value.trim().toLowerCase();
    if (t === '' || t === 'inf' || t === '∞' || t === 'infinity') return Infinity;
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) throw new Error('对焦距离需为正数或 inf');
    return n;
  }

  function readInput(): LensInput {
    const isPrime = focalKind.value === 'prime';
    const fMin = Number(focalMin.value);
    const fMax = isPrime ? fMin : Number(focalMax.value);
    const aMin = Number(apertureMin.value);
    const aMax = isPrime ? aMin : Number(apertureMax.value);
    if (!Number.isFinite(fMin) || !Number.isFinite(fMax)) throw new Error('焦距无效');
    if (!isPrime && fMin > fMax) throw new Error('焦距区间无效：最小值不能大于最大值');
    if (!isPrime && aMin > aMax) {
      throw new Error('光圈区间无效：最大光圈不能小于最小光圈');
    }
    return {
      mount: mount.value as MountId,
      focalMin: fMin,
      focalMax: fMax,
      apertureMin: aMin,
      apertureMax: aMax,
      zoom: isPrime ? 1 : Number(zoom.value),
      focusDistance: parseFocus(focusDistance.value),
      teleconverter: tc.value as TeleconverterId,
      reducer: reducer.value as ReducerId,
      barrelStyle: barrel.value as BarrelStyle,
      name: name.value.trim() || undefined,
    };
  }

  function refreshPreview(): void {
    formError.textContent = '';
    try {
      const g = computeOptics(readInput());
      opticsMeta.textContent = [
        `有效焦距  ${g.fEff.toFixed(1)} mm`,
        `有效光圈  f/${g.nEff.toFixed(2)}`,
        `入瞳 Ø    ${g.dEntrance.toFixed(1)} mm`,
        `前口径 Ø  ${g.dFront.toFixed(1)} mm`,
        `镜身长    ${formatLength(g.lengthTotal)}`,
        `水平 FOV  ${g.fovH.toFixed(2)}°`,
        `像距/放大 ${g.imageDistance.toFixed(1)} mm / ${(g.magnification * 100).toFixed(3)}%`,
        `后焦参考  ${g.bflRef.toFixed(1)} mm`,
        `卡口法兰  ${MOUNTS[g.input.mount].name} · ${MOUNTS[g.input.mount].flangeDistance} mm`,
      ].join('\n');
    } catch (err) {
      opticsMeta.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  function renderCards(): void {
    cards.innerHTML = '';
    state.lenses.forEach((g, index) => {
      const card = document.createElement('article');
      card.className = 'card' + (state.lensWire[index] ? ' active' : '');
      const label =
        g.input.name ??
        `${MOUNTS[g.input.mount].name} ${g.fEff.toFixed(0)}mm`;
      const isZoom = g.input.focalMax > g.input.focalMin + 1e-6;
      const h3 = document.createElement('h3');
      h3.textContent = label;
      card.appendChild(h3);
      const kv = document.createElement('div');
      kv.className = 'kv';
      card.appendChild(kv);
      const writeKv = (g2: LensGeometry) => {
        kv.textContent = '';
        const line1 = document.createElement('div');
        line1.textContent = `${MOUNTS[g2.input.mount].name} · ${g2.fBase.toFixed(0)}mm · f/${g2.nEff.toFixed(2)}`;
        const line2 = document.createElement('div');
        line2.textContent = `Ø前 ${g2.dFront.toFixed(1)} · Ø入瞳 ${g2.dEntrance.toFixed(1)} · L ${g2.lengthTotal.toFixed(1)}`;
        const line3 = document.createElement('div');
        line3.textContent = `FOV ${g2.fovH.toFixed(2)}° · ${g2.input.barrelStyle === 'internal' ? '内变焦' : '外变焦'}`;
        kv.append(line1, line2, line3);
      };
      writeKv(g);
      if (isZoom) {
        const field = document.createElement('div');
        field.className = 'field';
        field.style.marginTop = '8px';
        const lab = document.createElement('label');
        lab.textContent = '变焦';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = String(g.input.zoom);
        slider.addEventListener('input', () => {
          const z = Number(slider.value);
          state.lenses[index] = computeOptics({ ...state.lenses[index].input, zoom: z });
          sceneApi.setLenses(state.lenses, state.lensWire);
          writeKv(state.lenses[index]);
        });
        field.append(lab, slider);
        card.appendChild(field);
      }
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const wireBtn = document.createElement('button');
      wireBtn.type = 'button';
      wireBtn.textContent = state.lensWire[index] ? '取消线框' : '线框';
      wireBtn.addEventListener('click', () => {
        state.lensWire[index] = !state.lensWire[index];
        sceneApi.setLensWireframe(index, state.lensWire[index]);
        renderCards();
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => {
        state.lenses.splice(index, 1);
        state.lensWire.splice(index, 1);
        sceneApi.setLenses(state.lenses, state.lensWire);
        renderCards();
      });
      actions.append(wireBtn, delBtn);
      card.appendChild(actions);
      cards.appendChild(card);
    });
    if (state.lenses.length === 0) {
      cards.innerHTML = '<div class="card"><h3>暂无镜头</h3><div class="kv">使用左侧添加，或载入示例两组。</div></div>';
    }
  }

  function pushLens(input: LensInput): void {
    const g = computeOptics(input);
    state.lenses.push(g);
    state.lensWire.push(false);
    sceneApi.setLenses(state.lenses, state.lensWire);
    renderCards();
  }

  el<HTMLButtonElement>('addLens').addEventListener('click', () => {
    formError.textContent = '';
    try {
      pushLens(readInput());
    } catch (err) {
      formError.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  function loadPresetDemo(): void {
    formError.textContent = '';
    state.lenses = [];
    state.lensWire = [];
    sceneApi.setLenses(state.lenses, state.lensWire);
    pushLens({
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
      name: 'E f/0.9 600mm',
    });
    pushLens({
      mount: 'e',
      focalMin: 70,
      focalMax: 200,
      apertureMin: 0.9,
      apertureMax: 2.8,
      zoom: 0,
      focusDistance: Infinity,
      teleconverter: 'none',
      reducer: 'none',
      barrelStyle: 'external',
      name: 'E f/0.9–f/2.8 70–200mm',
    });
  }

  function loadPresetGallery(): void {
    formError.textContent = '';
    state.lenses = [];
    state.lensWire = [];
    sceneApi.setLenses(state.lenses, state.lensWire);
    pushLens({
      mount: 'e',
      focalMin: 85,
      focalMax: 85,
      apertureMin: 1.4,
      apertureMax: 1.4,
      zoom: 1,
      focusDistance: Infinity,
      teleconverter: 'none',
      reducer: 'none',
      barrelStyle: 'internal',
      name: '85mm f/1.4 定焦',
    });
    pushLens({
      mount: 'e',
      focalMin: 24,
      focalMax: 70,
      apertureMin: 2.8,
      apertureMax: 2.8,
      zoom: 0.5,
      focusDistance: Infinity,
      teleconverter: 'none',
      reducer: 'none',
      barrelStyle: 'internal',
      name: '24–70mm f/2.8',
    });
    pushLens({
      mount: 'e',
      focalMin: 70,
      focalMax: 200,
      apertureMin: 2.8,
      apertureMax: 2.8,
      zoom: 0.7,
      focusDistance: Infinity,
      teleconverter: 'none',
      reducer: 'none',
      barrelStyle: 'external',
      name: '70–200mm f/2.8',
    });
  }

  el<HTMLButtonElement>('presetDemo').addEventListener('click', loadPresetDemo);
  el<HTMLButtonElement>('presetGallery').addEventListener('click', loadPresetGallery);

  el<HTMLButtonElement>('clearAll').addEventListener('click', () => {
    state.lenses = [];
    state.lensWire = [];
    sceneApi.setLenses(state.lenses, state.lensWire);
    renderCards();
  });

  el<HTMLSelectElement>('alignMode').addEventListener('change', (e) => {
    state.alignMode = (e.target as HTMLSelectElement).value as AlignMode;
    sceneApi.setAlignMode(state.alignMode);
  });

  el<HTMLInputElement>('wireframe').addEventListener('change', (e) => {
    state.wireframeOverlay = (e.target as HTMLInputElement).checked;
    sceneApi.setWireframeOverlay(state.wireframeOverlay);
  });

  el<HTMLInputElement>('rulers').addEventListener('change', (e) => {
    sceneApi.setRulersVisible((e.target as HTMLInputElement).checked);
  });

  const views: Record<string, ViewPreset> = {
    viewTop: 'top',
    viewPersp: 'perspective',
    viewFront: 'front',
    viewSide: 'side',
    resetCam: 'perspective',
  };
  for (const [id, preset] of Object.entries(views)) {
    el<HTMLButtonElement>(id).addEventListener('click', () => sceneApi.setView(preset));
  }

  focalKind.addEventListener('change', () => {
    const prime = focalKind.value === 'prime';
    focalMax.disabled = prime;
    apertureMax.disabled = prime;
    zoom.disabled = prime;
    if (prime) {
      focalMax.value = focalMin.value;
      apertureMax.value = apertureMin.value;
      zoom.value = '1';
    }
    refreshPreview();
  });

  for (const node of [
    name,
    mount,
    focalMin,
    focalMax,
    apertureMin,
    apertureMax,
    zoom,
    focusDistance,
    tc,
    reducer,
    barrel,
  ]) {
    node.addEventListener('input', refreshPreview);
    node.addEventListener('change', refreshPreview);
  }

  refreshPreview();
  renderCards();

  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    loadPresetDemo();
    const view = params.get('view');
    if (view === 'top' || view === 'front' || view === 'side' || view === 'perspective') {
      sceneApi.setView(view);
    }
  } else if (params.get('gallery') === '1') {
    loadPresetGallery();
    const view = params.get('view');
    if (view === 'top' || view === 'front' || view === 'side' || view === 'perspective') {
      sceneApi.setView(view);
    }
  }

  window.addEventListener('resize', () => sceneApi.resize());
  sceneApi.resize();
}
