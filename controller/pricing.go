package controller

import (
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

	// Users should not be aware of other groups, nor be able to choose groups.
	// Pricing is therefore calculated for the user's own group only.
	userGroup := "default"
	if userId, exists := c.Get("id"); exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil && user.Group != "" {
			userGroup = user.Group
		}
	}
	multiplier := service.GetUserGroupRatio(userGroup, userGroup)

	for i := range pricing {
		// Don't leak group names to user-facing clients.
		pricing[i].UsedGroup = ""
		pricing[i].EnableGroup = nil
		if pricing[i].QuotaType == 1 {
			pricing[i].ModelPrice *= multiplier
			continue
		}
		pricing[i].InputPrice *= multiplier
		pricing[i].OutputPrice *= multiplier
		if pricing[i].CacheReadPrice != 0 {
			pricing[i].CacheReadPrice *= multiplier
		}
		if pricing[i].CacheWritePrice != 0 {
			pricing[i].CacheWritePrice *= multiplier
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
		"supported_endpoint": model.GetSupportedEndpointMap(),
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
