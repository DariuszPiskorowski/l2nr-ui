import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { assertUiNodeSpec } from "../spec/ui-node-spec.js";

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);
const IGNORED_DIRECTORIES = new Set([".git", "dist", "node_modules", ".output"]);

export interface ProjectReport {
  schemaVersion: 1;
  packageName: string | null;
  projectRoot: string;
  classification: "ui-application" | "unknown";
  frameworks: string[];
  transports: string[];
  browserApis: string[];
  sourceFilesScanned: number;
  manifest: {
    path: "l2nr-ui.manifest.json";
    name: string;
    label: string;
    component: string;
    mode: "interactive" | "display";
    input: "msg.payload";
    output: "msg.payload" | null;
  } | null;
}

interface PackageJson {
  name?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
}

export async function scanProject(projectDirectory: string): Promise<ProjectReport> {
  const projectRoot = path.resolve(projectDirectory);
  const packageJson = await loadPackageJson(projectRoot);
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {})
  };

  const frameworks = detectFrameworks(dependencies);
  const transports = new Set<string>();
  const browserApis = new Set<string>();

  detectDependencyTransports(dependencies, transports);

  const sourceFiles = await collectSourceFiles(path.join(projectRoot, "src"));
  for (const sourceFile of sourceFiles) {
    const content = await readFile(sourceFile, "utf8");
    detectSourceSignals(content, transports, browserApis);
  }

  return {
    schemaVersion: 1,
    packageName: typeof packageJson.name === "string" ? packageJson.name : null,
    projectRoot,
    classification: frameworks.includes("react") ? "ui-application" : "unknown",
    frameworks,
    transports: [...transports].sort(),
    browserApis: [...browserApis].sort(),
    sourceFilesScanned: sourceFiles.length,
    manifest: await loadManifest(projectRoot)
  };
}

async function loadManifest(projectRoot: string): Promise<ProjectReport["manifest"]> {
  const manifestName = "l2nr-ui.manifest.json" as const;
  const manifestPath = path.join(projectRoot, manifestName);
  let content: string;

  try {
    content = await readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Cannot read " + manifestPath, { cause: error });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error("Invalid JSON in " + manifestPath, { cause: error });
  }

  assertUiNodeSpec(parsed);

  const componentPath = path.resolve(projectRoot, parsed.component);
  const relativeComponent = path.relative(projectRoot, componentPath);
  if (relativeComponent.startsWith("..") || path.isAbsolute(relativeComponent)) {
    throw new Error("Manifest component must be inside the project");
  }

  try {
    await readFile(componentPath, "utf8");
  } catch (error) {
    throw new Error("Manifest component does not exist: " + parsed.component, { cause: error });
  }

  return {
    path: manifestName,
    name: parsed.name,
    label: parsed.label,
    component: parsed.component,
    mode: parsed.output === null ? "display" : "interactive",
    input: parsed.input.source,
    output: parsed.output?.target ?? null
  };
}

async function loadPackageJson(projectRoot: string): Promise<PackageJson> {
  const packagePath = path.join(projectRoot, "package.json");
  let content: string;

  try {
    content = await readFile(packagePath, "utf8");
  } catch (error) {
    throw new Error("Cannot read " + packagePath, { cause: error });
  }

  try {
    return JSON.parse(content) as PackageJson;
  } catch (error) {
    throw new Error("Invalid JSON in " + packagePath, { cause: error });
  }
}

function detectFrameworks(dependencies: Record<string, unknown>): string[] {
  const frameworks = new Set<string>();
  if ("react" in dependencies) frameworks.add("react");
  if ("@tanstack/react-start" in dependencies) frameworks.add("tanstack-start");
  if ("vite" in dependencies) frameworks.add("vite");
  return [...frameworks].sort();
}

function detectDependencyTransports(
  dependencies: Record<string, unknown>,
  transports: Set<string>
): void {
  if ("mqtt" in dependencies) transports.add("mqtt");
  if ("socket.io-client" in dependencies || "ws" in dependencies) transports.add("websocket");
  if ("@supabase/supabase-js" in dependencies) transports.add("supabase");
}

function detectSourceSignals(
  content: string,
  transports: Set<string>,
  browserApis: Set<string>
): void {
  if (/\bmqtt\.(connect|publish|subscribe)\b/.test(content)) transports.add("mqtt");
  if (/\b(fetch|axios\.(get|post|put|patch|delete))\s*\(/.test(content)) transports.add("http");
  if (/\b(new\s+WebSocket|io\s*\()/.test(content)) transports.add("websocket");

  if (/\bwindow\b/.test(content)) browserApis.add("window");
  if (/\bdocument\b/.test(content)) browserApis.add("document");
  if (/\blocalStorage\b/.test(content)) browserApis.add("localStorage");
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        files.push(...(await collectSourceFiles(entryPath)));
      }
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files.sort();
}
