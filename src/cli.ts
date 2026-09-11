#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { scanProject } from "./scanner/project-scanner.js";

async function main(args: string[]): Promise<void> {
  const [command, projectDirectory = ".", ...rest] = args;

  if (command !== "inspect") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const outputIndex = rest.indexOf("--output");
  const output = outputIndex >= 0 ? rest[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !output) {
    throw new Error("--output requires a file path");
  }

  const report = await scanProject(projectDirectory);
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (output) {
    await writeFile(output, json, "utf8");
  } else {
    process.stdout.write(json);
  }
}

function printUsage(): void {
  process.stderr.write("Usage: l2nr-ui inspect <project-directory> [--output <file>]\n");
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`l2nr-ui: ${message}\n`);
  process.exitCode = 1;
});
