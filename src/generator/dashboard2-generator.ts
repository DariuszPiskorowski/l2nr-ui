import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertUiNodeSpec, type UiNodeSpec } from "../spec/ui-node-spec.js";

export interface GeneratedDashboardPackage {
  packageDirectory: string;
  packageName: string;
  nodeType: string;
}

export async function generateDashboard2Package(
  projectDirectory: string,
  outputDirectory: string
): Promise<GeneratedDashboardPackage> {
  const projectRoot = path.resolve(projectDirectory);
  const spec = await readManifest(projectRoot);

  const packageName = "node-red-dashboard-2-" + spec.name;
  const nodeType = "ui-" + spec.name;
  const widgetName = toPascalCase(nodeType);
  const packageDirectory = path.join(path.resolve(outputDirectory), packageName);
  const nodesDirectory = path.join(packageDirectory, "nodes");
  const componentsDirectory = path.join(packageDirectory, "ui", "components");

  await mkdir(nodesDirectory, { recursive: true });
  await mkdir(componentsDirectory, { recursive: true });

  const vueFile = path.join(componentsDirectory, widgetName + ".vue");
  const componentFile = path.resolve(projectRoot, spec.component);
  const componentImport = toModulePath(path.relative(path.dirname(vueFile), componentFile));
  const stylesFile = path.join(projectRoot, "src", "styles.css");
  const stylesImport = (await exists(stylesFile))
    ? toModulePath(path.relative(path.dirname(vueFile), stylesFile)) + "?inline"
    : null;

  await Promise.all([
    writeFile(
      path.join(packageDirectory, "package.json"),
      renderPackageJson(packageName, nodeType, widgetName),
      "utf8"
    ),
    writeFile(path.join(nodesDirectory, nodeType + ".js"), renderRuntime(nodeType), "utf8"),
    writeFile(
      path.join(nodesDirectory, nodeType + ".html"),
      renderEditor(nodeType, spec),
      "utf8"
    ),
    writeFile(
      path.join(packageDirectory, "ui", "index.js"),
      renderUiEntry(widgetName),
      "utf8"
    ),
    writeFile(
      vueFile,
      renderVueWrapper(widgetName, componentImport, stylesImport, spec),
      "utf8"
    ),
    writeFile(
      path.join(packageDirectory, "vite.config.mjs"),
      renderViteConfig(nodeType, projectRoot),
      "utf8"
    )
  ]);

  return { packageDirectory, packageName, nodeType };
}

async function readManifest(projectRoot: string): Promise<UiNodeSpec> {
  const manifestPath = path.join(projectRoot, "l2nr-ui.manifest.json");
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error("Cannot load " + manifestPath, { cause: error });
  }

  assertUiNodeSpec(parsed);

  if (!/^[a-z][a-z0-9-]*$/.test(parsed.name)) {
    throw new Error("Manifest name must use lowercase letters, numbers and hyphens");
  }

  const componentFile = path.resolve(projectRoot, parsed.component);
  const relative = path.relative(projectRoot, componentFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Manifest component must be inside the project");
  }

  await access(componentFile);
  return parsed;
}

function renderPackageJson(
  packageName: string,
  nodeType: string,
  widgetName: string
): string {
  return JSON.stringify(
    {
      name: packageName,
      version: "0.4.0",
      description: "Generated Node-RED Dashboard 2 widget",
      license: "MIT",
      main: "nodes/" + nodeType + ".js",
      files: ["nodes", "resources"],
      scripts: { build: "vite build" },
      engines: { node: ">=22" },
      "node-red": {
        nodes: { [nodeType]: "nodes/" + nodeType + ".js" }
      },
      "node-red-dashboard-2": {
        version: "1.0.0",
        widgets: {
          [nodeType]: {
            output: nodeType + ".umd.js",
            component: widgetName
          }
        }
      },
      dependencies: {
        vue: "3.5.42",
        vuex: "4.1.0"
      },
      devDependencies: {
        "@tailwindcss/vite": "4.2.1",
        "@vitejs/plugin-react": "5.2.0",
        "@vitejs/plugin-vue": "6.0.8",
        react: "19.2.0",
        "react-dom": "19.2.0",
        tailwindcss: "4.2.1",
        "tw-animate-css": "1.3.4",
        vite: "7.1.12"
      }
    },
    null,
    2
  ) + "\n";
}

function renderRuntime(nodeType: string): string {
  return lines(
    "\"use strict\";",
    "",
    "module.exports = function (RED) {",
    "  function DisplayNode(config) {",
    "    RED.nodes.createNode(this, config);",
    "    const node = this;",
    "    const group = RED.nodes.getNode(config.group);",
    "",
    "    if (!group) {",
    "      node.error(\"No Dashboard group configured\");",
    "      return;",
    "    }",
    "",
    "    const base = group.getBase();",
    "    const events = {",
    "      onInput: function (msg, send, done) {",
    "        base.stores.data.save(base, node, msg);",
    "        if (done) done();",
    "      }",
    "    };",
    "",
    "    group.register(node, config, events);",
    "  }",
    "",
    "  RED.nodes.registerType(" + quote(nodeType) + ", DisplayNode);",
    "};"
  );
}

function renderEditor(nodeType: string, spec: UiNodeSpec): string {
  const label = escapeHtml(spec.label);
  const display = spec.display ?? {};
  const valueProperty = display.valueProperty ?? "payload";
  const caption = display.caption ?? "";
  const showCaption = display.showCaption ?? true;
  const componentLabel = display.label ?? "";
  const min = display.min ?? 0;
  const max = display.max ?? 100;
  return lines(
    "<script type=\"text/javascript\">",
    "(function () {",
    "  RED.nodes.registerType(" + quote(nodeType) + ", {",
    "    category: \"dashboard\",",
    "    color: \"#a74444\",",
    "    defaults: {",
    "      name: { value: \"\" },",
    "      group: { type: \"ui-group\", required: true },",
    "      order: { value: 0 },",
    "      width: { value: " + String(spec.dashboard.width) + " },",
    "      height: { value: " + String(spec.dashboard.height) + " },",
    "      valueProperty: { value: " + quote(valueProperty) + ", required: true },",
    "      caption: { value: " + quote(caption) + " },",
    "      showCaption: { value: " + String(showCaption) + " },",
    "      componentLabel: { value: " + quote(componentLabel) + " },",
    "      min: { value: " + String(min) + ", required: true, validate: RED.validators.number() },",
    "      max: { value: " + String(max) + ", required: true, validate: RED.validators.number() }",
    "    },",
    "    inputs: 1,",
    "    outputs: " + (spec.output === null ? "0" : "1") + ",",
    "    icon: \"font-awesome/fa-dashboard\",",
    "    paletteLabel: " + quote(spec.label) + ",",
    "    label: function () { return this.name || " + quote(spec.label) + "; },",
    "    oneditprepare: function () {",
    "      $(\"#node-input-valueProperty\").typedInput({ type: \"msg\", types: [\"msg\"] });",
    "      $(\"#node-input-size\").elementSizer({",
    "        width: \"#node-input-width\",",
    "        height: \"#node-input-height\",",
    "        group: \"#node-input-group\"",
    "      });",
    "    }",
    "  });",
    "}());",
    "</script>",
    "",
    "<script type=\"text/html\" data-template-name=\"" + nodeType + "\">",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-group\"><i class=\"fa fa-table\"></i> Group</label>",
    "    <input type=\"text\" id=\"node-input-group\">",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label><i class=\"fa fa-object-group\"></i> Size</label>",
    "    <input type=\"hidden\" id=\"node-input-width\">",
    "    <input type=\"hidden\" id=\"node-input-height\">",
    "    <button class=\"editor-button\" id=\"node-input-size\"></button>",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-valueProperty\"><i class=\"fa fa-list\"></i> Value property</label>",
    "    <input type=\"text\" id=\"node-input-valueProperty\" placeholder=\"payload.ambient\">",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-caption\"><i class=\"fa fa-comment\"></i> Caption</label>",
    "    <input type=\"text\" id=\"node-input-caption\" placeholder=\"Auto from value property\">",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-showCaption\"><i class=\"fa fa-eye\"></i> Show caption</label>",
    "    <input type=\"checkbox\" id=\"node-input-showCaption\" style=\"width:auto;vertical-align:top;\">",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-componentLabel\"><i class=\"fa fa-font\"></i> Gauge label</label>",
    "    <input type=\"text\" id=\"node-input-componentLabel\" placeholder=\"TEMP °C\">",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-min\"><i class=\"fa fa-minus\"></i> Minimum</label>",
    "    <input type=\"number\" id=\"node-input-min\">",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-max\"><i class=\"fa fa-plus\"></i> Maximum</label>",
    "    <input type=\"number\" id=\"node-input-max\">",
    "  </div>",
    "  <div class=\"form-row\">",
    "    <label for=\"node-input-name\"><i class=\"fa fa-tag\"></i> Name</label>",
    "    <input type=\"text\" id=\"node-input-name\" placeholder=\"" + label + "\">",
    "  </div>",
    "</script>",
    "",
    "<script type=\"text/html\" data-help-name=\"" + nodeType + "\">",
    "  <p>" + label + " generated by l2nr-ui.</p>",
    "  <p><b>Value property</b> selects a numeric field from the incoming message, for example <code>payload.ambient</code>.</p>",
    "  <p><b>Caption</b> is shown below the display. Leave it empty to derive it from the value property.</p>",
    "</script>"
  );
}

function renderUiEntry(widgetName: string): string {
  return lines(
    "export { default as " + widgetName + " } from \"./components/" + widgetName + ".vue\";"
  );
}

function renderVueWrapper(
  widgetName: string,
  componentImport: string,
  stylesImport: string | null,
  spec: UiNodeSpec
): string {
  const display = spec.display ?? {};
  const defaultValueProperty = display.valueProperty ?? "payload";
  const defaultCaption = display.caption ?? "";
  const defaultShowCaption = display.showCaption ?? true;
  const defaultLabel = display.label ?? "";
  const defaultMin = display.min ?? 0;
  const defaultMax = display.max ?? 100;
  const interactive = spec.output !== null;
  const styleLine = stylesImport
    ? "import sourceCss from " + quote(stylesImport) + ";"
    : "const sourceCss = \"\";";

  return lines(
    "<template>",
    "  <div ref=\"host\" class=\"l2nr-widget-host\"></div>",
    "</template>",
    "",
    "<script>",
    "import React from \"react\";",
    "import { createRoot } from \"react-dom/client\";",
    "import SourceComponent from " + quote(componentImport) + ";",
    styleLine,
    "",
    "function coerceNumber(input) {",
    "  if (typeof input === \"number\" && Number.isFinite(input)) return input;",
    "  if (typeof input === \"string\") {",
    "    const parsed = Number(input);",
    "    if (Number.isFinite(parsed)) return parsed;",
    "  }",
    "  if (input && typeof input === \"object\") {",
    "    for (const key of [\"value\", \"temperature\", \"temp\", \"ambient\", \"current\"]) {",
    "      const parsed = Number(input[key]);",
    "      if (Number.isFinite(parsed)) return parsed;",
    "    }",
    "  }",
    "  return 0;",
    "}",
    "",
    "function readValue(message, property) {",
    "  const path = typeof property === \"string\" && property.trim()",
    "    ? property.trim().replace(/^msg\\./, \"\")",
    "    : \"payload\";",
    "  let current = message;",
    "  for (const key of path.split(\".\").filter(Boolean)) {",
    "    if (current && typeof current === \"object\" && key in current) current = current[key];",
    "    else return coerceNumber(message);",
    "  }",
    "  return coerceNumber(current);",
    "}",
    "",
    "function deriveCaption(property) {",
    "  const last = String(property || \"payload\").split(\".\").filter(Boolean).pop() || \"payload\";",
    "  return last.replace(/([a-z0-9])([A-Z])/g, \"$1 $2\").replace(/[_-]+/g, \" \").toUpperCase();",
    "}",
    "",
    "function numberSetting(value, fallback) {",
    "  const parsed = Number(value);",
    "  return Number.isFinite(parsed) ? parsed : fallback;",
    "}",
    "",
    "export default {",
    "  name: " + quote(widgetName) + ",",
    "  inject: [\"$dataTracker\"],",
    "  props: {",
    "    id: { type: String, required: true },",
    "    props: { type: Object, default: () => ({}) },",
    "    state: { type: Object, default: () => ({}) }",
    "  },",
    "  data() {",
    "    return { latestMessage: null, reactRoot: null };",
    "  },",
    "  created() {",
    "    this.$dataTracker(this.id, this.onInput, this.onLoad);",
    "  },",
    "  mounted() {",
    "    const shadow = this.$refs.host.attachShadow({ mode: \"open\" });",
    "    const style = document.createElement(\"style\");",
    "    style.textContent = sourceCss.replaceAll(\":root\", \":host\") +",
    "      \"\\n:host{display:block;width:100%;height:100%;min-height:0}\" +",
    "      \"\\n.l2nr-react-root{width:100%;height:100%;overflow:hidden}\" +",
    "      \"\\n.l2nr-display{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden}\" +",
    "      \"\\n.l2nr-component{flex:1;min-height:0;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}\" +",
    "      \"\\n.l2nr-component>*{max-width:100%;max-height:100%}\" +",
    "      \"\\n.l2nr-component svg{max-width:100%;max-height:100%;height:auto}\" +",
    "      \"\\n.l2nr-caption{flex:0 0 auto;color:var(--gauge-ember,#f28c00);font-family:var(--font-tech,ui-monospace,monospace);font-size:12px;letter-spacing:.25em;text-align:center;text-transform:uppercase;opacity:.8}\";",
    "    const root = document.createElement(\"div\");",
    "    root.className = \"l2nr-react-root l2nr-" + escapeJavaScriptFragment(spec.name) + "\";",
    "    shadow.append(style, root);",
    "    this.reactRoot = createRoot(root);",
    "    this.renderReact();",
    "  },",
    "  beforeUnmount() {",
    "    if (this.reactRoot) this.reactRoot.unmount();",
    "  },",
    "  methods: {",
    "    onInput(message) {",
    "      this.latestMessage = message;",
    "      this.renderReact();",
    "    },",
    "    onLoad(message) {",
    "      this.latestMessage = message;",
    "      this.renderReact();",
    "    },",
    interactive
      ? "    sendPayload(payload) {\n      this.$socket.emit(\"widget-action\", this.id, { payload });\n    },"
      : "",
    "    renderReact() {",
    "      if (!this.reactRoot) return;",
    "      const valueProperty = typeof this.props.valueProperty === \"string\" && this.props.valueProperty.trim()",
    "        ? this.props.valueProperty.trim()",
    "        : " + quote(defaultValueProperty) + ";",
    "      const configuredCaption = typeof this.props.caption === \"string\"",
    "        ? this.props.caption",
    "        : " + quote(defaultCaption) + ";",
    "      const showCaption = typeof this.props.showCaption === \"boolean\"",
    "        ? this.props.showCaption",
    "        : " + String(defaultShowCaption) + ";",
    "      const caption = showCaption",
    "        ? configuredCaption.trim() || deriveCaption(valueProperty)",
    "        : \"\";",
    "      const componentLabel = typeof this.props.componentLabel === \"string\" && this.props.componentLabel.trim()",
    "        ? this.props.componentLabel.trim()",
    "        : " + quote(defaultLabel) + ";",
    "      const min = numberSetting(this.props.min, " + String(defaultMin) + ");",
    "      const configuredMax = numberSetting(this.props.max, " + String(defaultMax) + ");",
    "      const max = configuredMax > min ? configuredMax : min + 1;",
    "      const sourceProps = {",
    "        value: readValue(this.latestMessage, valueProperty),",
    "        payload: this.latestMessage && typeof this.latestMessage === \"object\"",
    "          ? this.latestMessage.payload",
    "          : undefined,",
    "        message: this.latestMessage,",
    "        min,",
    "        max,",
    "        label: componentLabel",
    "      };",
    interactive
      ? "      sourceProps.onChange = this.sendPayload;"
      : "",
    "      const component = React.createElement(SourceComponent, sourceProps);",
    "      this.reactRoot.render(",
    "        React.createElement(\"div\", { className: \"l2nr-display\" }, [",
    "          React.createElement(\"div\", { className: \"l2nr-component\", key: \"component\" }, component),",
    "          caption ? React.createElement(\"div\", { className: \"l2nr-caption\", key: \"caption\" }, caption) : null",
    "        ])",
    "      );",
    "    }",
    "  }",
    "};",
    "</script>",
    "",
    "<style>",
    ".l2nr-widget-host { width: 100%; height: 100%; min-height: 0; }",
    "</style>"
  );
}

function renderViteConfig(nodeType: string, projectRoot: string): string {
  return lines(
    "import tailwindcss from \"@tailwindcss/vite\";",
    "import react from \"@vitejs/plugin-react\";",
    "import vue from \"@vitejs/plugin-vue\";",
    "import path from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "import { defineConfig } from \"vite\";",
    "",
    "const rootDir = path.dirname(fileURLToPath(import.meta.url));",
    "const sourceRoot = " + quote(projectRoot) + ";",
    "",
    "export default defineConfig({",
    "  plugins: [tailwindcss(), vue(), react()],",
    "  define: {",
    "    \"process.env.NODE_ENV\": JSON.stringify(\"production\")",
    "  },",
    "  resolve: {",
    "    alias: { \"@\": path.join(sourceRoot, \"src\") },",
    "    dedupe: [\"react\", \"react-dom\"]",
    "  },",
    "  build: {",
    "    outDir: path.resolve(rootDir, \"resources\"),",
    "    emptyOutDir: true,",
    "    lib: {",
    "      entry: path.resolve(rootDir, \"ui/index.js\"),",
    "      name: " + quote(nodeType) + ",",
    "      formats: [\"umd\"],",
    "      fileName: () => " + quote(nodeType + ".umd.js"),
    "    },",
    "    rollupOptions: {",
    "      external: [\"vue\", \"vuex\"],",
    "      output: { globals: { vue: \"Vue\", vuex: \"vuex\" } }",
    "    }",
    "  }",
    "});"
  );
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function toModulePath(value: string): string {
  const normalized = value.split(path.sep).join("/");
  return normalized.startsWith(".") ? normalized : "./" + normalized;
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function lines(...values: string[]): string {
  return values.join("\n") + "\n";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function escapeJavaScriptFragment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
