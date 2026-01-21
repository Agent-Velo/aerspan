package model

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	NameRuleExact = iota
	NameRulePrefix
	NameRuleContains
	NameRuleSuffix
)

type BoundChannel struct {
	Name string `json:"name"`
	Type int    `json:"type"`
}

type Model struct {
	Id           int    `json:"id"`
	ModelName    string `json:"model_name" gorm:"size:128;not null;uniqueIndex:uk_model_name_delete_at,priority:1"`
	DisplayName  string `json:"display_name,omitempty" gorm:"size:128"`
	Description  string `json:"description,omitempty" gorm:"type:text"`
	Icon         string `json:"icon,omitempty" gorm:"type:varchar(128)"`
	Tags         string `json:"tags,omitempty" gorm:"type:varchar(255)"`
	VendorID     int    `json:"vendor_id,omitempty" gorm:"index"`
	Endpoints    string `json:"endpoints,omitempty" gorm:"type:text"`
	InputTypes   string `json:"input_types,omitempty" gorm:"type:varchar(255)"`
	OutputTypes  string `json:"output_types,omitempty" gorm:"type:varchar(255)"`
	TotalContext *int   `json:"total_context,omitempty"`
	MaxOutput    *int   `json:"max_output,omitempty"`

	// OpenRouter model metadata for /v1/models/openrouter.
	//
	// Note: list fields are stored as comma-separated strings.
	OpenRouterHuggingFaceID               string `json:"openrouter_hugging_face_id,omitempty" gorm:"type:varchar(255)"`
	OpenRouterCreated                     *int64 `json:"openrouter_created,omitempty" gorm:"type:bigint"`
	OpenRouterInputModalities             string `json:"openrouter_input_modalities,omitempty" gorm:"type:text"`
	OpenRouterOutputModalities            string `json:"openrouter_output_modalities,omitempty" gorm:"type:text"`
	OpenRouterQuantization                string `json:"openrouter_quantization,omitempty" gorm:"type:varchar(64)"`
	OpenRouterPricingPrompt               string `json:"openrouter_pricing_prompt,omitempty" gorm:"type:varchar(32)"`
	OpenRouterPricingCompletion           string `json:"openrouter_pricing_completion,omitempty" gorm:"type:varchar(32)"`
	OpenRouterPricingImage                string `json:"openrouter_pricing_image,omitempty" gorm:"type:varchar(32)"`
	OpenRouterPricingRequest              string `json:"openrouter_pricing_request,omitempty" gorm:"type:varchar(32)"`
	OpenRouterPricingInputCacheRead       string `json:"openrouter_pricing_input_cache_read,omitempty" gorm:"type:varchar(32)"`
	OpenRouterPricingInputCacheWrite      string `json:"openrouter_pricing_input_cache_write,omitempty" gorm:"type:varchar(32)"`
	OpenRouterSupportedSamplingParameters string `json:"openrouter_supported_sampling_parameters,omitempty" gorm:"type:text"`
	OpenRouterSupportedFeatures           string `json:"openrouter_supported_features,omitempty" gorm:"type:text"`
	OpenRouterSlug                        string `json:"openrouter_slug,omitempty" gorm:"type:varchar(255)"`

	Status       int            `json:"status" gorm:"default:1"`
	SyncOfficial int            `json:"sync_official" gorm:"default:1"`
	CreatedTime  int64          `json:"created_time" gorm:"bigint"`
	UpdatedTime  int64          `json:"updated_time" gorm:"bigint"`
	DeletedAt    gorm.DeletedAt `json:"-" gorm:"index;uniqueIndex:uk_model_name_delete_at,priority:2"`

	BoundChannels []BoundChannel `json:"bound_channels,omitempty" gorm:"-"`
	EnableGroups  []string       `json:"enable_groups,omitempty" gorm:"-"`
	QuotaTypes    []int          `json:"quota_types,omitempty" gorm:"-"`
	NameRule      int            `json:"name_rule" gorm:"default:0"`

	MatchedModels []string `json:"matched_models,omitempty" gorm:"-"`
	MatchedCount  int      `json:"matched_count,omitempty" gorm:"-"`
}

func (mi *Model) Insert() error {
	now := common.GetTimestamp()
	mi.CreatedTime = now
	mi.UpdatedTime = now
	return DB.Create(mi).Error
}

func IsModelNameDuplicated(id int, name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	var cnt int64
	err := DB.Model(&Model{}).Where("model_name = ? AND id <> ?", name, id).Count(&cnt).Error
	return cnt > 0, err
}

func (mi *Model) Update() error {
	mi.UpdatedTime = common.GetTimestamp()
	return DB.Session(&gorm.Session{AllowGlobalUpdate: false, FullSaveAssociations: false}).
		Model(&Model{}).
		Where("id = ?", mi.Id).
		Omit("created_time").
		Select("*").
		Updates(mi).Error
}

func (mi *Model) Delete() error {
	return DB.Delete(mi).Error
}

func GetVendorModelCounts() (map[int64]int64, error) {
	var stats []struct {
		VendorID int64
		Count    int64
	}
	if err := DB.Model(&Model{}).
		Select("vendor_id as vendor_id, count(*) as count").
		Group("vendor_id").
		Scan(&stats).Error; err != nil {
		return nil, err
	}
	m := make(map[int64]int64, len(stats))
	for _, s := range stats {
		m[s.VendorID] = s.Count
	}
	return m, nil
}

func GetAllModels(offset int, limit int) ([]*Model, error) {
	var models []*Model
	err := DB.Order("id DESC").Offset(offset).Limit(limit).Find(&models).Error
	return models, err
}

func GetBoundChannelsByModelsMap(modelNames []string) (map[string][]BoundChannel, error) {
	result := make(map[string][]BoundChannel)
	if len(modelNames) == 0 {
		return result, nil
	}
	type row struct {
		Model string
		Name  string
		Type  int
	}
	var rows []row
	err := DB.Table("channels").
		Select("abilities.model as model, channels.name as name, channels.type as type").
		Joins("JOIN abilities ON abilities.channel_id = channels.id").
		Where("abilities.model IN ? AND abilities.enabled = ?", modelNames, true).
		Distinct().
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		result[r.Model] = append(result[r.Model], BoundChannel{Name: r.Name, Type: r.Type})
	}
	return result, nil
}

func SearchModels(keyword string, vendor string, offset int, limit int) ([]*Model, int64, error) {
	var models []*Model
	db := DB.Model(&Model{})
	if keyword != "" {
		like := "%" + keyword + "%"
		db = db.Where("model_name LIKE ? OR display_name LIKE ? OR description LIKE ? OR tags LIKE ?", like, like, like, like)
	}
	if vendor != "" {
		if vid, err := strconv.Atoi(vendor); err == nil {
			db = db.Where("models.vendor_id = ?", vid)
		} else {
			db = db.Joins("JOIN vendors ON vendors.id = models.vendor_id").Where("vendors.name LIKE ?", "%"+vendor+"%")
		}
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if err := db.Order("models.id DESC").Offset(offset).Limit(limit).Find(&models).Error; err != nil {
		return nil, 0, err
	}
	return models, total, nil
}
