# **🛠️ RARE 系统技术规格书：n8n 工作流与前后端通信架构**

## **1\. 架构概览 (Architecture Overview)**

本系统采用“全解耦”的微服务架构。前端 Vue/React 应用仅负责 UI 渲染（基于定制的 LiteGraph 或 React Flow）和事件派发。所有的业务逻辑编排、大模型调用、双库（PostgreSQL \+ VectorDB）交互，**全部交由 n8n 承担**。

* **通信协议约束**：  
  * **触发动作 (Trigger)**：前端通过 RESTful API (HTTP POST) 触发 n8n 的 Webhook 节点。  
  * **状态反馈 (Status)**：因大模型推理耗时较长，n8n 必须通过 WebSocket 向前端推送实时状态与最终的 JSON 图谱数据，前端据此更新进度条并渲染画布。

## **2\. 核心工作流 A：历史资产多模态解析与推理流**

**触发时机**：用户在项目大厅创建项目，或在项目内部上传新的历史资料（PDF、操作手册、MP4 等）时。  
**核心职责**：将非结构化的文件转化为前端画布可渲染的 Nodes（模块、页面、字段、动作）和 Edges（明确业务流/数据流，以及推断流）。

### **2.1 n8n 节点拓扑与详细配置**

| 序号 | 节点名称 (类型) | 核心职责与关键配置 |
| :---- | :---- | :---- |
| **A-1** | Webhook | **触发接收器** \- Path: /api/v1/projects/:project\_id/ingest \- Method: POST \- Respond: Immediately (返回 202 Accepted 和 task\_id 给前端，断开 HTTP 连接，转为后台异步执行)。 |
| **A-2** | Switch | **多模态分流** \- 规则 1: 属性 mime\_type 包含 video/ $\\rightarrow$ 走视频抽帧微服务 (HTTP Request)。 \- 规则 2: 属性 mime\_type 包含 pdf 或 word $\\rightarrow$ 走 OCR 微服务。 |
| **A-3** | Code (Merge) | **文本清洗合并** \- 接收多模态微服务返回的非结构化文本，剔除乱码，压缩空格，打包为 full\_parsed\_text。 |
| **A-4** | Basic LLM Chain | **实体精准提取** \- Model: Claude 3.5 Sonnet / GPT-4o (温度 $T=0.1$)。 \- Output Parser: 强制开启 JSON Mode。 \- Prompt: “从上下文中提取明确提及的系统模块、页面、字段、动作。不要脑补任何关系。” |
| **A-5** | Advanced LLM Chain | **图谱推理与规则挂载 (核心)** \- Input: full\_parsed\_text \+ 上一步的 entities\_json。 \- Prompt 约束: 1\. 优先提取明确写明的流转线（标记 status: "extracted"并附带 source\_quote）。2. 仅对明显断层的操作（如“提交”）进行常识补全（标记 status: "inferred"）。3. 提取动作的前置条件。 |
| **A-6** | Code (Data Adapter) | **图结构适配器** \- 将大模型的 JSON 转换为前端图表引擎所需的格式。 \- 为每个节点生成唯一 id，将页面的 parentId 指向模块，为连线 (Edges) 指定 sourceHandle 和 targetHandle。 |
| **A-7** | PostgreSQL | **草稿入库** \- 将生成的 Nodes 和 Edges 存入数据库，标记状态为 draft，强行挂载 project\_id。 |
| **A-8** | WebSocket (Standalone) / HTTP Request | **流式推送结果** \- 向前端 WebSocket 频道推流。 \- Payload: 包含完整的 Nodes 数组和 Edges 数组。 |

### **2.2 前端交互协议 (Frontend Handshake)**

* 前端上传文件后，拿到 task\_id。  
* 前端建立 WebSocket 连接监听 ws://host/tasks/{task\_id}。  
* 当接收到 A-8 节点推送的 JSON 时，前端的 ComfyUI 画布组件被唤醒，根据 parentId 渲染嵌套容器；根据 status: "inferred" 渲染流动的虚线。

## **3\. 核心工作流 B：：宏观认知自进化流 (Macro Context Auto-Updater)**

**架构定位**：系统宏观业务常识的“压舱石”。  
**触发时机**：用户在 **动态图谱画布 (人机协同审核画布)** 上完成了对大模型初始提取结果的二次确认（删减错线、重组层级、补充规则），并点击 **【保存初始系统资产】** 成功入库后**自动触发**。  
**核心职责**：将人工校准后的系统静态结构（模块、页面）与动态流转（业务流、数据流）提取出来，交由大模型生成一份**高度凝练的《系统宏观业务流转大纲》**。这份大纲将作为后续所有“智能需求变更”的 RAG 检索最优先级上下文，确保大模型在推演新需求时拥有正确的全局视野。

### **7.1 n8n 节点拓扑与详细配置**

| 序号 | 节点名称 (类型) | 核心职责与关键配置 |
| :---- | :---- | :---- |
| **B-1** | Webhook | **触发接收器**  \- 接收前端画布“保存资产”动作完成后的 project\_id。 |
| **B-2** | PostgreSQL | **全景拓扑快照拉取**  \- 聚合查询该项目**人工确认后**的模块、页面名称，以及核心的 BUSINESS\_FLOW 和 DATA\_FLOW 连线。 \- *(注意：过滤掉底层细枝末节的字段，只抓取骨架结构)*。 |
| **B-3** | LLM Agent | **宏观大纲重塑**  \- Input：人工校准后的全景拓扑数据。 \- Prompt 约束：“作为首席架构师，请基于最新的拓扑数据，撰写该系统的宏观业务流转大纲。要求语言凝练，重点描述模块间的交互逻辑、核心数据流向以及全局性约束。” |
| **B-4** | Vector Store (Upsert) | **认知基准入库**  \- 将大模型生成的《系统宏观业务流转大纲》做 Embedding，写入向量库。 \- 强制挂载 Metadata: project\_id, type: "macro\_summary", status: "baseline"。 |

### **💡 架构时序重新梳理 (The New Timeline)**

为了确保整个 RARE 系统的逻辑严密，我们重新梳理一下目前的完整交互与技术工作流时序：

1. **\[上传阶段\]** 用户上传老文档 $\\rightarrow$ 触发 **工作流 A (多模态解析与微补偿推理)**。  
2. **\[审核阶段\]** 渲染初始 ComfyUI 嵌套画布 $\\rightarrow$ 用户手动纠偏（确认虚线、改层级）。  
3. **\[建基阶段 \- 本次修改点\]** 用户点击保存 $\\rightarrow$ 资产落入 PG 库 $\\rightarrow$ **触发 工作流 D (生成《宏观认知大纲》)**。  
4. **\[需求输入阶段\]** 用户在输入舱提出新需求 $\\rightarrow$ 触发 **工作流 E (双路 RAG 强校验与润色)** $\\rightarrow$ 前端渲染特定标签。  
5. **\[推演阶段\]** 用户确认标签无误，点击“评估影响” $\\rightarrow$ 触发 **工作流 B (Canvas Diff 影响面计算)** $\\rightarrow$ 画布红绿染色。  
6. **\[决断阶段\]** 用户点击“确认保存新架构” $\\rightarrow$ 触发 **工作流 C (版本快照与线性覆盖)**。  
7. *(注意：在截断式覆盖发生后，如果涉及到系统宏观逻辑的重大改变，可能还需要手动或在特定里程碑版本再次触发 工作流 D 更新大纲。)*

## **新增工作流 C：新需求润色与强校验拦截流 (Demand Refinement & Strict Validation)**

**架构定位**：大模型幻觉的“断头台”。

**触发时机**：用户在底部“智能需求输入舱”输入原始需求/上传小文件，点击“发送”时触发（**注意：此步骤发生在点击“评估影响”之前**）。

**核心职责**：利用 RAG 吸收宏观认知，将用户的口水话润色为标准化需求；**通过 Code 节点进行物理级比对**，强行剥离大模型虚构的实体，只为 100% 匹配的实体下发内联选择器数据。

### **8.1 n8n 节点拓扑与详细配置**

| 序号 | 节点名称 (类型) | 核心职责与关键配置 |
| :---- | :---- | :---- |
| **C-1** | Webhook | **前端需求接收**  \- 接收用户原始输入的 raw\_prompt 或文档提取文本。 |
| **C-2** | Vector Store | **宏观+微观双路召回 (Dual-RAG)**  \- 路 1：固定召回 type: "macro\_summary"（获取全局业务流转与前置规则常识）。 \- 路 2：根据 raw\_prompt 语义召回相关的特定页面/字段细节。 |
| **C-3** | LLM Chain (Structured Output) | **需求重构与实体强提取**  \- 结合召回的常识，完善用户逻辑（如补全缺失的前置条件）。 \- 强制输出 JSON 结构，严格分离“润色文本”与“提取实体”： {"refined\_text": "...", "extracted\_entities": \[{"name": "登录页", "type": "page", "is\_new": false}\]} |
| **C-4** | PostgreSQL | **全量合法字典提取**  \- SELECT id, name, type FROM assets WHERE project\_id \= $1。 \- 获取该系统当前所有真实存在的合法实体清单（作为比对基准）。 |
| **C-5** | Code (JavaScript) | **代码级二次强校验 (核心防幻觉关卡)**  \- **逻辑 1（已有实体比对）**：遍历 LLM 提取的 is\_new: false 的实体。将其 name 与 E-4 拉取的合法字典进行绝对字符串匹配（或做轻量级编辑距离容差）。 \- **结果 A（匹配成功）**：将该实体打上库里的真实 id，在返回给前端的文本中，将其替换为特定的占位符格式，例如：\[\[\_\_MATCHED\_\_:page:1098:登录页\]\]。 \- **结果 B（匹配失败）**：判定为大模型幻觉，**剥夺其特殊标签资格，将其退化为普通纯文本**。 \- **逻辑 2（新增实体处理）**：对于 is\_new: true 的实体，直接打上新增标签，例如：\[\[\_\_NEW\_\_:field:积分余额\]\]。 |
| **C-6** | Respond to Webhook | 将经过 Code 节点净化和包装后的最终文本返回给前端。 |

### **前端气泡渲染与交互闭环 (Frontend Rendering Logic)**

当前端接收到 **工作流 E** 返回的带有 \[\[\_\_XXX\_\_\]\] 特殊标记的文本时，执行以下渲染逻辑：

1. **正则表达式解析**：前端拦截特殊占位符。  
2. **合法已有实体渲染 (灰色内联选择器)**：  
   * 识别到 \[\[\_\_MATCHED\_\_:page:1098:登录页\]\] 时，渲染为带有灰色背景的交互标签 \[页面: 登录页\]。  
   * 该标签底层已死死绑定了 ID 1098。用户点击它，可以唤起下拉列表，列表中展示全量的页面数据供其手动重选（重选后更新绑定的 ID）。  
3. **退化实体渲染 (普通文本)**：  
   * 对于在 E-5 节点比对失败、未带特殊标记的词汇，前端直接作为黑色普通文本渲染。这就**彻底阻断了用户尝试去评估一个根本不存在的脏实体的可能性**。  
4. **新增实体渲染 (绿色可编辑标签)**：  
   * 识别到 \[\[\_\_NEW\_\_:field:积分余额\]\] 时，渲染为高亮绿色的 ✨ {新增字段: 积分余额}。用户点击可唤起迷你表单修改其名称或层级。

## **核心工作流 D：新需求智能推演与 Canvas Diff 流**

**触发时机**：用户在前端底部的“智能需求输入舱”输入了新需求文本，**并**通过内联选择器确认了所有“特定实体标签”后，点击【✨ 评估影响】按钮。  
**核心职责**：根据新需求，检索已有资产，计算受影响的链路拓扑，并返回“增量矩阵（新增+修改+受影响波及）”供前端画布进行红绿染色。

### **n8n 节点拓扑与详细配置**

| 序号 | 节点名称 (类型) | 核心职责与关键配置 |
| :---- | :---- | :---- |
| **D-1** | Webhook | **触发接收器** \- Path: /api/v1/projects/:project\_id/evaluate \- Method: POST \- Body 包含: new\_prompt\_text 以及前端校验后的实体标签数组 (如 \[{"id": "node\_123", "type": "page"}, ...\])。 |
| **D-2** | Vector Store (Qdrant/Milvus) | **上下文召回 (RAG)** \- Search Query: new\_prompt\_text。 \- **⚠️ 致命防御**: 必须配置 Metadata 过滤 { "project\_id": { "$eq": "{{$json.project\_id}}" } }。 \- 召回 Top-K 相关的历史规则和页面语义。 |
| **D-3** | PostgreSQL | **拓扑关联查询** \- 根据前端传来的实体标签 ID，查询该实体在数据库中关联的上游和下游连线（依赖溯源）。 |
| **D-4** | LLM Agent (CoT) | **影响面深度推演** \- 注入思维链提示词 (Chain of Thought)。 \- Step 1: 梳理纯新增的节点与属性。 \- Step 2: 梳理顺着数据流被破坏的老节点（如“积分抵扣”导致“结算 API”失效）。 \- Output: Delta JSON (包含 additions, modifications, impacted\_nodes)。 |
| **D-5** | Code (Diff Formatter) | **渲染指令打包** \- 将 impacted\_nodes 的 ID 提取出来，打包为前端画布染色指令。 \- 返回 JSON：{"highlight": {"green": \["new\_id\_1"\], "red": \["old\_id\_5", "old\_id\_7"\], "tooltips": {"old\_id\_5": "结算流断层"}}} |
| **D-6** | Respond to Webhook | (此流程通常在 10s 内，可直接用 HTTP 响应返回)。将染色指令下发给前端。 |

### **前端交互协议 (Canvas Diff Paint)**

* 前端收到 B-6 的 JSON 后，画布进入“审计模式”。  
* 根据 green 数组中的 ID 渲染高亮绿色节点及 \[+ New\] 徽章。  
* 根据 red 数组中的 ID，将老节点渲染为红色警告状态，并将 tooltips 内容挂载到节点上供用户 Hover 查看。

## **4\. 核心工作流 E：截断式物理覆盖与版本快照流**

**触发时机**：前端画布处于“审计模式”（红绿染色状态）时，用户仔细检查了 Diff 影响面，认为逻辑无误，点击了右上角的【✅ 确认保存新架构】按钮。  
**核心职责**：执行数据库的硬写入，生成新版本号；如果是从旧版本（如 V1）触发的，则执行无情的“物理抹杀”动作，清理掉 V1 之后的平行世界线。

### **4.1 n8n 节点拓扑与详细配置**

| 序号 | 节点名称 (类型) | 核心职责与关键配置 |
| :---- | :---- | :---- |
| **E-1** | Webhook | **提交通道** \- Path: /api/v1/projects/:project\_id/commit \- Body: 前端用户确认后的最终态 JSON（包含人工纠偏后的连线）。 |
| **E-2** | PostgreSQL (Execute SQL) | **\[条件触发\] 历史线截断** \- 检查 base\_version。如果当前提交是基于历史版本 V1，执行 SQL： DELETE FROM Commit\_Logs WHERE project\_id \= $1 AND version \> $2; *(依赖数据库表设计中的 ON DELETE CASCADE 自动清理挂载在这些版本上的新增孤儿节点)*。 |
| **E-3** | Vector Store | **\[条件触发\] 记忆切除** \- 发送指令给 Milvus/Qdrant 删除幻觉数据： DELETE WHERE project\_id \== $1 AND version \> $2。 |
| **E-4** | PostgreSQL (Execute SQL) | **快照生成** \- 生成新的 Commit\_ID，插入版本日志表。 |
| **E-5** | PostgreSQL (Upsert) | **资产落库** \- 开启事务 (Transaction)。 \- 将前端传来的全量节点和连线执行 INSERT ON CONFLICT DO UPDATE，将外键 commit\_id 强绑定为新生成的版本。 |
| **E-6** | Vector Store | **语义同步入库** \- 将新确认的【页面/动作/规则】文本做 Embedding 操作写入。 \- **Metadata 必须包含**: project\_id, node\_id, commit\_id。 |
| **E-7** | Respond to Webhook | 返回 200 OK，附带新的 Commit\_ID。 |

### **前端交互协议 (Snapshot State)**

* 由于 C 流程涉及不可逆的抹杀，前端在调用 C-1 之前必须弹出带有 ⚠️ 的红色输入确认框。  
* 收到 C-7 的成功响应后，前端将画布上的红绿色全部褪去，恢复标准主题色。  
* 左侧折叠的“历史时间轴”更新，新增一条最新的版本记录。

## **💡 给研发团队的技术提示 (Tech Notes)**

1. **关于 parentId 的处理机制**：  
   由于我们的前端采用 ComfyUI / React Flow 的嵌套节点模式。在 n8n 执行数据组装（A-6 和 B-5 节点）时，必须严格维护 parentId 字段。如果大模型提取出了一个悬空的动作节点，不要强行指定父节点，将其 parentId 设为 null。前端在渲染时，parentId \== null 的节点会脱离模块容器，显示在画布边缘的公共区域，此时边缘闪烁橙色光晕，强迫产品经理手动去把这些“孤岛节点”拖拽归属到具体的页面容器中。  
2. **关于大模型 JSON 输出不稳定性的防御**：  
   在 A-4 和 A-5 节点，除了开启 JSON Mode，建议结合 Zod 或 Instructor 库进行强 Schema 约束。一旦 n8n 解析 JSON 抛错，应在工作流内部配置一个**带有 3 次重试机制 (Retry on Fail)** 的异常捕获环，尝试让大模型自我修复 JSON 语法。