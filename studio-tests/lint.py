#!/usr/bin/env python3
"""Static checks for Web Studios: agents, skills, rules, templates, cross-references.
Usage: lint.py [agents|skills|skill <name>|rules|templates|all]"""
import glob, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
try:
    import yaml
except ImportError:
    yaml = None

errors, warnings = [], []
def err(m): errors.append(m)
def warn(m): warnings.append(m)

def frontmatter(path):
    s = open(path, encoding="utf-8").read()
    if not s.startswith("---\n"):
        err(f"{path}: missing frontmatter"); return {}, s
    end = s.find("\n---", 4)
    raw = s[4:end]
    if yaml:
        try:
            return (yaml.safe_load(raw) or {}), s[end + 4:]
        except Exception as e:
            err(f"{path}: frontmatter is not valid YAML: {e}"); return {}, s
    fm = {}
    for line in raw.splitlines():
        if ":" in line and not line.startswith(" "):
            k, v = line.split(":", 1); fm[k.strip()] = v.strip().strip('"')
    return fm, s[end + 4:]

AGENTS = {os.path.basename(p)[:-3] for p in glob.glob(".claude/agents/*.md")}
SKILLS = {os.path.basename(os.path.dirname(p)) for p in glob.glob(".claude/skills/*/SKILL.md")}
TEMPLATES = {os.path.basename(p) for p in glob.glob(".claude/docs/templates/*")}
SCRIPTS = {os.path.basename(p) for p in glob.glob(".claude/scripts/*")}
BUILTIN = {"help", "clear", "compact", "config", "init", "plugin", "agents", "hooks", "mcp", "model",
           "permissions", "review", "security-review", "memory", "status", "doctor", "login", "logout", "cost", "resume", "fast", "reload-plugins", "context", "export", "bug", "terminal-setup", "ide", "add-dir", "vim", "upgrade", "web-studios"}
AGENT_SUFFIX = ("-specialist", "-lead", "-director", "-engineer", "-designer", "-researcher")
AGENT_WORDS = {"producer", "copywriter", "prototyper", "product-manager", "release-manager"}
EXAMPLE_OK = {"frontend-guru", "other-skill", "my-skill", "skill-name"}  # deliberately invalid example in skill-test

def check_refs(path, text):
    for ref in set(re.findall(r"`([a-z][a-z0-9-]+)`", text)):
        if (ref.endswith(AGENT_SUFFIX) or ref in AGENT_WORDS) and ref not in AGENTS and ref not in EXAMPLE_OK:
            err(f"{path}: references unknown agent `{ref}`")
    # skill invocations: a backticked span that starts with /name, e.g. `/dev-story S-007`
    for ref in set(re.findall(r"(?:^|[\s(|,>*])`/([a-z][a-z0-9-]+)(?:\s[^`]*)?`", text, re.M)):
        if ref not in SKILLS and ref not in BUILTIN and ref not in EXAMPLE_OK:
            err(f"{path}: references unknown skill `/{ref}`")
    for t in set(re.findall(r"\.claude/docs/templates/([A-Za-z0-9._-]+\.(?:md|json|yaml))", text)):
        if t not in TEMPLATES:
            err(f"{path}: references missing template {t}")
    for sc in set(re.findall(r"\.claude/scripts/([A-Za-z0-9_-]+\.sh)", text)):
        if sc not in SCRIPTS:
            err(f"{path}: references missing script {sc}")
    for d in set(re.findall(r"`(\.claude/(?:docs|rules)/[A-Za-z0-9_./-]+\.md)`", text)):
        if not os.path.exists(d):
            err(f"{path}: references missing doc {d}")

def lint_agents():
    for p in sorted(glob.glob(".claude/agents/*.md")):
        fm, body = frontmatter(p)
        name = os.path.basename(p)[:-3]
        if fm.get("name") != name: err(f"{p}: name '{fm.get('name')}' != filename")
        d = fm.get("description", "")
        if not d or len(d) > 1024: err(f"{p}: description missing or > 1024 chars")
        if fm.get("model") not in ("opus", "sonnet", "haiku", "inherit"): err(f"{p}: bad model {fm.get('model')}")
        for sec in ("### Collaboration Protocol", "### What This Agent Must NOT Do", "### Delegation Map"):
            if sec not in body: err(f"{p}: missing section '{sec}'")
        check_refs(p, body)
    roster = open(".claude/docs/agent-roster.md").read()
    listed = set(re.findall(r"^\| `([a-z0-9-]+)` \|", roster, re.M))
    for a in AGENTS - listed: err(f"agent-roster.md: missing {a}")
    for a in listed - AGENTS: err(f"agent-roster.md: lists {a} but no agent file")

def lint_skill(name):
    p = f".claude/skills/{name}/SKILL.md"
    if not os.path.exists(p): err(f"{p}: not found"); return
    fm, body = frontmatter(p)
    if fm.get("name") != name: err(f"{p}: name '{fm.get('name')}' != folder")
    d = str(fm.get("description", ""))
    if not d: err(f"{p}: missing description")
    elif len(d) > 500: warn(f"{p}: description {len(d)} chars (> 500)")
    if not re.search(r"\b(Use|Run|Invoke)\b", d): warn(f"{p}: description lacks a usage trigger ('Use when/before/after …')")
    if fm.get("user-invocable") is not True and str(fm.get("user-invocable")).lower() != "true": err(f"{p}: user-invocable must be true")
    if fm.get("model") not in ("opus", "sonnet", "haiku", None): err(f"{p}: bad model {fm.get('model')}")
    if not fm.get("allowed-tools"): err(f"{p}: missing allowed-tools")
    n = body.count("\n")
    if n > 220: warn(f"{p}: {n} lines (> 220)")
    check_refs(p, body)

def lint_skills():
    for s in sorted(SKILLS): lint_skill(s)
    bp = open("docs/BLUEPRINT.md").read()
    sec = bp[bp.index("## 4. Skills"):bp.index("## 5. Hooks")]
    planned = set(re.findall(r"`/([a-z0-9-]+)`", sec))
    for s in planned - SKILLS: err(f"BLUEPRINT §4 lists /{s} but no skill exists")
    for s in SKILLS - planned: err(f"skill /{s} is not listed in BLUEPRINT §4")

def lint_rules():
    for p in sorted(glob.glob(".claude/rules/*.md")):
        fm, body = frontmatter(p)
        if not isinstance(fm.get("paths"), list) or not fm["paths"]: err(f"{p}: needs a non-empty paths: list")
        check_refs(p, body)

def lint_templates():
    for p in sorted(glob.glob(".claude/docs/templates/*")):
        if p.endswith(".json"):
            try: json.load(open(p))
            except Exception as e: err(f"{p}: invalid JSON: {e}")
        elif p.endswith(".yaml") and yaml:
            try: yaml.safe_load(open(p))
            except Exception as e: err(f"{p}: invalid YAML: {e}")
        else:
            check_refs(p, open(p).read())
    for doc in glob.glob(".claude/docs/*.md") + glob.glob("docs/*.md") + ["CLAUDE.md", "README.md"]:
        check_refs(doc, open(doc).read())

def lint_config():
    for p in (".claude/settings.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".claude-plugin/hooks.json"):
        try: json.load(open(p))
        except Exception as e: err(f"{p}: invalid JSON: {e}")
    s = json.load(open(".claude/settings.json"))
    for ev, groups in s.get("hooks", {}).items():
        for g in groups:
            for h in g["hooks"]:
                m = re.search(r"\.claude/hooks/([\w-]+\.sh)", h["command"])
                if m and not os.path.exists(f".claude/hooks/{m.group(1)}"): err(f"settings.json {ev}: missing hook {m.group(1)}")
    if yaml:
        try: yaml.safe_load(open("project.yaml"))
        except Exception as e: err(f"project.yaml: invalid YAML: {e}")

args = sys.argv[1:] or ["all"]
if args[0] == "agents": lint_agents()
elif args[0] == "skills": lint_skills()
elif args[0] == "skill": lint_skill(args[1])
elif args[0] == "rules": lint_rules()
elif args[0] == "templates": lint_templates()
else:
    lint_config(); lint_agents(); lint_skills(); lint_rules(); lint_templates()

for w in warnings: print("WARN ", w)
for e in errors: print("ERROR", e)
print(f"lint: {len(AGENTS)} agents, {len(SKILLS)} skills, {len(TEMPLATES)} templates — {len(errors)} errors, {len(warnings)} warnings")
sys.exit(1 if errors else 0)
