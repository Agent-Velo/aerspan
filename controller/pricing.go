package controller

import (
	"math"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetPricing(c *gin.Context) {
	basePricing := model.GetPricing()
	pricing := make([]model.Pricing, len(basePricing))
	copy(pricing, basePricing)

	if modelName := c.Query("model"); modelName != "" {
		filtered := pricing[:0]
		for _, item := range pricing {
			if item.ModelName == modelName {
				filtered = append(filtered, item)
			}
		}
		pricing = filtered
	}

	selectedGroup := c.Query("group")
	if selectedGroup == "" {
		selectedGroup = "all"
	}
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupMultiplier := ratio_setting.GetGroupRatioCopy()
	var group string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			for g := range groupMultiplier {
				ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
				if ok {
					groupMultiplier[g] = ratio
				}
			}
		}
	}

	usableGroup = service.GetUserUsableGroups(group)
	// keep only usable groups
	for g := range groupMultiplier {
		if _, ok := usableGroup[g]; !ok {
			delete(groupMultiplier, g)
		}
	}

	resolveMultiplier := func(enableGroups []string) (float64, string) {
		if selectedGroup != "" && selectedGroup != "all" {
			m, ok := groupMultiplier[selectedGroup]
			if !ok {
				m = 1
			}
			return m, selectedGroup
		}
		min := math.Inf(1)
		used := ""
		for _, g := range enableGroups {
			if m, ok := groupMultiplier[g]; ok {
				if m < min {
					min = m
					used = g
				}
			}
		}
		if used == "" || math.IsInf(min, 1) {
			return 1, ""
		}
		return min, used
	}

	for i := range pricing {
		multiplier, usedGroup := resolveMultiplier(pricing[i].EnableGroup)
		pricing[i].UsedGroup = usedGroup
		if pricing[i].QuotaType == 1 {
			pricing[i].ModelPrice *= multiplier
			continue
		}
		pricing[i].InputPrice *= multiplier
		pricing[i].OutputPrice *= multiplier
		if pricing[i].CacheReadPrice != 0 {
			pricing[i].CacheReadPrice *= multiplier
		}
		if pricing[i].ImageInputPrice != 0 {
			pricing[i].ImageInputPrice *= multiplier
		}
		if pricing[i].AudioInputPrice != 0 {
			pricing[i].AudioInputPrice *= multiplier
		}
		if pricing[i].AudioOutputPrice != 0 {
			pricing[i].AudioOutputPrice *= multiplier
		}
	}

	c.JSON(200, gin.H{
		"success":            true,
		"data":               pricing,
		"vendors":            model.GetVendors(),
		"usable_group":       usableGroup,
		"supported_endpoint": model.GetSupportedEndpointMap(),
		"auto_groups":        service.GetUserAutoGroup(group),
		"selected_group":     selectedGroup,
	})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	if err := model.UpdateOption("ModelRatio", defaultStr); err != nil {
		c.JSON(200, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := ratio_setting.UpdateModelRatioByJSONString(defaultStr); err != nil {
		c.JSON(200, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := model.RebuildPricingSettingsFromLegacyRatios(); err != nil {
		c.JSON(200, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "Model pricing reset",
	})
}
