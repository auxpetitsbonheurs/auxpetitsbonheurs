#!/usr/bin/env bash
# Behavioural tests for .claude/scripts/*.
set -u
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
cp -R "$REPO/.claude" "$T/.claude"; cp "$REPO/studio-tests/fixtures/project.yaml" "$T/"; cd "$T"  # pristine template, not this project's live config
export CLAUDE_PROJECT_DIR="$T"
S=.claude/scripts; pass=0; fail=0
eq() { if [ "$1" = "$2" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL $3: got '$1', want '$2'"; fi; }

# yaml-get
eq "$(bash $S/yaml-get.sh budgets.lighthouse.performance)" "90" "yaml-get nested"
eq "$(bash $S/yaml-get.sh stack.frontend)" "" "yaml-get null → empty"
eq "$(bash $S/yaml-get.sh stack.styling)" "tailwind-shadcn" "yaml-get strips comment"
# config-set
bash $S/config-set.sh stack.frontend=nextjs >/dev/null
eq "$(bash $S/yaml-get.sh stack.frontend)" "nextjs" "config-set existing key"
eq "$(grep -c 'frontend:' project.yaml)" "1" "config-set no duplicate key"
bash $S/config-set.sh paths.code_root=apps/web >/dev/null
eq "$(bash $S/yaml-get.sh paths.code_root)" "apps/web" "config-set new section"
bash $S/config-set.sh "specialists=[nextjs-specialist, postgres-specialist]" >/dev/null
eq "$(grep -E '^specialists:' project.yaml)" "specialists: [nextjs-specialist, postgres-specialist]" "config-set top-level inline list"
bash $S/config-set.sh --local modes.rigor=full >/dev/null
eq "$(bash $S/yaml-get.sh modes.rigor project.local.yaml)" "full" "config-set --local"
python3 -c "import yaml;yaml.safe_load(open('project.yaml'))" 2>/dev/null && pass=$((pass+1)) || { python3 -c "import yaml" 2>/dev/null && { fail=$((fail+1)); echo "FAIL project.yaml invalid after edits"; } || pass=$((pass+1)); }
# set-stage
bash $S/set-stage.sh build >/dev/null
eq "$(bash $S/yaml-get.sh project.stage)" "build" "set-stage yaml"
eq "$(cat production/stage.txt)" "build" "set-stage mirror"
bash $S/set-stage.sh bogus >/dev/null 2>&1; eq "$?" "1" "set-stage rejects bad stage"
# next-number
mkdir -p docs/architecture/adr production/stories/E-01 production/bugs
eq "$(bash $S/next-number.sh docs/architecture/adr)" "0001" "next ADR empty"
touch docs/architecture/adr/0001-stack.md docs/architecture/adr/0002-auth.md
eq "$(bash $S/next-number.sh docs/architecture/adr ADR)" "0003" "next ADR (ADR prefix alias)"
touch production/stories/E-01/S-009-login.md
eq "$(bash $S/next-number.sh production/stories S-)" "S-010" "next story"
eq "$(bash $S/next-number.sh production/bugs BUG)" "BUG-001" "next bug, prefix without dash"
printf -- '- TD-03 x\n- TD-11 y\n' > production/tech-debt.md
eq "$(bash $S/next-number.sh production/tech-debt.md TD)" "TD-12" "next ID inside a file"
# story-list
printf '# S-009: Login\nStatus: ready\nEstimate: 3 pts\n' > production/stories/E-01/S-009-login.md
eq "$(bash $S/story-list.sh ready)" "S-009|ready|3 pts|production/stories/E-01/S-009-login.md" "story-list filter"
eq "$(bash $S/story-list.sh done)" "" "story-list empty filter"
# project-state: working prototype + test sessions
mkdir -p prototypes/booking production/test-sessions
printf '# Booking prototype\nType: working-prototype\n' > prototypes/booking/README.md
printf '# spike\n' > prototypes/README.md
touch production/test-sessions/2026-11-09-booking.md
st="$(bash $S/project-state.sh)"
eq "$(printf '%s\n' "$st" | sed -n 's/^working_prototypes: //p')" "1" "project-state counts working prototypes"
eq "$(printf '%s\n' "$st" | sed -n 's/^test_sessions: //p')" "1" "project-state counts test sessions"
# project-state + detect-stack
ps_out="$(bash $S/project-state.sh)"; printf '%s\n' "$ps_out" | grep -q '^stage: build' && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL project-state stage"; }
echo '{"dependencies":{"nuxt":"3","drizzle-orm":"1","postgres":"3"},"devDependencies":{"vitest":"1"}}' > package.json; touch pnpm-lock.yaml
out="$(bash $S/detect-stack.sh)"
for k in "frontend: nuxt" "orm: drizzle" "database: postgres" "package_manager: pnpm" "test_unit: vitest"; do
  printf '%s\n' "$out" | grep -qx "$k" && pass=$((pass+1)) || { fail=$((fail+1)); echo "FAIL detect-stack '$k'"; }
done
# test-run with no runner
eq "$(bash $S/test-run.sh | sed -n 's/^result: //p')" "no-runner" "test-run without tests"
# test-run: missing runner is not a test failure
# (pin npm: an earlier step left a pnpm lockfile, and CI runners have no pnpm)
rm -f pnpm-lock.yaml; bash $S/config-set.sh stack.package_manager=npm >/dev/null
echo '{"scripts":{"test":"definitely-not-installed-runner run"}}' > package.json
eq "$(bash $S/test-run.sh | sed -n 's/^result: //p')" "runner-missing" "test-run missing runner"
echo '{"scripts":{"test":"node -e \"process.exit(1)\""}}' > package.json
eq "$(bash $S/test-run.sh | sed -n 's/^result: //p')" "fail" "test-run failing tests"
echo '{"scripts":{"test":"node -e \"process.exit(0)\""}}' > package.json
eq "$(bash $S/test-run.sh | sed -n 's/^result: //p')" "pass" "test-run passing tests"
rm package.json
# statusline
out="$(printf '{"model":{"display_name":"M"},"workspace":{"project_dir":"%s"}}' "$T" | bash .claude/statusline.sh)"
eq "$out" "M | build | nextjs" "statusline"
echo "scripts: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
