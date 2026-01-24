package service

import "github.com/QuantumNous/new-api/setting/pricing_setting"

func ShouldExposeCacheUsage(modelName string) bool {
	return pricing_setting.HasModelCachePricing(modelName)
}

func ShouldHideCacheUsage(modelName string) bool {
	return !ShouldExposeCacheUsage(modelName)
}

