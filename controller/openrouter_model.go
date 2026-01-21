package controller

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/pricing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

func splitCSV(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		result = append(result, p)
	}
	return result
}

func formatUSDPerMillionToUSDPerTokenString(usdPerMillion float64) string {
	if usdPerMillion <= 0 {
		return "0"
	}
	perToken := usdPerMillion / float64(pricing_setting.TokensPerMillion)
	return strconv.FormatFloat(perToken, 'f', -1, 64)
}

// ListOpenRouterModels exposes an unauthenticated OpenRouter-like model list.
//
// It is designed for UIs/tools that need OpenRouter's enriched model schema,
// while the actual model invocation still happens via /v1 endpoints.
func ListOpenRouterModels(c *gin.Context) {
	// 1) Collect distinct enabled models across all channels.
	var internalModelNames []string
	err := model.DB.Table("abilities").
		Distinct("model").
		Where("enabled = ?", true).
		Pluck("model", &internalModelNames).Error
	if err != nil {
		common.SysError(fmt.Sprintf("ListOpenRouterModels: failed to load models: %v", err))
		c.JSON(200, dto.OpenRouterModelsResponse{Data: []dto.OpenRouterModel{}})
		return
	}
	if len(internalModelNames) == 0 {
		c.JSON(200, dto.OpenRouterModelsResponse{Data: []dto.OpenRouterModel{}})
		return
	}
	sort.Strings(internalModelNames)

	// 2) Load matched meta rows (exact/prefix/suffix/contains).
	metaByInternalName, err := model.GetMatchedModelsMetaMap(internalModelNames)
	if err != nil {
		common.SysError(fmt.Sprintf("ListOpenRouterModels: failed to load model metas: %v", err))
		c.JSON(200, dto.OpenRouterModelsResponse{Data: []dto.OpenRouterModel{}})
		return
	}

	// 3) Build OpenRouter objects and de-duplicate by the resulting slug.
	modelsBySlug := make(map[string]dto.OpenRouterModel)
	for _, internalName := range internalModelNames {
		meta := metaByInternalName[internalName]
		if meta != nil && meta.Status != 1 {
			continue
		}

		slug := internalName
		if meta != nil {
			if s := strings.TrimSpace(meta.OpenRouterSlug); s != "" {
				slug = s
			}
		}
		if slug == "" {
			continue
		}
		// Prefer the first one (stable due to sorted internalModelNames).
		if _, exists := modelsBySlug[slug]; exists {
			continue
		}

		created := int64(0)
		name := slug
		description := ""
		huggingFaceID := ""
		quantization := ""
		inputModalities := []string{"text"}
		outputModalities := []string{"text"}
		supportedSamplingParameters := []string{}
		supportedFeatures := []string{}
		contextLength := 0
		maxOutputLength := 0

		pricing := dto.OpenRouterModelPricing{
			Prompt:          "",
			Completion:      "",
			Image:           "",
			Request:         "",
			InputCacheRead:  "",
			InputCacheWrite: "",
		}

		if meta != nil {
			if meta.OpenRouterCreated != nil && *meta.OpenRouterCreated > 0 {
				created = *meta.OpenRouterCreated
			} else if meta.CreatedTime > 0 {
				created = meta.CreatedTime
			}
			if dn := strings.TrimSpace(meta.DisplayName); dn != "" {
				name = dn
			}
			description = strings.TrimSpace(meta.Description)
			huggingFaceID = strings.TrimSpace(meta.OpenRouterHuggingFaceID)
			quantization = strings.TrimSpace(meta.OpenRouterQuantization)
			if meta.TotalContext != nil {
				contextLength = *meta.TotalContext
			}
			if meta.MaxOutput != nil {
				maxOutputLength = *meta.MaxOutput
			}
			if m := splitCSV(meta.OpenRouterInputModalities); len(m) > 0 {
				inputModalities = m
			}
			if m := splitCSV(meta.OpenRouterOutputModalities); len(m) > 0 {
				outputModalities = m
			}
			supportedSamplingParameters = splitCSV(meta.OpenRouterSupportedSamplingParameters)
			supportedFeatures = splitCSV(meta.OpenRouterSupportedFeatures)

			if v := strings.TrimSpace(meta.OpenRouterPricingPrompt); v != "" {
				pricing.Prompt = v
			}
			if v := strings.TrimSpace(meta.OpenRouterPricingCompletion); v != "" {
				pricing.Completion = v
			}
			if v := strings.TrimSpace(meta.OpenRouterPricingImage); v != "" {
				pricing.Image = v
			}
			if v := strings.TrimSpace(meta.OpenRouterPricingRequest); v != "" {
				pricing.Request = v
			}
			if v := strings.TrimSpace(meta.OpenRouterPricingInputCacheRead); v != "" {
				pricing.InputCacheRead = v
			}
			if v := strings.TrimSpace(meta.OpenRouterPricingInputCacheWrite); v != "" {
				pricing.InputCacheWrite = v
			}
		}

		// Default pricing from system pricing config if OpenRouter overrides are unset.
		// Use the OpenRouter slug for matching, so aliases can still return the right price.
		if pricing.Prompt == "" {
			if inputPricePerMillion, ok, _ := pricing_setting.GetModelInputPrice(slug); ok {
				pricing.Prompt = formatUSDPerMillionToUSDPerTokenString(inputPricePerMillion)
			}
		}
		if pricing.Completion == "" {
			// Prefer explicit output price.
			if outputPricePerMillion, ok := pricing_setting.GetModelOutputPrice(slug); ok {
				pricing.Completion = formatUSDPerMillionToUSDPerTokenString(outputPricePerMillion)
			} else if inputPricePerMillion, ok, _ := pricing_setting.GetModelInputPrice(slug); ok {
				// Fallback to completion ratio for backward compatibility.
				pricing.Completion = formatUSDPerMillionToUSDPerTokenString(
					inputPricePerMillion * ratio_setting.GetCompletionRatio(slug),
				)
			}
		}
		if pricing.InputCacheRead == "" {
			if cacheReadPerMillion, ok := pricing_setting.GetModelCacheReadPrice(slug); ok {
				pricing.InputCacheRead = formatUSDPerMillionToUSDPerTokenString(cacheReadPerMillion)
			}
		}
		if pricing.InputCacheWrite == "" {
			if inputPricePerMillion, ok, _ := pricing_setting.GetModelInputPrice(slug); ok {
				cacheWritePerMillion := inputPricePerMillion * 1.25
				if r, ok := ratio_setting.GetCreateCacheRatio(slug); ok {
					cacheWritePerMillion = inputPricePerMillion * r
				}
				pricing.InputCacheWrite = formatUSDPerMillionToUSDPerTokenString(cacheWritePerMillion)
			}
		}
		if pricing.Prompt == "" {
			pricing.Prompt = "0"
		}
		if pricing.Completion == "" {
			pricing.Completion = "0"
		}
		if pricing.Image == "" {
			pricing.Image = "0"
		}
		if pricing.Request == "" {
			pricing.Request = "0"
		}
		if pricing.InputCacheRead == "" {
			pricing.InputCacheRead = "0"
		}
		if pricing.InputCacheWrite == "" {
			pricing.InputCacheWrite = "0"
		}

		m := dto.OpenRouterModel{
			ID:                          slug,
			HuggingFaceID:               huggingFaceID,
			Name:                        name,
			Created:                     created,
			InputModalities:             inputModalities,
			OutputModalities:            outputModalities,
			Quantization:                quantization,
			ContextLength:               contextLength,
			MaxOutputLength:             maxOutputLength,
			Pricing:                     pricing,
			SupportedSamplingParameters: supportedSamplingParameters,
			SupportedFeatures:           supportedFeatures,
			Description:                 description,
		}
		m.OpenRouter.Slug = slug
		modelsBySlug[slug] = m
	}

	result := make([]dto.OpenRouterModel, 0, len(modelsBySlug))
	for _, m := range modelsBySlug {
		result = append(result, m)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].ID < result[j].ID
	})

	c.JSON(200, dto.OpenRouterModelsResponse{Data: result})
}
