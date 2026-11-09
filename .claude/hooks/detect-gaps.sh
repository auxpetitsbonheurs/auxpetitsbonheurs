#!/usr/bin/env bash
# SessionStart: list artifacts the current stage expects but that are missing.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
stage="$(cfg project.stage)"; [ -z "$stage" ] && exit 0
type="$(cfg project.type)"
gaps=""; gap() { gaps="${gaps}
  - $1"; }
need() { [ -e "$1" ] || gap "$2"; }
nonempty() { [ -n "$(find "$1" -type f ! -name .gitkeep 2>/dev/null | head -1)" ] || gap "$2"; }
case "$stage" in
  design|build|launch|grow)
    need docs/product/prd.md "PRD (docs/product/prd.md): /write-prd" ;;
esac
case "$stage" in
  build|launch|grow)
    [ -z "$(cfg stack.frontend)$(cfg stack.backend)" ] && gap "stack not configured: /setup-stack"
    nonempty docs/specs/features "feature specs: /feature-spec"
    need docs/architecture/architecture.md "architecture: /create-architecture"
    if [ "$type" != api ]; then need docs/design/design-system.md "design system: /design-system"; fi
    if [ "$RIGOR" != minimal ]; then
      grep -qsE '^Type:[[:space:]]*working-prototype' prototypes/*/README.md || gap "no working prototype tested by hand: /working-prototype"
      nonempty production/test-sessions "no manual test session yet: /test-session"
    fi ;;
esac
case "$stage" in
  build|launch|grow)
    root="$(code_root)"
    src=$(find "$root" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.py' -o -name '*.go' -o -name '*.php' -o -name '*.rb' -o -name '*.vue' -o -name '*.svelte' \) -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')
    tests=$(find . -type f \( -name '*.test.*' -o -name '*.spec.*' -o -name 'test_*.py' -o -name '*_test.go' -o -name '*Test.php' -o -name '*_spec.rb' \) -not -path '*/node_modules/*' 2>/dev/null | wc -l | tr -d ' ')
    [ "$src" -gt 5 ] && [ "$tests" -eq 0 ] && gap "$src source files but no tests: /test-setup"
    [ -f .env.example ] || { [ "$src" -gt 0 ] && gap ".env.example missing (document every env var)"; } ;;
esac
case "$stage" in
  launch|grow)
    [ -d .github/workflows ] || gap "no CI workflow: /ci-setup"
    nonempty production/audits "no launch audits yet: /team-launch" ;;
esac
[ "$stage" = grow ] && { need production/analytics/tracking-plan.md "analytics tracking plan: /analytics-plan"; }
[ -z "$gaps" ] && exit 0
echo "Gaps for stage '$stage':$gaps"
exit 0
