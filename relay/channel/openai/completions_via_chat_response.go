package openai

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type openAICompletionsResponse struct {
	ID      string                     `json:"id"`
	Object  string                     `json:"object"`
	Created int64                      `json:"created"`
	Model   string                     `json:"model"`
	Choices []openAICompletionsChoice  `json:"choices"`
	Usage   dto.Usage                  `json:"usage"`
	Error   any                        `json:"error,omitempty"`
	Extra   map[string]json.RawMessage `json:"-"`
}

type openAICompletionsChoice struct {
	Text         string `json:"text"`
	Index        int    `json:"index"`
	Logprobs     any    `json:"logprobs"`
	FinishReason string `json:"finish_reason"`
}

type openAICompletionsStreamChunk struct {
	ID      string                       `json:"id"`
	Object  string                       `json:"object"`
	Created int64                        `json:"created"`
	Model   string                       `json:"model"`
	Choices []openAICompletionsChunkItem `json:"choices"`
}

type openAICompletionsChunkItem struct {
	Text         string  `json:"text"`
	Index        int     `json:"index"`
	Logprobs     any     `json:"logprobs"`
	FinishReason *string `json:"finish_reason"`
}

func parseCreatedUnix(created any) int64 {
	switch v := created.(type) {
	case int64:
		return v
	case int:
		return int64(v)
	case float64:
		return int64(v)
	case json.Number:
		if i, err := v.Int64(); err == nil {
			return i
		}
	case string:
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
	}
	return 0
}

func messageToCompletionText(message dto.Message, thinkingToContent bool) string {
	content := message.StringContent()
	if !thinkingToContent {
		return content
	}

	reasoning := message.ReasoningContent
	if reasoning == "" {
		reasoning = message.Reasoning
	}
	if reasoning == "" {
		return content
	}

	if content == "" {
		return "<think>\n" + reasoning + "\n</think>\n"
	}
	return "<think>\n" + reasoning + "\n</think>\n" + content
}

func OpenaiCompletionsViaChatHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	if common.DebugEnabled {
		println("upstream response body:", string(responseBody))
	}

	var chatResp dto.OpenAITextResponse
	if err := common.Unmarshal(responseBody, &chatResp); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	if oaiError := chatResp.GetOpenAIError(); oaiError != nil && oaiError.Type != "" {
		return nil, types.WithOpenAIError(*oaiError, resp.StatusCode, types.ErrOptionWithUpstreamError())
	}

	usage := chatResp.Usage
	if usage.PromptTokens == 0 {
		completionTokens := usage.CompletionTokens
		if completionTokens == 0 {
			for _, choice := range chatResp.Choices {
				text := messageToCompletionText(choice.Message, info.ChannelSetting.ThinkingToContent)
				completionTokens += service.CountTextToken(text, info.UpstreamModelName)
			}
		}
		usage = dto.Usage{
			PromptTokens:     info.GetEstimatePromptTokens(),
			CompletionTokens: completionTokens,
			TotalTokens:      info.GetEstimatePromptTokens() + completionTokens,
		}
	}

	applyUsagePostProcessing(info, &usage, responseBody)

	completionsResp := openAICompletionsResponse{
		ID:      completionsCompatibleID(chatResp.Id),
		Object:  "text_completion",
		Created: parseCreatedUnix(chatResp.Created),
		Model:   relaycommon.MaskMappedModelName(c, info, chatResp.Model),
		Choices: make([]openAICompletionsChoice, 0, len(chatResp.Choices)),
		Usage:   usage,
	}

	for _, choice := range chatResp.Choices {
		completionsResp.Choices = append(completionsResp.Choices, openAICompletionsChoice{
			Text:         messageToCompletionText(choice.Message, info.ChannelSetting.ThinkingToContent),
			Index:        choice.Index,
			Logprobs:     nil,
			FinishReason: choice.FinishReason,
		})
	}

	responseBody, err = common.Marshal(completionsResp)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	service.IOCopyBytesGracefully(c, resp, responseBody)
	return &usage, nil
}

func OaiCompletionsViaChatStreamHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		logger.LogError(c, "invalid response or response body")
		return nil, types.NewOpenAIError(fmt.Errorf("invalid response"), types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	defer service.CloseResponseBodyGracefully(resp)

	var (
		lastStreamData      string
		containStreamUsage  bool
		usage               = &dto.Usage{}
		responseTextBuilder strings.Builder
	)

	helper.StreamScannerHandler(c, resp, info, func(data string) bool {
		if data == "" {
			return true
		}
		lastStreamData = data

		var streamResp dto.ChatCompletionsStreamResponse
		if err := common.Unmarshal(common.StringToByteSlice(data), &streamResp); err != nil {
			logger.LogError(c, "failed to unmarshal chat completion chunk: "+err.Error())
			return false
		}

		if service.ValidUsage(streamResp.Usage) {
			containStreamUsage = true
			usage = streamResp.Usage
		}

		convertedChunks, chunkText := chatChunkToCompletionsChunks(c, info, streamResp)
		if chunkText != "" {
			responseTextBuilder.WriteString(chunkText)
		}
		for _, chunk := range convertedChunks {
			info.SendResponseCount++
			if err := helper.ObjectData(c, chunk); err != nil {
				logger.LogError(c, "failed to write completion chunk: "+err.Error())
				return false
			}
		}
		return true
	})

	if !containStreamUsage {
		usage = service.ResponseText2Usage(
			c,
			responseTextBuilder.String(),
			info.UpstreamModelName,
			info.GetEstimatePromptTokens(),
		)
	}

	applyUsagePostProcessing(info, usage, common.StringToByteSlice(lastStreamData))
	helper.Done(c)
	return usage, nil
}

func chatChunkToCompletionsChunks(c *gin.Context, info *relaycommon.RelayInfo, chatChunk dto.ChatCompletionsStreamResponse) ([]openAICompletionsStreamChunk, string) {
	if info == nil {
		return nil, ""
	}

	created := chatChunk.Created
	model := relaycommon.MaskMappedModelName(c, info, chatChunk.Model)
	id := completionsCompatibleID(chatChunk.Id)

	object := "text_completion"

	// When thinking_to_content is enabled, emulate the existing tag-injection behavior
	// from sendStreamData, but output as legacy completions chunks.
	hasThinkingContent := false
	hasContent := false
	var thinkingContent strings.Builder
	for _, choice := range chatChunk.Choices {
		if rc := choice.Delta.GetReasoningContent(); len(rc) > 0 {
			hasThinkingContent = true
			thinkingContent.WriteString(rc)
		}
		if cc := choice.Delta.GetContentString(); len(cc) > 0 {
			hasContent = true
		}
	}

	chunks := make([]openAICompletionsStreamChunk, 0, 2)
	var sentText strings.Builder

	if info.ChannelSetting.ThinkingToContent && info.ThinkingContentInfo.IsFirstThinkingContent {
		if hasThinkingContent {
			text := "<think>\n" + thinkingContent.String()
			chunk := openAICompletionsStreamChunk{
				ID:      id,
				Object:  object,
				Created: created,
				Model:   model,
				Choices: make([]openAICompletionsChunkItem, 0, len(chatChunk.Choices)),
			}
			for _, choice := range chatChunk.Choices {
				chunk.Choices = append(chunk.Choices, openAICompletionsChunkItem{
					Text:         text,
					Index:        choice.Index,
					Logprobs:     nil,
					FinishReason: nil,
				})
			}
			chunks = append(chunks, chunk)
			sentText.WriteString(text)
			info.ThinkingContentInfo.IsFirstThinkingContent = false
			info.ThinkingContentInfo.HasSentThinkingContent = true
			return chunks, sentText.String()
		}
	}

	// Insert closing tag before the first content token after thinking.
	if info.ChannelSetting.ThinkingToContent &&
		hasContent &&
		!info.ThinkingContentInfo.SendLastThinkingContent &&
		info.ThinkingContentInfo.HasSentThinkingContent {

		text := "\n</think>\n"
		chunk := openAICompletionsStreamChunk{
			ID:      id,
			Object:  object,
			Created: created,
			Model:   model,
			Choices: make([]openAICompletionsChunkItem, 0, len(chatChunk.Choices)),
		}
		for _, choice := range chatChunk.Choices {
			chunk.Choices = append(chunk.Choices, openAICompletionsChunkItem{
				Text:         text,
				Index:        choice.Index,
				Logprobs:     nil,
				FinishReason: nil,
			})
		}
		chunks = append(chunks, chunk)
		sentText.WriteString(text)
		info.ThinkingContentInfo.SendLastThinkingContent = true
	}

	// Convert the actual chunk.
	chunk := openAICompletionsStreamChunk{
		ID:      id,
		Object:  object,
		Created: created,
		Model:   model,
		Choices: make([]openAICompletionsChunkItem, 0, len(chatChunk.Choices)),
	}

	for _, choice := range chatChunk.Choices {
		var text string

		if info.ChannelSetting.ThinkingToContent {
			if rc := choice.Delta.GetReasoningContent(); rc != "" {
				text = rc
			} else {
				text = choice.Delta.GetContentString()
			}
		} else {
			text = choice.Delta.GetContentString()
		}

		chunk.Choices = append(chunk.Choices, openAICompletionsChunkItem{
			Text:         text,
			Index:        choice.Index,
			Logprobs:     nil,
			FinishReason: choice.FinishReason,
		})
		sentText.WriteString(text)
	}

	// Skip the leading assistant-role-only chunk(s) to avoid leaking chat-specific patterns.
	shouldSend := false
	for _, choice := range chunk.Choices {
		if choice.Text != "" || choice.FinishReason != nil {
			shouldSend = true
			break
		}
	}
	if shouldSend {
		chunks = append(chunks, chunk)
	}

	// Usage-only chunks are not part of legacy completions streaming; don't forward them.
	// We keep them for billing via `containStreamUsage` in the caller.
	if !shouldSend {
		sentText.Reset()
	}
	return chunks, sentText.String()
}
