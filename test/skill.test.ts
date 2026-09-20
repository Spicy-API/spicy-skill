import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { getDefaultAgentSkillPath, installSpicySkill } from "../src/skill/index.js";

void test("Skill installer copies the valid package and refuses implicit replacement", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "spicy-skill-install-"));
  const destination = path.join(temporaryRoot, "skills", "spicyapi");
  try {
    const first = await installSpicySkill({ destination });
    assert.deepEqual(first, { destination, replaced: false });
    assert.match(
      await readFile(path.join(destination, "SKILL.md"), "utf8"),
      /^---\nname: spicyapi\n/,
    );
    assert.match(
      await readFile(path.join(destination, "agents", "openai.yaml"), "utf8"),
      /allow_implicit_invocation: true/,
    );

    await assert.rejects(installSpicySkill({ destination }), /already exists/);
    await writeFile(path.join(destination, "local-marker"), "must be replaced", "utf8");
    const replaced = await installSpicySkill({ destination, force: true });
    assert.deepEqual(replaced, { destination, replaced: true });
    await assert.rejects(access(path.join(destination, "local-marker")), { code: "ENOENT" });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

void test("--force refuses a directory that is not a SpicyAPI Skill, such as the parent skills directory", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "spicy-skill-guard-"));
  const skillsRoot = path.join(temporaryRoot, "skills");
  const otherSkill = path.join(skillsRoot, "someone-else", "SKILL.md");
  try {
    await mkdir(path.dirname(otherSkill), { recursive: true });
    await writeFile(otherSkill, "---\nname: someone-else\n---\n", "utf8");

    // The trailing spicyapi segment is missing, so the target is the whole skills directory.
    await assert.rejects(
      installSpicySkill({ destination: skillsRoot, force: true }),
      /refusing to replace .*not a SpicyAPI Skill directory.*spicyapi/s,
    );
    assert.match(await readFile(otherSkill, "utf8"), /name: someone-else/);

    // Somebody else's Skill directory is not replaced either, even though it has a SKILL.md.
    await assert.rejects(
      installSpicySkill({ destination: path.dirname(otherSkill), force: true }),
      /refusing to replace/,
    );
    assert.match(await readFile(otherSkill, "utf8"), /name: someone-else/);

    // An empty directory - one the user created ahead of time - is safe to overwrite.
    const empty = path.join(skillsRoot, "spicyapi");
    await mkdir(empty);
    assert.deepEqual(await installSpicySkill({ destination: empty, force: true }), {
      destination: empty,
      replaced: true,
    });
    await access(path.join(empty, "SKILL.md"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

void test("default Skill path honors an explicit AGENTS_SKILLS_DIR", () => {
  assert.equal(
    getDefaultAgentSkillPath({ AGENTS_SKILLS_DIR: "/tmp/shared-agent-skills" }),
    "/tmp/shared-agent-skills/spicyapi",
  );
});
