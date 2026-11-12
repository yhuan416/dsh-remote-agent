# 架构（中文）

> 部署与验证见 [DEPLOY.zh.md](DEPLOY.zh.md) ｜ 英文版见 [../ARCHITECTURE.md](../ARCHITECTURE.md)
> 兼容性：[../COMPATIBILITY.md](../COMPATIBILITY.md) ｜ 变更记录：[../CHANGELOG.md](../CHANGELOG.md)

## 1. 角色

`dsh-remote-agent` 是远端 dsh 方案的**远端侧**一半。它运行在每个后端 `dsh web` 进程里，把该
进程的 launch token 与身份发布到一个很小的 JSON 文件，使 Hub 不必翻日志或手工贴 token 就能换到
远端浏览器 Cookie。

它**不**做反向代理、**不**做隧道、**不**暴露 HTTP 路由、**不**添加任何工具。它只写一个文件。

```text
远端 dsh web（已加载本插件）
  ├─ dsh 为当前进程生成的 launch token
  └─ $DSH_HOME/remote-agent.json   （0600，原子写，每 60 秒刷新，退出时删除）
            ▲
            │ dsh-remote-hub 通过 ssh 读取（tokenFile.kind = "ssh"）
Hub 的 dsh web ┘
```

## 2. 运行时

插件导出 `name = 'remote-agent'`，并 `inject = ['connection', 'webServer']`——只依赖这两个
宿主服务，不注册路由、不注册工具。

1. **启动** — `apply()` 里用一个 `setTimeout(0)` 排一次立即发布。
2. **token 发现** — 先 `ctx.webServer.getOrigin()` 拿监听 origin，再
   `ctx.connection.authenticatedUrl(origin.origin + '/')` 拿到带 token 的 URL，从 query 的
   `token` 参数取值。token 尚未就绪时每 200 ms 重试一次，最多 50 次（约 10 秒）；仍未拿到就
   不再单独定时重试，交给 60 秒心跳继续尝试。
3. **写入** — 目标为 `<dshHome>/remote-agent.json`，或配置项 `config.file`。写临时文件
   `remote-agent.json.tmp-<pid>`（mode 0600）后 rename 覆盖；父目录不存在时按 0700 递归创建。
4. **心跳** — 每 60 秒重写同一份 payload：`updatedAt` 刷新，token 不变。因此这个文件同时是
   一个存活提示。
5. **退出** — `ctx.effect(fn, 'remote-agent: identity file')` 的清理函数清掉定时器并 unlink
   文件。崩溃不会执行清理，会留下旧文件；Hub 探测失败后重试，下一次发布覆盖它。

## 3. Payload（文件 version 1）

```json
{
  "version": 1,
  "hostname": "yhuan-n100",
  "pid": 2533885,
  "startedAt": 1792413884370,
  "updatedAt": 1794197394348,
  "token": "<43 字符 launch token>",
  "webPort": 3080,
  "dshHome": "/home/yhuan/.dsh"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `version` | number | 文件 schema 版本，当前为 `1` |
| `hostname` | string | `os.hostname()`，诊断用 |
| `pid` | number | 发布者进程 PID，诊断用 |
| `startedAt` | number | 插件启动时间戳（epoch ms） |
| `updatedAt` | number | 本次发布/心跳的时间戳（epoch ms），Hub 用它判断文件是否新鲜 |
| `token` | string | 当前进程的 launch token（43 字符），换 Cookie 用 |
| `webPort` | number | 监听端口（`origin.port`，缺失时按 80 处理），Hub 用它决定隧道目标端口 |
| `dshHome` | string | 解析到的 DSH 目录（`$DSH_HOME`，否则 `~/.dsh`），诊断用 |

Hub 的 `tokenFile: { kind: 'ssh', host, user, path }` 读取这个文件，消费 `token` 与
`webPort`；`hostname`/`pid` 只用于诊断。增加字段向后兼容；改变已有字段含义需要升 `version`
并同步升级 Hub。

## 4. 配置

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
      config:
        file: /custom/path/remote-agent.json   # 可选
```

profile 能解析 `@deepseek-ai/schemastery` 时会生成设置表单；解析不到时插件仍按默认值工作
（`$DSH_HOME/remote-agent.json`）。

## 5. 安全

- token 是凭据：文件 0600；父目录不存在时按 0700 创建，**已有父目录的权限不会被修改**。
- 本插件不向网络发送任何东西；读取文件的是 Hub，在服务端经 ssh 完成。
- 正常退出会删除文件。要轮换 token，重启远端 dsh 即可；下一次发布就会重写文件。
- 不要把 `remote-agent.json` 拷进仓库或容器镜像。

## 6. 刻意不实现

- HTTP 端点或发现协议（Hub 已经有 ssh 传输）。
- 多进程协调：一个 `DSH_HOME`/文件路径只对应一个 dsh 进程。两个进程共用同一
  `DSH_HOME` 会争抢同一个文件；用 `config.file` 把它们分开。
