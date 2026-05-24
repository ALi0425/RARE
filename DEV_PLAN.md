# RARE 平台开发计划 v1

## 技术栈

| 层级 | 选型 | 说明 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | Vite 构建 |
| 图编辑引擎 | @xyflow/react v12 | ReactFlow 最新版 |
| 状态管理 | Zustand | 比 useNodesState 更可控，避免 setNodes 纯函数问题 |
| CSS 方案 | Tailwind CSS | 高效实现毛玻璃沉浸式设计 |
| 后端 | Express + Prisma ORM | RESTful API |
| 数据库 | PostgreSQL | Docker 运行中 |
| 工作流引擎 | n8n | 解析需求走 n8n webhook |
| AI 模型 | Ollama (本地) / DeepSeek API | 按需选择 |

## 数据库 Schema

```
Validation (校验条件)     ← 新增
├── id, fieldId?, actionId?, edgeId?
├── rule: string         (如 "余额需大于 100")
├── type: "pre_condition" | "post_condition"
└── sourceQuote: string? (原文引用)

Project
  ├── Module (一级容器)
  │     └── Page (二级容器)
  │           ├── Field (三级原子)
  │           │     └── Validation[] (前置条件)
  │           └── Action (三级原子)
  │                 └── Validation[] (前置条件)
  ├── Edge (连线)
  │     └── conditions: Validation[] (连线校验)
  └── CommitLog (版本)
```

- `moduleId: String?` (Page → Module，可为 null = 游离)
- `pageId: String?` (Field/Action → Page，可为 null = 游离)
- Edge: sourceId, targetId, label, sourceQuote, flowType, status

## 开发阶段

### 阶段一：后端基建（1-2小时）

#### 1.1 初始化项目
```
backend/
├── prisma/
│   └── schema.prisma    # 数据模型定义
├── src/
│   ├── index.ts         # Express 入口
│   ├── lib/
│   │   └── prisma.ts    # Prisma 客户端
│   ├── routes/
│   │   ├── projects.ts  # 项目 CRUD
│   │   ├── assets.ts    # 模块/页面/字段/动作 CRUD
│   │   └── edges.ts     # 连线 CRUD
│   └── services/
│       └── llm.ts       # 本地 LLM 解析
├── package.json
└── tsconfig.json
```

#### 1.2 数据模型定义
- Project: id, name, description, status (active/archived)
- Module: id, projectId, name, posX, posY
- Page: id, projectId, moduleId?, name, posX, posY
- Field: id, projectId, pageId?, name, fieldType, posX, posY
- Action: id, projectId, pageId?, name, actionType, validations[], posX, posY
- Edge: id, projectId, sourceId, targetId, label, sourceQuote, flowType (BUSINESS_FLOW|DATA_FLOW), status (extracted|inferred)

#### 1.3 API 路由
- `GET    /api/projects` — 项目列表
- `POST   /api/projects` — 新建项目
- `GET    /api/projects/:id` — 项目详情（含全部层级 + 连线）
- `PATCH  /api/projects/:id` — 更新项目
- `POST   /api/parse/:projectId` — 解析需求文档（清除旧数据 → LLM 生成 → 入库 → 返回）

模块/页面/字段/动作/连线的完整 CRUD:
- `POST/PATCH/DELETE` for each entity type
- 删除页面时：其子级 field/action 的 pageId 设为 null（孤儿保护）
- 删除模块时：其子级 page 的 moduleId 设为 null（孤儿保护）

### 阶段二：前端基建（1-2小时）

#### 2.1 初始化项目
```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx               # 路由：Lobby ↔ Canvas
│   ├── api/
│   │   └── index.ts          # API 封装
│   ├── pages/
│   │   ├── Lobby.tsx          # 项目大厅
│   │   └── ProjectCanvas.tsx  # 画布（核心）
│   ├── components/
│   │   └── canvas/
│   │       └── Nodes.tsx      # ModuleNode, PageNode, FieldNode, ActionNode
│   └── types/
│       └── index.ts          # TypeScript 类型
├── package.json
├── tsconfig.json
└── vite.config.ts
```

#### 2.2 项目大厅 (Lobby)
- 毛玻璃卡片展示活跃项目
- 名前、资产规模、最后活跃时间
- 新建项目按钮 → 极简弹窗 → 输入名称+目标 → Enter 创建
- 点击卡片 → 跳转画布

### 阶段三：画布核心交互（核心，h，最重要）

#### 3.1 节点组件
四种节点类型，统一视觉风格：
- 毛玻璃（glassmorphism）背景 + 细彩色边框 + ◆ 标签
- 四方向 Handle
- Module/Page 作为容器（方形，偏大）
- Field 作为输入原子（偏小）
- Action 作为操作原子（偏小，带▶图标）

#### 3.2 数据加载 (useEffect → setNodes)
```
加载项目 → API → 遍历 Project 的层级结构
→ 创建模块节点（绝对坐标）
→ 创建页面节点（相对模块的坐标，parentId = moduleId）
→ 创建字段/动作节点（相对页面的坐标，parentId = pageId）
→ 创建连线
→ 节点排序：模块 > 页面 > 字段/动作（父节点在子前面）
```

#### 3.3 交互实现（6条需求的完整实现）

**R1 — 层级拖拽**
- React Flow 原生 parentId 机制：拖父节点 → 子节点随动
- 子节点移动 → 父节点不动（extent:'parent' 约束子节点在容器内）
- 三层嵌套：module → page → field/action

**R2 — 容器包裹 + 动态尺寸**
- `extent:'parent'` 约束子节点在容器内（视觉不可脱出）
- 容器尺寸在 **onNodeDragStop** 时一次性重算（computeFluidBounds）
- `CSS transition: width 0.15s ease, height 0.15s ease` 平滑变化
- 重算时机：任何拖拽结束时、注入/脱出后

**R3 — Space+拖拽脱出/注入**
- `onNodeDrag`：Space 按下时设 spaceUsedThisDragRef = true（只记标记，不调 setNodes）
- `onNodeDragStop`：
  1. wasSpace → getNodeAbsPosition（走完整父链）→ detach（parentId = undefined，坐标转绝对）
  2. 如果节点现在浮动 → 收集所有容器（module + page），按深度排序
  3. 有任意重叠 → 注入到最深容器（设置相对坐标 + parentId）
  4. 重算所有容器尺寸
- API 调用通过 setTimeout(0) 在 setNodes 返回后执行（保持 setNodes 纯函数）

**R4 — 右键删除节点**
- `onNodeContextMenu` → 弹出 ContextMenu 组件
- 容器被删除时：子节点不删除，parentId 设为 undefined（绝对坐标计算用 getNodeAbsPosition）
- 非容器节点：直接删除

**R5 — 右键新建节点**
- `onPaneContextMenu` → 弹出 CreateMenu 组件
- 新建 module/page/field/action，可命名
- 新建后触发容器重算

**R6 — 连线双击编辑**
- `onEdgeDoubleClick` → 弹出 EditEdgeDialog
- 可编辑：标签(label)、原文引用(sourceQuote)
- 保存到后端

### 阶段四：解析引擎（1-2小时）

#### 4.1 本地 LLM 解析
- 后端接收解析请求 → 调用 LLM（Ollama/local AI）→ JSON 模式输出
- JSON 结构：{ modules: [], pages: [], fields: [], actions: [], edges: [] }
- 布局算法：模块水平排列，页面在模块内垂直排列，字段在页面内左右排列

#### 4.2 验证与完善
- 端到端测试：粘贴需求 → 解析 → 画布渲染
- 验证 6 条需求全部可用
- 处理边缘情况

## 时间预估

| 阶段 | 内容 | 预估时间 |
|------|------|---------|
| 一 | 后端基建 + 数据库 | 1.5h |
| 二 | 前端基建 + 大厅 | 1.5h |
| 三 | 画布核心交互（6条需求） | 3-4h |
| 四 | 解析引擎 + 验证 | 1-2h |
| **总计** | | **7-9h** |

## 关键设计决策

1. **extent:'parent' 全程开启** — 子节点视觉约束在容器内。Space+拖拽推到边缘，松手时 detach
2. **onNodeDrag 不做任何 setNodes** — 只记 Space 标记。所有状态变更在 onNodeDragStop 一次性完成
3. **API 调用在 setNodes 之外执行** — 通过 setTimeout(0) 收集执行，保持 setNodes 纯函数
4. **containerDepth 深度优先注入** — page（深度2）优先于 module（深度1）
5. **getNodeAbsPosition 走完整父链** — 处理三层嵌套的绝对坐标计算
6. **孤儿保护** — 删除容器时子节点不删，保留为游离节点
