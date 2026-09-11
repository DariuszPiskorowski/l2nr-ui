import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { scanProject } from "../dist/index.js";

test("detects a display-only Lovable React UI and its external transports", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "l2nr-ui-"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "sample-ui",
      dependencies: {
        react: "19.0.0",
        vite: "7.0.0",
        mqtt: "5.0.0"
      }
    })
  );
  await writeFile(
    path.join(root, "src", "ui.tsx"),
    "window.localStorage.getItem('config'); fetch('/state');"
  );
  await writeFile(
    path.join(root, "l2nr-ui.manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "sample-ui",
      label: "Sample UI",
      component: "src/ui.tsx",
      dashboard: { width: 6, height: 6 },
      input: { source: "msg.payload" },
      output: null
    })
  );

  const report = await scanProject(root);

  assert.equal(report.classification, "ui-application");
  assert.deepEqual(report.frameworks, ["react", "vite"]);
  assert.deepEqual(report.transports, ["http", "mqtt"]);
  assert.deepEqual(report.browserApis, ["localStorage", "window"]);
  assert.equal(report.sourceFilesScanned, 1);
  assert.deepEqual(report.manifest, {
    path: "l2nr-ui.manifest.json",
    name: "sample-ui",
    label: "Sample UI",
    component: "src/ui.tsx",
    mode: "display",
    input: "msg.payload",
    output: null
  });
});
