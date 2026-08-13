package pullrequests

import "fmt"

// validMergeStrategies mirrors the fixed vocabulary every other bounded-
// choice field in this build uses (codeowners has no such vocabulary to
// mirror since owners are opaque strings, but see e.g. automations.
// service.ts's TRIGGER_TYPES on the Node side for the same discipline).
var validMergeStrategies = map[string]bool{"merge": true, "squash": true, "rebase": true}

// normalizeMergeStrategy pulls Merge()'s inline validation out into a
// pure, independently-testable function (docs/FEATURES.md test-coverage
// fast-follow) — an empty strategy defaults to "merge" (a plain,
// unqualified merge commit, the least surprising default), anything
// else must be one of the three real strategies performMerge below
// actually implements.
func normalizeMergeStrategy(strategy string) (string, error) {
	if strategy == "" {
		strategy = "merge"
	}
	if !validMergeStrategies[strategy] {
		return "", fmt.Errorf("strategy must be one of: merge, squash, rebase")
	}
	return strategy, nil
}
