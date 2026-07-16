# 集装箱业务管理系统 — 开发说明文档

> 本文档面向后续使用 **Cursor / AI 辅助编程** 进行二次开发的工程师。
> 阅读顺序建议：先通读「1 项目概述」「4 系统架构」「5 通用数据层」，再按「10 常见开发任务」中的配方动手改造。
> 文档中所有路径均相对于项目根目录。

---

## 1. 项目概述

一个面向铁路班列 / 多式联运集装箱全生命周期管理的内部业务系统，覆盖客户订舱、调运审批、多维库存、堆场作业、供应计划、维修管理与系统管理七大业务域，内置 7 种角色与基于角色的菜单/权限控制、多级审批、操作审计和管理员「代理登录」能力。

- **形态**：Next.js 16 App Router 全栈单体应用（前端页面 + 内置 REST API + MySQL）。
- **语言**：TypeScript（严格 camelCase 贯穿前后端与数据库列名）。
- **界面语言**：简体中文。
- **数据后端**：MySQL 8；无数据库时自动回退到「内存种子数据」后端，保证预览环境可运行（见 5.2）。

---

## 2. 技术栈

| 领域 | 选型 | 说明 |
| --- | --- | --- |
| 框架 | Next.js 16（App Router） | RSC + Route Handlers |
| 语言 | TypeScript | |
| UI | React 19 + Tailwind CSS v4 + shadcn/ui | 组件在 `components/ui/` |
| 图标 | lucide-react | 禁止用 emoji 代替图标 |
| 图表 | recharts（经 shadcn chart 封装） | 库存分析报表 |
| 数据获取 | SWR | 统一封装在 `lib/api.ts` |
| 数据库 | MySQL 8（`mysql2/promise` 连接池） | |
| 鉴权 | 自研 HMAC-SHA256 签名 Cookie 会话 | 无第三方 auth 库 |
| 密码 | Node `crypto` scrypt | `lib/password.ts` |
| 通知 | sonner（toast） | |
| 初始化脚本 | tsx | `pnpm db:init` |

> ⚠️ **不要**引入 ORM（Prisma/Drizzle 等）。本项目刻意采用轻量「资源注册表 + 通用仓储」模式，保持数据库列名与 TS 字段一一对应。

---

## 3. 目录结构

```
app/
  (dashboard)/              受保护的业务区（共享侧边栏+顶栏布局）
    layout.tsx              RoleProvider / DictionaryProvider / 侧边栏
    page.tsx                系统仪表盘
    inbox/                  待办与通知
    customer/               M01 客户门户：apply/orders/documents/bills
    supply/                 M05 供应计划：plans/contracts/suppliers
    dispatch/               M02 调运：apply/approvals/tasks/returns/ledger
    inventory/              M03 库存：ledger/gate/exceptions/reports/discrepancy
    repair/                 M06 维修：orders
    yard/                   M04 堆场：templates/bookings/yards
    config/                 基础配置：cities
    admin/                  系统管理：users/data/audit/integrations
  login/                    登录页（公共）
  api/
    [resource]/route.ts        通用资源集合接口：GET(列表) / POST(新增)
    [resource]/[id]/route.ts   通用资源单项接口：GET / PATCH / DELETE
    auth/login|logout|me|impersonate/route.ts   鉴权接口

lib/
  resources.ts     ★ 资源注册表（单一配置源，最重要）
  repo.ts          ★ 通用仓储（MySQL / 内存 双后端）
  api.ts           ★ 客户端 useResource hook（SWR）
  audit.ts         审计日志写入
  auth-server.ts   服务端读取会话
  session.ts       会话令牌签名/校验（Edge 兼容）
  password.ts      scrypt 密码哈希
  role-context.tsx 客户端角色/用户/代理登录上下文
  dictionary-context.tsx  城市字典上下文
  nav.ts           ★ 侧边栏导航 + 角色可见性矩阵
  types.ts         ★ 全部业务实体 TS 类型
  mock-data.ts     种子数据 + 角色定义 roles
  db.ts            MySQL 连接池单例
  utils.ts         cn() 等工具

components/
  app-sidebar.tsx / app-header.tsx   框架布局
  page-header.tsx / stat-card.tsx / status-badge.tsx  通用展示组件
  dispatch-document.tsx              调运单据打印视图
  ui/                                shadcn 组件

scripts/
  init-db.ts       初始化：建表 + 导入种子 + 生成用户密码
  sql/schema.sql   建库建表 DDL

middleware.ts      路由守卫（未登录拦截）
```

---

## 4. 系统架构

### 4.1 分层

```
页面组件 (app/.../page.tsx, "use client")
   │  useResource("<key>")  ← lib/api.ts (SWR)
   ▼
REST API  (app/api/[resource]/**)  ← 校验会话 + 写审计
   │  list/get/create/update/remove
   ▼
通用仓储  lib/repo.ts  ── detectBackend() ──►  MySQL (lib/db.ts)  或  内存种子 (lib/mock-data.ts)
   ▲
资源注册表 lib/resources.ts（表名/主键/JSON字段/布尔字段/模块/种子名）
```

### 4.2 核心设计思想

**一切业务实体都是「资源（resource）」**，通过 `lib/resources.ts` 的一张注册表统一描述。API 路由、仓储层、初始化脚本、客户端 hook 全部由这张表驱动，因此**新增或修改一个数据实体通常不需要写新的 API 路由或仓储代码**——只改注册表 + 类型 + 建表 SQL + 种子即可（详见 10.1）。

---

## 5. 通用数据层（重点）

### 5.1 资源注册表 `lib/resources.ts`

每个资源一行配置：

```ts
export const RESOURCES = {
  dispatch: {
    table: "dispatch_orders",   // MySQL 表名
    id: "id",                   // 主键字段名（camelCase，与列名一致）
    json: ["approvals"],        // 需 JSON.stringify/parse 的字段
    bool: [],                   // 存为 TINYINT(1) 的布尔字段
    seed: "dispatchOrders",     // lib/mock-data.ts 中的导出名
    module: "M02 调运管理",      // 审计日志归属模块
    label: "调运订单",           // 审计/UI 展示名
  },
  // ...
} satisfies Record<string, ResourceConfig>

export type ResourceKey = keyof typeof RESOURCES
```

现有资源键（`ResourceKey`）：
`orders, bills, dispatch, returns, inventory, gate, containers, discrepancy, templates, bookings, yards, cities, users, suppliers, supplyPlans, supplyContracts, repair, notifications, audit, integrations`

> 注意 `containers` 的主键是 `containerNo`（非 `id`）。新增资源时若主键非 `id`，务必在 `id` 字段正确声明。

### 5.2 通用仓储 `lib/repo.ts`

导出 `list / get / create / update / remove / currentBackend`。特点：

- **双后端自动探测**：首次访问执行 `SELECT 1`，成功用 MySQL，失败回退内存（种子来自 `mock-data`）。内存后端为**进程内可读写**，重启即还原——仅用于无数据库的预览。
- **值编解码**：读出时 `json` 字段 `JSON.parse`、`bool` 字段转真布尔；写入时反向处理（见 `encodeValue`/`decodeRow`）。
- **列白名单**：写库前 `SHOW COLUMNS` 缓存表列，只写数据库中真实存在的列，多余字段被忽略（前端可安全多传字段）。
- **自动主键**：`create` 时若无主键，生成 `<table>_<base36时间戳><随机>`。

### 5.3 客户端 hook `lib/api.ts`

```ts
const { data, isLoading, error, mutate, create, update, remove } = useResource<T>("<key>")
```

- `data`：`T[]`，SWR 缓存，多组件共享同一 key 自动同步。
- `create(payload)` / `update(id, patch)` / `remove(id, meta)`：写操作后自动 `mutate()` 重新拉取。
- **审计元字段**：payload/patch 可携带 `__auditAction`、`__auditDetail`，会被 API 用于写操作日志（不会写入业务表，PATCH 里被解构剔除）。
- `revalidateResource("<key>")`：跨组件手动刷新某资源。

**写操作调用范式（页面中统一用 try/catch + toast）：**

```ts
try {
  await update(row.id, {
    status: "已通过",
    __auditAction: "审批",
    __auditDetail: `通过还箱申请 ${row.applyNo}`,
  })
  toast.success("已通过")
} catch (e) {
  toast.error((e as Error).message)
}
```

### 5.4 REST 接口约定

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/<resource>` | 列表 |
| POST | `/api/<resource>` | 新增（自动写「新增」审计） |
| GET | `/api/<resource>/<id>` | 单项 |
| PATCH | `/api/<resource>/<id>` | 局部更新（`__auditAction`/`__auditDetail` 可覆盖审计） |
| DELETE | `/api/<resource>/<id>?detail=...` | 删除（`detail` 覆盖审计详情） |

- 所有接口先 `getSession()`，未登录返回 401。
- `audit` 资源自身的写操作**不再递归写审计**。
- 未知资源键返回 404。

---

## 6. 认证与权限

### 6.1 会话机制

- 登录 `POST /api/auth/login`：按 `account` 查 `users`，用 `verifyPassword` 校验（内存后端无哈希时回退到 `SEED_PASSWORD`，默认 `Passw0rd!`）。
- 会话令牌：`lib/session.ts` 用 **Web Crypto HMAC-SHA256** 签名，格式 `base64url(payload).base64url(sig)`，写入 **HttpOnly Cookie `cb_session`**，有效期 12 小时。密钥来自 `APP_SECRET`。
- 令牌 payload 含 `uid/account/name/roleId/exp`，代理登录时附带 `real`（真实管理员身份）。
- 兼容 Edge 运行时，故中间件可直接校验。

### 6.2 路由守卫 `middleware.ts`

- 放行：`/login`、`/api/auth/login`、`/_next`、静态资源。
- 其余路径无有效会话时：页面 302 到 `/login?from=...`，API 返回 401。

### 6.3 客户端角色上下文 `lib/role-context.tsx`

`useRole()` 提供：

```ts
const {
  roleId, role, user,        // 当前生效角色/用户（代理中为被代理者）
  realRoleId, real, isAdmin, // 真实身份；isAdmin === (realRoleId === "R00")
  impersonating,             // 代理中的用户信息，null 表示未代理
  startImpersonation(user),  // 管理员发起代理登录（不能代理 R00）
  stopImpersonation(),       // 结束代理
  logout(),                  // 退出
  loading,
} = useRole()
```

- 数据来源 `GET /api/auth/me`。
- **代理登录**：管理员在「用户与代理」页对目标用户 `startImpersonation`，会话切换为目标身份，但审计日志仍记录真实管理员（`proxied=true, proxyBy=管理员`）。

### 6.4 菜单与页面可见性 `lib/nav.ts`

- `navGroups` 定义分组菜单，每个 `NavItem.roles: RoleId[]` 声明可见角色，侧边栏据此过滤。
- **注意**：`nav.ts` 只控制菜单显隐，属于「UI 级」权限。API 层目前只校验「是否登录」，未做字段级 RBAC。若需强化，见 10.5。

---

## 7. 角色与业务模块

### 7.1 七种角色（`lib/mock-data.ts` `roles`）

| ID | 名称 | 说明 |
| --- | --- | --- |
| R00 | 系统管理员 | 全权限，可代理任意用户 |
| R01 | 集装箱管理部业务专员 | 内部核心操作中枢（大部分模块） |
| R02 | 多联公司内部审批人员 | 五级审批链 |
| R03 | 客户（班列/多联/租箱） | 外部：用箱申请、提还箱、账单确认 |
| R04 | 代管公司操作员 | 进出场、库存、提还箱信息维护 |
| R05 | 承运商操作员 | 调运任务、提还箱、还箱申请 |
| R06 | 堆场操作员 | 现场作业、箱况检查、进出场同步 |

### 7.2 业务模块 ↔ 路由 ↔ 资源

| 模块 | 页面 | 主要资源键 |
| --- | --- | --- |
| M01 客户门户 | customer/apply·orders·documents·bills | `orders`, `bills` |
| M05 供应计划 | supply/plans·contracts·suppliers | `supplyPlans`, `supplyContracts`, `suppliers` |
| M02 调运 | dispatch/apply·approvals·tasks·returns·ledger | `dispatch`, `returns` |
| M03 库存 | inventory/ledger·gate·exceptions·reports·discrepancy | `inventory`, `gate`, `containers`, `discrepancy` |
| M06 维修 | repair/orders | `repair` |
| M04 堆场 | yard/templates·bookings·yards | `templates`, `bookings`, `yards` |
| 基础配置 | config/cities | `cities` |
| 系统管理 | admin/users·data·audit·integrations | `users`, `audit`, `integrations`（data 页聚合全部） |

---

## 8. 数据模型

全部实体类型定义在 `lib/types.ts`（camelCase）。关键实体：`UseBoxOrder`、`Bill`、`DispatchOrder`（含 `approvals: ApprovalStep[]` 审批链）、`ReturnApplication`、`InventoryRow`、`GateRecord`、`ContainerMaster`、`DiscrepancyRow`、`DocTemplate`、`Booking`、`Yard`、`Supplier`、`SupplyPlan`、`SupplyContract`、`RepairOrder`、`SystemUser`、`CityDictItem`、`Notification`、`AuditLog`、`Integration`。

> **约定**：TS 类型字段名 === MySQL 列名 === 前端使用名。改字段时三处同步（类型、`schema.sql`、种子），JSON/布尔字段还要在 `resources.ts` 声明。

数据库表结构见 `scripts/sql/schema.sql`；`AuditLog` 额外含数据库列 `passwordHash`（仅 `users` 表）与审计的 `proxied/proxyBy`。

---

## 9. 环境变量

在项目根目录创建 `.env.development.local`（参考 `.env.example`）：

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_NAME=container_biz
DB_POOL_SIZE=10

APP_SECRET=用 openssl rand -base64 32 生成的强随机串   # 会话签名密钥，生产必须设置
SEED_PASSWORD=Passw0rd!                                 # 种子用户默认密码
```

- 缺 `DB_*` 或数据库连不上：应用仍可运行，走内存后端（数据不持久）。
- 生产环境务必设置强随机 `APP_SECRET`，否则会话可被伪造。

### 启动流程

```bash
pnpm install
# 配置 .env.development.local
pnpm db:init      # 建库建表 + 导入种子 + 生成用户密码（幂等：会先 DELETE 再 INSERT）
pnpm dev          # http://localhost:3000
```

默认账号（密码均为 `SEED_PASSWORD`，默认 `Passw0rd!`）：`admin`(R00) 及各角色种子账号，详见 `lib/mock-data.ts` 的 `systemUsers`。

---

## 10. 常见开发任务（配方）

### 10.1 新增一个业务实体（资源）

1. **类型**：在 `lib/types.ts` 新增 `interface Xxx`。
2. **建表**：在 `scripts/sql/schema.sql` 增加 `CREATE TABLE`，列名与 TS 字段完全一致；JSON 字段用 `JSON`/`TEXT`，布尔用 `TINYINT(1)`。
3. **种子**：在 `lib/mock-data.ts` 导出 `export const xxxList: Xxx[] = [...]`。
4. **注册**：在 `lib/resources.ts` 的 `RESOURCES` 增加一行，正确填写 `table/id/json/bool/seed/module/label`。
5. **（可选）导航**：在 `lib/nav.ts` 加菜单项并设置 `roles`。
6. **重建**：`pnpm db:init` 重新导入。
7. 页面中即可 `useResource<Xxx>("xxx")` —— **无需写任何 API 或仓储代码**。

### 10.2 给已有实体加字段

1. `lib/types.ts` 加字段。
2. `scripts/sql/schema.sql` 对应表加列（已有数据库需手动 `ALTER TABLE` 或重跑 `db:init`）。
3. 若是 JSON/布尔字段 → 在 `resources.ts` 的 `json`/`bool` 数组里补上。
4. 更新种子（可选）。仓储的列白名单会自动纳入新列。

### 10.3 新增一个页面

1. 在 `app/(dashboard)/<模块>/<页面>/page.tsx` 创建（`"use client"`）。
2. 顶部用 `<PageHeader title=... description=... />`，卡片用 `components/ui/*` 与 `StatCard`/`StatusBadge`。
3. 数据用 `useResource`；写操作套 try/catch + `toast` + `__auditAction/__auditDetail`。
4. 在 `lib/nav.ts` 注册菜单与可见角色。
5. 遵循设计规范：3–5 种颜色、语义化 token（`bg-background/text-foreground` 等）、flex 优先、移动端优先。

### 10.4 修改审批链 / 业务规则

审批链数据在 `DispatchOrder.approvals`（`ApprovalStep[]`），调运申请页 `dispatch/apply/page.tsx` 内 `buildApprovals(total)` 按调运总价生成层级；审批动作在 `dispatch/approvals/page.tsx`。业务规则（如 BR-13 必须完成全部预约才可提箱）以内联校验实现，改规则时搜索对应 `BR-` 注释。

### 10.5 强化 API 权限（资源级 ACL）

已实现：`lib/acl.ts` 集中维护「资源 → 可读/可写角色」；`app/api/[resource]/**` 在登录校验后按 `session.roleId`（代理登录时为被代理角色）判定，未授权返回 403。页面侧另有 `components/page-access-guard.tsx` 按 `lib/nav.ts` 拦截直链。

`users` 列表/读写响应会剥离 `passwordHash`；新增用户若未带密码则自动写入 `SEED_PASSWORD` 的哈希。若需字段级或行级隔离，可在 `acl.ts` 与 API 层继续扩展。

---

## 11. 编码规范与约定

- **命名**：camelCase 贯穿 TS/列名/前端；文件名英文，界面文案中文。
- **写操作**：一律经 `useResource` 的 `create/update/remove`，并带审计元字段；禁止在客户端直接 `fetch` 业务写接口绕过 hook。
- **只读页面**：也要用 `useResource("<key>")` 取数，不要再 import `mock-data` 里的数组（`roles`、字典等静态定义除外）。
- **副作用**：禁止在 `useEffect` 里 fetch 业务数据，统一 SWR。
- **JSX 转义**：文本中的 `<`、`>`、`{`、`}`、撇号需转义或包字符串。
- **图标**：只用 lucide-react，尺寸 16/20/24；不得用 emoji。
- **调试**：临时日志用 `console.log("[v0] ...")`，完成后删除。
- **依赖**：新增第三方包先用 `pnpm add` 安装再 import；不要引入 ORM。

---

## 12. 已知注意事项 / 坑

- **API 权限**：`lib/acl.ts` 做资源读写 ACL；列表请求若 403，客户端 `useResource` 软降级为空数组（避免仪表盘崩）。页面直链由 `PageAccessGuard` 拦截。可用 `pnpm check:acl` 校验页面依赖与 ACL 一致性。
- **内存后端不持久**：无数据库时的增删改仅存在于服务进程内存，重启还原。要真持久必须连 MySQL 并 `pnpm db:init`。
- **`db:init` 会清表**：每个资源先 `DELETE` 再 `INSERT`，勿在生产对已有数据直接运行。
- **`containers` 主键是 `containerNo`**：切换箱属等更新用 `containerNo` 作为 `update(id,...)` 的 id。
- **`tsc --noEmit` 存在历史告警**：主要是 shadcn `Select onValueChange` 的 `string|null` 签名与 `PageHeader` props 用法，属项目既有模式，不影响运行（Next SWC 构建通过）。改动时不必强行修这些历史告警。
- **审计模块自身**：`audit` 资源的写不再触发审计，避免递归。
- **代理登录审计**：所有代理期间的写操作都会带 `proxied=true` 与真实管理员 `proxyBy`，排查问题时以此追溯真实操作者。

---

## 13. 快速定位对照表

| 我想改… | 去这里 |
| --- | --- |
| 加/改数据实体 | `lib/resources.ts` + `lib/types.ts` + `scripts/sql/schema.sql` + `lib/mock-data.ts` |
| 菜单/角色可见性 | `lib/nav.ts` |
| 登录/会话/密码 | `app/api/auth/*` + `lib/session.ts` + `lib/password.ts` |
| 路由拦截 | `middleware.ts` |
| 前端取数/写数 | `lib/api.ts`（`useResource`） |
| 底层读写 SQL | `lib/repo.ts` |
| 审计规则 | `lib/audit.ts` + 各 API 路由 |
| 角色/代理登录逻辑 | `lib/role-context.tsx` + `app/api/auth/impersonate` |
| 通用 UI 组件 | `components/*` 与 `components/ui/*` |
| 初始化/种子 | `scripts/init-db.ts` + `lib/mock-data.ts` |
