#!/usr/bin/env bash
# test-run.sh [unit|e2e|all] — runs the project's tests and prints a summary:
#   command: <what ran>
#   result: pass|fail|no-tests|no-runner|runner-missing|runner-error
#   (runner-missing/-error: the test setup is broken, not the tests; see /test-setup)
# followed by the last 40 lines of output. Never edits files.
kind="${1:-unit}"
cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}" 2>/dev/null || true
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJ_YAML="$(pwd)/project.yaml"
get() { bash "$HERE/yaml-get.sh" "$1" "$PROJ_YAML"; }
# Run from paths.code_root when it holds the package manifest (e.g. src/).
root=$(get paths.code_root); [ -n "$root" ] && [ "$root" != "." ] && [ -d "$root" ] && { [ -f "$root/package.json" ] || [ -f "$root/pyproject.toml" ] || [ -f "$root/go.mod" ]; } && cd "$root"
pm=$(get stack.package_manager)
[ -z "$pm" ] && { [ -f pnpm-lock.yaml ] && pm=pnpm || { [ -f yarn.lock ] && pm=yarn || pm=npm; }; }
run_script() { # $1 = package.json script name
  [ -f package.json ] && grep -q "\"$1\"[[:space:]]*:" package.json && echo "$pm run $1"
}
cmd=""
case "$kind" in
  e2e) cmd=$(run_script test:e2e); [ -z "$cmd" ] && [ -f playwright.config.ts -o -f playwright.config.js ] && cmd="npx playwright test --reporter=line" ;;
  unit|all)
    cmd=$(run_script test)
    if [ -z "$cmd" ]; then
      case "$(get stack.test_unit)" in
        vitest) cmd="npx vitest run" ;; jest) cmd="npx jest" ;;
        pytest) cmd="pytest -q" ;; go-test) cmd="go test ./..." ;;
        phpunit) cmd="php artisan test" ;; rspec) cmd="bundle exec rspec" ;;
      esac
    fi
    [ -z "$cmd" ] && [ -f pyproject.toml ] && cmd="pytest -q"
    [ -z "$cmd" ] && [ -f go.mod ] && cmd="go test ./..."
    if [ "$kind" = all ]; then e=$(run_script test:e2e); [ -n "$e" ] && cmd="$cmd && $e"; fi ;;
  *) echo "usage: test-run.sh [unit|e2e|all]" >&2; exit 2 ;;
esac
if [ -z "$cmd" ]; then echo "command: none"; echo "result: no-runner"; exit 0; fi
echo "command: $cmd"
out=$(CI=1 bash -c "$cmd" 2>&1); code=$?
if [ $code -eq 0 ]; then echo "result: pass"
elif [ $code -eq 127 ] || printf '%s' "$out" | grep -qE '((^|[[:space:]])(sh|bash|zsh|/bin/sh)(: line [0-9]+|: [0-9]+)?: [^[:space:]]+: (command )?not found|not recognized as an internal|Cannot find module .*(vitest|jest|playwright)|No module named pytest)'; then echo "result: runner-missing"
elif printf '%s' "$out" | grep -qE 'Startup Error|ERR_MODULE_NOT_FOUND.*node_modules|Cannot find package .* imported from .*node_modules'; then echo "result: runner-error"
elif printf '%s' "$out" | grep -qiE 'no test files found|no tests found|collected 0 items|no test suite found'; then echo "result: no-tests"
else echo "result: fail"; fi
echo "exit_code: $code"
echo "--- output (tail) ---"
printf '%s\n' "$out" | tail -40
exit 0
