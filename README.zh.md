# dsh-remote-agent

> [English](README.md) | 中文
>
> 架构：[ARCHITECTURE.md](ARCHITECTURE.md) ｜ 兼容性：[COMPATIBILITY.md](COMPATIBILITY.md)
> 变更记录：[CHANGELOG.md](CHANGELOG.md) ｜ 路线图：[TODO.md](TODO.md)
> 部署步骤（中文）：[dsh-remote-hub/docs/DEPLOY.zh.md](https://github.com/yhuan416/dsh-remote-hub/blob/main/docs/DEPLOY.zh.md)

Agent 侧的 DSH 宿主插件，装在每个需要被 Hub 访问的后端上。

它把当前 dsh 进程的 launch token 与身份写入 `$DSH_HOME/remote-agent.json`（0600，原子写），
每 60 秒刷新一次，进程正常退出时删除。token 由 dsh 按进程生成且不落盘，因此这个文件是 Hub
免手工贴 token、免翻日志取 token 的干净入口。

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

## 安装（bundle，推荐）

```sh
git clone https://github.com/yhuan416/dsh-remote-agent ~/.dsh/plugins/dsh-remote-agent
cd ~/.dsh/plugins/dsh-remote-agent
./scripts/install.sh web
```

脚本会软链包、把它登记为 profile **dependency**、选为 **bundle**（这样才会出现在
设置 → 插件里），并在存在旧的手工 patch 行时移除它。写文件前会备份；之后重启 `dsh web`
（bundle 选择在启动时组合）。

验证：

```sh
cat ~/.dsh/remote-agent.json    # 有 token，updatedAt 是新的
```

## 安装（手工）

```sh
mkdir -p ~/.dsh/plugins
tar xzf dsh-remote-agent.tgz -C ~/.dsh/plugins
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/node_modules/dsh-remote-agent
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/web/node_modules/dsh-remote-agent
```

在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾加：

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
```

重启 `dsh web`。

## 与 Hub 配对

```yaml
# Hub 端：~/.dsh/profiles/web/cordis.patch.yml → dsh-remote-hub 配置
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

Hub 通过 ssh 读取 `token` 与 `webPort`。不装这个插件时，也可以在 Hub 配置里用内联
`token` 或本地可读的 `tokenFile`。

## 配置

```yaml
- insert:
    - id: remote-agent
      name: dsh-remote-agent
      config:
        file: /custom/path/remote-agent.json   # 可选
```

profile 能解析 `@deepseek-ai/schemastery` 时会生成设置表单。

## 生命周期与安全

- 启动立即发布；拿不到 token 时最多重试约 10 秒，之后 60 秒心跳继续尝试。
- 文件 0600；父目录不存在时按 0700 创建（不修改已有目录权限）。
- 正常退出删除文件；崩溃会留下旧文件，Hub 探测失败后由下一次发布覆盖。
- token 是凭据：不要提交到仓库，也不要打进镜像。

## 排错

| 现象 | 检查 |
|---|---|
| 文件不存在 | 插件是否加载？设置 → 插件；重启 dsh web |
| 没有 `token` 字段 | DSH token 发现失败；核对 `dsh --version` 兼容性 |
| Hub 报 `tokenResolved: false` | ssh 路径/用户/host；`ssh <host> cat ~/.dsh/remote-agent.json` |
| `updatedAt` 很旧 | 远端 dsh 没运行，或心跳已停 |
| 两个 profile 抢同一个文件 | 给每个实例配置不同的 `config.file` |

## 开发

```sh
npm run check   # 离线：导出、manifest、bundle patch
```
