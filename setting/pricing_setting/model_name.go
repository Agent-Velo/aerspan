package pricing_setting

import "strings"

// handleThinkingBudgetModel normalizes thinking-budget model names to a wildcard form.
// This mirrors the legacy matching behavior to reduce the need for per-variant pricing.
func handleThinkingBudgetModel(name, prefix, wildcard string) string {
	if strings.HasPrefix(name, prefix) && strings.Contains(name, "-thinking-") {
		return wildcard
	}
	return name
}

// FormatMatchingModelName normalizes certain model name variants (gizmo, thinking budget, ...)
// so they can share pricing settings.
//
// NOTE: Keep this behavior consistent with the legacy ratio_setting.FormatMatchingModelName.
func FormatMatchingModelName(name string) string {
	if strings.HasPrefix(name, "gemini-2.5-flash-lite") {
		name = handleThinkingBudgetModel(name, "gemini-2.5-flash-lite", "gemini-2.5-flash-lite-thinking-*")
	} else if strings.HasPrefix(name, "gemini-2.5-flash") {
		name = handleThinkingBudgetModel(name, "gemini-2.5-flash", "gemini-2.5-flash-thinking-*")
	} else if strings.HasPrefix(name, "gemini-2.5-pro") {
		name = handleThinkingBudgetModel(name, "gemini-2.5-pro", "gemini-2.5-pro-thinking-*")
	}

	if strings.HasPrefix(name, "gpt-4-gizmo") {
		name = "gpt-4-gizmo-*"
	}
	if strings.HasPrefix(name, "gpt-4o-gizmo") {
		name = "gpt-4o-gizmo-*"
	}
	return name
}
