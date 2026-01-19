package model

import "unicode"

func containsHan(s string) bool {
	for _, r := range s {
		if unicode.In(r, unicode.Han) {
			return true
		}
	}
	return false
}

// NormalizeVendorName returns an English display name for known vendors.
//
// It is used to keep API responses consistent even when legacy data contains
// non-English vendor names.
func NormalizeVendorName(name, icon string) string {
	if name == "" {
		return name
	}
	if !containsHan(name) {
		return name
	}

	switch icon {
	case "Zhipu.Color":
		return "Zhipu"
	case "Qwen.Color":
		return "Alibaba"
	case "Wenxin.Color":
		return "Baidu"
	case "Spark.Color":
		return "iFLYTEK"
	case "Hunyuan.Color":
		return "Tencent"
	case "Yi.Color":
		return "01.AI"
	case "Doubao.Color":
		return "ByteDance"
	case "Kling.Color":
		return "Kuaishou"
	case "Jimeng.Color":
		return "Jimeng"
	case "AzureAI":
		return "Microsoft"
	default:
		return name
	}
}
