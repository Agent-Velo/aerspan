package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/checkout/session"
	"github.com/stripe/stripe-go/v81/webhook"
)

const (
	PaymentMethodStripe = "stripe"
)

var stripeAdaptor = &StripeAdaptor{}

type StripePayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

type StripeAdaptor struct {
}

func (*StripeAdaptor) RequestAmount(c *gin.Context, req *StripePayRequest) {
	if req.Amount < getStripeMinTopup() {
		c.JSON(200, gin.H{"message": "error", "data": fmt.Sprintf("Top-up amount must be at least %d", getStripeMinTopup())})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "Failed to get user group"})
		return
	}
	payMoney := getStripePayMoney(float64(req.Amount), group)
	if payMoney <= 0.01 {
		c.JSON(200, gin.H{"message": "error", "data": "Amount is too low to charge"})
		return
	}
	c.JSON(200, gin.H{"message": "success", "data": strconv.FormatFloat(payMoney, 'f', 2, 64)})
}

func (*StripeAdaptor) RequestPay(c *gin.Context, req *StripePayRequest) {
	if req.PaymentMethod != PaymentMethodStripe {
		c.JSON(200, gin.H{"message": "error", "data": "Unsupported payment method"})
		return
	}
	if req.Amount < getStripeMinTopup() {
		c.JSON(200, gin.H{"message": fmt.Sprintf("Top-up amount must be at least %d", getStripeMinTopup()), "data": 10})
		return
	}
	if req.Amount > 10000 {
		c.JSON(200, gin.H{"message": "Top-up amount cannot exceed 10000", "data": 10})
		return
	}

	id := c.GetInt("id")
	user, _ := model.GetUserById(id, false)
	chargedMoney := GetChargedAmount(float64(req.Amount), *user)

	tradeNo, payLink, err := genStripeLink(user.StripeCustomer, user.Email, req.Amount)
	if err != nil {
		log.Println("failed to get Stripe Checkout URL", err)
		c.JSON(200, gin.H{"message": "error", "data": "Failed to start checkout"})
		return
	}

	topUp := &model.TopUp{
		UserId:        id,
		Amount:        req.Amount,
		Money:         chargedMoney,
		TradeNo:       tradeNo,
		PaymentMethod: PaymentMethodStripe,
		CreateTime:    time.Now().Unix(),
		Status:        common.TopUpStatusPending,
	}
	err = topUp.Insert()
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "Failed to create order"})
		return
	}
	c.JSON(200, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_link": payLink,
		},
	})
}

func RequestStripeAmount(c *gin.Context) {
	var req StripePayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "Invalid parameters"})
		return
	}
	stripeAdaptor.RequestAmount(c, &req)
}

func RequestStripePay(c *gin.Context) {
	var req StripePayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(200, gin.H{"message": "error", "data": "Invalid parameters"})
		return
	}
	stripeAdaptor.RequestPay(c, &req)
}

func StripeWebhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		log.Printf("Failed to parse Stripe webhook payload: %v\n", err)
		c.AbortWithStatus(http.StatusServiceUnavailable)
		return
	}

	signature := c.GetHeader("Stripe-Signature")
	endpointSecret := setting.StripeWebhookSecret
	event, err := webhook.ConstructEventWithOptions(payload, signature, endpointSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})

	if err != nil {
		log.Printf("Stripe webhook signature verification failed: %v\n", err)
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}

	switch event.Type {
	case stripe.EventTypeCheckoutSessionCompleted:
		sessionCompleted(event)
	case stripe.EventTypeCheckoutSessionExpired:
		sessionExpired(event)
	case stripe.EventTypePaymentIntentSucceeded:
		paymentIntentSucceeded(event)
	case stripe.EventTypePaymentIntentPaymentFailed:
		paymentIntentFailed(event)
	case stripe.EventTypeSetupIntentSucceeded:
		setupIntentSucceeded(event)
	default:
		log.Printf("Unsupported Stripe webhook event type: %s\n", event.Type)
	}

	c.Status(http.StatusOK)
}

func sessionCompleted(event stripe.Event) {
	customerId := event.GetObjectValue("customer")
	tradeNo := event.GetObjectValue("id")
	legacyReferenceId := event.GetObjectValue("client_reference_id")
	status := event.GetObjectValue("status")
	if "complete" != status {
		log.Println("Unexpected Stripe Checkout completion status:", status, ",", tradeNo)
		return
	}

	err := model.Recharge(tradeNo, customerId)
	if err != nil && legacyReferenceId != "" {
		// Backward compatibility: older orders stored client_reference_id as trade_no.
		err = model.Recharge(legacyReferenceId, customerId)
	}
	if err != nil {
		log.Println(err.Error(), tradeNo)
		return
	}

	total, _ := strconv.ParseFloat(event.GetObjectValue("amount_total"), 64)
	currency := strings.ToUpper(event.GetObjectValue("currency"))
	log.Printf("Payment received: %s, %.2f (%s)", tradeNo, total/100, currency)
}

func sessionExpired(event stripe.Event) {
	tradeNo := event.GetObjectValue("id")
	legacyReferenceId := event.GetObjectValue("client_reference_id")
	status := event.GetObjectValue("status")
	if "expired" != status {
		log.Println("Unexpected Stripe Checkout expiration status:", status, ",", tradeNo)
		return
	}

	if tradeNo == "" && legacyReferenceId == "" {
		log.Println("Missing Stripe Checkout session ID")
		return
	}

	if tradeNo == "" {
		tradeNo = legacyReferenceId
	}

	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil && legacyReferenceId != "" {
		// Backward compatibility: older orders stored client_reference_id as trade_no.
		topUp = model.GetTopUpByTradeNo(legacyReferenceId)
		tradeNo = legacyReferenceId
	}
	if topUp == nil {
		log.Println("Top-up order not found", tradeNo)
		return
	}

	if topUp.Status != common.TopUpStatusPending {
		log.Println("Invalid top-up order status", tradeNo)
	}

	topUp.Status = common.TopUpStatusExpired
	err := topUp.Update()
	if err != nil {
		log.Println("Failed to expire top-up order", tradeNo, ", err:", err.Error())
		return
	}

	log.Println("Top-up order expired", tradeNo)
}

func paymentIntentSucceeded(event stripe.Event) {
	var pi stripe.PaymentIntent
	if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
		log.Printf("Failed to parse Stripe PaymentIntent payload: %v\n", err)
		return
	}

	customerID := ""
	if pi.Customer != nil {
		customerID = pi.Customer.ID
	}
	tradeNo := pi.ID
	legacyReferenceID := ""
	if pi.Metadata != nil {
		legacyReferenceID = pi.Metadata["reference_id"]
	}
	if tradeNo == "" && legacyReferenceID == "" {
		log.Println("Missing Stripe PaymentIntent ID")
		return
	}
	if tradeNo == "" {
		tradeNo = legacyReferenceID
	}

	err := model.Recharge(tradeNo, customerID)
	if err != nil && legacyReferenceID != "" {
		// Backward compatibility: older orders stored reference_id as trade_no.
		err = model.Recharge(legacyReferenceID, customerID)
		tradeNo = legacyReferenceID
	}
	if err != nil {
		log.Println(err.Error(), tradeNo)
		return
	}

	currency := strings.ToUpper(string(pi.Currency))
	// Note: This assumes a 2-decimal currency. If you use a zero-decimal currency, adjust accordingly.
	log.Printf("Payment received: %s, %.2f (%s)", tradeNo, float64(pi.Amount)/100, currency)
}

func paymentIntentFailed(event stripe.Event) {
	var pi stripe.PaymentIntent
	if err := json.Unmarshal(event.Data.Raw, &pi); err != nil {
		log.Printf("Failed to parse Stripe PaymentIntent payload: %v\n", err)
		return
	}

	tradeNo := pi.ID
	legacyReferenceID := ""
	if pi.Metadata != nil {
		legacyReferenceID = pi.Metadata["reference_id"]
	}
	if tradeNo == "" && legacyReferenceID == "" {
		log.Println("Missing Stripe PaymentIntent ID")
		return
	}

	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil && legacyReferenceID != "" {
		// Backward compatibility: older orders stored reference_id as trade_no.
		topUp = model.GetTopUpByTradeNo(legacyReferenceID)
		tradeNo = legacyReferenceID
	}
	if topUp == nil {
		log.Println("Top-up order not found", tradeNo)
		return
	}
	if topUp.Status != common.TopUpStatusPending {
		return
	}

	topUp.Status = common.TopUpStatusFailed
	if err := topUp.Update(); err != nil {
		log.Println("Failed to mark top-up order failed", tradeNo, ", err:", err.Error())
		return
	}
	log.Println("Top-up order failed", tradeNo)
}

func setupIntentSucceeded(event stripe.Event) {
	var si stripe.SetupIntent
	if err := json.Unmarshal(event.Data.Raw, &si); err != nil {
		log.Printf("Failed to parse Stripe SetupIntent payload: %v\n", err)
		return
	}

	userIDStr := ""
	if si.Metadata != nil {
		userIDStr = si.Metadata["user_id"]
	}
	if userIDStr == "" {
		// SetupIntents can be created outside this app; ignore.
		return
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		log.Printf("Invalid user_id in Stripe SetupIntent metadata: %s", userIDStr)
		return
	}

	pmID := ""
	if si.PaymentMethod != nil {
		pmID = si.PaymentMethod.ID
	}
	if pmID == "" {
		log.Printf("Missing payment_method in Stripe SetupIntent: %s", si.ID)
		return
	}

	user, err := model.GetUserById(userID, false)
	if err != nil {
		log.Printf("Failed to load user %d for Stripe SetupIntent: %v", userID, err)
		return
	}

	// Keep stripe_customer synced.
	if user.StripeCustomer == "" && si.Customer != nil {
		user.StripeCustomer = si.Customer.ID
	}

	currentSetting := user.GetSetting()
	if currentSetting.StripeDefaultPaymentMethodID == "" {
		currentSetting.StripeDefaultPaymentMethodID = pmID
	}
	if currentSetting.StripeAutoTopUpPaymentMethodID == "" {
		currentSetting.StripeAutoTopUpPaymentMethodID = pmID
	}
	user.SetSetting(currentSetting)
	if err := user.Update(false); err != nil {
		log.Printf("Failed to update user %d Stripe setting after SetupIntent: %v", userID, err)
		return
	}
}

func genStripeLink(customerId string, email string, amount int64) (string, string, error) {
	if !strings.HasPrefix(setting.StripeApiSecret, "sk_") && !strings.HasPrefix(setting.StripeApiSecret, "rk_") {
		return "", "", fmt.Errorf("invalid Stripe API key")
	}

	stripe.Key = setting.StripeApiSecret

	params := &stripe.CheckoutSessionParams{
		SuccessURL: stripe.String(system_setting.ServerAddress + "/console/log"),
		CancelURL:  stripe.String(system_setting.ServerAddress + "/console/topup"),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(setting.StripePriceId),
				Quantity: stripe.Int64(amount),
			},
		},
		Mode:                stripe.String(string(stripe.CheckoutSessionModePayment)),
		AllowPromotionCodes: stripe.Bool(setting.StripePromotionCodesEnabled),
	}

	if "" == customerId {
		if "" != email {
			params.CustomerEmail = stripe.String(email)
		}

		params.CustomerCreation = stripe.String(string(stripe.CheckoutSessionCustomerCreationAlways))
	} else {
		params.Customer = stripe.String(customerId)
	}

	result, err := session.New(params)
	if err != nil {
		return "", "", err
	}

	return result.ID, result.URL, nil
}

func GetChargedAmount(count float64, user model.User) float64 {
	return service.StripeChargedAmount(count, user)
}

func getStripePayMoney(amount float64, group string) float64 {
	return service.StripePayMoney(amount, group)
}

func getStripeMinTopup() int64 {
	return service.StripeMinTopup()
}
