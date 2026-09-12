import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { generateDashboard2Package } from "../dist/index.js";

test("generates a display-only Dashboard 2 package around a React component", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "l2nr-generator-"));
  const output = path.join(root, ".l2nr-output");
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src", "Gauge.tsx"),
    "export default function Gauge({ value }) { return <output>{value}</output>; }"
  );
  await writeFile(path.join(root, "src", "styles.css"), ":root { --gauge: red; }");
  await writeFile(
    path.join(root, "l2nr-ui.manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "sample-gauge",
      label: "Sample Gauge",
      component: "src/Gauge.tsx",
      dashboard: { width: 6, height: 5 },
      input: { source: "msg.payload" },
      output: null
    })
  );

  const result = await generateDashboard2Package(root, output);
  const generatedPackage = JSON.parse(
    await readFile(path.join(result.packageDirectory, "package.json"), "utf8")
  );
  const runtimePath = path.join(
    result.packageDirectory,
    "nodes",
    "ui-sample-gauge.js"
  );
  const runtime = await readFile(runtimePath, "utf8");
  const editor = await readFile(
    path.join(result.packageDirectory, "nodes", "ui-sample-gauge.html"),
    "utf8"
  );
  const wrapper = await readFile(
    path.join(result.packageDirectory, "ui", "components", "UiSampleGauge.vue"),
    "utf8"
  );
  const uiEntry = await readFile(
    path.join(result.packageDirectory, "ui", "index.js"),
    "utf8"
  );
  const viteConfig = await readFile(
    path.join(result.packageDirectory, "vite.config.mjs"),
    "utf8"
  );

  const syntaxCheck = spawnSync(process.execPath, ["--check", runtimePath], {
    encoding: "utf8"
  });

  assert.equal(result.packageName, "node-red-dashboard-2-sample-gauge");
  assert.equal(generatedPackage.version, "0.1.5");
  assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr || syntaxCheck.stdout);
  assert.equal(generatedPackage["node-red"].nodes["ui-sample-gauge"], "nodes/ui-sample-gauge.js");
  assert.equal(
    generatedPackage["node-red-dashboard-2"].widgets["ui-sample-gauge"].output,
    "ui-sample-gauge.umd.js"
  );
  assert.match(runtime, /stores\.data\.save/);
  assert.doesNotMatch(runtime, /node\.send/);
  assert.match(editor, /outputs: 0/);
  assert.match(wrapper, /React\.createElement\(SourceComponent/);
  assert.match(wrapper, /attachShadow/);
  assert.match(wrapper, /\?inline/);
  assert.match(wrapper, /\$dataTracker\(this\.id, this\.onInput, this\.onLoad\);/);
  assert.doesNotMatch(wrapper, /this\.onLoad, this\)/);
  assert.match(
    uiEntry,
    /export \{ default as UiSampleGauge \} from ".\/components\/UiSampleGauge\.vue";/
  );
  assert.doesNotMatch(uiEntry, /export default/);
  assert.match(viteConfig, /name: "ui-sample-gauge"/);
  assert.match(
    viteConfig,
    /"process\.env\.NODE_ENV": JSON\.stringify\("production"\)/
  );
});
