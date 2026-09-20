#!/usr/bin/env node

import process from "node:process";

import { getBundledSkillPath, installSpicySkill } from "./skill/index.js";

function usage(): string {
  return [
    "Usage: spicyapi-skill [path | install] [--target <directory>] [--force] [--json]",
    "",
    "Commands:",
    "  path       Show the packaged Skill directory",
    "  install    Install the Skill into the shared Agent Skills directory (default)",
  ].join("\n");
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const command = args[0]?.startsWith("--") ? "install" : (args[0] ?? "install");
  const json = args.includes("--json");
  let result: unknown;
  if (command === "path") {
    result = { path: await getBundledSkillPath() };
  } else if (command === "install") {
    const target = optionValue(args, "--target");
    result = await installSpicySkill({
      ...(target === undefined ? {} : { destination: target }),
      force: args.includes("--force"),
    });
  } else {
    throw new Error(`unknown command: ${command}`);
  }
  process.stdout.write(
    json ? `${JSON.stringify(result)}\n` : `${JSON.stringify(result, null, 2)}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
