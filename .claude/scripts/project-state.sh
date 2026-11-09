#!/usr/bin/env bash
# project-state.sh — prints `key: value` rows describing what exists on disk.
# Observations only; the calling skill decides what they mean.
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}" 2>/dev/null || true
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
g() { bash "$HERE/yaml-get.sh" "$1"; }
count() { find "$@" -type f 2>/dev/null | grep -v '/\.gitkeep$' | wc -l | tr -d ' '; }
exists() { [ -e "$1" ] && echo yes || echo no; }

echo "project_name: $(g project.name)"
echo "project_type: $(g project.type)"
echo "stage: $(g project.stage)"
echo "rigor: $(g modes.rigor)"
echo "automation: $(g modes.automation)"
for k in frontend backend database orm hosting auth payments cms; do
  echo "stack_$k: $(g stack.$k)"
done
root="$(g paths.code_root)"; root="${root:-src}"
echo "code_root: $root"
if [ -d "$root" ]; then
  echo "source_files: $(find "$root" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.vue' -o -name '*.svelte' -o -name '*.astro' -o -name '*.py' -o -name '*.go' -o -name '*.php' -o -name '*.rb' \) -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')"
else
  echo "source_files: unknown"
fi
# Brownfield signals at repo root (an existing app not yet adopted)
for f in package.json pyproject.toml requirements.txt go.mod composer.json Gemfile next.config.js next.config.mjs next.config.ts nuxt.config.ts svelte.config.js astro.config.mjs angular.json; do
  [ -f "$f" ] && echo "manifest: $f"
done
echo "brief: $(exists docs/product/brief.md)"
echo "prd: $(exists docs/product/prd.md)"
echo "personas: $(count docs/product/personas)"
echo "brand_guide: $(exists docs/design/brand-guide.md)"
echo "design_system: $(exists docs/design/design-system.md)"
echo "ux_docs: $(count docs/design/ux)"
echo "feature_specs: $(count docs/specs/features)"
echo "working_prototypes: $(grep -lsE '^Type:[[:space:]]*working-prototype' prototypes/*/README.md 2>/dev/null | wc -l | tr -d ' ')"
echo "test_sessions: $(count production/test-sessions)"
echo "architecture: $(exists docs/architecture/architecture.md)"
echo "adrs: $(count docs/architecture/adr)"
echo "epics: $(count production/epics)"
echo "stories: $(count production/stories)"
echo "sprints: $(count production/sprints)"
echo "tests: $(find tests "$root" -type f \( -name '*.test.*' -o -name '*.spec.*' -o -name 'test_*.py' -o -name '*_test.go' -o -name '*_spec.rb' -o -name '*Test.php' \) -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')"
echo "releases: $(count production/releases)"
echo "active_session: $(exists production/session-state/active.md)"
echo "origin_url: $(git remote get-url origin 2>/dev/null)"
