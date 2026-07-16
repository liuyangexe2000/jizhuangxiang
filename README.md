# 集装箱业务管理系统

中欧班列平台公司集装箱全生命周期管理系统。基于 **Next.js 16 (App Router) + MySQL 8** 构建，涵盖客户门户（M01）、调运管理（M02）、库存管理（M03）、堆场/预约（M04）、供应计划（M05）、维修管理（M06）以及系统管理（用户 / 审计 / 集成 / 数据中心）。

所有业务数据均持久化在 MySQL 数据库中，前端通过统一的 REST 数据层读写，所有写操作自动记录到操作审计日志。

---

## 一、技术栈

| 层次 | 技术 |
| --- | --- |
| 前端框架 | Next.js 16（App Router）、React 19 |
| UI | Tailwind CSS v4、shadcn/base-ui、lucide-react、recharts、sonner |
| 数据请求 | SWR（客户端 `useResource` hook） |
| 后端 | Next.js Route Handlers（`/api/resource/[resource]`、`/api/auth/*`） |
| 数据库 | MySQL 8（`mysql2/promise` 连接池） |
| 鉴权 | 自建会话（HttpOnly 签名 Cookie）+ 服务端密码哈希 |

---

## 二、环境要求

- **Node.js** ≥ 20
- **pnpm** ≥ 9（`npm i -g pnpm`）
- **MySQL** ≥ 8.0（字符集需支持 `utf8mb4`）

---

## 三、本地部署步骤

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备 MySQL 数据库

确保本地或远程 MySQL 8 已启动，并准备一个有建库权限的账号。初始化脚本会自动创建库和表，无需手动建库。

### 3. 配置环境变量

复制示例文件并按实际情况修改：

```bash
cp .env.example .env.development.local
```

变量说明：

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DB_HOST` | MySQL 主机 | `127.0.0.1` |
| `DB_PORT` | MySQL 端口 | `3306` |
| `DB_USER` | MySQL 用户名 | `root` |
| `DB_PASSWORD` | MySQL 密码 | 空 |
| `DB_NAME` | 数据库名（脚本会自动创建） | `container_biz` |
| `DB_POOL_SIZE` | 连接池大小 | `10` |
| `APP_SECRET` | 会话签名密钥，**生产环境必须替换为随机长字符串**（`openssl rand -base64 32`） | — |
| `SEED_PASSWORD` | 种子用户默认登录密码（初始化脚本使用，可选） | `Passw0rd!` |

> 提示：Next.js 会自动加载 `.env.development.local`；初始化脚本通过 `dotenv` 读取同一份文件。

### 4. 初始化数据库（建表 + 导入种子数据）

```bash
pnpm db:init
```

该命令会：

1. 执行 `scripts/sql/schema.sql` —— 创建数据库 `container_biz` 与全部业务表；
2. 从 `lib/mock-data.ts` 导入全部种子数据（订单、调运、库存、堆场、供应、维修、用户等）；
3. 为每个用户写入默认密码哈希（默认 `Passw0rd!`，可用 `SEED_PASSWORD` 覆盖）。

> ⚠️ `db:init` 会先 `DELETE` 各表再重新导入，可重复执行以重置数据，但会清空既有数据，请谨慎在生产环境使用。

### 5. 启动开发服务器

```bash
pnpm dev
```

访问 `http://localhost:3000`，会自动跳转到登录页。

---

## 四、默认登录账号

所有账号初始密码统一为 `Passw0rd!`（或你设置的 `SEED_PASSWORD`）。

| 账号 | 姓名 | 角色 | 说明 |
| --- | --- | --- | --- |
| `admin` | 系统管理员 | R00 系统管理员 | 全量权限，含用户 / 审计 / 数据中心 |
| `zhangwei` | 张伟 | R01 集装箱管理部 | 调运 / 库存 / 供应 / 维修 |
| `wangfang` | 王芳 | R02 财务部 | 账单 / 账务相关 |
| `customer_xa` | 李晓明 | R03 客户 | 客户门户（用箱申请 / 订单 / 单据 / 账单） |
| `agent_de` | Klaus Weber | R04 代管公司 | 堆场进出场 / 库存核对 |
| `carrier_pl` | Piotr Nowak | R05 承运商 | 调运执行相关 |

> 系统管理员可在「系统管理 · 用户管理」中新增账号、重置角色，并支持模拟登录（impersonation）以其他角色视角查看系统。

---

## 五、生产环境部署

```bash
# 1. 配置生产环境变量（.env.production.local 或部署平台的环境变量）
#    务必设置强随机的 APP_SECRET，并指向生产 MySQL

# 2. 初始化生产数据库（仅首次；会重置数据）
pnpm db:init

# 3. 构建并启动
pnpm build
pnpm start
```

默认监听 `3000` 端口，可用 `PORT` 环境变量或 `pnpm start -- -p 8080` 调整。

生产环境注意事项：

- **务必**替换 `APP_SECRET`，否则会话签名不安全。
- 会话 Cookie 为 `HttpOnly`，在 HTTPS 下会自动带 `Secure`，请在生产使用 HTTPS。
- MySQL 建议单独账号并按最小权限授权（对 `container_biz` 库的读写即可）。

---

## 六、启动验证清单

部署完成后，按以下步骤快速验证：

1. **数据库连通性**：`pnpm db:init` 无报错，末尾输出「✅ 数据库初始化完成」。
2. **登录**：用 `admin` / `Passw0rd!` 登录成功并进入系统仪表盘。
3. **数据读取**：打开「系统管理 · 数据管理中心」，各数据集显示「共 N 条」（数据来自数据库）。
4. **数据写入与持久化**：任意修改一条记录（如在「供应商台账」停用某供应商），**刷新页面**后状态保持不变，说明已写入数据库。
5. **审计日志**：打开「系统管理 · 操作日志」，可看到上一步写操作对应的审计记录。
6. **登出**：点击右上角登出，返回登录页，受保护路由无法直接访问（会跳转登录）。

---

## 七、项目结构（关键路径）

```
app/
  (auth)/login/            登录页
  (dashboard)/             业务页面（M01–M06 + admin），均通过 useResource 读写数据库
  api/
    auth/                  登录 / 登出 / me / 模拟登录 接口
    resource/[resource]/   通用 CRUD REST 接口（自动写审计日志）
lib/
  db.ts                    MySQL 连接池
  resources.ts             资源注册表（表名 / 主键 / JSON / 布尔 / 模块 —— 数据层单一配置源）
  repo.ts                  通用 CRUD 仓储
  api.ts                   客户端 useResource hook（基于 SWR）
  session.ts               会话签名与校验
  password.ts              密码哈希
  role-context.tsx         角色 / 登录态上下文
  mock-data.ts             种子数据源（仅用于初始化导入及静态字典）
scripts/
  init-db.ts               建表 + 种子导入脚本（pnpm db:init）
  sql/schema.sql           建库建表 DDL
middleware.ts              路由中间件（未登录跳转登录页）
```

---

## 八、常见问题

- **`pnpm db:init` 报连接错误**：检查 `.env.development.local` 中的 `DB_*` 是否正确，MySQL 是否已启动、账号是否有建库权限。
- **登录后立刻被踢回登录页**：多为 `APP_SECRET` 在运行时与签发 Cookie 时不一致，确保开发/生产使用固定的 `APP_SECRET`。
- **中文乱码**：确认 MySQL 库表字符集为 `utf8mb4`（`schema.sql` 已默认指定）。
- **想重置全部数据**：重新执行 `pnpm db:init`（会清空并重新导入种子数据）。
