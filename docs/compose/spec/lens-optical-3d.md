---
feature: lens-optical-3d
status: in-progress
updated: 2026-02-25
branch: session/lens-3d-htg7x9
commits: # filled at delivery
---

# 镜头光学 3D 对比台

## Report

## [S1] Problem

用户需要按物理光学规律，根据卡口、焦段、光圈等参数推算镜头外观尺寸（口径、长度、镜组段），并在 Web 中实时 3D 渲染可旋转观察；支持多镜头并排对比、顶视对齐（卡口端/前端）、线框叠加，并提供 3D 标尺与鸟模型作为比例参考。示例：`E f/0.9 600mm` 与 `E f/0.9–f/2.8 70–200mm`。

## [S2] Design

### 产品形态

- Vite + TypeScript + Three.js 单页应用（SPA），无后端。
- 中文 UI，工程仪器风：深色玻璃面板、细线边框、精密刻度数字，主视觉为视口 + 左侧参数台 + 底部镜头卡片列表。
- 可 `npm run build` 静态部署；开发用 `npm run dev`。

### 光学模型（完整光学布局）

纯函数模块 `src/optics.ts`，输入 `LensInput`，输出 `LensGeometry` + 中间光学量。单位 mm。

**输入 `LensInput`**

| 字段 | 含义 |
|------|------|
| mount | 卡口 id（见卡口表） |
| focalMin / focalMax | 焦距；定焦两者相等 |
| apertureMin / apertureMax | 最大–最小光圈 f 数（定焦可相等）；区间表示变焦全程光圈变化 |
| zoom | 变焦位置 0–1（仅变焦；定焦恒为 1） |
| focusDistance | 对焦距离 mm，`Infinity` = 无穷远（默认） |
| teleconverter | `none` \| `x1.4` \| `x2` |
| reducer | `none` \| `x0.7` \| `x0.5` |
| barrelStyle | `internal`（内变焦，默认）\| `external`（外变焦） |
| name | 显示名（可选） |

**卡口表 `src/mounts.ts`**（法兰距、卡口喉径、卡口外径、卡口座厚度）

| id | 名称 | 法兰距 | 喉径 | 卡口外径 |
|----|------|--------|------|----------|
| e | Sony E | 18.0 | 46.1 | 50.0 |
| rf | Canon RF | 20.0 | 54.0 | 58.0 |
| ef | Canon EF | 44.0 | 54.0 | 58.0 |
| f | Nikon F | 46.5 | 44.0 | 50.0 |
| l | Leica L | 20.0 | 51.6 | 55.0 |
| m | Leica M | 27.8 | 44.0 | 50.0 |
| m42 | M42 | 45.5 | 44.0 | 48.0 |
| pl | ARRI PL | 52.0 | 61.0 | 65.0 |
| ft | M4/3 | 19.25 | 20.0 | 38.0 |
| x | Fujifilm X | 17.7 | 43.5 | 48.0 |

**计算链**

1. **有效焦距**  
   `f_eff = lerp(focalMin, focalMax, zoom) * tcFactor * reducerFactor`  
   TC: 1.4 / 2；减焦：0.7 / 0.5。

2. **光圈**  
   变焦镜头按 `zoom` 在 `apertureMin–apertureMax` 间插值得 `N_zoom`，再  
   `N_eff = N_zoom * tcFactor * reducerFactor`（增距变慢、减焦变快）。  
   入瞳直径 `D_e = f_base / N_zoom = f_eff / N_eff`（同一批前组，附加镜不改变入瞳）。

3. **物方视场角**（全画幅 24×36）  
   `FOV_h = 2 * atan(18 / f_eff)`，宽角放大前组相对口径。

4. **前组有效口径**  
   `D_front_raw = D_e * frontFactor`，  
   `frontFactor = clamp(1.08 + 0.35 * (1 - f_eff/85), 1.05, 1.55)`（广角更大、长焦略大于入瞳）。  
   再与卡口喉径、镜身中段包络取几何可行值：  
   `D_front = max(D_front_raw, D_mount_out * 1.05)`。

5. **镜身分段（完整布局）**  
   沿光轴从卡口安装面（z=0，朝向传感器为 −z，前方物方为 +z）拆段：
   - **卡口座** `mountShank`：长度 `flange * 0.35`（不足 8mm 取 8），直径 `mount_out`，带简易卡爪缺口。
   - **后组筒** `rearBarrel`：直径 `D_mount_out * 1.15`，长度  
     `L_rear = max(flange * 0.55, 0.18 * f_eff) + focusTravel`  
     `focusTravel = clamp(0.02 * focusDistance_or_2000, 0.5, 25)`（无穷远用 2000）。
   - **中组变焦筒** `midBarrel`：直径 `lerp(D_rear, D_front, 0.45)`。  
     内变焦长度 `L_mid = zoomSpan`；外变焦 `L_mid = zoomSpan * (0.35 + 0.65 * zoom)`。  
     `zoomSpan = clamp(0.12 * |f_max - f_min| + 0.08 * f_max, 8, max(8, 0.55 * f_est))`，定焦取 `8`。
   - **前组筒** `frontBarrel`：直径 `D_front`，长度  
     `L_front = clamp(0.22 * f_eff + 0.35 * D_front, 18, max(18, 0.45 * f_est_total))`。  
     前玉用球冠玻璃：曲率半径 `R ≈ 0.9 * D_front`，厚度 `T_front ≈ 0.12 * D_front`。
   - **遮光罩接口环**（可选装饰环，不计入光学长）。

   **镜身总长**（卡口面→前玉顶）  
   `L_total = mountShank + L_rear + L_mid + L_front + T_front_effective`。

   **主点/像距参考量**（用于信息面板，非网格）：  
   - 理想薄透镜像距 `v = 1 / (1/f - 1/u)`，`u` 为对焦距离（同号约定：物距取正）；`u→∞` 时 `v=f`，`β=0`。  
   - 后焦距参考 `BFL_ref = flange + L_rear * 0.25`（机械后焦近似，用于说明后组相对位置）。  
   - 放大率 `β = |f_eff / (u - f_eff)|`。

5b. **附加镜**  
   - 增距镜：在卡口座前插入段，长度 1.4×→22、2×→48，直径 `min(D_rear*1.2, D_front)`。  
   - 减焦增光镜：插入段长度 0.7×→28、0.5×→35。

6. **变焦可见性**  
   信息面板显示当前 `zoom` 对应 `f_eff`、`N_eff`、`D_e`、`D_front`、`L_total`，并随滑杆实时刷新几何。

### 几何与渲染

- 全部程序化 Three.js 网格（圆柱段 + 环 + 球冠前玉 + 非金属镜筒 PBR + 玻璃感前玉）。
- 镜头局部坐标系：**卡口面 z=0**，光轴 +z 指向物方；场景中多镜头按对齐策略摆放。
- **鸟参考**：低多边形程序化鸟（体/翼/尾/喙），默认立于 z 轴旁地面，身高/翼展约 120mm，身高标尺与鸟同位，材质可辨。
- **3D 标尺**：场景地面 10mm 细网格 + 100mm 粗网格；沿 X 的毫米标尺条（每 10/50/100mm 刻度）；镜头旁自动附尺寸标注线（长度/前口径）。
- **对齐选项** `alignMode`：`mount`（卡口面共面，默认）\| `front`（前玉顶共面）\| `center`（几何中心共面）。顶视图（正交俯视）一键切换。
- **线框叠加** `wireframeOverlay`：每镜头实体材质 + 叠加 `WireframeGeometry` 线框层，可全局开关；对比时可对指定镜头强制线框。
- 轨道控制器：拖动旋转、滚轮缩放、右键平移；预设视角：透视、顶视、前视、侧视。

### UI 契约

- **参数台**：卡口、焦距（定焦/变焦切换）、光圈（定/变）、对焦距离、变焦位置、增距/减焦、内/外变焦、名称。
- **镜头列表**：每卡片显示摘要（`E · 600mm · f/0.9 · Ø667 · L≈…`），可删除、高亮、单独线框。
- **全局条**：对齐模式、线框总开关、顶视/透视切换、标尺开关、重置相机。
- **示例预设按钮**：一键载入题述两组镜头。
- 非法输入（焦距≤0、光圈&lt;0.7、变焦 min&gt;max）内联报错，不加入列表；UI **拒绝** 而非静默交换 min/max。

### 错误行为

- 未知卡口 id → 抛出并在 UI 拒绝。
- `zoom` 越界钳制到 [0,1]。
- 极端参数（如 600/0.9）按公式给出巨型尺寸，不人为缩小，保证物理一致可对比。

## [S3] Out of Scope

- 真实光学设计/像差/MTF/镜片曲面优化。
- 导出 STEP/GLTF 工程文件（可后续扩展；本版不承诺）。
- 后端、账号、云端存储。
- 移动端深度适配（保证桌面可用即可）。
- 景深/光斑等渲染特效。

## Tasks

- [ ] T1: 挂载表与光学纯函数 + 单元测试 — acceptance: `npm test` 覆盖 f_eff/N_eff/D_front/L_total/TC/减焦/变焦插值，断言与公式一致 (covers: S2)
- [ ] T2: Three.js 场景骨架（相机/灯光/轨道/标尺/鸟/视图预设） — acceptance: 打开页面可见网格标尺与鸟，可旋转缩放，顶视/透视可切换 (covers: S2; depends: T1)
- [ ] T3: 程序化镜头网格构建器 — acceptance: 单组 `E f/0.9 600mm` 与 `E 70–200 f/2.8` 外观分段直径/长度与 `LensGeometry` 数值一致 (covers: S2; depends: T1)
- [ ] T4: 多镜头并排 + 对齐/线框/参数台 UI — acceptance: 可添加题述两组并按卡口/前端对齐，顶视图对齐正确，线框可叠加，变焦滑杆实时改形 (covers: S2; depends: T2, T3)
- [ ] T5: 构建与聚焦验证 — acceptance: `npm run build` 成功，`npm test` 全绿；记录命令结果 (covers: S2; depends: T4)
