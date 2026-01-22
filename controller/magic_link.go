package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type magicLinkAction string

const (
	magicLinkActionLogin    magicLinkAction = "login"
	magicLinkActionRegister magicLinkAction = "register"
)

func (a magicLinkAction) purpose() string {
	switch a {
	case magicLinkActionLogin:
		return common.MagicLinkLoginPurpose
	case magicLinkActionRegister:
		return common.MagicLinkRegisterPurpose
	default:
		return ""
	}
}

func sanitizeRedirectPath(raw string) string {
	redirect := strings.TrimSpace(raw)
	if redirect == "" {
		return ""
	}
	if !strings.HasPrefix(redirect, "/") {
		return ""
	}
	if strings.HasPrefix(redirect, "//") {
		return ""
	}
	if strings.Contains(redirect, "\\") {
		return ""
	}
	if len(redirect) > 2048 {
		return ""
	}
	return redirect
}

func validateEmailRestrictions(email string) error {
	if err := common.Validate.Var(email, "required,email"); err != nil {
		return errors.New("Invalid email address")
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return errors.New("Invalid email address")
	}
	localPart := parts[0]
	domainPart := parts[1]
	if common.EmailDomainRestrictionEnabled {
		allowed := false
		for _, domain := range common.EmailDomainWhitelist {
			if domainPart == domain {
				allowed = true
				break
			}
		}
		if !allowed {
			return errors.New("Email domain isn't allowed")
		}
	}
	if common.EmailAliasRestrictionEnabled {
		containsSpecialSymbols := strings.Contains(localPart, "+") || strings.Contains(localPart, ".")
		if containsSpecialSymbols {
			return errors.New("Email aliases are not allowed")
		}
	}
	return nil
}

func usernameFromEmail(email string) string {
	local := strings.Split(email, "@")[0]
	local = strings.ToLower(strings.TrimSpace(local))
	if local == "" {
		return "user"
	}
	var b strings.Builder
	b.Grow(len(local))
	for _, r := range local {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' {
			b.WriteRune(r)
			continue
		}
		b.WriteByte('_')
	}
	result := strings.Trim(b.String(), "_")
	if result == "" {
		return "user"
	}
	return result
}

func generateUniqueUsernameByEmail(email string) (string, error) {
	base := usernameFromEmail(email)
	const suffixLen = 6
	maxBaseLen := 20 - 1 - suffixLen
	if maxBaseLen < 1 {
		maxBaseLen = 1
	}
	if len(base) > maxBaseLen {
		base = base[:maxBaseLen]
	}

	for i := 0; i < 10; i++ {
		suffix := common.GenerateVerificationCode(0)
		if len(suffix) > suffixLen {
			suffix = suffix[:suffixLen]
		}
		candidate := fmt.Sprintf("%s_%s", base, suffix)
		exist, err := model.CheckUserExistOrDeleted(candidate, "")
		if err != nil {
			return "", err
		}
		if !exist {
			return candidate, nil
		}
	}
	return "", errors.New("failed to generate a unique username")
}

// SendMagicLink sends a passwordless login/register magic link to the given email.
//
// - action=login: only sends when the account exists (to avoid accidental sign-up via login form).
// - action=register: only sends when sign-ups are enabled and the email is unused.
func SendMagicLink(c *gin.Context) {
	email := strings.TrimSpace(c.Query("email"))
	action := magicLinkAction(strings.TrimSpace(c.Query("action")))
	redirect := sanitizeRedirectPath(c.Query("redirect"))
	via := strings.TrimSpace(c.Query("via"))
	if via == "" {
		via = strings.TrimSpace(c.Query("aff"))
	}
	if action == "" {
		action = magicLinkActionLogin
	}
	if action.purpose() == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Invalid action",
		})
		return
	}
	if err := validateEmailRestrictions(email); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	trimmedServerAddress := strings.TrimRight(system_setting.ServerAddress, "/")
	if trimmedServerAddress == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Server address is not configured",
		})
		return
	}

	switch action {
	case magicLinkActionRegister:
		if operation_setting.SelfUseModeEnabled || !common.RegisterEnabled {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "Sign-ups are disabled",
			})
			return
		}
		if model.IsEmailAlreadyTaken(email) {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "Email address is already in use",
			})
			return
		}
	case magicLinkActionLogin:
		if !model.IsEmailAlreadyTaken(email) {
			// Avoid leaking user existence.
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "",
			})
			return
		}
	}

	token := common.GenerateVerificationCode(0)
	common.RegisterVerificationCodeWithKey(email, token, action.purpose())

	link := fmt.Sprintf("%s/auth/magic?email=%s&token=%s&action=%s", trimmedServerAddress, url.QueryEscape(email), url.QueryEscape(token), url.QueryEscape(string(action)))
	if redirect != "" {
		link = link + "&redirect=" + url.QueryEscape(redirect)
	}
	if action == magicLinkActionRegister && via != "" {
		link = link + "&via=" + url.QueryEscape(via)
	}

	var subject string
	var content string
	if action == magicLinkActionRegister {
		subject = fmt.Sprintf("%s finish sign-up", common.SystemName)
		content = fmt.Sprintf(
			"<p>Click <a href='%s'>here</a> to finish signing up.</p>"+
				"<p>If the link doesn't open, copy and paste this URL into your browser:<br>%s</p>"+
				"<p>This link expires in %d minutes. If you didn't request this, you can ignore this email.</p>",
			link, link, common.VerificationValidMinutes,
		)
	} else {
		subject = fmt.Sprintf("%s sign-in link", common.SystemName)
		content = fmt.Sprintf(
			"<p>Click <a href='%s'>here</a> to sign in.</p>"+
				"<p>If the link doesn't open, copy and paste this URL into your browser:<br>%s</p>"+
				"<p>This link expires in %d minutes. If you didn't request this, you can ignore this email.</p>",
			link, link, common.VerificationValidMinutes,
		)
	}

	if err := common.SendEmail(subject, email, content); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

// SendPasswordRegisterEmailMagicLink sends an email verification magic link
// to be used during password-based sign-up.
func SendPasswordRegisterEmailMagicLink(c *gin.Context) {
	if !common.EmailVerificationEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Email verification is disabled",
		})
		return
	}
	if operation_setting.SelfUseModeEnabled || !common.RegisterEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Sign-ups are disabled",
		})
		return
	}
	if !common.PasswordRegisterEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Password sign-up is disabled",
		})
		return
	}

	email := strings.TrimSpace(c.Query("email"))
	if err := validateEmailRestrictions(email); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if model.IsEmailAlreadyTaken(email) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Email address is already in use",
		})
		return
	}

	trimmedServerAddress := strings.TrimRight(system_setting.ServerAddress, "/")
	if trimmedServerAddress == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Server address is not configured",
		})
		return
	}

	token := common.GenerateVerificationCode(0)
	common.RegisterVerificationCodeWithKey(email, token, common.PasswordRegisterEmailVerificationPurpose)
	link := fmt.Sprintf("%s/auth/signup?email=%s&verification_token=%s", trimmedServerAddress, url.QueryEscape(email), url.QueryEscape(token))
	subject := fmt.Sprintf("%s email verification", common.SystemName)
	content := fmt.Sprintf(
		"<p>Click <a href='%s'>here</a> to verify your email for sign-up.</p>"+
			"<p>If the link doesn't open, copy and paste this URL into your browser:<br>%s</p>"+
			"<p>This link expires in %d minutes. If you didn't request this, you can ignore this email.</p>",
		link, link, common.VerificationValidMinutes,
	)
	if err := common.SendEmail(subject, email, content); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

type magicLinkVerifyRequest struct {
	Email  string `json:"email"`
	Token  string `json:"token"`
	Action string `json:"action"`
	Via    string `json:"via"`
}

// VerifyMagicLink verifies the given token and logs the user in.
func VerifyMagicLink(c *gin.Context) {
	var req magicLinkVerifyRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Invalid parameters",
		})
		return
	}
	email := strings.TrimSpace(req.Email)
	token := strings.TrimSpace(req.Token)
	action := magicLinkAction(strings.TrimSpace(req.Action))
	via := strings.TrimSpace(req.Via)
	if action == "" {
		action = magicLinkActionLogin
	}
	if action.purpose() == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Invalid action",
		})
		return
	}
	if email == "" || token == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Invalid parameters",
		})
		return
	}
	if err := common.Validate.Var(email, "required,email"); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Invalid parameters",
		})
		return
	}

	if !common.VerifyCodeWithKey(email, token, action.purpose()) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Link is invalid or expired",
		})
		return
	}
	common.DeleteKey(email, action.purpose())

	var user model.User
	err := model.DB.Where("email = ?", email).First(&user).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiError(c, err)
			return
		}
		if action != magicLinkActionRegister {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "No account found for this email",
			})
			return
		}
		if operation_setting.SelfUseModeEnabled || !common.RegisterEnabled {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "Sign-ups are disabled",
			})
			return
		}
		username, err := generateUniqueUsernameByEmail(email)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		generatedPassword := common.GenerateVerificationCode(12)
		inviterId := 0
		if via != "" {
			inviterId, _ = model.GetUserIdByAffCode(via)
		}

		user = model.User{
			Username:    username,
			Password:    generatedPassword,
			DisplayName: username,
			Email:       email,
			InviterId:   inviterId,
			Role:        common.RoleCommonUser,
		}
		if err := user.Insert(inviterId); err != nil {
			common.ApiError(c, err)
			return
		}
	}

	if user.Status != common.UserStatusEnabled {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Account is disabled",
		})
		return
	}

	if model.IsTwoFAEnabled(user.Id) {
		session := sessions.Default(c)
		session.Set("pending_username", user.Username)
		session.Set("pending_user_id", user.Id)
		if err := session.Save(); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"message": "Couldn't save session. Try again",
				"success": false,
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message": "Enter your 2FA code",
			"success": true,
			"data": map[string]interface{}{
				"require_2fa": true,
			},
		})
		return
	}

	setupLogin(&user, c)
}
