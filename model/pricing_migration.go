package model

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/pricing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"gorm.io/gorm"
)

const pricingMigrationVersionKey = "PricingMigrationVersion"

func getOptionValueFromDB(key string) (string, bool, error) {
	var opt Option
	err := DB.First(&opt, "key = ?", key).Error
	if err == nil {
		return opt.Value, true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, nil
	}
	return "", false, err
}

func updateOptionIfMissing(key, value string) error {
	_, exists, err := getOptionValueFromDB(key)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return UpdateOption(key, value)
}

func MigratePricingSettingsIfNeeded() {
	version, exists, err := getOptionValueFromDB(pricingMigrationVersionKey)
	if err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: failed to read version: %v", err))
		return
	}
	if exists && version == "1" {
		return
	}

	if common.QuotaPerUnit <= 0 {
		common.SysLog("pricing migration: invalid QuotaPerUnit, skip")
		return
	}

	baseUSDPerMillion := float64(pricing_setting.TokensPerMillion) / common.QuotaPerUnit

	modelRatioMap := ratio_setting.GetModelRatioCopy()
	modelInputPrice := make(map[string]float64, len(modelRatioMap))
	modelOutputPrice := make(map[string]float64, len(modelRatioMap))

	for model, ratio := range modelRatioMap {
		input := ratio * baseUSDPerMillion
		modelInputPrice[model] = input
		modelOutputPrice[model] = input * ratio_setting.GetCompletionRatio(model)
	}

	cacheRatioMap := ratio_setting.GetCacheRatioCopy()
	modelCacheReadPrice := make(map[string]float64, len(cacheRatioMap))
	for model, cacheRatio := range cacheRatioMap {
		input, ok := modelInputPrice[model]
		if !ok {
			continue
		}
		modelCacheReadPrice[model] = input * cacheRatio
	}

	// Image ratio map (no direct copy helper in legacy code, parse JSON)
	modelImageInputPrice := make(map[string]float64)
	{
		imageRatio := make(map[string]float64)
		_ = json.Unmarshal([]byte(ratio_setting.ImageRatio2JSONString()), &imageRatio)
		for model, r := range imageRatio {
			input, ok := modelInputPrice[model]
			if !ok {
				continue
			}
			modelImageInputPrice[model] = input * r
		}
	}

	// Audio ratios
	modelAudioInputPrice := make(map[string]float64)
	modelAudioOutputPrice := make(map[string]float64)
	{
		audioRatio := make(map[string]float64)
		_ = json.Unmarshal([]byte(ratio_setting.AudioRatio2JSONString()), &audioRatio)
		audioCompletionRatio := make(map[string]float64)
		_ = json.Unmarshal([]byte(ratio_setting.AudioCompletionRatio2JSONString()), &audioCompletionRatio)

		// Only migrate models that had audio-specific billing settings.
		modelSet := make(map[string]struct{}, len(audioRatio)+len(audioCompletionRatio))
		for model := range audioRatio {
			modelSet[model] = struct{}{}
		}
		for model := range audioCompletionRatio {
			modelSet[model] = struct{}{}
		}

		for model := range modelSet {
			input, ok := modelInputPrice[model]
			if !ok {
				continue
			}

			aRatio, hasARatio := audioRatio[model]
			if !hasARatio {
				aRatio = 1
			}
			if hasARatio && aRatio == 0 {
				// explicitly configured as free
				modelAudioInputPrice[model] = 0
				modelAudioOutputPrice[model] = 0
				continue
			}

			inAudio := input * aRatio
			modelAudioInputPrice[model] = inAudio

			comp, hasComp := audioCompletionRatio[model]
			if !hasComp {
				comp = 1
			}
			modelAudioOutputPrice[model] = inAudio * comp
		}
	}

	writeJSON := func(v any) string {
		b, _ := common.Marshal(v)
		return string(b)
	}

	// Write only if missing, so manual edits to new keys are preserved.
	if err := updateOptionIfMissing("ModelInputPrice", writeJSON(modelInputPrice)); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write ModelInputPrice failed: %v", err))
		return
	}
	if err := updateOptionIfMissing("ModelOutputPrice", writeJSON(modelOutputPrice)); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write ModelOutputPrice failed: %v", err))
		return
	}
	if err := updateOptionIfMissing("ModelCacheReadPrice", writeJSON(modelCacheReadPrice)); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write ModelCacheReadPrice failed: %v", err))
		return
	}
	if err := updateOptionIfMissing("ModelImageInputPrice", writeJSON(modelImageInputPrice)); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write ModelImageInputPrice failed: %v", err))
		return
	}
	if err := updateOptionIfMissing("ModelAudioInputPrice", writeJSON(modelAudioInputPrice)); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write ModelAudioInputPrice failed: %v", err))
		return
	}
	if err := updateOptionIfMissing("ModelAudioOutputPrice", writeJSON(modelAudioOutputPrice)); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write ModelAudioOutputPrice failed: %v", err))
		return
	}
	// Migrate expose flag
	if err := updateOptionIfMissing("ExposePricingEnabled", fmt.Sprintf("%v", ratio_setting.IsExposeRatioEnabled())); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write ExposePricingEnabled failed: %v", err))
		return
	}
	if err := UpdateOption(pricingMigrationVersionKey, "1"); err != nil {
		common.SysLog(fmt.Sprintf("pricing migration: write version failed: %v", err))
		return
	}

	common.SysLog("pricing migration: completed (ratios -> USD/1M token prices)")
}

// RebuildPricingSettingsFromLegacyRatios overwrites the new USD/1M pricing maps
// using the current legacy ratio settings. This is mainly used for admin reset.
func RebuildPricingSettingsFromLegacyRatios() error {
	if common.QuotaPerUnit <= 0 {
		return fmt.Errorf("invalid QuotaPerUnit")
	}
	baseUSDPerMillion := float64(pricing_setting.TokensPerMillion) / common.QuotaPerUnit

	modelRatioMap := ratio_setting.GetModelRatioCopy()
	modelInputPrice := make(map[string]float64, len(modelRatioMap))
	modelOutputPrice := make(map[string]float64, len(modelRatioMap))
	for model, ratio := range modelRatioMap {
		input := ratio * baseUSDPerMillion
		modelInputPrice[model] = input
		modelOutputPrice[model] = input * ratio_setting.GetCompletionRatio(model)
	}

	cacheRatioMap := ratio_setting.GetCacheRatioCopy()
	modelCacheReadPrice := make(map[string]float64, len(cacheRatioMap))
	for model, cacheRatio := range cacheRatioMap {
		input, ok := modelInputPrice[model]
		if !ok {
			continue
		}
		modelCacheReadPrice[model] = input * cacheRatio
	}

	modelImageInputPrice := make(map[string]float64)
	{
		imageRatio := make(map[string]float64)
		_ = json.Unmarshal([]byte(ratio_setting.ImageRatio2JSONString()), &imageRatio)
		for model, r := range imageRatio {
			input, ok := modelInputPrice[model]
			if !ok {
				continue
			}
			modelImageInputPrice[model] = input * r
		}
	}

	modelAudioInputPrice := make(map[string]float64)
	modelAudioOutputPrice := make(map[string]float64)
	{
		audioRatio := make(map[string]float64)
		_ = json.Unmarshal([]byte(ratio_setting.AudioRatio2JSONString()), &audioRatio)
		audioCompletionRatio := make(map[string]float64)
		_ = json.Unmarshal([]byte(ratio_setting.AudioCompletionRatio2JSONString()), &audioCompletionRatio)

		modelSet := make(map[string]struct{}, len(audioRatio)+len(audioCompletionRatio))
		for model := range audioRatio {
			modelSet[model] = struct{}{}
		}
		for model := range audioCompletionRatio {
			modelSet[model] = struct{}{}
		}
		for model := range modelSet {
			input, ok := modelInputPrice[model]
			if !ok {
				continue
			}
			aRatio, hasARatio := audioRatio[model]
			if !hasARatio {
				aRatio = 1
			}
			if hasARatio && aRatio == 0 {
				modelAudioInputPrice[model] = 0
				modelAudioOutputPrice[model] = 0
				continue
			}
			inAudio := input * aRatio
			modelAudioInputPrice[model] = inAudio
			comp, hasComp := audioCompletionRatio[model]
			if !hasComp {
				comp = 1
			}
			modelAudioOutputPrice[model] = inAudio * comp
		}
	}

	writeJSON := func(v any) string {
		b, _ := common.Marshal(v)
		return string(b)
	}
	if err := UpdateOption("ModelInputPrice", writeJSON(modelInputPrice)); err != nil {
		return err
	}
	if err := UpdateOption("ModelOutputPrice", writeJSON(modelOutputPrice)); err != nil {
		return err
	}
	if err := UpdateOption("ModelCacheReadPrice", writeJSON(modelCacheReadPrice)); err != nil {
		return err
	}
	if err := UpdateOption("ModelImageInputPrice", writeJSON(modelImageInputPrice)); err != nil {
		return err
	}
	if err := UpdateOption("ModelAudioInputPrice", writeJSON(modelAudioInputPrice)); err != nil {
		return err
	}
	if err := UpdateOption("ModelAudioOutputPrice", writeJSON(modelAudioOutputPrice)); err != nil {
		return err
	}
	return UpdateOption(pricingMigrationVersionKey, "1")
}
