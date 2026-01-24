package pricing_setting

import (
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

const exposedDataTTL = 30 * time.Second

type exposedCache struct {
	data      gin.H
	expiresAt time.Time
}

var (
	exposedData atomic.Value
	rebuildMu   sync.Mutex
)

func InvalidateExposedDataCache() {
	exposedData.Store((*exposedCache)(nil))
}

func cloneGinH(src gin.H) gin.H {
	dst := make(gin.H, len(src))
	for k, v := range src {
		dst[k] = v
	}
	return dst
}

func GetExposedData() gin.H {
	if c, ok := exposedData.Load().(*exposedCache); ok && c != nil && time.Now().Before(c.expiresAt) {
		return cloneGinH(c.data)
	}
	rebuildMu.Lock()
	defer rebuildMu.Unlock()
	if c, ok := exposedData.Load().(*exposedCache); ok && c != nil && time.Now().Before(c.expiresAt) {
		return cloneGinH(c.data)
	}
	newData := gin.H{
		"model_input_price":        GetModelInputPriceCopy(),
		"model_output_price":       GetModelOutputPriceCopy(),
		"model_cache_read_price":   GetModelCacheReadPriceCopy(),
		"model_cache_write_price":  GetModelCacheWritePriceCopy(),
		"model_image_input_price":  GetModelImageInputPriceCopy(),
		"model_audio_input_price":  GetModelAudioInputPriceCopy(),
		"model_audio_output_price": GetModelAudioOutputPriceCopy(),
		"model_price":              ratio_setting.GetModelPriceCopy(),
	}
	exposedData.Store(&exposedCache{
		data:      newData,
		expiresAt: time.Now().Add(exposedDataTTL),
	})
	return cloneGinH(newData)
}
