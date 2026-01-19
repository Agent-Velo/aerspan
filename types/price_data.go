package types

import "fmt"

type GroupRatioInfo struct {
	GroupRatio        float64
	GroupSpecialRatio float64
	HasSpecialRatio   bool
}

type PriceData struct {
	FreeModel bool
	// ModelPrice is used for per-call billing (quota_type=1).
	ModelPrice float64

	// Token prices are used for per-token billing (quota_type=0) and are expressed in USD per 1M tokens.
	InputPrice           float64
	OutputPrice          float64
	CacheReadPrice       float64
	CacheCreationPrice   float64
	CacheCreation5mPrice float64
	CacheCreation1hPrice float64
	ImageInputPrice      float64
	AudioInputPrice      float64
	AudioOutputPrice     float64
	OtherRatios          map[string]float64
	UsePrice             bool
	QuotaToPreConsume    int // 预消耗额度
	GroupRatioInfo       GroupRatioInfo
}

func (p *PriceData) AddOtherRatio(key string, ratio float64) {
	if p.OtherRatios == nil {
		p.OtherRatios = make(map[string]float64)
	}
	if ratio <= 0 {
		return
	}
	p.OtherRatios[key] = ratio
}

type PerCallPriceData struct {
	ModelPrice     float64
	Quota          int
	GroupRatioInfo GroupRatioInfo
}

func (p *PriceData) ToSetting() string {
	return fmt.Sprintf("ModelPrice: %f, InputPrice: %f, OutputPrice: %f, CacheReadPrice: %f, CacheCreationPrice: %f, CacheCreation5mPrice: %f, CacheCreation1hPrice: %f, ImageInputPrice: %f, AudioInputPrice: %f, AudioOutputPrice: %f, GroupRatio: %f, UsePrice: %t, QuotaToPreConsume: %d", p.ModelPrice, p.InputPrice, p.OutputPrice, p.CacheReadPrice, p.CacheCreationPrice, p.CacheCreation5mPrice, p.CacheCreation1hPrice, p.ImageInputPrice, p.AudioInputPrice, p.AudioOutputPrice, p.GroupRatioInfo.GroupRatio, p.UsePrice, p.QuotaToPreConsume)
}
