# SuperBirdCamera · 镜头光学 3D 对比台

> 基于物理光学推算的相机镜头 3D 外观对比工具。输入卡口 / 焦段 / 光圈，实时生成可旋转的 3D 镜头模型，并支持多镜头并排、尺寸标注、剖面镜组与鸟模型比例参考。  
> **本文件以中文为准**；英文版见 [README.en.md](./README.en.md)。

---

## 功能特性

### 光学推算
- 按高斯光学与工程分段公式，由 **卡口、焦距、光圈、变焦位置、对焦距离、增距镜 / 减焦镜** 计算：
  - 有效焦距、有效光圈
  - 入瞳直径、前口径
  - 镜身总长与分段（卡口座 / 后组 / 中组 / 前组 / 前玉）
  - 水平 FOV、像距、放大率、机械后焦参考
- 变焦镜头：焦距与光圈随变焦位置插值；支持 **内变焦 / 外变焦**
- 增距镜（1.4× / 2×）、减焦增光镜（0.7× / 0.5×）符合「焦距与 f 数同倍率、入瞳不变」

### 3D 场景
- 程序化镜筒（现代镜造型：橡胶环、卡口、前玉镀膜等）
- **300mm+ 超长焦**：按参考剖面的连续收锥侧影 + GM 风格细节（脚架环、开关、滤镜槽）
- 可选 **剖面 / 内部**：显示镜组落点（前玉、黄胶合、橙弯月、绿后组等）
- **尺寸标注**：L / Ø前 / Ø卡 / Ø入瞳 / Ø后（毫米）
- 3D 标尺：横尺 + 纵尺（在 0 点垂直相交）+ 地面网格
- **参考鸟**：身高 / 翼展约 120mm，用于比例对照

### 多镜头对比
- 添加任意多支镜头，卡片列表可 **选中编辑**、**拖拽排序**（或 ←/→ 按钮）
- 对齐方式：**卡口端 / 前端 / 中心**；顶视图核对并排关系
- 线框叠加、变焦滑杆实时改形

### 界面
- 中文 UI，工程仪器风深色主题
- **桌面 + 手机** 自适应（参数抽屉、触控目标、安全区）
- 顶视 / 透视 / 前视 / 侧视（技术视图用正交投影）

---

## 快速开始

### 环境要求
- **Node.js 18+**（含 npm）
- Windows（提供 `build.bat` / `run.bat` / `serve.ps1`）；其它系统可用下方 npm 命令

### 一键构建并启动（Windows）

```bat
build.bat
dist\run.bat
```

1. `build.bat`：安装依赖 → `tsc` + `vite` 构建 → 将启动脚本拷入 `dist\`
2. `dist\run.bat`：在 `dist\` 起静态服务（端口 8765–8776 自动避让），并打开浏览器  
   - 会打印 **Local / LAN / Public** 访问地址（云服请放行安全组与防火墙）

> 请务必使用 **`dist\run.bat`**。项目根目录的 `run.bat` 若检测到源码页会提示先构建（根目录 `index.html` 含 `/src/main.ts`，不能直接用静态服务器打开）。

### npm 脚本

```bash
npm install          # 或 npm ci
npm run dev          # 开发服务器（热更新）
npm run build        # 类型检查 + 产出 dist/
npm run preview      # 预览 dist
npm test             # 单元测试
```

网络不佳时可指定镜像源后再构建：

```bat
set NPM_REGISTRY=https://registry.npmmirror.com
build.bat
```

### URL 快捷参数

| 参数 | 说明 |
|------|------|
| `?demo=1` | 加载示例两组（600/0.9 与 70–200） |
| `?gallery=1` | 加载现代图鉴（85/24–70/70–200） |
| `?one=600,4` | 只加载一支定焦 600mm f/4 |
| `&view=side` | `side` / `top` / `front` / `perspective` |
| `&interior=1` | 打开剖面 / 内部镜组 |

示例：`http://127.0.0.1:8765/?one=600,4&view=side&interior=1`

---

## 项目结构

```
SuperBirdCamera/
├── build.bat              # Windows 一键构建
├── run.bat                # 启动器（优先 dist\）
├── serve.ps1              # 静态服务（Local/LAN/Public）
├── index.html             # Vite 入口（源码页）
├── package.json
├── src/
│   ├── main.ts
│   ├── style.css          # 含手机响应式
│   ├── types.ts           # LensInput / LensGeometry
│   ├── mounts.ts          # 卡口库（法兰距、喉径…）
│   ├── optics.ts          # 光学纯函数（核心）
│   ├── optics.test.ts
│   ├── ui/app.ts          # 参数台、卡片、选中/排序
│   └── three/
│       ├── scene.ts       # 相机、灯光、对齐、剖面开关
│       ├── lensBuilder.ts # 通用镜筒网格
│       ├── superTele.ts   # 300mm+ 壳体与镜组剖面
│       ├── dimensions.ts  # 尺寸标注
│       ├── rulers.ts      # 横/纵标尺、文字精灵
│       └── bird.ts        # 比例参考鸟
├── docs/compose/spec/     # 功能规格
└── dist/                  # 构建输出（含 run.bat）
```

---

## 开发与扩展指南

### 1. 调整光学公式
核心逻辑在 **`src/optics.ts`** 的 `computeOptics()`：

| 步骤 | 建议改法 |
|------|----------|
| 前口径 `dFront` | 改 `frontFactor` 与入瞳关系 |
| 镜身分段长度 | 改 `lMount` / `lRear` / `lMid` / `lFront` |
| 超长焦写实长径比 | 保持 `L ≈ max(2.6×dFront, 0.7×f)` 或按需调整 |
| 变焦插值 | `lerp(focalMin, focalMax, zoom)` 等 |

改完请跑 `npm test`；在 `src/optics.test.ts` 补断言。

### 2. 新增卡口
编辑 **`src/mounts.ts`**：

```ts
xf: { id: 'xf', name: 'X Mount', flangeDistance: 17.7, throatDiameter: 43.5, outerDiameter: 48.0 },
```

并把 `MountId` 联合类型加上对应字面量。

### 3. 改 3D 外观
- **常规镜头**：`src/three/lensBuilder.ts`（`buildBarrelBody` / `addFrontAssembly`）
- **300mm+**：`src/three/superTele.ts`（`AXIAL.profile` 轮廓控制点、`buildSuperTeleShell`、`buildOpticalInterior`）
- **剖面镜组落点**：`AXIAL.el*` 与 `buildOpticalInterior`

材质与颜色常量多在各文件顶部的 `PALETTE` / `WHITE` 等。

### 4. 尺寸标注
`src/three/dimensions.ts` 的 `addLensDimensions()`；开关在 UI「尺寸标注」。

### 5. 标尺
`src/three/rulers.ts`：横尺（X）、纵尺（Z，与 0 点垂直相交）、鸟旁身高尺。

### 6. UI / 交互
`src/ui/app.ts`：表单校验、卡片选中与 `updateLens`、拖拽排序 `reorderLens`。  
手机布局在 `src/style.css` 的 `@media (max-width: 860px)`。

### 7. 测试与构建
```bash
npm test
npm run build
```
新行为建议补 **纯函数测试**（optics）或 **几何存在性测试**（lensBuilder）。

### 8. 云端部署
1. 完整拷贝项目（含 `src/`、`package.json`、bat/ps1）
2. `build.bat` 失败多半是 npm 网络问题 → 重试或 `NPM_REGISTRY`
3. `dist\run.bat` 绑定全网卡并打印公网 URL
4. 安全组 / 防火墙放行 **TCP 8765–8776**

---

## 示例镜头

| 名称 | 参数 | 说明 |
|------|------|------|
| 超高速长焦 | E · 600mm · f/0.9 | 物理尺寸极大，用于极端光学对比 |
| 变焦 | E · 70–200mm · f/0.9–f/2.8 | 变焦环实时改形 |
| 写实定焦 | E · 600mm · f/4 | L/D≈2.6，贴近现代超长焦 |
| 图鉴 | 85 / 24–70 / 70–200 | 常见焦段造型 |

---

## 许可证

按仓库约定使用。请勿将第三方商标 / 产品图当作官方标识使用；模型为程序化示意，非厂商工程图纸。

---

# English

## SuperBirdCamera · Lens Optics 3D Studio

Web app that estimates lens barrel geometry from **mount / focal length / aperture** and renders interactive 3D models for side-by-side comparison.

### Features
- Gaussian + engineering barrel formulas (entrance pupil, front diameter, length segments, FOV, BFL)
- Zoom / prime, internal vs external zoom, teleconverters, focal reducers
- Modern barrel meshes; 300mm+ super-tele silhouette + optional optical cutaway
- Per-lens dimension callouts (L, Ø front / mount / entrance pupil)
- Cross rulers (X & Z meeting at 0), grid, 120mm reference bird
- Multi-lens list: select & edit, drag reorder, mount/front/center align, wireframe
- Desktop + mobile UI

### Quick start (Windows)
```bat
build.bat
dist\run.bat
```

### npm
```bash
npm install
npm run dev
npm run build
npm test
```

### URL presets
`?demo=1` · `?gallery=1` · `?one=600,4` · `&view=side` · `&interior=1`

### Extending
| Goal | File |
|------|------|
| Optical math | `src/optics.ts` |
| New mount | `src/mounts.ts` |
| Standard barrel look | `src/three/lensBuilder.ts` |
| Super-tele shell / elements | `src/three/superTele.ts` |
| Dimensions | `src/three/dimensions.ts` |
| UI | `src/ui/app.ts` |
| Mobile CSS | `src/style.css` |

See the Chinese section above for the full development guide.
