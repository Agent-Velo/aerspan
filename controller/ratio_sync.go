package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/logger"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/pricing_setting"

	"github.com/gin-gonic/gin"
)

const (
	defaultTimeoutSeconds = 10
	defaultEndpoint       = "/api/pricing_config"
	maxConcurrentFetches  = 8
	maxRatioConfigBytes   = 10 << 20 // 10MB
	floatEpsilon          = 1e-9
)

func nearlyEqual(a, b float64) bool {
	if a > b {
		return a-b < floatEpsilon
	}
	return b-a < floatEpsilon
}

func valuesEqual(a, b interface{}) bool {
	af, aok := a.(float64)
	bf, bok := b.(float64)
	if aok && bok {
		return nearlyEqual(af, bf)
	}
	return a == b
}

var pricingTypes = []string{
	"model_input_price",
	"model_output_price",
	"model_cache_read_price",
	"model_image_input_price",
	"model_audio_input_price",
	"model_audio_output_price",
	"model_price",
}

type upstreamResult struct {
	Name string         `json:"name"`
	Data map[string]any `json:"data,omitempty"`
	Err  string         `json:"err,omitempty"`
}

func FetchUpstreamRatios(c *gin.Context) {
	var req dto.UpstreamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}

	if req.Timeout <= 0 {
		req.Timeout = defaultTimeoutSeconds
	}

	var upstreams []dto.UpstreamDTO

	if len(req.Upstreams) > 0 {
		for _, u := range req.Upstreams {
			if strings.HasPrefix(u.BaseURL, "http") {
				if u.Endpoint == "" {
					u.Endpoint = defaultEndpoint
				}
				u.BaseURL = strings.TrimRight(u.BaseURL, "/")
				upstreams = append(upstreams, u)
			}
		}
	} else if len(req.ChannelIDs) > 0 {
		intIds := make([]int, 0, len(req.ChannelIDs))
		for _, id64 := range req.ChannelIDs {
			intIds = append(intIds, int(id64))
		}
		dbChannels, err := model.GetChannelsByIds(intIds)
		if err != nil {
			logger.LogError(c.Request.Context(), "failed to query channels: "+err.Error())
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to load channels"})
			return
		}
		for _, ch := range dbChannels {
			if base := ch.GetBaseURL(); strings.HasPrefix(base, "http") {
				upstreams = append(upstreams, dto.UpstreamDTO{
					ID:       ch.Id,
					Name:     ch.Name,
					BaseURL:  strings.TrimRight(base, "/"),
					Endpoint: "",
				})
			}
		}
	}

	if len(upstreams) == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "No valid upstream channels"})
		return
	}

	var wg sync.WaitGroup
	ch := make(chan upstreamResult, len(upstreams))

	sem := make(chan struct{}, maxConcurrentFetches)

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{MaxIdleConns: 100, IdleConnTimeout: 90 * time.Second, TLSHandshakeTimeout: 10 * time.Second, ExpectContinueTimeout: 1 * time.Second, ResponseHeaderTimeout: 10 * time.Second}
	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
		}
		// 对 github.io 优先尝试 IPv4，失败则回退 IPv6
		if strings.HasSuffix(host, "github.io") {
			if conn, err := dialer.DialContext(ctx, "tcp4", addr); err == nil {
				return conn, nil
			}
			return dialer.DialContext(ctx, "tcp6", addr)
		}
		return dialer.DialContext(ctx, network, addr)
	}
	client := &http.Client{Transport: transport}

	for _, chn := range upstreams {
		wg.Add(1)
		go func(chItem dto.UpstreamDTO) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			endpoint := chItem.Endpoint
			var fullURL string
			if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
				fullURL = endpoint
			} else {
				if endpoint == "" {
					endpoint = defaultEndpoint
				} else if !strings.HasPrefix(endpoint, "/") {
					endpoint = "/" + endpoint
				}
				fullURL = chItem.BaseURL + endpoint
			}

			uniqueName := chItem.Name
			if chItem.ID != 0 {
				uniqueName = fmt.Sprintf("%s(%d)", chItem.Name, chItem.ID)
			}

			ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(req.Timeout)*time.Second)
			defer cancel()

			httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
			if err != nil {
				logger.LogWarn(c.Request.Context(), "build request failed: "+err.Error())
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			// 简单重试：最多 3 次，指数退避
			var resp *http.Response
			var lastErr error
			for attempt := 0; attempt < 3; attempt++ {
				resp, lastErr = client.Do(httpReq)
				if lastErr == nil {
					break
				}
				time.Sleep(time.Duration(200*(1<<attempt)) * time.Millisecond)
			}
			if lastErr != nil {
				logger.LogWarn(c.Request.Context(), "http error on "+chItem.Name+": "+lastErr.Error())
				ch <- upstreamResult{Name: uniqueName, Err: lastErr.Error()}
				return
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				logger.LogWarn(c.Request.Context(), "non-200 from "+chItem.Name+": "+resp.Status)
				ch <- upstreamResult{Name: uniqueName, Err: resp.Status}
				return
			}

			// Content-Type 和响应体大小校验
			if ct := resp.Header.Get("Content-Type"); ct != "" && !strings.Contains(strings.ToLower(ct), "application/json") {
				logger.LogWarn(c.Request.Context(), "unexpected content-type from "+chItem.Name+": "+ct)
			}
			limited := io.LimitReader(resp.Body, maxRatioConfigBytes)
			// 兼容两种上游接口格式：
			//  type1: /api/ratio_config -> data 为 map[string]any，包含 model_ratio/completion_ratio/cache_ratio/model_price
			//  type2: /api/pricing      -> data 为 []Pricing 列表，需要转换为与 type1 相同的 map 格式
			var body struct {
				Success bool            `json:"success"`
				Data    json.RawMessage `json:"data"`
				Message string          `json:"message"`
			}

			if err := json.NewDecoder(limited).Decode(&body); err != nil {
				logger.LogWarn(c.Request.Context(), "json decode failed from "+chItem.Name+": "+err.Error())
				ch <- upstreamResult{Name: uniqueName, Err: err.Error()}
				return
			}

			if !body.Success {
				ch <- upstreamResult{Name: uniqueName, Err: body.Message}
				return
			}

			// 若 Data 为空，将继续按 type1 尝试解析（与多数静态 pricing_config 兼容）

			// 尝试按 type1 解析
			var type1Data map[string]any
			if err := json.Unmarshal(body.Data, &type1Data); err == nil {
				// 如果包含至少一个 pricingTypes 字段，则认为是 type1
				isType1 := false
				for _, rt := range pricingTypes {
					if _, ok := type1Data[rt]; ok {
						isType1 = true
						break
					}
				}
				if isType1 {
					ch <- upstreamResult{Name: uniqueName, Data: type1Data}
					return
				}
			}

			// 如果不是 type1，则尝试按 type2 (/api/pricing) 解析
			var pricingItems []struct {
				ModelName        string  `json:"model_name"`
				QuotaType        int     `json:"quota_type"`
				InputPrice       float64 `json:"input_price"`
				OutputPrice      float64 `json:"output_price"`
				CacheReadPrice   float64 `json:"cache_read_price"`
				CacheWritePrice  float64 `json:"cache_write_price"`
				ImageInputPrice  float64 `json:"image_input_price"`
				AudioInputPrice  float64 `json:"audio_input_price"`
				AudioOutputPrice float64 `json:"audio_output_price"`
				ModelPrice       float64 `json:"model_price"`
			}
			if err := json.Unmarshal(body.Data, &pricingItems); err != nil {
				logger.LogWarn(c.Request.Context(), "unrecognized data format from "+chItem.Name+": "+err.Error())
				ch <- upstreamResult{Name: uniqueName, Err: "Failed to parse upstream response"}
				return
			}

			modelInputPriceMap := make(map[string]float64)
			modelOutputPriceMap := make(map[string]float64)
			modelCacheReadPriceMap := make(map[string]float64)
			modelCacheWritePriceMap := make(map[string]float64)
			modelImageInputPriceMap := make(map[string]float64)
			modelAudioInputPriceMap := make(map[string]float64)
			modelAudioOutputPriceMap := make(map[string]float64)
			modelPriceMap := make(map[string]float64)

			for _, item := range pricingItems {
				if item.QuotaType == 1 {
					modelPriceMap[item.ModelName] = item.ModelPrice
					continue
				}
				modelInputPriceMap[item.ModelName] = item.InputPrice
				modelOutputPriceMap[item.ModelName] = item.OutputPrice
				if item.CacheReadPrice != 0 {
					modelCacheReadPriceMap[item.ModelName] = item.CacheReadPrice
				}
				if item.CacheWritePrice != 0 {
					modelCacheWritePriceMap[item.ModelName] = item.CacheWritePrice
				}
				if item.ImageInputPrice != 0 {
					modelImageInputPriceMap[item.ModelName] = item.ImageInputPrice
				}
				if item.AudioInputPrice != 0 {
					modelAudioInputPriceMap[item.ModelName] = item.AudioInputPrice
				}
				if item.AudioOutputPrice != 0 {
					modelAudioOutputPriceMap[item.ModelName] = item.AudioOutputPrice
				}
			}

			converted := make(map[string]any)

			if len(modelInputPriceMap) > 0 {
				anyMap := make(map[string]any, len(modelInputPriceMap))
				for k, v := range modelInputPriceMap {
					anyMap[k] = v
				}
				converted["model_input_price"] = anyMap
			}
			if len(modelOutputPriceMap) > 0 {
				anyMap := make(map[string]any, len(modelOutputPriceMap))
				for k, v := range modelOutputPriceMap {
					anyMap[k] = v
				}
				converted["model_output_price"] = anyMap
			}
			if len(modelCacheReadPriceMap) > 0 {
				anyMap := make(map[string]any, len(modelCacheReadPriceMap))
				for k, v := range modelCacheReadPriceMap {
					anyMap[k] = v
				}
				converted["model_cache_read_price"] = anyMap
			}
			if len(modelCacheWritePriceMap) > 0 {
				anyMap := make(map[string]any, len(modelCacheWritePriceMap))
				for k, v := range modelCacheWritePriceMap {
					anyMap[k] = v
				}
				converted["model_cache_write_price"] = anyMap
			}
			if len(modelImageInputPriceMap) > 0 {
				anyMap := make(map[string]any, len(modelImageInputPriceMap))
				for k, v := range modelImageInputPriceMap {
					anyMap[k] = v
				}
				converted["model_image_input_price"] = anyMap
			}
			if len(modelAudioInputPriceMap) > 0 {
				anyMap := make(map[string]any, len(modelAudioInputPriceMap))
				for k, v := range modelAudioInputPriceMap {
					anyMap[k] = v
				}
				converted["model_audio_input_price"] = anyMap
			}
			if len(modelAudioOutputPriceMap) > 0 {
				anyMap := make(map[string]any, len(modelAudioOutputPriceMap))
				for k, v := range modelAudioOutputPriceMap {
					anyMap[k] = v
				}
				converted["model_audio_output_price"] = anyMap
			}

			if len(modelPriceMap) > 0 {
				priceAny := make(map[string]any, len(modelPriceMap))
				for k, v := range modelPriceMap {
					priceAny[k] = v
				}
				converted["model_price"] = priceAny
			}

			ch <- upstreamResult{Name: uniqueName, Data: converted}
		}(chn)
	}

	wg.Wait()
	close(ch)

	localData := pricing_setting.GetExposedData()

	var testResults []dto.TestResult
	var successfulChannels []struct {
		name string
		data map[string]any
	}

	for r := range ch {
		if r.Err != "" {
			testResults = append(testResults, dto.TestResult{
				Name:   r.Name,
				Status: "error",
				Error:  r.Err,
			})
		} else {
			testResults = append(testResults, dto.TestResult{
				Name:   r.Name,
				Status: "success",
			})
			successfulChannels = append(successfulChannels, struct {
				name string
				data map[string]any
			}{name: r.Name, data: r.Data})
		}
	}

	differences := buildDifferences(localData, successfulChannels)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"differences":  differences,
			"test_results": testResults,
		},
	})
}

func buildDifferences(localData map[string]any, successfulChannels []struct {
	name string
	data map[string]any
}) map[string]map[string]dto.DifferenceItem {
	differences := make(map[string]map[string]dto.DifferenceItem)

	allModels := make(map[string]struct{})

	for _, ratioType := range pricingTypes {
		if localRatioAny, ok := localData[ratioType]; ok {
			if localRatio, ok := localRatioAny.(map[string]float64); ok {
				for modelName := range localRatio {
					allModels[modelName] = struct{}{}
				}
			}
		}
	}

	for _, channel := range successfulChannels {
		for _, ratioType := range pricingTypes {
			if upstreamRatio, ok := channel.data[ratioType].(map[string]any); ok {
				for modelName := range upstreamRatio {
					allModels[modelName] = struct{}{}
				}
			}
		}
	}

	confidenceMap := make(map[string]map[string]bool)
	// 默认全部标记为可信（不同上游的定价口径差异较大，避免误判）
	for _, channel := range successfulChannels {
		confidenceMap[channel.name] = make(map[string]bool)
		for modelName := range allModels {
			confidenceMap[channel.name][modelName] = true
		}
	}

	for modelName := range allModels {
		for _, ratioType := range pricingTypes {
			var localValue interface{} = nil
			if localRatioAny, ok := localData[ratioType]; ok {
				if localRatio, ok := localRatioAny.(map[string]float64); ok {
					if val, exists := localRatio[modelName]; exists {
						localValue = val
					}
				}
			}

			upstreamValues := make(map[string]interface{})
			confidenceValues := make(map[string]bool)
			hasUpstreamValue := false
			hasDifference := false

			for _, channel := range successfulChannels {
				var upstreamValue interface{} = nil

				if upstreamRatio, ok := channel.data[ratioType].(map[string]any); ok {
					if val, exists := upstreamRatio[modelName]; exists {
						upstreamValue = val
						hasUpstreamValue = true

						if localValue != nil && !valuesEqual(localValue, val) {
							hasDifference = true
						} else if valuesEqual(localValue, val) {
							upstreamValue = "same"
						}
					}
				}
				if upstreamValue == nil && localValue == nil {
					upstreamValue = "same"
				}

				if localValue == nil && upstreamValue != nil && upstreamValue != "same" {
					hasDifference = true
				}

				upstreamValues[channel.name] = upstreamValue

				confidenceValues[channel.name] = confidenceMap[channel.name][modelName]
			}

			shouldInclude := false

			if localValue != nil {
				if hasDifference {
					shouldInclude = true
				}
			} else {
				if hasUpstreamValue {
					shouldInclude = true
				}
			}

			if shouldInclude {
				if differences[modelName] == nil {
					differences[modelName] = make(map[string]dto.DifferenceItem)
				}
				differences[modelName][ratioType] = dto.DifferenceItem{
					Current:    localValue,
					Upstreams:  upstreamValues,
					Confidence: confidenceValues,
				}
			}
		}
	}

	channelHasDiff := make(map[string]bool)
	for _, ratioMap := range differences {
		for _, item := range ratioMap {
			for chName, val := range item.Upstreams {
				if val != nil && val != "same" {
					channelHasDiff[chName] = true
				}
			}
		}
	}

	for modelName, ratioMap := range differences {
		for ratioType, item := range ratioMap {
			for chName := range item.Upstreams {
				if !channelHasDiff[chName] {
					delete(item.Upstreams, chName)
					delete(item.Confidence, chName)
				}
			}

			allSame := true
			for _, v := range item.Upstreams {
				if v != "same" {
					allSame = false
					break
				}
			}
			if len(item.Upstreams) == 0 || allSame {
				delete(ratioMap, ratioType)
			} else {
				differences[modelName][ratioType] = item
			}
		}

		if len(ratioMap) == 0 {
			delete(differences, modelName)
		}
	}

	return differences
}

func GetSyncableChannels(c *gin.Context) {
	channels, err := model.GetAllChannels(0, 0, true, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	var syncableChannels []dto.SyncableChannel
	for _, channel := range channels {
		if channel.GetBaseURL() != "" {
			syncableChannels = append(syncableChannels, dto.SyncableChannel{
				ID:      channel.Id,
				Name:    channel.Name,
				BaseURL: channel.GetBaseURL(),
				Status:  channel.Status,
			})
		}
	}

	syncableChannels = append(syncableChannels, dto.SyncableChannel{
		ID:      -100,
		Name:    "Official presets",
		BaseURL: "https://basellm.github.io",
		Status:  1,
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    syncableChannels,
	})
}
