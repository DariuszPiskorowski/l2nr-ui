import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

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
      display: {
        valueProperty: "payload.ambient",
        caption: "Ambient Temperature",
        label: "TEMP °C",
        min: -10,
        max: 50
      },
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
  assert.equal(generatedPackage.version, "0.5.2");
  assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr || syntaxCheck.stdout);
  assert.equal(generatedPackage["node-red"].nodes["ui-sample-gauge"], "nodes/ui-sample-gauge.js");
  assert.equal(
    generatedPackage["node-red-dashboard-2"].widgets["ui-sample-gauge"].output,
    "ui-sample-gauge.umd.js"
  );
  assert.match(runtime, /stores\.data\.save/);
  assert.doesNotMatch(runtime, /node\.send/);
  assert.match(editor, /outputs: 0/);
  assert.match(editor, /node-input-valueProperty/);
  assert.match(editor, /node-input-caption/);
  assert.match(editor, /node-input-showCaption/);
  assert.match(editor, /node-input-componentLabel/);
  assert.match(editor, /valueProperty: \{ value: "payload\.ambient"/);
  assert.match(wrapper, /React\.createElement\(SourceComponent/);
  assert.match(wrapper, /readValue\(this\.latestMessage, valueProperty\)/);
  assert.match(wrapper, /deriveCaption\(valueProperty\)/);
  assert.match(wrapper, /Ambient Temperature/);
  assert.match(wrapper, /TEMP °C/);
  assert.match(wrapper, /l2nr-caption/);
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


test("generates an interactive Dashboard 2 package with a payload output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "l2nr-interactive-"));
  const output = path.join(root, ".l2nr-output");
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "src", "Dial.tsx"),
    "export default function Dial({ payload, onChange }) { return <button onClick={() => onChange({ setpoint: 22 })}>{payload?.setpoint}</button>; }"
  );
  await writeFile(
    path.join(root, "l2nr-ui.manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "sample-dial",
      label: "Sample Dial",
      component: "src/Dial.tsx",
      dashboard: { width: 6, height: 6 },
      input: { source: "msg.payload" },
      display: { valueProperty: "payload.setpoint", caption: "THERMOSTAT", min: 5, max: 32 },
      output: { target: "msg.payload" }
    })
  );

  const result = await generateDashboard2Package(root, output);
  const runtime = await readFile(
    path.join(result.packageDirectory, "nodes", "ui-sample-dial.js"),
    "utf8"
  );
  const editor = await readFile(
    path.join(result.packageDirectory, "nodes", "ui-sample-dial.html"),
    "utf8"
  );
  const wrapper = await readFile(
    path.join(result.packageDirectory, "ui", "components", "UiSampleDial.vue"),
    "utf8"
  );

  assert.match(editor, /outputs: 1/);
  assert.match(runtime, /onAction: true/);
  assert.match(wrapper, /inject: \["\$dataTracker", "\$socket"\]/);
  assert.match(wrapper, /sourceProps\.onChange = this\.sendPayload/);
  assert.match(wrapper, /this\.latestMessage\.payload/);
  assert.match(wrapper, /nodeId: this\.id/);
  assert.match(wrapper, /storageKey: "l2nr-ui:" \+ this\.id/);
  assert.match(
    wrapper,
    /this\.\$socket\.emit\("widget-action", this\.id, message\)/
  );
});


// Execute the generated bridge, rather than only checking for source strings.
test("bridge preserves the configured topic and a settings-panel override", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "l2nr-topics-"));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "Panel.tsx"), "export default function Panel() { return null; }");
  await writeFile(path.join(root, "l2nr-ui.manifest.json"), JSON.stringify({
    schemaVersion: 1, name: "topic-panel", label: "Panel", component: "src/Panel.tsx",
    dashboard: { width: 6, height: 8 }, input: { source: "msg.payload", topic: "Heating/Control/state" },
    output: { target: "msg.payload", topic: "Heating/Control/set" }
  }));
  const result = await generateDashboard2Package(root, path.join(root, "out"));
  const wrapper = await readFile(path.join(result.packageDirectory, "ui/components/UiTopicPanel.vue"), "utf8");
  const emitted = [];
  const source = wrapper.split("<script>")[1].split("</script>")[0]
    .replace(/^import .*;$/gm, "").replace("export default", "globalThis.widget =");
  const sandbox = { sourceCss: "", markRaw: v => v, toRaw: v => v };
  vm.runInNewContext(source, sandbox);
  const context = { id: "panel1", $socket: { emit: (...args) => emitted.push(args) } };
  const payload = { setpoint: 19.5, mode: "normal" };
  sandbox.widget.methods.sendPayload.call(context, payload);
  sandbox.widget.methods.sendPayload.call(context, payload, { topic: "Other/set" });
  assert.equal(emitted[0][2].topic, "Heating/Control/set");
  assert.equal(emitted[1][2].topic, "Other/set");
  assert.equal(emitted[1][2].payload, payload);
  const runtime = await readFile(path.join(result.packageDirectory, "nodes/ui-topic-panel.js"), "utf8");
  let Constructor, registered;
  const RED = { nodes: {
    createNode() {}, getNode() { return { getBase() { return {}; }, register(node, config, events) { registered = { config, events }; } }; },
    registerType(type, ctor) { Constructor = ctor; }
  } };
  const scope = { module: { exports: {} } };
  vm.runInNewContext(runtime, scope);
  scope.module.exports(RED);
  new Constructor({ group: "group1" });
  assert.equal(registered.config.topicType, "msg");
  assert.equal(registered.config.topic, "topic", "Dashboard must evaluate the topic from the action message");
});
