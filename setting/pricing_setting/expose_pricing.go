package pricing_setting

import "sync/atomic"

var exposePricingEnabled atomic.Bool

func init() {
	exposePricingEnabled.Store(false)
}

func SetExposePricingEnabled(enabled bool) {
	exposePricingEnabled.Store(enabled)
}

func IsExposePricingEnabled() bool {
	return exposePricingEnabled.Load()
}
