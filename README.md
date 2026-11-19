# magpie-mizar

[Mizar](https://github.com/Mieluoxxx/mizar) as a magpie agent. Mizar keeps its
providers in `~/.mizar/models.json` and the model a session starts on in
`~/.mizar/settings.json`, so this is an agent plugin with `startup`, as PiG's
and Pine's are: `connect` writes magpie's provider block into `models.json`,
and magpie writes `defaultProvider` and `defaultModel` into `settings.json`.

macOS 上 Mizar 的 models.json 就是 pi 的格式（Mizar 的路由器是从 pi 移植的），
所以这里每条模型的字段规则照着 magpie 自己的 Pi 适配器来：七个思考级别全部列出，
不支持的那些写成 `null` —— **漏写的级别会被当成支持并显示出来**。

## Installation

```sh
magpie plugin add /path/to/magpie-mizar
# or, once published:
magpie plugin add magpie-mizar
```

Then pick one of magpie's models in Mizar's row on magpie's Agents page. The
CLI equivalent is `magpie mizar magpie/<provider>/<model>`.

Magpie then writes into `~/.mizar/models.json`:

```json
{
  "providers": {
    "magpie": {
      "name": "magpie",
      "baseUrl": "http://127.0.0.1:3425/v1",
      "apiKey": "magpie-mizar",
      "api": "openai-completions",
      "compat": { "sendSessionAffinityHeaders": true },
      "models": [
        {
          "id": "mayoru-responses/deepseek-flash",
          "name": "DeepSeek V4.1 Flash",
          "input": ["text", "image"],
          "reasoning": true,
          "contextWindow": 1000000,
          "maxTokens": 384000,
          "thinkingLevelMap": { "off": null, "minimal": null, "low": "low", "medium": "medium", "high": "high", "xhigh": null, "max": null },
          "cost": { "input": 0.15, "output": 0.6, "cacheRead": 0.003 }
        }
      ]
    }
  }
}
```

and into `~/.mizar/settings.json`:

```json
{
  "defaultProvider": "magpie",
  "defaultModel": "mayoru-responses/deepseek-flash"
}
```

Your comments, other providers and every other key stay as they were: magpie
stashes what each key held before the first write and puts it back when you
disconnect. Restart Mizar after a change — it reads `~/.mizar` when it starts.

## The Effort field

`effort: true` gives Mizar's row a reasoning-effort picker. Mizar sends its own
`reasoning_effort`, so this is not written into `settings.json` at all: the
gateway replaces the level on the way through, for a model that thinks
(`provider.AgentEffort` in magpie). The pick is kept in magpie's own
`settings.json` under `agentEfforts.mizar`.

Verified: with the row set to `high`, a request sent as `reasoning_effort: low`
reaches the vendor as `high`, and magpie's usage ledger records `effort: high`.

## What it owns

Magpie manages **one complete object**, `providers.magpie` in `models.json`, and
the two keys `defaultProvider` and `defaultModel` in `settings.json`:

| Field | Value |
| :--- | :--- |
| `name` | `magpie` |
| `baseUrl` | The gateway's `/v1` address |
| `apiKey` | The key magpie made for Mizar (`magpie-mizar` on loopback) |
| `api` | `openai-completions` |
| `compat.sendSessionAffinityHeaders` | `true`, so a turn's usage names its session |
| `models` | The catalog magpie exposes to Mizar |

Each model carries `id`, `name`, `input`, `reasoning`, `contextWindow`,
`maxTokens`, `thinkingLevelMap` and `cost`, from what magpie's `connect` is
given. Unknown or nonpositive limits are left out rather than written as `0` —
Mizar would take a `0` for a real cap. A published output limit is capped at the
model's known context window. `cost` is USD a million tokens; magpie hands a
price over as USD a token in a decimal string.

A pre-existing `magpie` provider is replaced while connected and restored on
disconnect. Keep a hand-written service under a different provider id. Do not
rely on removing the plugin to run the disconnect flow: turn Mizar off in
magpie first.

## What it does not do

- It does not read credentials, install a Mizar extension, or run a daemon.
- It does not write Mizar's `mcp.json` or its `AGENTS.md`.
- `decisionModels` is not used: it is absent from magpie's `connect` input in
  v0.1.3960 and present from a later release. Nothing here depends on it.

Requests use magpie's supplied key, so usage is attributed to `mizar` rather
than guessed from a User-Agent. The `ua` field is a fallback for requests that
arrive without one.

## Development

The runtime module is a single file with no imports and no runtime
dependencies, as the [community agent convention](https://github.com/magpie-community/plugins#agents)
requires.

```sh
bun test mizar.test.mjs
```

End-to-end, against a real magpie and a real Mizar:

```sh
magpie plugin add .
magpie mizar mayoru-responses/deepseek-flash
magpie mizar effort high
```

`~/.mizar/models.json` and `~/.mizar/settings.json` are then written and read
back by Mizar's own router. `magpie mizar default` puts both files back.

## 中文

把 [Mizar](https://github.com/Mieluoxxx/mizar) 加到 magpie 的 Agent 页：选一个
magpie 的模型，magpie 把网关和模型目录写进 `~/.mizar/models.json`，把
`defaultProvider` / `defaultModel` 写进 `~/.mizar/settings.json`，重开 Mizar 即生效。

**Effort 不落在配置文件里**：Mizar 自己会发 `reasoning_effort`，这一行选中的档位由
网关在转发时替换，存在 magpie 的 `settings.json` 的 `agentEfforts.mizar`。实测：行里
选 `high`、请求发 `low`，到上游是 `high`，magpie 用量记录里也是 `effort: high`。

插件只管 `models.json` 里的 `providers.magpie` 整块，和 `settings.json` 里的两个键；
其余内容、注释和其他 provider 原样保留。断开（`magpie mizar default`）时逐键还原；
原先没有 `providers.magpie` 就整块移除。

已知限制：不读写 Mizar 的 `mcp.json` 和 `AGENTS.md`；`decisionModels` 在 magpie
v0.1.3960 的 `connect` 入参里还没有，本插件不依赖它。

## License

MIT.