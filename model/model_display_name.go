package model

import (
	"sort"
	"strings"
)

type displayNameRule struct {
	Id          int
	ModelName   string
	DisplayName string
	NameRule    int
}

// GetModelDisplayNameMap returns model_id -> display_name mapping.
//
// The display name follows the same matching priority as model meta:
// exact > prefix > suffix > contains.
//
// Notes:
// - Only meta rows with non-empty display_name participate.
// - When multiple rules of the same type match, the most specific (longest pattern) wins.
func GetModelDisplayNameMap(modelNames []string) (map[string]string, error) {
	result := make(map[string]string, len(modelNames))
	if len(modelNames) == 0 {
		return result, nil
	}

	var metas []displayNameRule
	// Query only the columns we need.
	err := DB.Model(&Model{}).
		Select("id", "model_name", "display_name", "name_rule").
		Where("display_name <> ''").
		Find(&metas).Error
	if err != nil {
		return nil, err
	}

	exact := make(map[string]string)
	prefix := make([]displayNameRule, 0)
	suffix := make([]displayNameRule, 0)
	contains := make([]displayNameRule, 0)

	for _, m := range metas {
		m.DisplayName = strings.TrimSpace(m.DisplayName)
		m.ModelName = strings.TrimSpace(m.ModelName)
		if m.DisplayName == "" || m.ModelName == "" {
			continue
		}

		switch m.NameRule {
		case NameRuleExact:
			exact[m.ModelName] = m.DisplayName
		case NameRulePrefix:
			prefix = append(prefix, m)
		case NameRuleSuffix:
			suffix = append(suffix, m)
		case NameRuleContains:
			contains = append(contains, m)
		}
	}

	// Make matching deterministic and prefer the most specific rule.
	sort.Slice(prefix, func(i, j int) bool {
		li, lj := len(prefix[i].ModelName), len(prefix[j].ModelName)
		if li != lj {
			return li > lj
		}
		return prefix[i].Id > prefix[j].Id
	})
	sort.Slice(suffix, func(i, j int) bool {
		li, lj := len(suffix[i].ModelName), len(suffix[j].ModelName)
		if li != lj {
			return li > lj
		}
		return suffix[i].Id > suffix[j].Id
	})
	sort.Slice(contains, func(i, j int) bool {
		li, lj := len(contains[i].ModelName), len(contains[j].ModelName)
		if li != lj {
			return li > lj
		}
		return contains[i].Id > contains[j].Id
	})

	for _, modelName := range modelNames {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" {
			continue
		}

		if dn, ok := exact[modelName]; ok {
			result[modelName] = dn
			continue
		}

		var matched string
		for _, r := range prefix {
			if strings.HasPrefix(modelName, r.ModelName) {
				matched = r.DisplayName
				break
			}
		}
		if matched == "" {
			for _, r := range suffix {
				if strings.HasSuffix(modelName, r.ModelName) {
					matched = r.DisplayName
					break
				}
			}
		}
		if matched == "" {
			for _, r := range contains {
				if strings.Contains(modelName, r.ModelName) {
					matched = r.DisplayName
					break
				}
			}
		}
		if matched != "" {
			result[modelName] = matched
		}
	}

	return result, nil
}
