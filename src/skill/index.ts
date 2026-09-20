import { randomUUID } from "node:crypto";
import { access, cp, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface InstallSpicySkillOptions {
  destination?: string;
  force?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface InstalledSpicySkill {
  destination: string;
  replaced: boolean;
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function getBundledSkillPath(): Promise<string> {
  const candidates = [
    new URL("../../../skills/spicyapi/", import.meta.url),
    new URL("../../skills/spicyapi/", import.meta.url),
  ];
  for (const candidate of candidates) {
    const directory = fileURLToPath(candidate);
    if (await exists(path.join(directory, "SKILL.md"))) return directory;
  }
  throw new Error("the packaged SpicyAPI Skill could not be found");
}

/**
 * Whether the target looks like a SpicyAPI Skill this package installed, or is an empty directory
 * that is safe to overwrite.
 *
 * `--force` means "replace that exact directory". It used not to look at what the directory was:
 * `--target ~/.agents/skills --force`, with the trailing `spicyapi` segment forgotten, would
 * replace the entire skills directory - along with every other Skill the user had installed - with
 * this one. The test recognises only this package's own marker: `name: spicyapi` in the SKILL.md
 * frontmatter.
 */
async function isReplaceableSkillDirectory(target: string): Promise<boolean> {
  const info = await stat(target);
  if (!info.isDirectory()) return false;
  if ((await readdir(target)).length === 0) return true;
  let skill: string;
  try {
    skill = await readFile(path.join(target, "SKILL.md"), "utf8");
  } catch {
    return false;
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(skill)?.[1];
  return frontmatter !== undefined && /^name:\s*["']?spicyapi["']?\s*$/m.test(frontmatter);
}

export function getDefaultAgentSkillPath(env: NodeJS.ProcessEnv = process.env): string {
  const skillsRoot = env.AGENTS_SKILLS_DIR?.trim() || path.join(homedir(), ".agents", "skills");
  return path.resolve(skillsRoot, "spicyapi");
}

export async function installSpicySkill(
  options: InstallSpicySkillOptions = {},
): Promise<InstalledSpicySkill> {
  const source = await getBundledSkillPath();
  const destination = path.resolve(options.destination ?? getDefaultAgentSkillPath(options.env));
  const destinationExists = await exists(destination);
  if (destinationExists && !options.force) {
    throw new Error(
      `skill already exists at ${destination}; pass --force to replace that exact directory`,
    );
  }
  if (destinationExists && !(await isReplaceableSkillDirectory(destination))) {
    throw new Error(
      `refusing to replace ${destination}: it is not a SpicyAPI Skill directory (no SKILL.md with name: spicyapi), even with --force. ` +
        `--target must be the Skill's own directory, for example ${path.join(destination, "spicyapi")}`,
    );
  }

  const parent = path.dirname(destination);
  const nonce = randomUUID();
  const staging = path.join(parent, `.spicyapi-install-${nonce}`);
  const backup = path.join(parent, `.spicyapi-backup-${nonce}`);
  await mkdir(parent, { recursive: true });
  try {
    await cp(source, staging, { recursive: true, errorOnExist: true, force: false });
    if (destinationExists) await rename(destination, backup);
    try {
      await rename(staging, destination);
    } catch (error) {
      if (destinationExists && (await exists(backup))) await rename(backup, destination);
      throw error;
    }
    if (destinationExists) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  return { destination, replaced: destinationExists };
}
