// Mizar (github.com/Mieluoxxx/mizar) keeps its providers in ~/.mizar/models.json
// and the model a session starts on in ~/.mizar/settings.json, so this is an
// agent plugin with startup, as PiG's and Pine's are: connect writes magpie's
// provider block into models.json, and magpie writes defaultProvider and
// defaultModel into settings.json.
//
// models.json is Pi's format (mizar's router is a port of pi's), so the entry
// rules here follow magpie's own Pi adapter (internal/agent/agents.go,
// piModelOn): every thinking level is named, the ones the model lacks set to
// null, because a level left out is offered rather than hidden.

// The row's picture, an https URL or a data: URI (agentplug.Desc.Icon).
// It is icon.svg, which package.json's magpie.icon carries too: that one
// is the plugin's row, this one the agent's. Paths carry their own fill
// because magpie draws it as <img src>, where a <style> block inside the
// SVG is not applied and class-coloured paths come out blank.
const ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiIgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIj4KICA8cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHJ4PSI3IiBmaWxsPSIjMTYxNjE2Ii8+CiAgPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTUuNSAyNC41VjguNkg5TDE1LjYgMTYuNkwxOC4zIDEzLjhMMjAuNyAxNi4yTDE1LjYgMjEuNUw4LjkgMTMuOVYyNC41SDUuNVoiLz4KICA8cGF0aCBmaWxsPSIjZmZmZmZmIiBkPSJNMjAuOSAxNi44SDI0LjZWMjQuNUgyMC45VjE2LjhaIi8+CiAgPHBhdGggZmlsbD0iIzZiOGZmZiIgZD0iTTIyLjkgNy4yIFEyMy43IDEwLjkgMjcuNCAxMS43IFEyMy43IDEyLjUgMjIuOSAxNi4yIFEyMi4xIDEyLjUgMTguNCAxMS43IFEyMi4xIDEwLjkgMjIuOSA3LjIgWiIvPgogIDxwYXRoIGZpbGw9IiM2YjhmZmYiIGQ9Ik0yNy4zIDQuNCBRMjcuOCA1LjggMjkuMiA2LjMgUTI3LjggNi44IDI3LjMgOC4yIFEyNi44IDYuOCAyNS40IDYuMyBRMjYuOCA1LjggMjcuMyA0LjQgWiIvPgo8L3N2Zz4="

export const agent = {
  id: "mizar",
  name: "Mizar",
  icon: ICON,
  bin: "mizar",
  dir: "~/.mizar",
  // connect writes the gateway and the catalog here
  config: "~/.mizar/models.json",
  format: "json",
  // ...and the model a session starts on here, with the provider beside it
  startup: {
    config: "~/.mizar/settings.json",
    format: "json",
    model: "defaultModel",
    keys: { defaultProvider: "magpie" },
  },
  // Mizar sends its own reasoning_effort; this row's pick replaces it on the
  // gateway, for a model that thinks (magpie's provider.AgentEffort)
  effort: true,
  // names Mizar's requests in Usage when they come without its key
  ua: ["mizar"],
  notice: "Mizar 启动时读取 ~/.mizar，重启后生效；/model 里也能随时切换。",
}

// pi's thinking levels, lowest first (pi-ai's EXTENDED_THINKING_LEVELS)
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

// one of magpie's models as an entry of models.json. Mizar keeps the fields
// Pi does: unknown limits are left out, never written as 0, which mizar would
// take for a real cap.
function modelEntry(model) {
  const efforts = model.efforts ?? []
  const entry = {
    id: model.id,
    name: model.name || model.id,
    input: model.images ? ["text", "image"] : ["text"],
    // Mizar offers its thinking levels for a model that reasons only
    reasoning: efforts.length > 0,
  }
  if (model.context > 0) entry.contextWindow = model.context
  // a published output limit cannot exceed the window it is in
  if (model.output > 0) entry.maxTokens = model.context > 0 ? Math.min(model.output, model.context) : model.output
  if (entry.reasoning) {
    // a level set to null is hidden; one left out is offered, so every level
    // is named. Magpie's off is the model's "none" where it takes one.
    entry.thinkingLevelMap = {}
    for (const level of LEVELS) {
      const sent = level === "off" ? "none" : level
      entry.thinkingLevelMap[level] = efforts.includes(sent) ? sent : null
    }
  }
  // what a call costs, in USD a million tokens; magpie gives USD a token as
  // a decimal string, and leaves out what it doesn't know
  if (model.pricing) {
    const perMillion = (v) => (v == null ? undefined : Number(v) * 1e6)
    const cost = {
      input: perMillion(model.pricing.prompt),
      output: perMillion(model.pricing.completion),
      cacheRead: perMillion(model.pricing.input_cache_read),
      cacheWrite: perMillion(model.pricing.input_cache_write),
    }
    for (const k of Object.keys(cost)) if (cost[k] === undefined || Number.isNaN(cost[k])) delete cost[k]
    if (Object.keys(cost).length > 0) entry.cost = cost
  }
  return entry
}

export function connect({ gateway, models }) {
  // one object, so magpie stashes and puts back the whole provider: written
  // leaf by leaf, stepping out would leave an empty provider where there was
  // none, and mizar would fail to read it
  return {
    "providers.magpie": {
      name: "magpie",
      baseUrl: gateway.v1,
      apiKey: gateway.key,
      api: "openai-completions",
      // without it mizar sends no session to the gateway, and a turn's usage
      // is recorded with no session of its own
      compat: { sendSessionAffinityHeaders: true },
      models: models.map(modelEntry),
    },
  }
}