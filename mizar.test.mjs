import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { agent, connect } from "./mizar.agent.js"

const gateway = { url: "http://127.0.0.1:3425", v1: "http://127.0.0.1:3425/v1", key: "magpie-mizar" }

// a model as magpie's connect is given one: pricing is USD a token, as decimal strings
const model = {
  id: "relay/vendor/model",
  name: "Example",
  context: 262144,
  output: 32768,
  images: true,
  efforts: ["low", "medium", "high"],
  native_endpoints: ["/v1/chat/completions"],
  pricing: { prompt: "0.0000015", completion: "0.0000075", input_cache_read: "0.000000075" },
}

const output = (models = [model]) => connect({ gateway, models })
const provider = (models = [model]) => output(models)["providers.magpie"]

test("registers Mizar with its startup model in settings.json", () => {
  expect(agent).toMatchObject({
    id: "mizar",
    name: "Mizar",
    bin: "mizar",
    config: "~/.mizar/models.json",
    format: "json",
  })
  // agent.model stays out: the model lives in settings.json, not models.json
  expect(agent.model).toBeUndefined()
  expect(agent.startup).toEqual({
    config: "~/.mizar/settings.json",
    format: "json",
    model: "defaultModel",
    keys: { defaultProvider: "magpie" },
  })
  // the row's effort replaces Mizar's own reasoning_effort on the gateway
  expect(agent.effort).toBe(true)
})

test("writes one complete provider object, so disconnect restores it whole", () => {
  expect(Object.keys(output())).toEqual(["providers.magpie"])
  const p = provider()
  expect(p.baseUrl).toBe(gateway.v1)
  expect(p.apiKey).toBe("magpie-mizar")
  expect(p.api).toBe("openai-completions")
  // without it Mizar sends no session, and a turn's usage has none
  expect(p.compat).toEqual({ sendSessionAffinityHeaders: true })
})

test("names every thinking level, hiding the ones the model lacks", () => {
  const [entry] = provider().models
  expect(entry.reasoning).toBe(true)
  // a level left out is offered rather than hidden, so all seven are named
  expect(Object.keys(entry.thinkingLevelMap).sort()).toEqual(["high", "low", "max", "medium", "minimal", "off", "xhigh"])
  expect(entry.thinkingLevelMap).toMatchObject({ off: null, minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null })
})

test("maps magpie's off to the model's none where it takes one", () => {
  const [entry] = provider([{ ...model, efforts: ["none", "high"] }]).models
  expect(entry.thinkingLevelMap.off).toBe("none")
  expect(entry.thinkingLevelMap.high).toBe("high")
  expect(entry.thinkingLevelMap.medium).toBeNull()
})

test("turns magpie's per-token pricing into USD a million tokens", () => {
  expect(provider().models[0].cost).toEqual({ input: 1.5, output: 7.5, cacheRead: 0.075 })
})

test("keeps a cache write price where magpie knows one", () => {
  const [entry] = provider([{ ...model, pricing: { ...model.pricing, input_cache_write: "0.0000125" } }]).models
  expect(entry.cost.cacheWrite).toBe(12.5)
})

test("omits a cost magpie gave no figure for", () => {
  const [entry] = provider([{ ...model, pricing: { prompt: "0.000001", completion: "0.000002" } }]).models
  expect(entry.cost).toEqual({ input: 1, output: 2 })
  expect(entry.cost.cacheRead).toBeUndefined()
})

test("writes no cost at all for a model magpie prices not", () => {
  expect(provider([{ ...model, pricing: {} }]).models[0].cost).toBeUndefined()
})

test("leaves unknown or nonpositive limits to Mizar's defaults", () => {
  for (const limits of [{}, { context: 0, output: 0 }, { context: -1, output: -1 }]) {
    const [entry] = provider([{ id: "relay/plain", ...limits }]).models
    expect(entry).toEqual({ id: "relay/plain", name: "relay/plain", input: ["text"], reasoning: false })
  }
})

test("keeps a published output limit inside its known context window", () => {
  expect(provider([{ ...model, context: 8192, output: 32768 }]).models[0].maxTokens).toBe(8192)
  expect(provider([{ ...model, context: 0, output: 32768 }]).models[0].maxTokens).toBe(32768)
})

test("marks a model that thinks with no levels known as reasoning, with none offered", () => {
  // magpie's own adapter does this: a model that thinks with no levels is
  // offered Mizar's levels anyway, and the gateway fits them to the model
  const [entry] = provider([{ ...model, efforts: [] }]).models
  expect(entry.reasoning).toBe(false)
  expect(entry.thinkingLevelMap).toBeUndefined()
})

test("takes images only for a model that sees", () => {
  expect(provider([{ ...model, images: false }]).models[0].input).toEqual(["text"])
})

test("replaces the catalog on the next call, an empty one included", () => {
  expect(provider([{ id: "new/only", efforts: [] }]).models.map((m) => m.id)).toEqual(["new/only"])
  expect(provider([]).models).toEqual([])
})

test("follows the host's gateway without caching an address or a key", () => {
  const next = connect({ gateway: { v1: "http://127.0.0.1:3900/v1", key: "synthetic-next" }, models: [] })["providers.magpie"]
  expect(next.baseUrl).toBe("http://127.0.0.1:3900/v1")
  expect(next.apiKey).toBe("synthetic-next")
})

test("does not mutate what the host gave it", () => {
  const input = { gateway: { ...gateway }, models: [{ ...model, efforts: [...model.efforts] }] }
  const before = JSON.stringify(input)
  connect(input)
  expect(JSON.stringify(input)).toBe(before)
})

test("declares the community agent entry and no host module", () => {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
  expect(pkg.magpie.agent).toBe("./mizar.agent.js")
  expect(pkg.main).toBeUndefined()
  expect(pkg.dependencies).toBeUndefined()
  expect(pkg.scripts.preinstall).toBeUndefined()
  expect(pkg.scripts.postinstall).toBeUndefined()
})

test("carries an icon that renders where magpie shows it, in an <img>", () => {
  // magpie draws an agent's picture as <img src>, and shows an https or data:
  // URI only: provider.iconURL refuses anything else, and a relative path
  // would name a file beside the plugin that the page never serves
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
  const icon = pkg.magpie.icon
  expect(icon.startsWith("data:image/svg+xml;base64,")).toBe(true)
  const svg = Buffer.from(icon.split(",")[1], "base64").toString("utf8")
  expect(svg).toContain("<svg")
  // a <style> block inside an <img> is not applied: paths carrying only a
  // class name come out with no fill at all, which is a blank icon
  expect(svg).not.toContain("<style")
  expect(svg).not.toMatch(/class=/)
  const paths = svg.match(/<path[^>]*>/g) ?? []
  expect(paths.length).toBeGreaterThan(0)
  for (const p of paths) expect(p).toContain("fill=")
})

test("gives the icon to the agent export too, which is what the Agents page draws", () => {
  // package.json's magpie.icon is the plugin's own row. An agent's row reads
  // agentplug.Desc.Icon, the icon of the module's agent export: with only the
  // package one set, magpie's pluggedIcon falls back to "generic", and the
  // Agents page shows a placeholder while the Plugins page shows the picture
  expect(agent.icon).toBeDefined()
  expect(agent.icon.startsWith("data:image/svg+xml;base64,")).toBe(true)
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
  expect(agent.icon).toBe(pkg.magpie.icon)
})

test("keeps the icon.svg the data URI was made from", () => {
  const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"))
  expect(pkg.files).toContain("icon.svg")
  const file = readFileSync(new URL("./icon.svg", import.meta.url), "utf8")
  const svg = Buffer.from(pkg.magpie.icon.split(",")[1], "base64").toString("utf8")
  expect(file.trim()).toBe(svg.trim())
})