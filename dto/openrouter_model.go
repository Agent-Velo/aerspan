package dto

type OpenRouterModelPricing struct {
	Prompt          string `json:"prompt"`
	Completion      string `json:"completion"`
	Image           string `json:"image"`
	Request         string `json:"request"`
	InputCacheRead  string `json:"input_cache_read"`
	InputCacheWrite string `json:"input_cache_write"`
}

type OpenRouterModel struct {
	ID                          string                 `json:"id"`
	HuggingFaceID               string                 `json:"hugging_face_id"`
	Name                        string                 `json:"name"`
	Created                     int64                  `json:"created"`
	InputModalities             []string               `json:"input_modalities"`
	OutputModalities            []string               `json:"output_modalities"`
	Quantization                string                 `json:"quantization"`
	ContextLength               int                    `json:"context_length"`
	MaxOutputLength             int                    `json:"max_output_length"`
	Pricing                     OpenRouterModelPricing `json:"pricing"`
	SupportedSamplingParameters []string               `json:"supported_sampling_parameters"`
	SupportedFeatures           []string               `json:"supported_features"`
	Description                 string                 `json:"description,omitempty"`
	OpenRouter                  struct {
		Slug string `json:"slug"`
	} `json:"openrouter"`
}

type OpenRouterModelsResponse struct {
	Data []OpenRouterModel `json:"data"`
}
