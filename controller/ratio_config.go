package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/setting/pricing_setting"

	"github.com/gin-gonic/gin"
)

// GetPricingConfig exposes pricing configuration (USD per 1M tokens) for clients.
func GetPricingConfig(c *gin.Context) {
	if !pricing_setting.IsExposePricingEnabled() {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "Pricing config endpoint is disabled",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    pricing_setting.GetExposedData(),
	})
}

// GetRatioConfig is kept for backward compatibility.
func GetRatioConfig(c *gin.Context) {
	GetPricingConfig(c)
}
