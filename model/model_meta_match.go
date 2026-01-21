package model

import (
	"sort"
	"strings"
)

// GetMatchedModelsMetaMap returns model_name -> matched meta mapping.
//
// Matching priority follows the same rules as model meta usage:
// exact > prefix > suffix > contains.
//
// When multiple rules of the same type match, the most specific (longest pattern) wins.
func GetMatchedModelsMetaMap(modelNames []string) (map[string]*Model, error) {
	result := make(map[string]*Model, len(modelNames))
	if len(modelNames) == 0 {
		return result, nil
	}

	var metas []Model
	if err := DB.Find(&metas).Error; err != nil {
		return nil, err
	}

	exact := make(map[string]*Model)
	prefix := make([]*Model, 0)
	suffix := make([]*Model, 0)
	contains := make([]*Model, 0)

	for i := range metas {
		m := &metas[i]
		m.ModelName = strings.TrimSpace(m.ModelName)
		if m.ModelName == "" {
			continue
		}
		switch m.NameRule {
		case NameRuleExact:
			exact[m.ModelName] = m
		case NameRulePrefix:
			prefix = append(prefix, m)
		case NameRuleSuffix:
			suffix = append(suffix, m)
		case NameRuleContains:
			contains = append(contains, m)
		default:
			// Fallback to exact match.
			exact[m.ModelName] = m
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

	for _, name := range modelNames {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if m, ok := exact[name]; ok {
			result[name] = m
			continue
		}
		for _, r := range prefix {
			if strings.HasPrefix(name, r.ModelName) {
				result[name] = r
				goto matched
			}
		}
		for _, r := range suffix {
			if strings.HasSuffix(name, r.ModelName) {
				result[name] = r
				goto matched
			}
		}
		for _, r := range contains {
			if strings.Contains(name, r.ModelName) {
				result[name] = r
				goto matched
			}
		}
	matched:
	}

	return result, nil
}
