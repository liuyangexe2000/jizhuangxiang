# Cursor / Windows SSH 密钥连接指南

本文说明如何在 Windows 上配置 SSH 密钥，让 **Cursor「Remote-SSH / 新建 SSH 项目」** 免密连接 Linux 服务器。  
路径均相对于本机用户目录；项目仓库本身不需要提交私钥。

---

## 为什么要用密钥

Cursor 的 Remote-SSH 主要依赖 **SSH 公钥登录**。  
本机若只有密码、没有私钥，新建 SSH 项目时经常连不上或反复要密码。  
密钥配好一次后，改 root 密码也不影响 Cursor 连接。

本仓库生产机示例别名：`jzx-prod`（主机 `154.83.15.176`，目录 `/opt/jizhuangxiang`）。

---

## 1. 本机生成密钥

在 **PowerShell** 中执行（把名字换成你的项目，勿覆盖已有密钥）：

```powershell
# 示例：集装箱生产机用 id_ed25519_jzx（若已存在可跳过）
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519_jzx" -N '""' -C "cursor-jzx"

# 新服务器可另起名字，例如：
# ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\id_ed25519_新项目" -N '""' -C "cursor-新项目"
```

生成两个文件：

| 文件 | 用途 |
| --- | --- |
| `C:\Users\你的用户名\.ssh\id_ed25519_jzx` | **私钥**，绝不要发给别人、不要提交 Git |
| `C:\Users\你的用户名\.ssh\id_ed25519_jzx.pub` | **公钥**，可以放到服务器 |

---

## 2. 写本机 SSH 配置

编辑或新建：`C:\Users\你的用户名\.ssh\config`（无扩展名）。

加入（按实际 IP / 用户 / 密钥名修改）：

```
Host jzx-prod
  HostName 154.83.15.176
  User root
  IdentityFile ~/.ssh/id_ed25519_jzx
  IdentitiesOnly yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

说明：

- `Host`：Cursor 里显示的**别名**（推荐短英文）
- `HostName`：服务器公网 IP 或域名
- `User`：登录用户（常见 `root` 或普通用户）
- `IdentityFile`：上一步的私钥路径
- `IdentitiesOnly yes`：只用这把钥匙，避免乱试其它密钥导致失败

同一台服务器多个项目：**共用一把密钥、同一个 Host**，连上后打开不同目录即可。  
新服务器：再加一段新的 `Host ...` 块。

---

## 3. 把公钥装到服务器（只需一次）

需要能登录一次服务器（密码或面板均可）。

### 方式 A：本机一条命令（推荐）

PowerShell：

```powershell
type $env:USERPROFILE\.ssh\id_ed25519_jzx.pub | ssh root@154.83.15.176 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

提示输入一次 root 密码。成功后即可免密。

### 方式 B：宝塔 / 云面板

1. 用记事本打开 `.pub` 文件，复制**整行**内容  
2. 在面板「SSH 密钥」或服务器 `/root/.ssh/authorized_keys` 中粘贴并保存  
3. 权限建议：`.ssh` 为 `700`，`authorized_keys` 为 `600`

### 方式 C：已能 SSH 进服务器时

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo '这里粘贴.pub整行内容' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 服务器建议（Cursor Remote-SSH）

确保 SSH 允许转发（多数默认可用；若 Cursor 报 SOCKS / forwarding 相关错误再改）：

```bash
# /etc/ssh/sshd_config 中确认有：
AllowTcpForwarding yes
# 修改后：
systemctl reload sshd
```

服务器上需有 `tar`、`curl`（一般已装），磁盘空间足够安装 Cursor Server。

---

## 4. 验证免密

本机 PowerShell：

```powershell
ssh jzx-prod
# 或
ssh -o BatchMode=yes jzx-prod "hostname"
```

能进入且**不再要密码**即成功。`BatchMode=yes` 若失败，说明密钥尚未生效。

---

## 5. 在 Cursor 里连接

1. 按 `F1`（或 `Ctrl+Shift+P`）  
2. 选 **Remote-SSH: Connect to Host...**  
3. 选别名 **`jzx-prod`**  
4. 连上后：**打开文件夹** → `/opt/jizhuangxiang`（或你的项目路径）

「新建 SSH 项目」时主机选/填同一别名即可，不必再手填密码。

---

## 6. 常见问题

| 现象 | 处理 |
| --- | --- |
| Cursor 连不上、一直要密码 | 本机没有密钥或未写入服务器 `authorized_keys`；先完成第 1～4 步 |
| `Permission denied (publickey)` | 公钥未装上、用户不对，或 `IdentityFile` 路径写错 |
| 改了 root 密码后 Cursor 还能连吗 | **能**，密钥登录与密码无关 |
| 换电脑了怎么办 | 在新电脑重新 `ssh-keygen`，把新 `.pub` 再追加到服务器 `authorized_keys` |
| Windows 用户名含非英文导致异常 | 密钥可放到纯英文路径（如 `C:\ssh-keys\`），`IdentityFile` 指到该路径 |
| 插件是否要装 | Cursor 扩展中确认已启用 **Remote - SSH**（`anysphere.remote-ssh`） |

---

## 7. 安全注意

- **私钥不要**发聊天、不要上传网盘公开处、不要提交到 GitHub  
- 曾经在聊天里发过的 root 密码，应在服务器执行 `passwd` 立即更换  
- 生产环境建议限制 SSH 来源 IP（云安全组），并定期检查 `authorized_keys`

---

## 8. 与本项目部署文档的关系

- 应用部署、systemd、环境变量：见 [`生产环境部署.md`](生产环境部署.md)  
- 本文只解决：**本机 ↔ 服务器的 Cursor SSH 连接**  
- 生产应用开机自启由 `jizhuangxiang.service`（`systemctl enable`）负责，与 SSH 密钥无关  
