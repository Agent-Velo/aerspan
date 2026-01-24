package pricing_setting

import "testing"

func TestGetModelTokenPriceTierMultipliersByInputTokens_OutputMatchedByInputTokens(t *testing.T) {
	InitPricingSettings()

	modelOutputTokenTierMapMutex.Lock()
	modelOutputTokenTierMap = map[string][]TokenPriceTier{
		"glm-4.6": {
			{Min: 200000, Multiplier: 2},
		},
	}
	modelOutputTokenTierMapMutex.Unlock()

	in, out, inMatched, outMatched := GetModelTokenPriceTierMultipliersByInputTokens("glm-4.6", 199999)
	if in != 1 || inMatched {
		t.Fatalf("unexpected input multiplier: got (%v, %v), want (1, false)", in, inMatched)
	}
	if out != 1 || outMatched {
		t.Fatalf("unexpected output multiplier below threshold: got (%v, %v), want (1, false)", out, outMatched)
	}

	in, out, inMatched, outMatched = GetModelTokenPriceTierMultipliersByInputTokens("glm-4.6", 200000)
	if in != 1 || inMatched {
		t.Fatalf("unexpected input multiplier: got (%v, %v), want (1, false)", in, inMatched)
	}
	if out != 2 || !outMatched {
		t.Fatalf("unexpected output multiplier at threshold: got (%v, %v), want (2, true)", out, outMatched)
	}
}

func TestGetModelTokenPriceTierMultipliersByInputTokens_InputAndOutputBothAffected(t *testing.T) {
	InitPricingSettings()

	modelInputTokenTierMapMutex.Lock()
	modelInputTokenTierMap = map[string][]TokenPriceTier{
		"glm-4.6": {
			{Min: 200000, Multiplier: 2},
		},
	}
	modelInputTokenTierMapMutex.Unlock()

	modelOutputTokenTierMapMutex.Lock()
	modelOutputTokenTierMap = map[string][]TokenPriceTier{
		"glm-4.6": {
			{Min: 200000, Multiplier: 2},
		},
	}
	modelOutputTokenTierMapMutex.Unlock()

	in, out, inMatched, outMatched := GetModelTokenPriceTierMultipliersByInputTokens("glm-4.6", 200000)
	if in != 2 || !inMatched {
		t.Fatalf("unexpected input multiplier at threshold: got (%v, %v), want (2, true)", in, inMatched)
	}
	if out != 2 || !outMatched {
		t.Fatalf("unexpected output multiplier at threshold: got (%v, %v), want (2, true)", out, outMatched)
	}
}

