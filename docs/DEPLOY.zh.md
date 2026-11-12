# 部署与验证指南（中文）

> 适用版本：dsh `>=0.2.1-rc.2` ｜ Node.js `>=22.19.0` ｜ 2026-11
> 架构细节：[ARCHITECTURE.zh.md](ARCHITECTURE.zh.md) ｜ 兼容性：[../COMPATIBILITY.md](../COMPATIBILITY.md)
> 英文说明：[../README.md](../README.md)

本指南只做一件事：在每台**需要被 Hub 访问的后端**上装好 `dsh-remote-agent`，并确认它确实在
发布 `~/.dsh/remote-agent.json`。这里只讲部署与验证，不涉及功能改动，也不涉及 Hub 侧的安装——Hub 侧见
[dsh-remote-hub 部署指南](https://github.com/yhuan416/dsh-remote-hub/blob/main/docs/DEPLOY.zh.md)。

`dsh-remote-agent` 是宿主侧插件：它在每个后端 `dsh web` 进程里把该进程的 launch token 与身份
写进一个 0600、原子写的 JSON 文件，每 60 秒刷新，退出时删除。Hub 通过 ssh 读这个文件换远端
浏览器 Cookie。**它不代理、不做隧道、不暴露 HTTP 路由、不加工具。**

## 1. 前提

| 项 | 要求 |
|---|---|
| dsh | `>=0.2.1-rc.2`（`engines.dsh` 已声明，profile 启动时会校验） |
| Node.js | `>=22.19.0` |
| profile | 至少启动过一次 `dsh web`，`~/.dsh/profiles/web/package.json` 存在 |
| Hub → 本机 | 能 ssh 登录（Hub 用它读 token 文件）；端口不需要对外开放 |
| 网络 | 本插件不监听端口、不发网络请求；dsh web 保持 loopback 即可 |

`DSH_HOME` 默认 `~/.dsh`；用环境变量改过的话，下文的 `~/.dsh` 要换成对应目录。

## 2. 安装（bundle，推荐）

### 2.1 命令

```sh
git clone https://github.com/yhuan416/dsh-remote-agent ~/.dsh/plugins/dsh-remote-agent
cd ~/.dsh/plugins/dsh-remote-agent
./scripts/install.sh web
```

`./scripts/install.sh [profile]` 的 profile 参数默认是 `web`；装了多个 profile 时显式传入。

### 2.2 脚本做了什么

`scripts/install.sh` 重复执行是安全的，改动前会备份（备份后缀为 `.bak-<YYYYmmdd-HHMMSS>`）：

1. 校验 `lib/index.js` 存在、`~/.dsh/profiles/<profile>/package.json` 存在（profile 不存在时
   提示先跑一次 `dsh web`）；
2. 建两个软链：
   `~/.dsh/profiles/<profile>/node_modules/dsh-remote-agent` 与
   `~/.dsh/profiles/node_modules/dsh-remote-agent`，都指向仓库根目录；
3. 备份 profile 的 `package.json`，写入 **dependency**
   `"dsh-remote-agent": "file:<仓库绝对路径>"`，并把 `dsh-remote-agent` 追加进
   `dsh.profile.bundles`（选为 **bundle**，这样才会出现在 设置 → 插件）；
4. 如果 `cordis.patch.yml` 里还留着旧版手工追加的 `remote-agent` patch 块（以
   `# dsh-remote-agent:` 注释开头），备份后删除该块——bundle 自带的 patch 已经提供同一行，
   重复会导致插件被插入两次。

脚本最后会打印下一步：重启 dsh web、`cat` 文件、在 Hub 配置 `tokenFile`。

### 2.3 重启要求

**必须重启 `dsh web`。** bundle 选择与 patch 组合都在进程启动时完成；装进一个已在运行的
进程不会生效，也不会生成任何文件。前台进程 Ctrl-C 后重跑：

```sh
dsh web --no-open --port 3080
```

或重启对应的 systemd 用户服务（服务名以实际配置为准）。

## 3. 手工安装（备用）

不想用脚本时，按下面三步等价操作。

### 3.1 解包与软链

如果你有打包好的 `dsh-remote-agent.tgz`（顶层目录为 `dsh-remote-agent/` 的仓库发布物）：

```sh
mkdir -p ~/.dsh/plugins
tar xzf dsh-remote-agent.tgz -C ~/.dsh/plugins
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/node_modules/dsh-remote-agent
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/web/node_modules/dsh-remote-agent
```

### 3.2 profile 依赖 + bundle 的写法

编辑 `~/.dsh/profiles/web/package.json`，保留原有字段，只补两处（路径按你的实际位置）：

```jsonc
{
  // ……其余字段保持原样……
  "dependencies": {
    // ……原有依赖……
    "dsh-remote-agent": "file:/home/yhuan/.dsh/plugins/dsh-remote-agent"
  },
  "dsh": {
    "profile": {
      // ……原有 bundles 条目保持原样，只追加本项目……
      "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-remote-agent"]
    }
  }
}
```

要点：**dependency 决定包能被解析，`bundles` 决定它被组合进运行时并在插件页可见**。只写
patch 行不写这两项时，插件能运行，但 设置 → 插件 里看不到它（见下）。

### 3.3 旧式 patch 行（仍可运行）

替代 bundle 选择的最简方式是在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
```

然后重启 `dsh web`。注意：这种方式插件能跑，但插件页不显示它；并且和 bundle 的 patch 行同时
存在时会插入两次，`scripts/install.sh` 会尝试清理旧块，手工安装时请自己确认只有一份。

## 4. 验证

### 4.1 文件与字段

```sh
cat ~/.dsh/remote-agent.json
```

应包含 `version`、`hostname`、`pid`、`startedAt`、`updatedAt`、`token`、`webPort`、`dshHome`，
其中 `token` 是 43 字符的 launch token。

### 4.2 权限

```sh
stat -c '%a %n' ~/.dsh/remote-agent.json   # 期望 600
stat -c '%a %n' ~/.dsh                     # 目录不存在时由插件按 700 创建；已有目录权限不变
```

### 4.3 新鲜度（心跳）

文件每 60 秒重写一次。用 `updatedAt` 算一下年龄，期望在 120 秒以内：

```sh
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.env.HOME+"/.dsh/remote-agent.json","utf8"));console.log("updatedAt age (s):",Math.round((Date.now()-j.updatedAt)/1000))'
```

### 4.4 插件页

设置 → 插件 里应能看到 `dsh-remote-agent`（bundle 安装方式）。看不到但文件存在，说明装的是
旧式 patch 行或 profile 依赖没写进去。

### 4.5 Hub 侧

Hub 配置好 `tokenFile: { kind: ssh, ... }` 后探测：

```sh
curl -s -X POST http://127.0.0.1:3080/api/remote-hosts/probe \
  -H 'content-type: application/json' -d '{"id":"n100"}'
```

期望 `tokenResolved: true`。不放心时先在 Hub 机器上直接验证 ssh 能读到文件：

```sh
ssh <host> cat ~/.dsh/remote-agent.json
```

### 4.6 退出清理

正常退出会删除文件（崩溃不会，会留下旧文件，由 Hub 探测失败 + 下一次发布覆盖）：

```sh
# Ctrl-C 结束 dsh web 之后
test ! -e ~/.dsh/remote-agent.json && echo "removed on shutdown"
```

## 5. 配置（可选）

默认写 `$DSH_HOME/remote-agent.json`。需要换路径时：

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
      config:
        file: /custom/path/remote-agent.json   # 可选
```

profile 能解析 `@deepseek-ai/schemastery` 时插件页会生成设置表单；解析不到时插件仍按默认值
工作。同一台机器跑多个 dsh 进程时，给每个实例配不同的 `config.file`，否则会抢同一个文件。

## 6. 与 Hub 配对

Hub 的 `dsh-remote-hub` 配置里加一条远端，用 ssh 读本文件：

```yaml
# Hub 端：~/.dsh/profiles/web/cordis.patch.yml → dsh-remote-hub config
remotes:
  - id: n100
    label: yhuan@192.168.4.50
    ssh: { host: 192.168.4.50, user: yhuan }
    remotePort: 3080
    tokenFile:
      kind: ssh
      host: 192.168.4.50
      user: yhuan
      path: ~/.dsh/remote-agent.json
```

Hub 读取 `token` 与 `webPort`：前者用来换远端 Cookie，后者决定隧道指向的远端端口。不装本插件
时，Hub 也可以改用内联 `token` 或本地可读的 `tokenFile`。

## 7. 常见失败与排查

| 现象 | 原因与处理 |
|---|---|
| 文件不存在 | 插件没加载，或装完没有重启 `dsh web`。先看 设置 → 插件；再确认进程确实是重启后的 |
| 没有 `token` 字段 | 当前进程的 token 发现失败（`ctx.webServer.getOrigin()` / `ctx.connection.authenticatedUrl()` 契约变化，或 dsh 版本不兼容）。盘上的文件可能是上一个进程留下的旧文件；核对 `dsh --version` 与 [COMPATIBILITY.md](../COMPATIBILITY.md) |
| `updatedAt` 不更新 | 远端 dsh 已退出、心跳被卡住，或同路径被另一个实例覆盖。文件每 60 秒重写，时间戳比几分钟旧就说明发布者已不在；确认只有一个进程写这个文件 |
| 权限不是 0600 | 插件用 0600 原子重写；若仍不对，说明文件被手工拷贝/其他工具写过。删掉后重启 dsh web，让它重新发布 |
| Hub 报 `tokenResolved: false` | ssh host/user/path 不对、Hub 无法免交互登录，或文件里没有 token。先在 Hub 机器上跑 `ssh <host> cat ~/.dsh/remote-agent.json` |
| Hub 连到错误端口 | `webPort` 是 dsh 的**监听**端口。反向代理/NAT 对外端口不同时，Hub 的 `remotePort` 必须是实际可达端口；目前没有配置覆盖项（见 [TODO.md](../TODO.md)） |
| `install.sh` 报 profile not found | 该 profile 还没创建：先运行一次 `dsh web`（或确认 `DSH_HOME`/profile 名） |
| `install.sh` 报 `lib/index.js missing` | 不在仓库根目录执行，或在错误目录运行了脚本 |
| 插件被加载两次 | 旧式 patch 行与 bundle 的 patch 行重复。检查 `cordis.patch.yml`，只保留 bundle 方式 |
| 两个 profile 抢同一个文件 | 两个进程共用一个 `DSH_HOME` 时后写者胜出，另一个 token 消失，Hub 侧 `tokenResolved` 会闪烁。给每个实例配不同的 `config.file` |
| 重启后 token 变了 | 这是预期行为：launch token 按进程生成，每个 dsh web 进程重启都会换新 token，Hub 缓存随之失效并重新读取 |

## 8. 安全红线

- **0600**：`remote-agent.json` 必须是 0600，存放目录不应对同机其他用户开放。插件负责写
  0600，不要把文件改成更宽松的权限。
- **token 不进日志**：不要 `echo` token、不要把文件内容贴进 issue/聊天/CI 输出，也不要在
  systemd unit 或脚本里打印它。token 等价于该 dsh 进程的登录凭据。
- **token 不进仓库**：不要把 `remote-agent.json` 拷贝进任何仓库（包括本仓库）；如果用了自定义
  路径，确保它落在仓库外，或至少被 `.gitignore` 覆盖。
- **不进镜像/备份**：不要把 token 文件打进容器镜像或公开备份。
- **轮换方式**：重启远端 `dsh web` 即换新 token，文件在下一次发布时重写；不需要手工改文件。

## 9. 卸载

```sh
# 1. 停掉 dsh web（正常退出会删除 identity 文件）
# 2. 从 profile package.json 移除 dependency 与 bundles 里的 dsh-remote-agent
# 3. 删除软链
rm -f ~/.dsh/profiles/web/node_modules/dsh-remote-agent
rm -f ~/.dsh/profiles/node_modules/dsh-remote-agent
# 4. 可选：删除插件目录与遗留的手工 patch 行
rm -rf ~/.dsh/plugins/dsh-remote-agent
```

卸载后 Hub 侧对应远端下次探测时会得到 `tokenResolved: false`，请同步清理或改用别的 token 来源。
