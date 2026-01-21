package service

import (
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/pricing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/types"

	"github.com/bytedance/gopkg/util/gopool"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

type TokenDetails struct {
	TextTokens  int
	AudioTokens int
}

type QuotaInfo struct {
	InputDetails  TokenDetails
	OutputDetails TokenDetails
	ModelName     string
	UsePrice      bool
	ModelPrice    float64
	InputPrice    float64
	OutputPrice   float64
	AudioInPrice  float64
	AudioOutPrice float64
	GroupRatio    float64
}

func hasCustomModelInputPrice(modelName string, currentPrice float64) bool {
	defaultRatio, exists := ratio_setting.GetDefaultModelRatioMap()[pricing_setting.FormatMatchingModelName(modelName)]
	if !exists {
		return true
	}
	if common.QuotaPerUnit <= 0 {
		return true
	}
	defaultPrice := defaultRatio * float64(pricing_setting.TokensPerMillion) / common.QuotaPerUnit
	// Use a small tolerance for floating point conversions.
	return math.Abs(currentPrice-defaultPrice) > 1e-9
}

func calculateAudioQuota(info QuotaInfo) int {
	if info.UsePrice {
		modelPrice := decimal.NewFromFloat(info.ModelPrice)
		quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		groupRatio := decimal.NewFromFloat(info.GroupRatio)

		quota := modelPrice.Mul(quotaPerUnit).Mul(groupRatio)
		return int(quota.IntPart())
	}

	quotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
	groupRatio := decimal.NewFromFloat(info.GroupRatio)
	unitTokens := decimal.NewFromInt(pricing_setting.TokensPerMillion)

	inputTextTokens := decimal.NewFromInt(int64(info.InputDetails.TextTokens))
	outputTextTokens := decimal.NewFromInt(int64(info.OutputDetails.TextTokens))
	inputAudioTokens := decimal.NewFromInt(int64(info.InputDetails.AudioTokens))
	outputAudioTokens := decimal.NewFromInt(int64(info.OutputDetails.AudioTokens))

	inputPrice := decimal.NewFromFloat(info.InputPrice)
	outputPrice := decimal.NewFromFloat(info.OutputPrice)
	audioInPrice := decimal.NewFromFloat(info.AudioInPrice)
	audioOutPrice := decimal.NewFromFloat(info.AudioOutPrice)

	quotaUSD := decimal.Zero
	quotaUSD = quotaUSD.Add(inputTextTokens.Mul(inputPrice).Div(unitTokens))
	quotaUSD = quotaUSD.Add(outputTextTokens.Mul(outputPrice).Div(unitTokens))
	quotaUSD = quotaUSD.Add(inputAudioTokens.Mul(audioInPrice).Div(unitTokens))
	quotaUSD = quotaUSD.Add(outputAudioTokens.Mul(audioOutPrice).Div(unitTokens))

	quota := quotaUSD.Mul(groupRatio).Mul(quotaPerUnit)
	if quotaUSD.GreaterThan(decimal.Zero) && quota.LessThanOrEqual(decimal.Zero) {
		quota = decimal.NewFromInt(1)
	}
	return int(quota.Round(0).IntPart())
}

func PreWssConsumeQuota(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.RealtimeUsage) error {
	if relayInfo.PriceData.UsePrice {
		return nil
	}
	userQuota, err := model.GetUserQuota(relayInfo.UserId, false)
	if err != nil {
		return err
	}

	modelName := relayInfo.OriginModelName
	textInputTokens := usage.InputTokenDetails.TextTokens
	textOutTokens := usage.OutputTokenDetails.TextTokens
	audioInputTokens := usage.InputTokenDetails.AudioTokens
	audioOutTokens := usage.OutputTokenDetails.AudioTokens
	actualGroupRatio := relayInfo.PriceData.GroupRatioInfo.GroupRatio

	inputPrice := relayInfo.PriceData.InputPrice
	outputPrice := relayInfo.PriceData.OutputPrice
	audioInPrice := relayInfo.PriceData.AudioInputPrice
	audioOutPrice := relayInfo.PriceData.AudioOutputPrice
	if audioInPrice == 0 {
		audioInPrice = inputPrice
	}
	if audioOutPrice == 0 {
		audioOutPrice = outputPrice
	}

	quotaInfo := QuotaInfo{
		InputDetails: TokenDetails{
			TextTokens:  textInputTokens,
			AudioTokens: audioInputTokens,
		},
		OutputDetails: TokenDetails{
			TextTokens:  textOutTokens,
			AudioTokens: audioOutTokens,
		},
		ModelName:     modelName,
		UsePrice:      relayInfo.PriceData.UsePrice,
		ModelPrice:    relayInfo.PriceData.ModelPrice,
		InputPrice:    inputPrice,
		OutputPrice:   outputPrice,
		AudioInPrice:  audioInPrice,
		AudioOutPrice: audioOutPrice,
		GroupRatio:    actualGroupRatio,
	}

	quota := calculateAudioQuota(quotaInfo)

	if userQuota < quota {
		return fmt.Errorf("user quota is not enough, user quota: %s, need quota: %s", logger.FormatQuota(userQuota), logger.FormatQuota(quota))
	}

	err = PostConsumeQuota(relayInfo, quota, 0, false)
	if err != nil {
		return err
	}
	logger.LogInfo(ctx, "realtime streaming consume quota success, quota: "+fmt.Sprintf("%d", quota))
	return nil
}

func PostWssConsumeQuota(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, modelName string,
	usage *dto.RealtimeUsage, extraContent string) {

	useTimeSeconds := time.Now().Unix() - relayInfo.StartTime.Unix()
	textInputTokens := usage.InputTokenDetails.TextTokens
	textOutTokens := usage.OutputTokenDetails.TextTokens

	audioInputTokens := usage.InputTokenDetails.AudioTokens
	audioOutTokens := usage.OutputTokenDetails.AudioTokens

	tokenName := ctx.GetString("token_name")
	groupRatio := relayInfo.PriceData.GroupRatioInfo.GroupRatio
	modelPrice := relayInfo.PriceData.ModelPrice
	usePrice := relayInfo.PriceData.UsePrice
	inputPrice := relayInfo.PriceData.InputPrice
	outputPrice := relayInfo.PriceData.OutputPrice
	audioInPrice := relayInfo.PriceData.AudioInputPrice
	audioOutPrice := relayInfo.PriceData.AudioOutputPrice
	if audioInPrice == 0 {
		audioInPrice = inputPrice
	}
	if audioOutPrice == 0 {
		audioOutPrice = outputPrice
	}

	quotaInfo := QuotaInfo{
		InputDetails: TokenDetails{
			TextTokens:  textInputTokens,
			AudioTokens: audioInputTokens,
		},
		OutputDetails: TokenDetails{
			TextTokens:  textOutTokens,
			AudioTokens: audioOutTokens,
		},
		ModelName:     modelName,
		UsePrice:      usePrice,
		ModelPrice:    modelPrice,
		InputPrice:    inputPrice,
		OutputPrice:   outputPrice,
		AudioInPrice:  audioInPrice,
		AudioOutPrice: audioOutPrice,
		GroupRatio:    groupRatio,
	}

	quota := calculateAudioQuota(quotaInfo)

	totalTokens := usage.TotalTokens
	var logContent string
	if !usePrice {
		logContent = fmt.Sprintf("Prices(/1M): input %.4f, output %.4f, audio_in %.4f, audio_out %.4f, group %.2f",
			inputPrice, outputPrice, audioInPrice, audioOutPrice, groupRatio)
	} else {
		logContent = fmt.Sprintf("Model price %.2f, group %.2f", modelPrice, groupRatio)
	}

	// record all the consume log even if quota is 0
	if totalTokens == 0 {
		// in this case, must be some error happened
		// we cannot just return, because we may have to return the pre-consumed quota
		quota = 0
		logContent += fmt.Sprintf("(possible upstream timeout)")
		logger.LogError(ctx, fmt.Sprintf("total tokens is 0, cannot consume quota, userId %d, channelId %d, "+
			"tokenId %d, model %s， pre-consumed quota %d", relayInfo.UserId, relayInfo.ChannelId, relayInfo.TokenId, modelName, relayInfo.FinalPreConsumedQuota))
	} else {
		model.UpdateUserUsedQuotaAndRequestCount(relayInfo.UserId, quota)
		model.UpdateChannelUsedQuota(relayInfo.ChannelId, quota)
	}

	logModel := modelName
	if extraContent != "" {
		logContent += ", " + extraContent
	}
	other := GenerateWssOtherInfo(ctx, relayInfo, usage, inputPrice, outputPrice, audioInPrice, audioOutPrice,
		groupRatio, modelPrice, relayInfo.PriceData.GroupRatioInfo.GroupSpecialRatio)
	model.RecordConsumeLog(ctx, relayInfo.UserId, model.RecordConsumeLogParams{
		ChannelId:        relayInfo.ChannelId,
		PromptTokens:     usage.InputTokens,
		CompletionTokens: usage.OutputTokens,
		ModelName:        logModel,
		TokenName:        tokenName,
		Quota:            quota,
		Content:          logContent,
		TokenId:          relayInfo.TokenId,
		UseTimeSeconds:   int(useTimeSeconds),
		IsStream:         relayInfo.IsStream,
		Group:            relayInfo.UsingGroup,
		Other:            other,
	})
}

func PostClaudeConsumeQuota(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.Usage) {

	useTimeSeconds := time.Now().Unix() - relayInfo.StartTime.Unix()
	promptTokens := usage.PromptTokens
	completionTokens := usage.CompletionTokens
	modelName := relayInfo.OriginModelName

	tokenName := ctx.GetString("token_name")
	groupRatio := relayInfo.PriceData.GroupRatioInfo.GroupRatio
	modelPrice := relayInfo.PriceData.ModelPrice
	inputPrice := relayInfo.PriceData.InputPrice
	outputPrice := relayInfo.PriceData.OutputPrice
	cacheReadPrice := relayInfo.PriceData.CacheReadPrice
	cacheTokens := usage.PromptTokensDetails.CachedTokens

	cacheCreationPrice := relayInfo.PriceData.CacheCreationPrice
	cacheCreationPrice5m := relayInfo.PriceData.CacheCreation5mPrice
	cacheCreationPrice1h := relayInfo.PriceData.CacheCreation1hPrice
	cacheCreationTokens := usage.PromptTokensDetails.CachedCreationTokens
	cacheCreationTokens5m := usage.ClaudeCacheCreation5mTokens
	cacheCreationTokens1h := usage.ClaudeCacheCreation1hTokens

	if relayInfo.ChannelType == constant.ChannelTypeOpenRouter {
		promptTokens -= cacheTokens
		isUsingCustomSettings := relayInfo.PriceData.UsePrice || hasCustomModelInputPrice(modelName, inputPrice)
		if cacheCreationTokens == 0 && cacheCreationPrice != inputPrice && usage.Cost != 0 && !isUsingCustomSettings {
			maybeCacheCreationTokens := CalcOpenRouterCacheCreateTokens(*usage, relayInfo.PriceData)
			if maybeCacheCreationTokens >= 0 && promptTokens >= maybeCacheCreationTokens {
				cacheCreationTokens = maybeCacheCreationTokens
			}
		}
		promptTokens -= cacheCreationTokens
	}

	quotaCalculateDecimal := decimal.Zero
	if !relayInfo.PriceData.UsePrice {
		unitTokens := decimal.NewFromInt(pricing_setting.TokensPerMillion)
		dGroup := decimal.NewFromFloat(groupRatio)
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)

		dPrompt := decimal.NewFromInt(int64(promptTokens))
		dCache := decimal.NewFromInt(int64(cacheTokens))
		dCompletion := decimal.NewFromInt(int64(completionTokens))
		dCacheCreate := decimal.NewFromInt(int64(cacheCreationTokens))
		dCacheCreate5m := decimal.NewFromInt(int64(cacheCreationTokens5m))
		dCacheCreate1h := decimal.NewFromInt(int64(cacheCreationTokens1h))

		// USD prices per 1M tokens
		dIn := decimal.NewFromFloat(inputPrice)
		dOut := decimal.NewFromFloat(outputPrice)
		dCacheRead := decimal.NewFromFloat(cacheReadPrice)
		dCacheCreatePrice := decimal.NewFromFloat(cacheCreationPrice)
		dCacheCreate5mPrice := decimal.NewFromFloat(cacheCreationPrice5m)
		dCacheCreate1hPrice := decimal.NewFromFloat(cacheCreationPrice1h)

		usd := decimal.Zero
		usd = usd.Add(dPrompt.Mul(dIn).Div(unitTokens))
		usd = usd.Add(dCache.Mul(dCacheRead).Div(unitTokens))
		usd = usd.Add(dCompletion.Mul(dOut).Div(unitTokens))

		usd = usd.Add(dCacheCreate5m.Mul(dCacheCreate5mPrice).Div(unitTokens))
		usd = usd.Add(dCacheCreate1h.Mul(dCacheCreate1hPrice).Div(unitTokens))
		if cacheCreationTokens5m != 0 || cacheCreationTokens1h != 0 {
			remainingCacheCreationTokens := cacheCreationTokens - cacheCreationTokens5m - cacheCreationTokens1h
			if remainingCacheCreationTokens > 0 {
				usd = usd.Add(decimal.NewFromInt(int64(remainingCacheCreationTokens)).Mul(dCacheCreatePrice).Div(unitTokens))
			}
		} else if cacheCreationTokens > 0 {
			// If upstream only returns total cache creation tokens, charge all at the default cache-creation price.
			usd = usd.Add(dCacheCreate.Mul(dCacheCreatePrice).Div(unitTokens))
		}

		quotaCalculateDecimal = usd.Mul(dGroup).Mul(dQuotaPerUnit)
		if usd.GreaterThan(decimal.Zero) && quotaCalculateDecimal.LessThanOrEqual(decimal.Zero) {
			quotaCalculateDecimal = decimal.NewFromInt(1)
		}
	} else {
		quotaCalculateDecimal = decimal.NewFromFloat(modelPrice).Mul(decimal.NewFromFloat(common.QuotaPerUnit)).Mul(decimal.NewFromFloat(groupRatio))
	}

	quota := int(quotaCalculateDecimal.Round(0).IntPart())

	totalTokens := promptTokens + completionTokens

	var logContent string
	// record all the consume log even if quota is 0
	if totalTokens == 0 {
		// in this case, must be some error happened
		// we cannot just return, because we may have to return the pre-consumed quota
		quota = 0
		logContent += fmt.Sprintf("(possible upstream error)")
		logger.LogError(ctx, fmt.Sprintf("total tokens is 0, cannot consume quota, userId %d, channelId %d, "+
			"tokenId %d, model %s， pre-consumed quota %d", relayInfo.UserId, relayInfo.ChannelId, relayInfo.TokenId, modelName, relayInfo.FinalPreConsumedQuota))
	} else {
		model.UpdateUserUsedQuotaAndRequestCount(relayInfo.UserId, quota)
		model.UpdateChannelUsedQuota(relayInfo.ChannelId, quota)
	}

	quotaDelta := quota - relayInfo.FinalPreConsumedQuota

	if quotaDelta > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("After pre-consume: charge %s (actual: %s, pre: %s)",
			logger.FormatQuota(quotaDelta),
			logger.FormatQuota(quota),
			logger.FormatQuota(relayInfo.FinalPreConsumedQuota),
		))
	} else if quotaDelta < 0 {
		logger.LogInfo(ctx, fmt.Sprintf("After pre-consume: refund %s (actual: %s, pre: %s)",
			logger.FormatQuota(-quotaDelta),
			logger.FormatQuota(quota),
			logger.FormatQuota(relayInfo.FinalPreConsumedQuota),
		))
	}

	// When quotaDelta == 0, the actual consumption equals the pre-consumed quota.
	// In this case, we still need to run post-consume side effects (e.g. auto top-up, quota notifications).
	if quotaDelta != 0 || relayInfo.FinalPreConsumedQuota != 0 {
		err := PostConsumeQuota(relayInfo, quotaDelta, relayInfo.FinalPreConsumedQuota, true)
		if err != nil {
			logger.LogError(ctx, "error consuming token remain quota: "+err.Error())
		}
	}

	other := GenerateClaudeOtherInfo(ctx, relayInfo, inputPrice, outputPrice, groupRatio,
		cacheTokens, cacheReadPrice,
		cacheCreationTokens, cacheCreationPrice,
		cacheCreationTokens5m, cacheCreationPrice5m,
		cacheCreationTokens1h, cacheCreationPrice1h,
		modelPrice, relayInfo.PriceData.GroupRatioInfo.GroupSpecialRatio)
	model.RecordConsumeLog(ctx, relayInfo.UserId, model.RecordConsumeLogParams{
		ChannelId:        relayInfo.ChannelId,
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		ModelName:        modelName,
		TokenName:        tokenName,
		Quota:            quota,
		Content:          logContent,
		TokenId:          relayInfo.TokenId,
		UseTimeSeconds:   int(useTimeSeconds),
		IsStream:         relayInfo.IsStream,
		Group:            relayInfo.UsingGroup,
		Other:            other,
	})

}

func CalcOpenRouterCacheCreateTokens(usage dto.Usage, priceData types.PriceData) int {
	if priceData.InputPrice == 0 {
		return 0
	}
	if priceData.CacheCreationPrice == 0 || priceData.CacheCreationPrice == priceData.InputPrice {
		return 0
	}

	promptPrice := priceData.InputPrice / pricing_setting.TokensPerMillion
	promptCacheCreatePrice := priceData.CacheCreationPrice / pricing_setting.TokensPerMillion
	promptCacheReadPrice := priceData.CacheReadPrice / pricing_setting.TokensPerMillion
	if promptCacheReadPrice == 0 {
		promptCacheReadPrice = promptPrice
	}
	completionPrice := priceData.OutputPrice / pricing_setting.TokensPerMillion

	cost, _ := usage.Cost.(float64)
	totalPromptTokens := float64(usage.PromptTokens)
	completionTokens := float64(usage.CompletionTokens)
	promptCacheReadTokens := float64(usage.PromptTokensDetails.CachedTokens)

	return int(math.Round((cost -
		totalPromptTokens*promptPrice +
		promptCacheReadTokens*(promptPrice-promptCacheReadPrice) -
		completionTokens*completionPrice) /
		(promptCacheCreatePrice - promptPrice)))
}

func PostAudioConsumeQuota(ctx *gin.Context, relayInfo *relaycommon.RelayInfo, usage *dto.Usage, extraContent string) {

	useTimeSeconds := time.Now().Unix() - relayInfo.StartTime.Unix()
	textInputTokens := usage.PromptTokensDetails.TextTokens
	textOutTokens := usage.CompletionTokenDetails.TextTokens

	audioInputTokens := usage.PromptTokensDetails.AudioTokens
	audioOutTokens := usage.CompletionTokenDetails.AudioTokens

	tokenName := ctx.GetString("token_name")
	groupRatio := relayInfo.PriceData.GroupRatioInfo.GroupRatio
	modelPrice := relayInfo.PriceData.ModelPrice
	usePrice := relayInfo.PriceData.UsePrice
	inputPrice := relayInfo.PriceData.InputPrice
	outputPrice := relayInfo.PriceData.OutputPrice
	audioInPrice := relayInfo.PriceData.AudioInputPrice
	audioOutPrice := relayInfo.PriceData.AudioOutputPrice
	if audioInPrice == 0 {
		audioInPrice = inputPrice
	}
	if audioOutPrice == 0 {
		audioOutPrice = outputPrice
	}

	quotaInfo := QuotaInfo{
		InputDetails: TokenDetails{
			TextTokens:  textInputTokens,
			AudioTokens: audioInputTokens,
		},
		OutputDetails: TokenDetails{
			TextTokens:  textOutTokens,
			AudioTokens: audioOutTokens,
		},
		ModelName:     relayInfo.OriginModelName,
		UsePrice:      usePrice,
		ModelPrice:    modelPrice,
		InputPrice:    inputPrice,
		OutputPrice:   outputPrice,
		AudioInPrice:  audioInPrice,
		AudioOutPrice: audioOutPrice,
		GroupRatio:    groupRatio,
	}

	quota := calculateAudioQuota(quotaInfo)

	totalTokens := usage.TotalTokens
	var logContent string
	if !usePrice {
		logContent = fmt.Sprintf("Prices(/1M): input %.4f, output %.4f, audio_in %.4f, audio_out %.4f, group %.2f",
			inputPrice, outputPrice, audioInPrice, audioOutPrice, groupRatio)
	} else {
		logContent = fmt.Sprintf("Model price %.2f, group %.2f", modelPrice, groupRatio)
	}

	// record all the consume log even if quota is 0
	if totalTokens == 0 {
		// in this case, must be some error happened
		// we cannot just return, because we may have to return the pre-consumed quota
		quota = 0
		logContent += fmt.Sprintf("(possible upstream timeout)")
		logger.LogError(ctx, fmt.Sprintf("total tokens is 0, cannot consume quota, userId %d, channelId %d, "+
			"tokenId %d, model %s， pre-consumed quota %d", relayInfo.UserId, relayInfo.ChannelId, relayInfo.TokenId, relayInfo.OriginModelName, relayInfo.FinalPreConsumedQuota))
	} else {
		model.UpdateUserUsedQuotaAndRequestCount(relayInfo.UserId, quota)
		model.UpdateChannelUsedQuota(relayInfo.ChannelId, quota)
	}

	quotaDelta := quota - relayInfo.FinalPreConsumedQuota

	if quotaDelta > 0 {
		logger.LogInfo(ctx, fmt.Sprintf("After pre-consume: charge %s (actual: %s, pre: %s)",
			logger.FormatQuota(quotaDelta),
			logger.FormatQuota(quota),
			logger.FormatQuota(relayInfo.FinalPreConsumedQuota),
		))
	} else if quotaDelta < 0 {
		logger.LogInfo(ctx, fmt.Sprintf("After pre-consume: refund %s (actual: %s, pre: %s)",
			logger.FormatQuota(-quotaDelta),
			logger.FormatQuota(quota),
			logger.FormatQuota(relayInfo.FinalPreConsumedQuota),
		))
	}

	// When quotaDelta == 0, the actual consumption equals the pre-consumed quota.
	// In this case, we still need to run post-consume side effects (e.g. auto top-up, quota notifications).
	if quotaDelta != 0 || relayInfo.FinalPreConsumedQuota != 0 {
		err := PostConsumeQuota(relayInfo, quotaDelta, relayInfo.FinalPreConsumedQuota, true)
		if err != nil {
			logger.LogError(ctx, "error consuming token remain quota: "+err.Error())
		}
	}

	logModel := relayInfo.OriginModelName
	if extraContent != "" {
		logContent += ", " + extraContent
	}
	other := GenerateAudioOtherInfo(ctx, relayInfo, usage, inputPrice, outputPrice, audioInPrice, audioOutPrice,
		groupRatio, modelPrice, relayInfo.PriceData.GroupRatioInfo.GroupSpecialRatio)
	model.RecordConsumeLog(ctx, relayInfo.UserId, model.RecordConsumeLogParams{
		ChannelId:        relayInfo.ChannelId,
		PromptTokens:     usage.PromptTokens,
		CompletionTokens: usage.CompletionTokens,
		ModelName:        logModel,
		TokenName:        tokenName,
		Quota:            quota,
		Content:          logContent,
		TokenId:          relayInfo.TokenId,
		UseTimeSeconds:   int(useTimeSeconds),
		IsStream:         relayInfo.IsStream,
		Group:            relayInfo.UsingGroup,
		Other:            other,
	})
}

func PreConsumeTokenQuota(relayInfo *relaycommon.RelayInfo, quota int) error {
	if quota < 0 {
		return errors.New("Quota can't be negative")
	}
	if relayInfo.IsPlayground {
		return nil
	}
	return model.DecreaseTokenQuota(relayInfo.TokenId, relayInfo.TokenKey, quota)
}

func PostConsumeQuota(relayInfo *relaycommon.RelayInfo, quota int, preConsumedQuota int, sendEmail bool) (err error) {

	if quota > 0 {
		err = model.DecreaseUserQuota(relayInfo.UserId, quota)
	} else {
		err = model.RefundUserQuota(relayInfo.UserId, -quota)
	}
	if err != nil {
		return err
	}

	if !relayInfo.IsPlayground {
		if quota > 0 {
			err = model.DecreaseTokenQuota(relayInfo.TokenId, relayInfo.TokenKey, quota)
		} else {
			err = model.IncreaseTokenQuota(relayInfo.TokenId, relayInfo.TokenKey, -quota)
		}
		if err != nil {
			return err
		}
	}

	// Auto top-up (Stripe): trigger after quota decreases.
	consumeQuota := quota + preConsumedQuota
	if consumeQuota > 0 {
		maybeTriggerStripeAutoTopup(relayInfo, relayInfo.UserQuota-consumeQuota)
	}

	if sendEmail {
		if (quota + preConsumedQuota) != 0 {
			checkAndSendQuotaNotify(relayInfo, quota, preConsumedQuota)
		}
	}

	return nil
}

func checkAndSendQuotaNotify(relayInfo *relaycommon.RelayInfo, quota int, preConsumedQuota int) {
	gopool.Go(func() {
		userSetting := relayInfo.UserSetting
		threshold := common.QuotaRemindThreshold
		if userSetting.QuotaWarningThreshold != 0 {
			threshold = int(userSetting.QuotaWarningThreshold)
		}

		//noMoreQuota := userCache.Quota-(quota+preConsumedQuota) <= 0
		quotaTooLow := false
		consumeQuota := quota + preConsumedQuota
		if relayInfo.UserQuota-consumeQuota < threshold {
			quotaTooLow = true
		}
		if quotaTooLow {
			prompt := "Quota is running low"
			topUpLink := fmt.Sprintf("%s/console/topup", system_setting.ServerAddress)

			// 根据通知方式生成不同的内容格式
			var content string
			var values []interface{}

			notifyType := userSetting.NotifyType
			if notifyType == "" {
				notifyType = dto.NotifyTypeEmail
			}

			if notifyType == dto.NotifyTypeBark {
				// Bark推送使用简短文本，不支持HTML
				content = "Remaining quota: {{value}}. Top up"
				values = []interface{}{logger.FormatQuota(relayInfo.UserQuota)}
			} else if notifyType == dto.NotifyTypeGotify {
				content = "Remaining quota: {{value}}. Top up"
				values = []interface{}{logger.FormatQuota(relayInfo.UserQuota)}
			} else {
				// 默认内容格式，适用于Email和Webhook（支持HTML）
				content = "Remaining quota: {{value}}.<br/>Top up: <a href='{{value}}'>{{value}}</a>"
				values = []interface{}{logger.FormatQuota(relayInfo.UserQuota), topUpLink, topUpLink}
			}

			err := NotifyUser(relayInfo.UserId, relayInfo.UserEmail, relayInfo.UserSetting, dto.NewNotify(dto.NotifyTypeQuotaExceed, prompt, content, values))
			if err != nil {
				common.SysError(fmt.Sprintf("failed to send quota notify to user %d: %s", relayInfo.UserId, err.Error()))
			}
		}
	})
}
