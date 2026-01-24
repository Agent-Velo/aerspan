package model

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/pricing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
)

func splitCSV(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" {
			continue
		}
		result = append(result, p)
	}
	return result
}

func parseEndpointSupport(raw string) []EndpointSupportItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	var parsed any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil
	}

	switch val := parsed.(type) {
	case map[string]any:
		items := make([]EndpointSupportItem, 0, len(val))
		for key, v := range val {
			name := strings.TrimSpace(key)
			uri := ""
			switch endpoint := v.(type) {
			case string:
				uri = strings.TrimSpace(endpoint)
			case map[string]any:
				if n, ok := endpoint["name"].(string); ok {
					n = strings.TrimSpace(n)
					if n != "" {
						name = n
					}
				}
				if n, ok := endpoint["display_name"].(string); ok {
					n = strings.TrimSpace(n)
					if n != "" {
						name = n
					}
				}
				if u, ok := endpoint["uri"].(string); ok {
					uri = strings.TrimSpace(u)
				}
				if uri == "" {
					if p, ok := endpoint["path"].(string); ok {
						uri = strings.TrimSpace(p)
					}
				}
			default:
				continue
			}
			items = append(items, EndpointSupportItem{Name: name, URI: uri})
		}
		sort.SliceStable(items, func(i, j int) bool {
			return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
		})
		return items
	case []any:
		items := make([]EndpointSupportItem, 0, len(val))
		for _, entry := range val {
			switch endpoint := entry.(type) {
			case string:
				endpointType := constant.EndpointType(strings.TrimSpace(endpoint))
				uri := ""
				if info, ok := common.GetDefaultEndpointInfo(endpointType); ok {
					uri = info.Path
				}
				items = append(items, EndpointSupportItem{Name: string(endpointType), URI: uri})
			case map[string]any:
				name := ""
				if n, ok := endpoint["name"].(string); ok {
					name = strings.TrimSpace(n)
				}
				uri := ""
				if u, ok := endpoint["uri"].(string); ok {
					uri = strings.TrimSpace(u)
				}
				if uri == "" {
					if p, ok := endpoint["path"].(string); ok {
						uri = strings.TrimSpace(p)
					}
				}
				if name == "" {
					name = uri
				}
				items = append(items, EndpointSupportItem{Name: name, URI: uri})
			}
		}
		return items
	default:
		return nil
	}
}

type Pricing struct {
	ModelName                       string                           `json:"model_name"`
	DisplayName                     string                           `json:"display_name,omitempty"`
	Description                     string                           `json:"description,omitempty"`
	Icon                            string                           `json:"icon,omitempty"`
	Tags                            string                           `json:"tags,omitempty"`
	VendorID                        int                              `json:"vendor_id,omitempty"`
	TotalContext                    *int                             `json:"total_context,omitempty"`
	MaxOutput                       *int                             `json:"max_output,omitempty"`
	InputTypes                      []string                         `json:"input_types,omitempty"`
	OutputTypes                     []string                         `json:"output_types,omitempty"`
	EndpointSupport                 []EndpointSupportItem            `json:"endpoint_support,omitempty"`
	QuotaType                       int                              `json:"quota_type"`
	InputPrice                      float64                          `json:"input_price"`
	OutputPrice                     float64                          `json:"output_price"`
	InputTokenPriceMultiplierTiers  []pricing_setting.TokenPriceTier `json:"input_token_price_multiplier_tiers,omitempty"`
	OutputTokenPriceMultiplierTiers []pricing_setting.TokenPriceTier `json:"output_token_price_multiplier_tiers,omitempty"`
	CacheReadPrice                  float64                          `json:"cache_read_price,omitempty"`
	CacheWritePrice                 float64                          `json:"cache_write_price,omitempty"`
	ImageInputPrice                 float64                          `json:"image_input_price,omitempty"`
	AudioInputPrice                 float64                          `json:"audio_input_price,omitempty"`
	AudioOutputPrice                float64                          `json:"audio_output_price,omitempty"`
	ModelPrice                      float64                          `json:"model_price"`
	OwnerBy                         string                           `json:"owner_by"`
	UsedGroup                       string                           `json:"used_group,omitempty"`
	EnableGroup                     []string                         `json:"enable_groups,omitempty"`
	SupportedEndpointTypes          []constant.EndpointType          `json:"supported_endpoint_types"`
}

type EndpointSupportItem struct {
	Name string `json:"name"`
	URI  string `json:"uri"`
}

type PricingVendor struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Icon        string `json:"icon,omitempty"`
}

var (
	pricingMap           []Pricing
	vendorsList          []PricingVendor
	supportedEndpointMap map[string]common.EndpointInfo
	lastGetPricingTime   time.Time
	updatePricingLock    sync.Mutex

	// 缓存映射：模型名 -> 启用分组 / 计费类型
	modelEnableGroups     = make(map[string][]string)
	modelQuotaTypeMap     = make(map[string]int)
	modelEnableGroupsLock = sync.RWMutex{}
)

var (
	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	modelSupportEndpointsLock = sync.RWMutex{}
)

func GetPricing() []Pricing {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		updatePricingLock.Lock()
		defer updatePricingLock.Unlock()
		// Double check after acquiring the lock
		if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
			modelSupportEndpointsLock.Lock()
			defer modelSupportEndpointsLock.Unlock()
			updatePricing()
		}
	}
	return pricingMap
}

// GetVendors 返回当前定价接口使用到的供应商信息
func GetVendors() []PricingVendor {
	if time.Since(lastGetPricingTime) > time.Minute*1 || len(pricingMap) == 0 {
		// 保证先刷新一次
		GetPricing()
	}
	return vendorsList
}

func GetModelSupportEndpointTypes(model string) []constant.EndpointType {
	if model == "" {
		return make([]constant.EndpointType, 0)
	}
	modelSupportEndpointsLock.RLock()
	defer modelSupportEndpointsLock.RUnlock()
	if endpoints, ok := modelSupportEndpointTypes[model]; ok {
		return endpoints
	}
	return make([]constant.EndpointType, 0)
}

func updatePricing() {
	//modelRatios := common.GetModelRatios()
	enableAbilities, err := GetAllEnableAbilityWithChannels()
	if err != nil {
		common.SysLog(fmt.Sprintf("GetAllEnableAbilityWithChannels error: %v", err))
		return
	}
	// 预加载模型元数据与供应商一次，避免循环查询
	var allMeta []Model
	_ = DB.Find(&allMeta).Error
	metaMap := make(map[string]*Model)
	prefixList := make([]*Model, 0)
	suffixList := make([]*Model, 0)
	containsList := make([]*Model, 0)
	for i := range allMeta {
		m := &allMeta[i]
		if m.NameRule == NameRuleExact {
			metaMap[m.ModelName] = m
		} else {
			switch m.NameRule {
			case NameRulePrefix:
				prefixList = append(prefixList, m)
			case NameRuleSuffix:
				suffixList = append(suffixList, m)
			case NameRuleContains:
				containsList = append(containsList, m)
			}
		}
	}

	// 将非精确规则模型匹配到 metaMap
	for _, m := range prefixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasPrefix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range suffixList {
		for _, pricingModel := range enableAbilities {
			if strings.HasSuffix(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}
	for _, m := range containsList {
		for _, pricingModel := range enableAbilities {
			if strings.Contains(pricingModel.Model, m.ModelName) {
				if _, exists := metaMap[pricingModel.Model]; !exists {
					metaMap[pricingModel.Model] = m
				}
			}
		}
	}

	// 预加载供应商
	var vendors []Vendor
	_ = DB.Find(&vendors).Error
	vendorMap := make(map[int]*Vendor)
	for i := range vendors {
		vendorMap[vendors[i].Id] = &vendors[i]
	}

	// 初始化默认供应商映射
	initDefaultVendorMapping(metaMap, vendorMap, enableAbilities)

	// 构建对前端友好的供应商列表
	vendorsList = make([]PricingVendor, 0, len(vendorMap))
	for _, v := range vendorMap {
		vendorsList = append(vendorsList, PricingVendor{
			ID:          v.Id,
			Name:        NormalizeVendorName(v.Name, v.Icon),
			Description: v.Description,
			Icon:        v.Icon,
		})
	}

	modelGroupsMap := make(map[string]*types.Set[string])

	for _, ability := range enableAbilities {
		groups, ok := modelGroupsMap[ability.Model]
		if !ok {
			groups = types.NewSet[string]()
			modelGroupsMap[ability.Model] = groups
		}
		groups.Add(ability.Group)
	}

	//这里使用切片而不是Set，因为一个模型可能支持多个端点类型，并且第一个端点是优先使用端点
	modelSupportEndpointsStr := make(map[string][]string)

	// 先根据已有能力填充原生端点
	for _, ability := range enableAbilities {
		endpoints := modelSupportEndpointsStr[ability.Model]
		channelTypes := common.GetEndpointTypesByChannelType(ability.ChannelType, ability.Model)
		for _, channelType := range channelTypes {
			if !common.StringsContains(endpoints, string(channelType)) {
				endpoints = append(endpoints, string(channelType))
			}
		}
		modelSupportEndpointsStr[ability.Model] = endpoints
	}

	// 再补充模型自定义端点
	for modelName, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			endpoints := modelSupportEndpointsStr[modelName]
			for k := range raw {
				if !common.StringsContains(endpoints, k) {
					endpoints = append(endpoints, k)
				}
			}
			modelSupportEndpointsStr[modelName] = endpoints
		}
	}

	modelSupportEndpointTypes = make(map[string][]constant.EndpointType)
	for model, endpoints := range modelSupportEndpointsStr {
		supportedEndpoints := make([]constant.EndpointType, 0)
		for _, endpointStr := range endpoints {
			endpointType := constant.EndpointType(endpointStr)
			supportedEndpoints = append(supportedEndpoints, endpointType)
		}
		modelSupportEndpointTypes[model] = supportedEndpoints
	}

	// 构建全局 supportedEndpointMap（默认 + 自定义覆盖）
	supportedEndpointMap = make(map[string]common.EndpointInfo)
	// 1. 默认端点
	for _, endpoints := range modelSupportEndpointTypes {
		for _, et := range endpoints {
			if info, ok := common.GetDefaultEndpointInfo(et); ok {
				if _, exists := supportedEndpointMap[string(et)]; !exists {
					supportedEndpointMap[string(et)] = info
				}
			}
		}
	}
	// 2. 自定义端点（models 表）覆盖默认
	for _, meta := range metaMap {
		if strings.TrimSpace(meta.Endpoints) == "" {
			continue
		}
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(meta.Endpoints), &raw); err == nil {
			for k, v := range raw {
				switch val := v.(type) {
				case string:
					supportedEndpointMap[k] = common.EndpointInfo{Path: strings.TrimSpace(val), Method: "POST"}
				case map[string]interface{}:
					ep := common.EndpointInfo{Method: "POST"}
					if u, ok := val["uri"].(string); ok {
						ep.Path = strings.TrimSpace(u)
					}
					if ep.Path == "" {
						if p, ok := val["path"].(string); ok {
							ep.Path = strings.TrimSpace(p)
						}
					}
					if m, ok := val["method"].(string); ok {
						ep.Method = strings.ToUpper(m)
					}
					supportedEndpointMap[k] = ep
				default:
					// ignore unsupported types
				}
			}
		}
	}

	pricingMap = make([]Pricing, 0)
	for model, groups := range modelGroupsMap {
		pricing := Pricing{
			ModelName:              model,
			EnableGroup:            groups.Items(),
			SupportedEndpointTypes: modelSupportEndpointTypes[model],
		}

		// 补充模型元数据（描述、标签、供应商、状态）
		if meta, ok := metaMap[model]; ok {
			// 若模型被禁用(status!=1)，则直接跳过，不返回给前端
			if meta.Status != 1 {
				continue
			}
			pricing.DisplayName = meta.DisplayName
			pricing.Description = meta.Description
			pricing.Icon = meta.Icon
			pricing.Tags = meta.Tags
			pricing.VendorID = meta.VendorID
			pricing.InputTypes = splitCSV(meta.InputTypes)
			pricing.OutputTypes = splitCSV(meta.OutputTypes)
			pricing.EndpointSupport = parseEndpointSupport(meta.Endpoints)
			pricing.TotalContext = meta.TotalContext
			pricing.MaxOutput = meta.MaxOutput
		}
		modelPrice, findPrice := ratio_setting.GetModelPrice(model, false)
		if findPrice {
			pricing.ModelPrice = modelPrice
			pricing.QuotaType = 1
		} else {
			inputPrice, _, _ := pricing_setting.GetModelInputPrice(model)
			pricing.InputPrice = inputPrice
			if outputPrice, ok := pricing_setting.GetModelOutputPrice(model); ok {
				pricing.OutputPrice = outputPrice
			} else {
				// Backward-compatible fallback for models without explicit output pricing.
				pricing.OutputPrice = inputPrice * ratio_setting.GetCompletionRatio(model)
			}
			cacheReadPrice, hasCacheReadPrice := pricing_setting.GetModelCacheReadPrice(model)
			cacheWritePrice, hasCacheWritePrice := pricing_setting.GetModelCacheWritePrice(model)
			if hasCacheReadPrice && hasCacheWritePrice {
				pricing.CacheReadPrice = cacheReadPrice
				pricing.CacheWritePrice = cacheWritePrice
			}
			if p, ok := pricing_setting.GetModelImageInputPrice(model); ok {
				pricing.ImageInputPrice = p
			}
			if p, ok := pricing_setting.GetModelAudioInputPrice(model); ok {
				pricing.AudioInputPrice = p
			}
			if p, ok := pricing_setting.GetModelAudioOutputPrice(model); ok {
				pricing.AudioOutputPrice = p
			}
			if tiers, ok := pricing_setting.GetModelInputTokenPriceMultiplierTiers(model); ok {
				pricing.InputTokenPriceMultiplierTiers = tiers
			}
			if tiers, ok := pricing_setting.GetModelOutputTokenPriceMultiplierTiers(model); ok {
				pricing.OutputTokenPriceMultiplierTiers = tiers
			}
			pricing.QuotaType = 0
		}
		pricingMap = append(pricingMap, pricing)
	}

	// 刷新缓存映射，供高并发快速查询
	modelEnableGroupsLock.Lock()
	modelEnableGroups = make(map[string][]string)
	modelQuotaTypeMap = make(map[string]int)
	for _, p := range pricingMap {
		modelEnableGroups[p.ModelName] = p.EnableGroup
		modelQuotaTypeMap[p.ModelName] = p.QuotaType
	}
	modelEnableGroupsLock.Unlock()

	lastGetPricingTime = time.Now()
}

// GetSupportedEndpointMap 返回全局端点到路径的映射
func GetSupportedEndpointMap() map[string]common.EndpointInfo {
	return supportedEndpointMap
}
