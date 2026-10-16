# LightRAG 生产级 Systemd 双轨守护部署与运维手册

本文档详述 LightRAG 在 Linux 生产宿主机（如 Ubuntu 24.04 LTS）上，通过 Systemd 托管运行的完整架构、部署步骤与日常运维规范。方便随时查阅与抄作业。

---

## 1. 架构拓扑与双轨职责划分

系统在生产环境中采用**双轨独立守护架构**，彻底解耦“对外生产工具网关”与“内部图形化运营控制台”：

```text
                               ┌────────────────────────────────────────────────┐
                               │             上层消费平台 / Agent 矩阵           │
                               └───────────────────────┬────────────────────────┘
                                                       │ (HTTP / JSON-RPC)
                                                       ▼
                                ┌──────────────────────────────────────────────┐
                                │   【Track 1: 生产网关守护】                    │
                                │   rag-service.service (端口 8001)             │
                                │   - FastMCP 8 大核心工具矩阵                  │
                                │   - 多租户物理工作区隔离与 POSIX CAS 原子发布  │
                                │   - 读租约引用计数与旧版本平滑优雅排空        │
                                └──────────────────────┬───────────────────────┘
                                                       │ 共享同一物理存储底层
                                                       │ (sandbox_storage/)
                                                       ▼
                                ┌──────────────────────────────────────────────┐
                                │   【Track 2: 原生 WebUI 守护】                │
                                │   rag-webui.service (端口 9621)              │
                                │   - 原生多租户可视化运营界面 (/webui/)        │
                                │   - 3D 知识图谱拓扑与实体探索                 │
                                │   - 文档全文切片透视与穿透检索                │
                                └──────────────────────────────────────────────┘
```

| 服务名称 | 监听端口 | 入口脚本 | 核心职责 |
|---|---|---|---|
| `rag-service.service` | `8001` | `gateway_mcp_server.py` | 8 大 FastMCP 核心工具、租约管理、原子发布与快照回退 |
| `rag-webui.service` | `9621` | `run_lightrag_webui_server.py` | 原生 WebUI、Swagger API 文档、知识图谱 3D 渲染与管理端点 |

---

## 2. 核心 Unit 文件设计与参数解析

服务单元文件存放于系统级目录 `/etc/systemd/system/`，配置模板位于项目 `deploy/systemd/`：

### 2.1 生产网关配置 (`rag-service.service`)
```ini
[Unit]
Description=LightRAG Production FastMCP Gateway Service
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/lightrag-v2-exploration/LightRAG
EnvironmentFile=/home/ubuntu/lightrag-v2-exploration/LightRAG/.env
ExecStart=/home/ubuntu/.local/bin/uv run python gateway_mcp_server.py
Restart=always
RestartSec=5s
KillMode=mixed
TimeoutStopSec=30
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 2.2 原生 WebUI 配置 (`rag-webui.service`)
```ini
[Unit]
Description=LightRAG Production Native WebUI & Graph Service
After=network.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/lightrag-v2-exploration/LightRAG
EnvironmentFile=/home/ubuntu/lightrag-v2-exploration/LightRAG/.env
ExecStart=/home/ubuntu/.local/bin/uv run python run_lightrag_webui_server.py
Restart=always
RestartSec=5s
KillMode=mixed
TimeoutStopSec=30
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 2.3 关键参数设计原理 (为何这样配？)

1. **`LimitNOFILE=65535` (文件句柄数扩容)**：
   - **背景**：RAG 底层涉及大量高并发读写，包括向量索引、NetworkX 图数据文件、JSON KV 存储及 Docling 资产。Linux 默认单进程上限通常仅为 1024。
   - **作用**：调大至 65535，彻底杜绝生产高负载时触发 `OSError: [Errno 24] Too many open files` 崩溃。
2. **`KillMode=mixed` + `TimeoutStopSec=30` (优雅停机排空读租约)**：
   - **背景**：当执行服务重启或停机时，可能有后台查询正在读取工作区（持有 `LeaseManager` 租约）。
   - **作用**：向主进程发送 `SIGTERM` 信号，给系统预留最长 30 秒排空读租约与持久化缓存；若超时才通过 `SIGKILL` 强杀子进程。保证底层存储 JSON/RocksDB 不会因突然断电或强杀损坏。
3. **`Restart=always` + `RestartSec=5s` (自动看门狗机制)**：
   - 无论因为 OOM 还是未捕获的不可抗力异常导致进程退出，Systemd 均会在 5 秒后自动原地拉起，保障 7×24 小时高可用。
4. **`EnvironmentFile` (解耦环境配置)**：
   - 动态加载工作区根目录的 `.env` 文件，LLM API Key、Embedding 密钥与 JWT Secret 统一管理，禁止在 systemd 文件硬编码任何敏感凭据。
5. **`StandardOutput=journal` (原生日志流接入)**：
   - 标准输出与错误全部接入 Linux 核心 `systemd-journald`，自动享受日志压缩、分页查看、大小轮转与按服务/时间筛选的工业级体验。

---

## 3. 从零安装与部署步骤

### 步骤 1：准备运行环境与权限
确保运行用户具备项目目录的完全读写权限：
```bash
sudo chown -R ubuntu:ubuntu /home/ubuntu/lightrag-v2-exploration/LightRAG
chmod 600 /home/ubuntu/lightrag-v2-exploration/LightRAG/.env
```

### 步骤 2：部署 Unit 文件至系统目录
可以通过软链接或直接拷贝（推荐软链方便跟踪改动）：
```bash
# 方式 A：软链接（修改源码仓库配置可立即生效）
sudo ln -sf /home/ubuntu/lightrag-v2-exploration/LightRAG/deploy/systemd/rag-service.service /etc/systemd/system/
sudo ln -sf /home/ubuntu/lightrag-v2-exploration/LightRAG/deploy/systemd/rag-webui.service /etc/systemd/system/

# 方式 B：直接拷贝
# sudo cp deploy/systemd/*.service /etc/systemd/system/
```

### 步骤 3：重载守护进程并设置开机自启
```bash
# 重载 systemd 配置管理器
sudo systemctl daemon-reload

# 设置开机自启
sudo systemctl enable rag-service.service
sudo systemctl enable rag-webui.service
```

### 步骤 4：启动服务
```bash
# 启动生产网关
sudo systemctl start rag-service.service

# 启动原生 WebUI
sudo systemctl start rag-webui.service
```

---

## 4. 日常生产运维常用命令速查

### 4.1 服务状态与启停
```bash
# 1. 检查运行状态 (查看 active/inactive/failed)
sudo systemctl status rag-service.service --no-pager
sudo systemctl status rag-webui.service --no-pager

# 2. 重启服务 (配置变更或热重载)
sudo systemctl restart rag-service.service
sudo systemctl restart rag-webui.service

# 3. 停止服务 (平滑排空)
sudo systemctl stop rag-service.service
sudo systemctl stop rag-webui.service
```

### 4.2 实时日志监控与故障排查
```bash
# 1. 实时跟踪输出 (类似 tail -f)
sudo journalctl -u rag-webui.service -f
sudo journalctl -u rag-service.service -f

# 2. 查看最近 100 行日志
sudo journalctl -u rag-webui.service -n 100 --no-pager

# 3. 查看最近 30 分钟的异常与错误日志
sudo journalctl -u rag-webui.service --since "30 minutes ago" | grep -iE "error|exception|fail"

# 4. 查看自今日 00:00 以来的所有重启记录
sudo journalctl -u rag-service.service --since today | grep -i "started"
```

### 4.3 物理端口与可用性现场探针
```bash
# 1. 检查物理端口监听状态
sudo ss -tulpn | grep -E "8001|9621"

# 2. 探测 WebUI 健康检查端点
curl -s http://127.0.0.1:9621/health | jq .

# 3. 探测 FastMCP 生产网关能力端点
curl -s http://127.0.0.1:8001/internal/knowledge/capabilities | jq .

# 4. 运行全量 8 大 MCP 工具 live 回归测试
uv run python verify_8_tools_live.py
```

### 4.4 极速一条龙健康巡检复合命令
一键复制执行，快速打印双服务状态、物理端口监听与 WebUI 连通性：
```bash
sudo systemctl status rag-service.service rag-webui.service --no-pager | grep -E "Active:|Loaded:" && \
sudo ss -tulpn | grep -E "8001|9621" && \
curl -s http://127.0.0.1:9621/health | jq '{status, auth_mode, core_version, api_version}'
```

### 4.5 多租户物理存储与 CAS 快照巡检
```bash
# 1. 检查各租户 active 软链指向的版本 (确保指向有效 rev_N)
ls -la /home/ubuntu/lightrag-v2-exploration/LightRAG/sandbox_storage/*/*/active

# 2. 检查已封印快照的 SHA-256 签名文件
ls -la /home/ubuntu/lightrag-v2-exploration/LightRAG/sandbox_storage/*/*/revisions/*/snapshot.json
```

---

## 5. 常见运维问题与避坑指南 (Troubleshooting)

### Q1: 浏览器偶发提示 `502 Bad Gateway`？
- **根因**：通常发生在管理员执行 `systemctl restart rag-webui.service` 的 2~3 秒瞬态窗口期内。此时旧进程释放端口，新进程正在加载模型配置，浏览器发起的定时轮询（如 `/health` 或 `/documents/paginated`）撞上端口关闭，触发连接重置。
- **验证**：服务重启完成后（通常 3 秒内），刷新浏览器即可自动恢复，无需人工干预。

### Q2: 进程启动报 `Failed to load .env: Permission denied`？
- **根因**：`.env` 文件权限为 root 所有，而 service 指定了 `User=ubuntu`。
- **解决**：执行 `sudo chown ubuntu:ubuntu .env`。

### Q3: 执行 `systemctl start` 报 `uv: command not found`？
- **根因**：`uv` 安装在用户个人目录下（如 `/home/ubuntu/.local/bin/uv`），非系统 `/usr/bin/`。
- **解决**：在 service 文件的 `ExecStart` 中务必填写绝对路径 `/home/ubuntu/.local/bin/uv`，禁止直接写相对命令 `uv`。

### Q4: 如何更新前端构建产物？
WebUI 前端由 `lightrag_webui/` 构建至 `lightrag/api/webui/`，更新前端资源后只需执行平滑重载：
```bash
# 本地打包并同步至宿主机后：
sudo systemctl restart rag-webui.service
```

---

## 6. 生产运维红线规范 (Zero-Tolerance Rules)

1. ❌ **严禁使用 `kill -9` 强杀服务进程**：
   - 强杀会导致未完成写入的 JSON KV 缓存丢失，并绕过 `LeaseManager` 租约排空，破坏底层存储完整性。重启务必使用 `systemctl restart`。
2. ❌ **严禁绕过 CAS 软链直接在 active 目录覆写数据**：
   - 所有数据变更必须通过候选沙箱（`candidates/`）入库，并调用 `atomic_publish_candidate` 执行原子切换。
3. ❌ **严禁将敏感凭据与索引入库**：
   - `.env`、`sandbox_storage/` 绝对严禁执行 `git add` / `git commit`。
