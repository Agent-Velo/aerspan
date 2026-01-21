package helper

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/pricing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

// https://docs.claude.com/en/docs/build-with-claude/prompt-caching#1-hour-cache-duration
const claudeCacheCreation1hMultiplier = 6 / 3.75

// HandleGroupRatio checks for "auto_group" in the context and updates the group ratio and relayInfo.UsingGroup if present
func HandleGroupRatio(ctx *gin.Context, relayInfo *relaycommon.RelayInfo) types.GroupRatioInfo {
	groupRatioInfo := types.GroupRatioInfo{
		GroupRatio:        1.0, // default ratio
		GroupSpecialRatio: -1,
	}

	// check auto group
	autoGroup, exists := ctx.Get("auto_group")
	if exists {
		logger.LogDebug(ctx, fmt.Sprintf("final group: %s", autoGroup))
		relayInfo.UsingGroup = autoGroup.(string)
	}

	// check user group special ratio
	userGroupRatio, ok := ratio_setting.GetGroupGroupRatio(relayInfo.UserGroup, relayInfo.UsingGroup)
	if ok {
		// user group special ratio
		groupRatioInfo.GroupSpecialRatio = userGroupRatio
		groupRatioInfo.GroupRatio = userGroupRatio
		groupRatioInfo.HasSpecialRatio = true
	} else {
		// normal group ratio
		groupRatioInfo.GroupRatio = ratio_setting.GetGroupRatio(relayInfo.UsingGroup)
	}

	return groupRatioInfo
}

func ModelPriceHelper(c *gin.Context, info *relaycommon.RelayInfo, promptTokens int, meta *types.TokenCountMeta) (types.PriceData, error) {
	modelPrice, usePrice := ratio_setting.GetModelPrice(info.OriginModelName, false)

	groupRatioInfo := HandleGroupRatio(c, info)

	var preConsumedQuota int
	var inputPrice float64
	var outputPrice float64
	var cacheReadPrice float64
	var imageInputPrice float64
	var cacheCreationPrice float64
	var cacheCreation5mPrice float64
	var cacheCreation1hPrice float64
	var audioInputPrice float64
	var audioOutputPrice float64
	var freeModel bool
	if !usePrice {
		preConsumedInputTokens := common.Max(promptTokens, common.PreConsumedQuota)
		preConsumedOutputTokens := 0
		if meta.MaxTokens != 0 {
			preConsumedOutputTokens = meta.MaxTokens
		}

		var ok bool
		var matchName string
		inputPrice, ok, matchName = pricing_setting.GetModelInputPrice(info.OriginModelName)
		if !ok {
			acceptUnsetRatio := false
			if info.UserSetting.AcceptUnsetRatioModel {
				acceptUnsetRatio = true
			}
			if !acceptUnsetRatio {
				return types.PriceData{}, fmt.Errorf("No pricing configured for model %s. Contact an admin or enable self-use mode", matchName)
			}
		}

		if v, ok := pricing_setting.GetModelOutputPrice(info.OriginModelName); ok {
			outputPrice = v
		} else {
			// Backward-compatible fallback: derive output pricing from legacy completion ratio.
			outputPrice = inputPrice * ratio_setting.GetCompletionRatio(info.OriginModelName)
		}

		if v, ok := pricing_setting.GetModelCacheReadPrice(info.OriginModelName); ok {
			cacheReadPrice = v
		} else {
			cacheReadPrice = inputPrice
		}

		if v, ok := pricing_setting.GetModelImageInputPrice(info.OriginModelName); ok {
			imageInputPrice = v
		} else {
			imageInputPrice = inputPrice
		}

		cacheCreationRatio, _ := ratio_setting.GetCreateCacheRatio(info.OriginModelName)
		cacheCreationPrice = inputPrice * cacheCreationRatio
		cacheCreation5mPrice = cacheCreationPrice
		// 固定1h和5min缓存写入价格的比例
		cacheCreation1hPrice = cacheCreationPrice * claudeCacheCreation1hMultiplier

		if v, ok := pricing_setting.GetModelAudioInputPrice(info.OriginModelName); ok {
			audioInputPrice = v
		}
		if v, ok := pricing_setting.GetModelAudioOutputPrice(info.OriginModelName); ok {
			audioOutputPrice = v
		}

		inputTierMultiplier, _ := pricing_setting.GetModelInputTokenPriceMultiplier(info.OriginModelName, preConsumedInputTokens)
		outputTierMultiplier, _ := pricing_setting.GetModelOutputTokenPriceMultiplier(info.OriginModelName, preConsumedOutputTokens)
		preConsumedUSD := (float64(preConsumedInputTokens)*inputPrice*inputTierMultiplier + float64(preConsumedOutputTokens)*outputPrice*outputTierMultiplier) / pricing_setting.TokensPerMillion
		preConsumedQuota = int(preConsumedUSD * groupRatioInfo.GroupRatio * common.QuotaPerUnit)
	} else {
		if meta.ImagePriceRatio != 0 {
			modelPrice = modelPrice * meta.ImagePriceRatio
		}
		preConsumedQuota = int(modelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
	}

	// check if free model pre-consume is disabled
	if !operation_setting.GetQuotaSetting().EnableFreeModelPreConsume {
		// if model price or ratio is 0, do not pre-consume quota
		if groupRatioInfo.GroupRatio == 0 {
			preConsumedQuota = 0
			freeModel = true
		} else if usePrice {
			if modelPrice == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		} else {
			if inputPrice == 0 && outputPrice == 0 {
				preConsumedQuota = 0
				freeModel = true
			}
		}
	}

	priceData := types.PriceData{
		FreeModel:            freeModel,
		ModelPrice:           modelPrice,
		InputPrice:           inputPrice,
		OutputPrice:          outputPrice,
		CacheReadPrice:       cacheReadPrice,
		CacheCreationPrice:   cacheCreationPrice,
		CacheCreation5mPrice: cacheCreation5mPrice,
		CacheCreation1hPrice: cacheCreation1hPrice,
		GroupRatioInfo:       groupRatioInfo,
		UsePrice:             usePrice,
		ImageInputPrice:      imageInputPrice,
		AudioInputPrice:      audioInputPrice,
		AudioOutputPrice:     audioOutputPrice,
		QuotaToPreConsume:    preConsumedQuota,
	}

	if common.DebugEnabled {
		println(fmt.Sprintf("model_price_helper result: %s", priceData.ToSetting()))
	}
	info.PriceData = priceData
	return priceData, nil
}

// ModelPriceHelperPerCall 按次计费的 PriceHelper (MJ、Task)
func ModelPriceHelperPerCall(c *gin.Context, info *relaycommon.RelayInfo) types.PerCallPriceData {
	groupRatioInfo := HandleGroupRatio(c, info)

	modelPrice, success := ratio_setting.GetModelPrice(info.OriginModelName, true)
	// 如果没有配置价格，则使用默认价格
	if !success {
		defaultPrice, ok := ratio_setting.GetDefaultModelPriceMap()[info.OriginModelName]
		if !ok {
			modelPrice = 0.1
		} else {
			modelPrice = defaultPrice
		}
	}
	quota := int(modelPrice * common.QuotaPerUnit * groupRatioInfo.GroupRatio)
	priceData := types.PerCallPriceData{
		ModelPrice:     modelPrice,
		Quota:          quota,
		GroupRatioInfo: groupRatioInfo,
	}
	return priceData
}

func ContainPriceOrRatio(modelName string) bool {
	_, ok := ratio_setting.GetModelPrice(modelName, false)
	if ok {
		return true
	}
	_, ok, _ = pricing_setting.GetModelInputPrice(modelName)
	if ok {
		return true
	}
	return false
}
