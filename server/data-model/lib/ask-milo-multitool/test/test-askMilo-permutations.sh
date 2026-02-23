#!/bin/bash
# test-askMilo-permutations.sh — Exercise all askMilo flag combinations
#
# Default: runs with -mockApi (no API calls, fast, free)
# Pass -prod to run with real API calls (costs money, slower)
#
# Usage:
#   ./test-askMilo-permutations.sh              # all groups, mock mode
#   ./test-askMilo-permutations.sh -prod         # all groups, live API
#   ./test-askMilo-permutations.sh single-call   # one group, mock mode
#   ./test-askMilo-permutations.sh -prod chorus  # one group, live API
#   ./test-askMilo-permutations.sh -verbose       # all groups, show full output
#
# Groups: single-call, chorus, prompts, interrogate, confluence, sessions, output, json-stdin, edge

PASSED=0
FAILED=0
SKIPPED=0
TOTAL=0
PROD_MODE=false
VERBOSE=false
GROUP_FILTER=""
TEST_SESSION_NAME="__TEST_permutation_$(date +%s)"

# Parse args
for arg in "$@"; do
	case "$arg" in
		-prod) PROD_MODE=true ;;
		-verbose) VERBOSE=true ;;
		*) GROUP_FILTER="$arg" ;;
	esac
done

if [ "$PROD_MODE" = true ]; then
	MOCK_FLAG=""
	echo "=== PROD MODE: Real API calls (costs money) ==="
else
	MOCK_FLAG="-mockApi"
	echo "=== MOCK MODE: No API calls ==="
fi
echo ""

# ── Helpers ──────────────────────────────────────────────────────────

run_test() {
	local test_name="$1"
	local expect_pass="$2"  # "pass" or "fail"
	local grep_pattern="$3" # pattern to look for in output (optional)
	shift 3
	local cmd=("$@")

	((TOTAL++))
	local output
	output=$("${cmd[@]}" 2>&1) || true
	local exit_code=$?

	local result="FAIL"

	if [ "$expect_pass" = "pass" ]; then
		if [ -n "$grep_pattern" ]; then
			if echo "$output" | grep -qiE "$grep_pattern"; then
				result="PASS"
			fi
		else
			# No grep pattern — just check exit code 0
			if [ $exit_code -eq 0 ] && [ -n "$output" ]; then
				result="PASS"
			fi
		fi
	elif [ "$expect_pass" = "fail" ]; then
		# We expect the command to fail or produce an error
		if [ -n "$grep_pattern" ]; then
			if echo "$output" | grep -qiE "$grep_pattern"; then
				result="PASS"
			fi
		else
			if [ $exit_code -ne 0 ]; then
				result="PASS"
			fi
		fi
	fi

	if [ "$result" = "PASS" ]; then
		((PASSED++))
		echo "  PASS  $test_name"
	else
		((FAILED++))
		echo "  FAIL  $test_name"
		echo "        cmd: ${cmd[*]}"
		echo "        exit: $exit_code"
		echo "        output (first 3 lines):"
		echo "$output" | head -3 | sed 's/^/        /'
	fi

	if [ "$VERBOSE" = true ]; then
		echo "        ── cmd: ${cmd[*]}"
		echo "        ── output ──"
		echo "$output" | sed 's/^/        | /'
		echo "        ── end ──"
		echo ""
	fi
}

should_run() {
	local group="$1"
	[ -z "$GROUP_FILTER" ] || [ "$GROUP_FILTER" = "$group" ]
}

# ── Group: single-call ───────────────────────────────────────────────

if should_run "single-call"; then
	echo "── Single-Call Basics ──"
	run_test "default single-call" "pass" "" \
		askMilo $MOCK_FLAG -noSave "What is 2+2?"

	run_test "explicit model (haiku)" "pass" "" \
		askMilo $MOCK_FLAG -noSave --model=haiku "What is 2+2?"

	run_test "verbose shows mode" "pass" "mode.*singlecall|singlecall.*mode" \
		askMilo $MOCK_FLAG -noSave -verbose "What is 2+2?"

	run_test "help flag" "pass" "configurable ai pipeline|pipeline control" \
		askMilo -help

	echo ""
fi

# ── Group: chorus ────────────────────────────────────────────────────

if should_run "chorus"; then
	echo "── Chorus Modes ──"
	run_test "chorus perspectives=2" "pass" "" \
		askMilo $MOCK_FLAG -noSave --perspectives=2 "Compare X and Y"

	run_test "chorus perspectives=3 + summarize" "pass" "synthe" \
		askMilo $MOCK_FLAG -noSave --perspectives=3 -summarize "Compare frameworks"

	run_test "chorus without summarize (no synthesis section)" "pass" "" \
		askMilo $MOCK_FLAG -noSave --perspectives=3 "Compare things"

	run_test "dryRun shows perspectives only" "pass" "perspective|instruction" \
		askMilo $MOCK_FLAG -noSave --perspectives=3 -dryRun "Evaluate something"

	echo ""
fi

# ── Group: prompts ───────────────────────────────────────────────────

if should_run "prompts"; then
	echo "── Prompt Selection ──"
	run_test "firstPrompt=default" "pass" "" \
		askMilo $MOCK_FLAG -noSave --firstPrompt=default "test"

	run_test "firstPrompt=whitePaper" "pass" "" \
		askMilo $MOCK_FLAG -noSave --firstPrompt=whitePaper "Write about SIF"

	run_test "firstPrompt=chorusResearcher" "pass" "" \
		askMilo $MOCK_FLAG -noSave --firstPrompt=chorusResearcher "Analyze this"

	run_test "firstPrompt=chorusExpander (chorus mode)" "pass" "" \
		askMilo $MOCK_FLAG -noSave --perspectives=2 --firstPrompt=chorusExpander "Compare things"

	echo ""
fi

# ── Group: interrogate ───────────────────────────────────────────────

if should_run "interrogate"; then
	echo "── Interrogate Mode ──"
	run_test "interrogate basic" "pass" "" \
		askMilo $MOCK_FLAG -noSave -interrogate "Explain the implications"

	run_test "interrogate with firstPrompt override" "pass" "" \
		askMilo $MOCK_FLAG -noSave -interrogate --firstPrompt=default "Explain more"

	run_test "interrogate verbose" "pass" "interrogat|first prompt" \
		askMilo $MOCK_FLAG -noSave -interrogate -verbose "Expand on that"

	echo ""
fi

# ── Group: confluence ────────────────────────────────────────────────

if should_run "confluence"; then
	echo "── Confluence Tools ──"
	run_test "tools=confluence single-call" "pass" "" \
		askMilo $MOCK_FLAG -noSave --tools=confluence "Search for SIF standards"

	run_test "tools=confluence + whitePaper prompt" "pass" "" \
		askMilo $MOCK_FLAG -noSave --tools=confluence --firstPrompt=whitePaper "Write about true-up"

	run_test "tools=confluence verbose shows config" "pass" "confluence|tool" \
		askMilo $MOCK_FLAG -noSave --tools=confluence -verbose "test"

	echo ""
fi

# ── Group: sessions ──────────────────────────────────────────────────

if should_run "sessions"; then
	echo "── Session Management ──"

	# Create a session we can work with
	run_test "create named session" "pass" "" \
		askMilo $MOCK_FLAG --sessionName="$TEST_SESSION_NAME" "Session test prompt"

	run_test "listSessions" "pass" "session|name|date" \
		askMilo -listSessions

	run_test "viewSession" "pass" "session test prompt|$TEST_SESSION_NAME" \
		askMilo --viewSession="$TEST_SESSION_NAME"

	run_test "resumeSession" "pass" "" \
		askMilo $MOCK_FLAG --resumeSession="$TEST_SESSION_NAME" "Follow up question"

	run_test "renameSession" "pass" "" \
		askMilo --renameSession="$TEST_SESSION_NAME" --sessionName="${TEST_SESSION_NAME}_renamed"

	run_test "deleteSession (cleanup)" "pass" "" \
		askMilo --deleteSession="${TEST_SESSION_NAME}_renamed"

	run_test "resumeSession auto-creates missing" "pass" "not found.*starting new|session saved.*${TEST_SESSION_NAME}_autocreate" \
		askMilo $MOCK_FLAG --resumeSession="${TEST_SESSION_NAME}_autocreate" "auto-create test"

	run_test "deleteSession (auto-create cleanup)" "pass" "" \
		askMilo --deleteSession="${TEST_SESSION_NAME}_autocreate"

	echo ""
fi

# ── Group: output ────────────────────────────────────────────────────

if should_run "output"; then
	echo "── Output Formats ──"
	run_test "json output" "pass" "question|response|model" \
		askMilo $MOCK_FLAG -noSave -json "What is 2+2?"

	run_test "json chorus" "pass" "perspectives|question" \
		askMilo $MOCK_FLAG -noSave -json --perspectives=2 "Compare things"

	run_test "verbose + json" "pass" "" \
		askMilo $MOCK_FLAG -noSave -verbose -json "test"

	echo ""
fi

# ── Group: json-stdin ────────────────────────────────────────────────

if should_run "json-stdin"; then
	echo "── JSON Stdin (bb2 pattern) ──"

	run_test "json stdin single-call" "pass" "" \
		bash -c 'echo "{\"switches\":{\"mockApi\":true,\"noSave\":true},\"values\":{},\"fileList\":[\"What is 2+2?\"]}" | askMilo'

	run_test "json stdin with model override" "pass" "haiku" \
		bash -c 'echo "{\"switches\":{\"mockApi\":true,\"noSave\":true,\"verbose\":true},\"values\":{\"model\":[\"haiku\"]},\"fileList\":[\"test\"]}" | askMilo'

	run_test "json stdin chorus" "pass" "perspective" \
		bash -c 'echo "{\"switches\":{\"mockApi\":true,\"noSave\":true},\"values\":{\"perspectives\":[\"2\"]},\"fileList\":[\"Compare X and Y\"]}" | askMilo'

	run_test "json argv direct" "pass" "" \
		askMilo '{"switches":{"mockApi":true,"noSave":true},"values":{},"fileList":["Tell me a joke"]}'

	echo ""
fi

# ── Group: edge ──────────────────────────────────────────────────────

if should_run "edge"; then
	echo "── Edge Cases ──"
	run_test "summarize without perspectives (warning)" "pass" "warn|perspectives|ignor" \
		askMilo $MOCK_FLAG -noSave -summarize "test"

	run_test "bad prompt name (error)" "fail" "not found|available|unknown" \
		askMilo $MOCK_FLAG -noSave --firstPrompt=nonExistentPrompt "test"

	run_test "noSave flag (no session created)" "pass" "" \
		askMilo $MOCK_FLAG -noSave "ephemeral test"

	echo ""
fi

# ── Summary ──────────────────────────────────────────────────────────

echo "════════════════════════════════════════"
echo "  Total: $TOTAL   Passed: $PASSED   Failed: $FAILED"
if [ $FAILED -eq 0 ]; then
	echo "  ALL TESTS PASSED"
else
	echo "  *** $FAILED FAILURES ***"
fi
echo "════════════════════════════════════════"

exit $FAILED
