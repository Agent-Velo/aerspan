package controller

import (
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/stripe/stripe-go/v81"
	"github.com/stripe/stripe-go/v81/customer"
	"github.com/stripe/stripe-go/v81/paymentintent"
	"github.com/stripe/stripe-go/v81/paymentmethod"
	"github.com/stripe/stripe-go/v81/setupintent"
	"github.com/thanhpk/randstr"
)

type stripeSetupIntentResponse struct {
	ClientSecret string `json:"client_secret"`
}

type stripePaymentMethodCard struct {
	ID       string `json:"id"`
	Brand    string `json:"brand"`
	Last4    string `json:"last4"`
	ExpMonth int64  `json:"exp_month"`
	ExpYear  int64  `json:"exp_year"`
}

type stripePaymentMethodsResponse struct {
	DefaultPaymentMethodID string                    `json:"default_payment_method_id"`
	PaymentMethods         []stripePaymentMethodCard `json:"payment_methods"`
}

type stripeSetDefaultPaymentMethodRequest struct {
	PaymentMethodID string `json:"payment_method_id"`
}

type stripeCreatePaymentIntentRequest struct {
	Amount          int64  `json:"amount"`
	PaymentMethodID string `json:"payment_method_id,omitempty"`
}

type stripeCreatePaymentIntentResponse struct {
	TradeNo         string `json:"trade_no"`
	ReferenceID     string `json:"reference_id"`
	PaymentIntentID string `json:"payment_intent_id"`
	Status          string `json:"status"`
	ClientSecret    string `json:"client_secret,omitempty"`
}

type stripeAutoTopupResponse struct {
	Enabled         bool   `json:"enabled"`
	Threshold       int64  `json:"threshold"`
	Amount          int64  `json:"amount"`
	PaymentMethodID string `json:"payment_method_id"`
}

type stripeAutoTopupUpdateRequest struct {
	Enabled         bool   `json:"enabled"`
	Threshold       int64  `json:"threshold"`
	Amount          int64  `json:"amount"`
	PaymentMethodID string `json:"payment_method_id"`
}

func validateStripeElementsConfig() error {
	return service.ValidateStripeElementsConfig()
}

func getStripeCurrency() string {
	return service.StripeCurrency()
}

func ensureStripeCustomerForUser(user *model.User) (string, error) {
	return service.EnsureStripeCustomerForUser(user)
}

func stripeMinorUnits(amount float64) (int64, error) {
	if amount <= 0 {
		return 0, errors.New("invalid amount")
	}
	// Stripe uses the smallest currency unit (e.g. cents for usd/cny).
	cents := decimal.NewFromFloat(amount).Mul(decimal.NewFromInt(100)).Round(0).IntPart()
	if cents <= 0 {
		return 0, errors.New("amount too small")
	}
	return cents, nil
}

func CreateStripeSetupIntent(c *gin.Context) {
	if err := validateStripeElementsConfig(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	customerID, err := ensureStripeCustomerForUser(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	params := &stripe.SetupIntentParams{
		Customer: stripe.String(customerID),
		PaymentMethodTypes: []*string{
			stripe.String("card"),
		},
		Usage: stripe.String(string(stripe.SetupIntentUsageOffSession)),
	}
	params.AddMetadata("user_id", strconv.Itoa(userID))

	si, err := setupintent.New(params)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stripeSetupIntentResponse{ClientSecret: si.ClientSecret})
}

func ListStripePaymentMethods(c *gin.Context) {
	if err := validateStripeElementsConfig(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userSetting := user.GetSetting()

	if user.StripeCustomer == "" {
		common.ApiSuccess(c, stripePaymentMethodsResponse{
			DefaultPaymentMethodID: userSetting.StripeDefaultPaymentMethodID,
			PaymentMethods:         []stripePaymentMethodCard{},
		})
		return
	}

	params := &stripe.PaymentMethodListParams{
		Customer: stripe.String(user.StripeCustomer),
		Type:     stripe.String("card"),
	}
	iter := paymentmethod.List(params)
	methods := make([]stripePaymentMethodCard, 0)
	for iter.Next() {
		pm := iter.PaymentMethod()
		if pm == nil || pm.Card == nil {
			continue
		}
		methods = append(methods, stripePaymentMethodCard{
			ID:       pm.ID,
			Brand:    string(pm.Card.Brand),
			Last4:    pm.Card.Last4,
			ExpMonth: pm.Card.ExpMonth,
			ExpYear:  pm.Card.ExpYear,
		})
	}
	if err := iter.Err(); err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, stripePaymentMethodsResponse{
		DefaultPaymentMethodID: userSetting.StripeDefaultPaymentMethodID,
		PaymentMethods:         methods,
	})
}

func SetStripeDefaultPaymentMethod(c *gin.Context) {
	if err := validateStripeElementsConfig(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	var req stripeSetDefaultPaymentMethodRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.PaymentMethodID == "" {
		common.ApiErrorMsg(c, "Invalid parameters")
		return
	}
	if !strings.HasPrefix(req.PaymentMethodID, "pm_") {
		common.ApiErrorMsg(c, "Invalid payment method")
		return
	}

	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	customerID, err := ensureStripeCustomerForUser(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pm, err := paymentmethod.Get(req.PaymentMethodID, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if pm.Customer == nil || pm.Customer.ID != customerID {
		common.ApiErrorMsg(c, "Payment method does not belong to this customer")
		return
	}

	// Best-effort set Stripe's customer-level default.
	_, _ = customer.Update(customerID, &stripe.CustomerParams{
		InvoiceSettings: &stripe.CustomerInvoiceSettingsParams{
			DefaultPaymentMethod: stripe.String(req.PaymentMethodID),
		},
	})

	currentSetting := user.GetSetting()
	currentSetting.StripeDefaultPaymentMethodID = req.PaymentMethodID
	user.SetSetting(currentSetting)
	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func DeleteStripePaymentMethod(c *gin.Context) {
	if err := validateStripeElementsConfig(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	paymentMethodID := strings.TrimSpace(c.Param("id"))
	if paymentMethodID == "" {
		common.ApiErrorMsg(c, "Invalid parameters")
		return
	}
	if !strings.HasPrefix(paymentMethodID, "pm_") {
		common.ApiErrorMsg(c, "Invalid payment method")
		return
	}

	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	customerID, err := ensureStripeCustomerForUser(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pm, err := paymentmethod.Get(paymentMethodID, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if pm.Customer == nil || pm.Customer.ID != customerID {
		common.ApiErrorMsg(c, "Payment method does not belong to this customer")
		return
	}

	if _, err := paymentmethod.Detach(paymentMethodID, nil); err != nil {
		common.ApiError(c, err)
		return
	}

	currentSetting := user.GetSetting()
	if currentSetting.StripeDefaultPaymentMethodID == paymentMethodID {
		currentSetting.StripeDefaultPaymentMethodID = ""
	}
	if currentSetting.StripeAutoTopUpPaymentMethodID == paymentMethodID {
		currentSetting.StripeAutoTopUpPaymentMethodID = ""
	}

	if currentSetting.StripeDefaultPaymentMethodID == "" {
		params := &stripe.PaymentMethodListParams{
			Customer: stripe.String(customerID),
			Type:     stripe.String("card"),
		}
		iter := paymentmethod.List(params)
		for iter.Next() {
			candidate := iter.PaymentMethod()
			if candidate == nil || candidate.Card == nil {
				continue
			}
			currentSetting.StripeDefaultPaymentMethodID = candidate.ID
			break
		}
		if err := iter.Err(); err != nil {
			common.ApiError(c, err)
			return
		}

		if currentSetting.StripeDefaultPaymentMethodID != "" {
			// Best-effort set Stripe's customer-level default.
			_, _ = customer.Update(customerID, &stripe.CustomerParams{
				InvoiceSettings: &stripe.CustomerInvoiceSettingsParams{
					DefaultPaymentMethod: stripe.String(currentSetting.StripeDefaultPaymentMethodID),
				},
			})
		}
	}

	user.SetSetting(currentSetting)
	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, nil)
}

func CreateStripePaymentIntent(c *gin.Context) {
	if err := validateStripeElementsConfig(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	var req stripeCreatePaymentIntentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "Invalid parameters")
		return
	}
	if req.Amount < getStripeMinTopup() {
		common.ApiErrorMsg(c, fmt.Sprintf("Top-up amount must be at least %d", getStripeMinTopup()))
		return
	}
	if req.Amount > 10000 {
		common.ApiErrorMsg(c, "Top-up amount cannot exceed 10000")
		return
	}

	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userSetting := user.GetSetting()

	customerID, err := ensureStripeCustomerForUser(user)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	paymentMethodID := strings.TrimSpace(req.PaymentMethodID)
	if paymentMethodID == "" {
		paymentMethodID = strings.TrimSpace(userSetting.StripeDefaultPaymentMethodID)
	}
	if paymentMethodID == "" {
		common.ApiErrorMsg(c, "No saved card. Please bind a card first")
		return
	}
	if !strings.HasPrefix(paymentMethodID, "pm_") {
		common.ApiErrorMsg(c, "Invalid payment method")
		return
	}
	pm, err := paymentmethod.Get(paymentMethodID, nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if pm.Customer == nil || pm.Customer.ID != customerID {
		common.ApiErrorMsg(c, "Payment method does not belong to this customer")
		return
	}

	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		common.ApiErrorMsg(c, "Failed to get user group")
		return
	}
	payMoney := getStripePayMoney(float64(req.Amount), group)
	if payMoney <= 0.01 {
		common.ApiErrorMsg(c, "Amount is too low to charge")
		return
	}
	chargeMinorUnits, err := stripeMinorUnits(payMoney)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	chargedMoney := GetChargedAmount(float64(req.Amount), *user)
	if chargedMoney <= 0 {
		common.ApiErrorMsg(c, "Invalid top-up amount")
		return
	}

	reference := fmt.Sprintf("new-api-ref-%d-%d-%s", user.Id, time.Now().UnixMilli(), randstr.String(4))
	referenceID := "ref_" + common.Sha1([]byte(reference))

	// Create an internal pending order first to keep the whole flow idempotent.
	topUp := &model.TopUp{
		UserId:        userID,
		Amount:        req.Amount,
		Money:         chargedMoney,
		TradeNo:       referenceID,
		PaymentMethod: PaymentMethodStripe,
		CreateTime:    time.Now().Unix(),
		Status:        common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		common.ApiErrorMsg(c, "Failed to create order")
		return
	}

	params := &stripe.PaymentIntentParams{
		Amount:        stripe.Int64(chargeMinorUnits),
		Currency:      stripe.String(getStripeCurrency()),
		Customer:      stripe.String(customerID),
		PaymentMethod: stripe.String(paymentMethodID),
		Confirm:       stripe.Bool(true),
		UseStripeSDK:  stripe.Bool(true),
		ReturnURL:     stripe.String(system_setting.ServerAddress + "/console/topup"),
		Description:   stripe.String(fmt.Sprintf("Top-up %s", referenceID)),
		Metadata: map[string]string{
			"reference_id": referenceID,
			"user_id":      strconv.Itoa(userID),
		},
	}
	params.SetIdempotencyKey(referenceID)

	pi, err := paymentintent.New(params)
	if err != nil {
		topUp.Status = common.TopUpStatusFailed
		_ = topUp.Update()
		common.ApiError(c, err)
		return
	}

	// Prefer Stripe's PaymentIntent ID as the external order number (trade_no) for better traceability.
	if pi.ID != "" {
		topUp.TradeNo = pi.ID
		if err := topUp.Update(); err != nil {
			log.Printf("failed to update top-up trade_no to PaymentIntent ID: %v", err)
		}
	}

	tradeNo := topUp.TradeNo
	resp := stripeCreatePaymentIntentResponse{
		TradeNo:         tradeNo,
		ReferenceID:     referenceID,
		PaymentIntentID: pi.ID,
		Status:          string(pi.Status),
		ClientSecret:    pi.ClientSecret,
	}

	// If succeeded immediately, update balance synchronously for better UX.
	if pi.Status == stripe.PaymentIntentStatusSucceeded {
		if err := model.Recharge(tradeNo, customerID); err != nil && referenceID != "" {
			// Backward compatibility: fallback to reference_id if needed.
			err = model.Recharge(referenceID, customerID)
		}
		if err != nil {
			// Webhook will also try to reconcile; log and still return payment status.
			log.Printf("failed to reconcile successful payment %s: %v", tradeNo, err)
		}
	}

	common.ApiSuccess(c, resp)
}

func GetStripeAutoTopup(c *gin.Context) {
	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	setting := user.GetSetting()
	common.ApiSuccess(c, stripeAutoTopupResponse{
		Enabled:         setting.StripeAutoTopUpEnabled,
		Threshold:       setting.StripeAutoTopUpThreshold,
		Amount:          setting.StripeAutoTopUpAmount,
		PaymentMethodID: setting.StripeAutoTopUpPaymentMethodID,
	})
}

func UpdateStripeAutoTopup(c *gin.Context) {
	if err := validateStripeElementsConfig(); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	var req stripeAutoTopupUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "Invalid parameters")
		return
	}
	if req.Enabled {
		if req.Threshold <= 0 {
			common.ApiErrorMsg(c, "Threshold must be greater than 0")
			return
		}
		if req.Amount < getStripeMinTopup() {
			common.ApiErrorMsg(c, fmt.Sprintf("Top-up amount must be at least %d", getStripeMinTopup()))
			return
		}
		if req.Amount > 10000 {
			common.ApiErrorMsg(c, "Top-up amount cannot exceed 10000")
			return
		}
		if req.PaymentMethodID == "" {
			common.ApiErrorMsg(c, "Please select a payment method")
			return
		}
		if !strings.HasPrefix(req.PaymentMethodID, "pm_") {
			common.ApiErrorMsg(c, "Invalid payment method")
			return
		}
	}

	userID := c.GetInt("id")
	user, err := model.GetUserById(userID, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	// Validate payment method ownership when enabling.
	if req.Enabled {
		customerID, err := ensureStripeCustomerForUser(user)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		pm, err := paymentmethod.Get(req.PaymentMethodID, nil)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		if pm.Customer == nil || pm.Customer.ID != customerID {
			common.ApiErrorMsg(c, "Payment method does not belong to this customer")
			return
		}
	}

	currentSetting := user.GetSetting()
	currentSetting.StripeAutoTopUpEnabled = req.Enabled
	currentSetting.StripeAutoTopUpThreshold = req.Threshold
	currentSetting.StripeAutoTopUpAmount = req.Amount
	currentSetting.StripeAutoTopUpPaymentMethodID = req.PaymentMethodID
	user.SetSetting(currentSetting)
	if err := user.Update(false); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
