package common

import (
	appcommon "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

func shouldMaskMappedModel(info *RelayInfo) bool {
	if info == nil || info.ChannelMeta == nil {
		return false
	}
	return info.ChannelMeta.IsModelMapped
}

// OriginalRequestModelName returns the model name as requested by the client
// before any model mapping happens.
func OriginalRequestModelName(c *gin.Context, info *RelayInfo) string {
	if c != nil {
		model := appcommon.GetContextKeyString(c, constant.ContextKeyOriginalModel)
		if model != "" {
			return model
		}
	}
	if info != nil {
		return info.OriginModelName
	}
	return ""
}

// MaskMappedModelName returns original model name when model mapping is enabled,
// otherwise returns the provided model.
func MaskMappedModelName(c *gin.Context, info *RelayInfo, model string) string {
	if !shouldMaskMappedModel(info) {
		return model
	}
	original := OriginalRequestModelName(c, info)
	if original == "" {
		return model
	}
	return original
}

// ReplaceJSONValueIfExistsBytes sets a JSON path if it already exists.
// It returns the original payload on errors.
func ReplaceJSONValueIfExistsBytes(payload []byte, path string, value any) []byte {
	if len(payload) == 0 || path == "" {
		return payload
	}
	if !gjson.GetBytes(payload, path).Exists() {
		return payload
	}
	out, err := sjson.SetBytes(payload, path, value)
	if err != nil {
		return payload
	}
	return out
}

// ReplaceJSONValueIfExistsString sets a JSON path if it already exists.
// It returns the original payload on errors.
func ReplaceJSONValueIfExistsString(payload string, path string, value any) string {
	if payload == "" || path == "" {
		return payload
	}
	if !gjson.Get(payload, path).Exists() {
		return payload
	}
	out, err := sjson.Set(payload, path, value)
	if err != nil {
		return payload
	}
	return out
}

// MaskJSONModelFieldIfMapped rewrites the JSON model field (or nested path) to
// the original requested model when model mapping is enabled.
func MaskJSONModelFieldIfMapped(c *gin.Context, info *RelayInfo, payload []byte, path string) []byte {
	if !shouldMaskMappedModel(info) {
		return payload
	}
	original := OriginalRequestModelName(c, info)
	if original == "" {
		return payload
	}
	return ReplaceJSONValueIfExistsBytes(payload, path, original)
}

// MaskJSONModelFieldIfMappedString rewrites the JSON model field (or nested path) to
// the original requested model when model mapping is enabled.
func MaskJSONModelFieldIfMappedString(c *gin.Context, info *RelayInfo, payload string, path string) string {
	if !shouldMaskMappedModel(info) {
		return payload
	}
	original := OriginalRequestModelName(c, info)
	if original == "" {
		return payload
	}
	return ReplaceJSONValueIfExistsString(payload, path, original)
}
