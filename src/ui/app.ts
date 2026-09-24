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
  /** 当前选中（可编辑）的镜头下标 */
  selectedIndex: number | null;
}

const state: AppState = {
  lenses: [],
  alignMode: 'mount',
  wireframeOverlay: false,
  lensWire: [],
  selectedIndex: null,
};

let sceneApi: SceneApi;

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <header class="topbar">
      <h1>镜头光学 3D</h1>
      <span class="badge hide-sm">物理尺寸推算</span>
      <span class="badge hide-sm">多镜头并排</span>
      <div class="spacer"></div>
      <button id="togglePanel" type="button" class="btn-panel">参数</button>
      <label class="hide-sm">对齐
        <select id="alignMode">
          <option value="mount">卡口端对齐</option>
          <option value="front">前端对齐</option>
          <option value="center">中心对齐</option>
        </select>
      </label>
      <label><input type="checkbox" id="wireframe" />线框叠加</label>
      <label><input type="checkbox" id="interior" />剖面 / 内部</label>
      <label><input type="checkbox" id="rulers" checked />3D 标尺</label>
      <button id="viewTop" type="button">顶视图</button>
      <button id="viewPersp" type="button">透视</button>
      <button id="viewFront" type="button">前视</button>
      <button id="viewSide" type="button">侧视</button>
      <button id="resetCam" type="button">复位相机</button>
    </header>
    <aside class="panel" id="panel">
      <div class="panel-head">
        <h2>镜头参数</h2>
        <button id="closePanel" type="button" class="btn-panel hide-lg">收起</button>
      </div>
      <div class="sel-hint" id="selHint">未选中镜头 · 可直接「添加镜头」</div>
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
        <button id="updateLens" type="button" disabled>更新所选</button>
        <button id="deselect" type="button" disabled>取消选中</button>
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

  const panel = el<HTMLDivElement>('panel');
  const togglePanel = el<HTMLButtonElement>('togglePanel');
  const closePanel = el<HTMLButtonElement>('closePanel');
  const setPanelOpen = (open: boolean) => {
    panel.classList.toggle('open', open);
    sceneApi.resize();
  };
  togglePanel.addEventListener('click', () => setPanelOpen(!panel.classList.contains('open')));
  closePanel.addEventListener('click', () => setPanelOpen(false));

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
  const selHint = el<HTMLDivElement>('selHint');
  const updateLensBtn = el<HTMLButtonElement>('updateLens');
  const deselectBtn = el<HTMLButtonElement>('deselect');

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

  function fillForm(g: LensGeometry): void {
    const input = g.input;
    name.value = input.name ?? '';
    mount.value = input.mount;
    const isPrime = input.focalMax <= input.focalMin + 1e-6;
    focalKind.value = isPrime ? 'prime' : 'zoom';
    focalMin.value = String(input.focalMin);
    focalMax.value = String(input.focalMax);
    apertureMin.value = String(input.apertureMin);
    apertureMax.value = String(input.apertureMax);
    zoom.value = String(input.zoom);
    focusDistance.value = Number.isFinite(input.focusDistance) ? String(input.focusDistance) : 'inf';
    tc.value = input.teleconverter;
    reducer.value = input.reducer;
    barrel.value = input.barrelStyle;
    focalMax.disabled = isPrime;
    apertureMax.disabled = isPrime;
    zoom.disabled = isPrime;
    refreshPreview();
  }

  function setSelection(index: number | null): void {
    state.selectedIndex = index;
    updateLensBtn.disabled = index === null;
    deselectBtn.disabled = index === null;
    if (index === null) {
      selHint.textContent = '未选中镜头 · 可直接「添加镜头」';
    } else {
      const g = state.lenses[index];
      selHint.textContent = `已选中 #${index + 1} · 改参数后点「更新所选」`;
      if (g) fillForm(g);
    }
    renderCards();
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

  function reorderLens(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= state.lenses.length || to >= state.lenses.length) {
      return;
    }
    const [g] = state.lenses.splice(from, 1);
    state.lenses.splice(to, 0, g);
    const [w] = state.lensWire.splice(from, 1);
    state.lensWire.splice(to, 0, w);
    if (state.selectedIndex === from) state.selectedIndex = to;
    else if (state.selectedIndex !== null) {
      const s = state.selectedIndex;
      if (from < s && to >= s) state.selectedIndex = s - 1;
      else if (from > s && to <= s) state.selectedIndex = s + 1;
    }
    sceneApi.setLenses(state.lenses, state.lensWire);
    setSelection(state.selectedIndex);
  }

  function renderCards(): void {
    cards.innerHTML = '';
    let dragFrom = -1;

    state.lenses.forEach((g, index) => {
      const card = document.createElement('article');
      card.className =
        'card' +
        (state.selectedIndex === index ? ' selected' : '') +
        (state.lensWire[index] ? ' active' : '');
      card.title = '拖动调整顺序 · 点击选中编辑';
      card.draggable = true;
      card.dataset.index = String(index);

      const grip = document.createElement('span');
      grip.className = 'grip';
      grip.textContent = '⠿';
      card.appendChild(grip);

      card.addEventListener('dragstart', (e) => {
        dragFrom = index;
        card.classList.add('dragging');
        e.dataTransfer?.setData('text/plain', String(index));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        cards.querySelectorAll('.card').forEach((c) => c.classList.remove('drag-over'));
        dragFrom = -1;
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove('drag-over');
        const raw = e.dataTransfer?.getData('text/plain') ?? String(dragFrom);
        const from = Number(raw);
        if (Number.isFinite(from) && from >= 0) reorderLens(from, index);
      });
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button, input, select, .grip')) return;
        setSelection(index);
      });
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
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.textContent = '←';
      upBtn.title = '前移';
      upBtn.className = 'order-btn';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderLens(index, index - 1);
      });
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.textContent = '→';
      downBtn.title = '后移';
      downBtn.className = 'order-btn';
      downBtn.disabled = index === state.lenses.length - 1;
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderLens(index, index + 1);
      });
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = '编辑';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelection(index);
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.lenses.splice(index, 1);
        state.lensWire.splice(index, 1);
        if (state.selectedIndex === index) setSelection(null);
        else if (state.selectedIndex !== null && state.selectedIndex > index) {
          setSelection(state.selectedIndex - 1);
        }
        sceneApi.setLenses(state.lenses, state.lensWire);
        renderCards();
      });
      actions.append(upBtn, downBtn, wireBtn, editBtn, delBtn);
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
      setSelection(state.lenses.length - 1);
    } catch (err) {
      formError.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  updateLensBtn.addEventListener('click', () => {
    formError.textContent = '';
    const idx = state.selectedIndex;
    if (idx === null) return;
    try {
      const g = computeOptics(readInput());
      state.lenses[idx] = g;
      sceneApi.setLenses(state.lenses, state.lensWire);
      setSelection(idx);
    } catch (err) {
      formError.textContent = err instanceof Error ? err.message : String(err);
    }
  });

  deselectBtn.addEventListener('click', () => setSelection(null));

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

  el<HTMLInputElement>('interior').addEventListener('change', (e) => {
    sceneApi.setInteriorVisible((e.target as HTMLInputElement).checked);
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
  // 单条定焦快载：?one=600,4  或 ?one=600,4&view=side
  const one = params.get('one');
  if (one) {
    const [fS, nS] = one.split(',');
    const f = Number(fS);
    const n = Number(nS);
    if (f > 0 && n >= 0.7) {
      pushLens({
        mount: 'e',
        focalMin: f,
        focalMax: f,
        apertureMin: n,
        apertureMax: n,
        zoom: 1,
        focusDistance: Infinity,
        teleconverter: 'none',
        reducer: 'none',
        barrelStyle: 'internal',
        name: `${f}mm f/${n}`,
      });
    }
    const view = params.get('view');
    if (view === 'top' || view === 'front' || view === 'side' || view === 'perspective') {
      sceneApi.setView(view);
    }
  }
  if (params.get('interior') === '1') {
    const box = el<HTMLInputElement>('interior');
    box.checked = true;
    sceneApi.setInteriorVisible(true);
  }
  if (one) {
    // already loaded
  } else if (params.get('demo') === '1') {
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
