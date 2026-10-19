# dsh-remote-agent

> [English](README.md) | 中文

Agent 侧的 DSH 宿主插件，装在每一台需要被 Hub 访问的后端上。

它把当前进程的 launch token 与身份信息发布到 `$DSH_HOME/remote-agent.json`
（0600、原子写），并在进程退出时删除该文件。token 由每个进程随机生成、dsh 本身不会持久化，
所以这个文件是 Hub 拿到 token 最干净的途径——不用去 `journalctl` 里刮日志。

```
{
  "version": 1,
  "hostname": "yhuan-n100",
  "pid": 1234,
  "startedAt": 1792400000000,
  "updatedAt": 1792400000000,
  "token": "<43 字符的 launch token>",
  "webPort": 3080,
  "dshHome": "/home/yhuan/.dsh"
}
```

## 安装

```
# 1) 把包放到 profile 能解析到的位置
mkdir -p ~/.dsh/plugins
tar xzf dsh-remote-agent.tgz -C ~/.dsh/plugins
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/node_modules/dsh-remote-agent
ln -sfn ~/.dsh/plugins/dsh-remote-agent ~/.dsh/profiles/web/node_modules/dsh-remote-agent

# 2) 追加到 ~/.dsh/profiles/web/cordis.patch.yml
# - insert:
#     - id: remote-agent
#       name: dsh-remote-agent

# 3) 重启 dsh web，然后确认
cat ~/.dsh/remote-agent.json
```

可选配置：`{ file: "/自定义/路径/remote-agent.json" }`。

Hub 侧用 `tokenFile: { kind: ssh, host, user, path: ~/.dsh/remote-agent.json }` 与之配对。

## 行为说明

- 启动后最多重试 50 次（每次间隔 200ms）等待服务就绪，然后写入文件；
- 每 60 秒刷新一次 `updatedAt`（心跳），文件始终是 0600；
- 正常退出时删除文件，因此"文件不存在"可以理解为"该 dsh 没在运行"；
- 兼容任何 dsh 0.2.1-rc.2 及以上版本，无第三方依赖。
