package pricing_setting

import (
	"encoding/json"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

const TokensPerMillion = 1_000_000

// Model prices are expressed in USD per 1M tokens.
// - Input: prompt/input text tokens
// - Output: completion/output text tokens
// Other categories (cache/image/audio) are also USD per 1M tokens for that token category.

var (
	modelInputPriceMap      map[string]float64
	modelInputPriceMapMutex sync.RWMutex

	modelOutputPriceMap      map[string]float64
	modelOutputPriceMapMutex sync.RWMutex

	modelCacheReadPriceMap      map[string]float64
	modelCacheReadPriceMapMutex sync.RWMutex

	modelImageInputPriceMap      map[string]float64
	modelImageInputPriceMapMutex sync.RWMutex

	modelAudioInputPriceMap      map[string]float64
	modelAudioInputPriceMapMutex sync.RWMutex

	modelAudioOutputPriceMap      map[string]float64
	modelAudioOutputPriceMapMutex sync.RWMutex
)

func init() {
	InitPricingSettings()
}

func InitPricingSettings() {
	modelInputPriceMapMutex.Lock()
	modelInputPriceMap = map[string]float64{}
	modelInputPriceMapMutex.Unlock()

	modelOutputPriceMapMutex.Lock()
	modelOutputPriceMap = map[string]float64{}
	modelOutputPriceMapMutex.Unlock()

	modelCacheReadPriceMapMutex.Lock()
	modelCacheReadPriceMap = map[string]float64{}
	modelCacheReadPriceMapMutex.Unlock()

	modelImageInputPriceMapMutex.Lock()
	modelImageInputPriceMap = map[string]float64{}
	modelImageInputPriceMapMutex.Unlock()

	modelAudioInputPriceMapMutex.Lock()
	modelAudioInputPriceMap = map[string]float64{}
	modelAudioInputPriceMapMutex.Unlock()

	modelAudioOutputPriceMapMutex.Lock()
	modelAudioOutputPriceMap = map[string]float64{}
	modelAudioOutputPriceMapMutex.Unlock()

	modelInputTokenTierMapMutex.Lock()
	modelInputTokenTierMap = map[string][]TokenPriceTier{}
	modelInputTokenTierMapMutex.Unlock()

	modelOutputTokenTierMapMutex.Lock()
	modelOutputTokenTierMap = map[string][]TokenPriceTier{}
	modelOutputTokenTierMapMutex.Unlock()
}

func baseFallbackInputPricePerMillion() float64 {
	// Legacy fallback was modelRatio=37.5. Convert that into USD/1M based on current QuotaPerUnit.
	baseUSDPerMillion := float64(TokensPerMillion) / common.QuotaPerUnit
	return 37.5 * baseUSDPerMillion
}

func GetModelInputPrice(name string) (float64, bool, string) {
	modelInputPriceMapMutex.RLock()
	defer modelInputPriceMapMutex.RUnlock()

	name = FormatMatchingModelName(name)
	price, ok := modelInputPriceMap[name]
	if !ok {
		return baseFallbackInputPricePerMillion(), operation_setting.SelfUseModeEnabled, name
	}
	return price, true, name
}

func GetModelOutputPrice(name string) (float64, bool) {
	modelOutputPriceMapMutex.RLock()
	defer modelOutputPriceMapMutex.RUnlock()
	name = FormatMatchingModelName(name)
	price, ok := modelOutputPriceMap[name]
	if !ok {
		return 0, false
	}
	return price, true
}

func GetModelCacheReadPrice(name string) (float64, bool) {
	modelCacheReadPriceMapMutex.RLock()
	defer modelCacheReadPriceMapMutex.RUnlock()
	name = FormatMatchingModelName(name)
	price, ok := modelCacheReadPriceMap[name]
	if !ok {
		return 0, false
	}
	return price, true
}

func GetModelImageInputPrice(name string) (float64, bool) {
	modelImageInputPriceMapMutex.RLock()
	defer modelImageInputPriceMapMutex.RUnlock()
	name = FormatMatchingModelName(name)
	price, ok := modelImageInputPriceMap[name]
	if !ok {
		return 0, false
	}
	return price, true
}

func GetModelAudioInputPrice(name string) (float64, bool) {
	modelAudioInputPriceMapMutex.RLock()
	defer modelAudioInputPriceMapMutex.RUnlock()
	name = FormatMatchingModelName(name)
	price, ok := modelAudioInputPriceMap[name]
	if !ok {
		return 0, false
	}
	return price, true
}

func GetModelAudioOutputPrice(name string) (float64, bool) {
	modelAudioOutputPriceMapMutex.RLock()
	defer modelAudioOutputPriceMapMutex.RUnlock()
	name = FormatMatchingModelName(name)
	price, ok := modelAudioOutputPriceMap[name]
	if !ok {
		return 0, false
	}
	return price, true
}

func HasAudioPricing(name string) bool {
	name = FormatMatchingModelName(name)
	modelAudioInputPriceMapMutex.RLock()
	_, hasIn := modelAudioInputPriceMap[name]
	modelAudioInputPriceMapMutex.RUnlock()

	modelAudioOutputPriceMapMutex.RLock()
	_, hasOut := modelAudioOutputPriceMap[name]
	modelAudioOutputPriceMapMutex.RUnlock()

	return hasIn || hasOut
}

func copyFloatMap(src map[string]float64) map[string]float64 {
	if src == nil {
		return map[string]float64{}
	}
	dst := make(map[string]float64, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func ModelInputPrice2JSONString() string {
	modelInputPriceMapMutex.RLock()
	defer modelInputPriceMapMutex.RUnlock()
	jsonBytes, err := common.Marshal(modelInputPriceMap)
	if err != nil {
		common.SysError("error marshalling model input price: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelInputPriceByJSONString(jsonStr string) error {
	tmp := make(map[string]float64)
	if err := common.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	modelInputPriceMapMutex.Lock()
	modelInputPriceMap = tmp
	modelInputPriceMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func ModelOutputPrice2JSONString() string {
	modelOutputPriceMapMutex.RLock()
	defer modelOutputPriceMapMutex.RUnlock()
	jsonBytes, err := common.Marshal(modelOutputPriceMap)
	if err != nil {
		common.SysError("error marshalling model output price: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelOutputPriceByJSONString(jsonStr string) error {
	tmp := make(map[string]float64)
	if err := common.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	modelOutputPriceMapMutex.Lock()
	modelOutputPriceMap = tmp
	modelOutputPriceMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func ModelCacheReadPrice2JSONString() string {
	modelCacheReadPriceMapMutex.RLock()
	defer modelCacheReadPriceMapMutex.RUnlock()
	jsonBytes, err := json.Marshal(modelCacheReadPriceMap)
	if err != nil {
		common.SysError("error marshalling model cache read price: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelCacheReadPriceByJSONString(jsonStr string) error {
	tmp := make(map[string]float64)
	if err := json.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	modelCacheReadPriceMapMutex.Lock()
	modelCacheReadPriceMap = tmp
	modelCacheReadPriceMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func ModelImageInputPrice2JSONString() string {
	modelImageInputPriceMapMutex.RLock()
	defer modelImageInputPriceMapMutex.RUnlock()
	jsonBytes, err := json.Marshal(modelImageInputPriceMap)
	if err != nil {
		common.SysError("error marshalling model image input price: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelImageInputPriceByJSONString(jsonStr string) error {
	tmp := make(map[string]float64)
	if err := json.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	modelImageInputPriceMapMutex.Lock()
	modelImageInputPriceMap = tmp
	modelImageInputPriceMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func ModelAudioInputPrice2JSONString() string {
	modelAudioInputPriceMapMutex.RLock()
	defer modelAudioInputPriceMapMutex.RUnlock()
	jsonBytes, err := json.Marshal(modelAudioInputPriceMap)
	if err != nil {
		common.SysError("error marshalling model audio input price: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelAudioInputPriceByJSONString(jsonStr string) error {
	tmp := make(map[string]float64)
	if err := json.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	modelAudioInputPriceMapMutex.Lock()
	modelAudioInputPriceMap = tmp
	modelAudioInputPriceMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func ModelAudioOutputPrice2JSONString() string {
	modelAudioOutputPriceMapMutex.RLock()
	defer modelAudioOutputPriceMapMutex.RUnlock()
	jsonBytes, err := json.Marshal(modelAudioOutputPriceMap)
	if err != nil {
		common.SysError("error marshalling model audio output price: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateModelAudioOutputPriceByJSONString(jsonStr string) error {
	tmp := make(map[string]float64)
	if err := json.Unmarshal([]byte(jsonStr), &tmp); err != nil {
		return err
	}
	modelAudioOutputPriceMapMutex.Lock()
	modelAudioOutputPriceMap = tmp
	modelAudioOutputPriceMapMutex.Unlock()
	InvalidateExposedDataCache()
	return nil
}

func GetModelInputPriceCopy() map[string]float64 {
	modelInputPriceMapMutex.RLock()
	defer modelInputPriceMapMutex.RUnlock()
	return copyFloatMap(modelInputPriceMap)
}

func GetModelOutputPriceCopy() map[string]float64 {
	modelOutputPriceMapMutex.RLock()
	defer modelOutputPriceMapMutex.RUnlock()
	return copyFloatMap(modelOutputPriceMap)
}

func GetModelCacheReadPriceCopy() map[string]float64 {
	modelCacheReadPriceMapMutex.RLock()
	defer modelCacheReadPriceMapMutex.RUnlock()
	return copyFloatMap(modelCacheReadPriceMap)
}

func GetModelImageInputPriceCopy() map[string]float64 {
	modelImageInputPriceMapMutex.RLock()
	defer modelImageInputPriceMapMutex.RUnlock()
	return copyFloatMap(modelImageInputPriceMap)
}

func GetModelAudioInputPriceCopy() map[string]float64 {
	modelAudioInputPriceMapMutex.RLock()
	defer modelAudioInputPriceMapMutex.RUnlock()
	return copyFloatMap(modelAudioInputPriceMap)
}

func GetModelAudioOutputPriceCopy() map[string]float64 {
	modelAudioOutputPriceMapMutex.RLock()
	defer modelAudioOutputPriceMapMutex.RUnlock()
	return copyFloatMap(modelAudioOutputPriceMap)
}
