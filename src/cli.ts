#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateDashboard2Package } from "./generator/dashboard2-generator.js";
import { scanProject } from "./scanner/project-scanner.js";

async function main(args: string[]): Promise<void> {
  const [command, projectDirectory = ".", ...rest] = args;
  const outputIndex = rest.indexOf("--output");
  const output = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;

  if (outputIndex >= 0 && !output) {
    throw new Error("--output requires a path");
  }

  if (command === "inspect") {
    const report = await scanProject(projectDirectory);
    const json = JSON.stringify(report, null, 2) + "\n";

    if (output) {
      await mkdir(path.dirname(path.resolve(output)), { recursive: true });
      await writeFile(output, json, "utf8");
    } else {
      process.stdout.write(json);
    }
    return;
  }

  if (command === "build") {
    const result = await generateDashboard2Package(
      projectDirectory,
      output ?? ".l2nr-output"
    );
    process.stdout.write(result.packageDirectory + "\n");
    return;
  }

  printUsage();
  process.exitCode = 1;
}

function printUsage(): void {
  process.stderr.write(
    "Usage:\n" +
    "  l2nr-ui inspect <project-directory> [--output <file>]\n" +
    "  l2nr-ui build <project-directory> [--output <directory>]\n"
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write("l2nr-ui: " + message + "\n");
  process.exitCode = 1;
});
