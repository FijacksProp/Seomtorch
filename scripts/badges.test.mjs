import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const catalog = readFileSync(new URL("../backend/learning/badges.py", import.meta.url), "utf8");
const artwork = readFileSync(new URL("../assets/badges.svg", import.meta.url), "utf8");
const catalogCodes = [...catalog.matchAll(/\{"code": "([a-z0-9-]+)"/g)].map((match) => match[1]);
const artworkCodes = [...artwork.matchAll(/<symbol id="([a-z0-9-]+)"/g)].map((match) => match[1]);

assert.ok(catalogCodes.length > 0, "the achievement catalog should not be empty");
assert.equal(new Set(catalogCodes).size, catalogCodes.length, "badge catalog codes should be unique");
assert.equal(new Set(artworkCodes).size, artworkCodes.length, "badge artwork ids should be unique");
assert.deepEqual([...artworkCodes].sort(), [...catalogCodes].sort(), "each badge should have one matching SVG symbol");
for (const code of catalogCodes) {
  const symbol = artwork.match(new RegExp(`<symbol id="${code}"[\\s\\S]*?<\\/symbol>`))?.[0];
  assert.ok(symbol && /<path|<circle|<rect/.test(symbol), `${code} should contain vector artwork`);
}

console.log(`Validated ${catalogCodes.length} custom badge SVGs.`);
