package setting

var StripeApiSecret = ""

// StripePublishableKey is used by Stripe.js / Stripe Elements on the client.
// It is safe to expose to authenticated users.
var StripePublishableKey = ""
var StripeWebhookSecret = ""
var StripePriceId = ""
var StripeUnitPrice = 8.0
var StripeMinTopUp = 1
var StripePromotionCodesEnabled = false

// StripeCurrency is the currency code used when creating PaymentIntents.
// If empty, the server will try to infer it from StripePriceId, falling back to "usd".
// Example values: "usd", "cny".
var StripeCurrency = ""
