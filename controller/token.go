package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// sanitizeTokenForUser removes internal-only fields from token responses.
//
// NOTE: Token "group" is an internal routing/pricing concept. Users should not
// be aware of other groups' existence, nor be able to select them.
func sanitizeTokenForUser(token *model.Token) {
	if token == nil {
		return
	}
	token.Group = ""
	token.CrossGroupRetry = false
	// Token-level restrictions are removed from the product. Keep the columns for
	// backward compatibility, but always present them as unrestricted.
	token.ExpiredTime = -1
	token.RemainQuota = 0
	token.UnlimitedQuota = true
	token.ModelLimitsEnabled = false
	token.ModelLimits = ""
	token.AllowIps = nil
}

func GetAllTokens(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	tokens, err := model.GetAllUserTokens(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, token := range tokens {
		sanitizeTokenForUser(token)
	}
	total, _ := model.CountUserTokens(userId)
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(tokens)
	common.ApiSuccess(c, pageInfo)
	return
}

func SearchTokens(c *gin.Context) {
	userId := c.GetInt("id")
	keyword := c.Query("keyword")
	tokenKey := c.Query("token")
	tokens, err := model.SearchUserTokens(userId, keyword, tokenKey)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	for _, tk := range tokens {
		sanitizeTokenForUser(tk)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    tokens,
	})
	return
}

func GetToken(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	token, err := model.GetTokenByIds(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	sanitizeTokenForUser(token)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    token,
	})
	return
}

func GetTokenStatus(c *gin.Context) {
	tokenId := c.GetInt("token_id")
	userId := c.GetInt("id")
	_, err := model.GetTokenByIds(tokenId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userQuota, _ := model.GetUserQuota(userId, false)
	usedQuota, _ := model.GetUserUsedQuota(userId)
	quota := userQuota + usedQuota
	c.JSON(http.StatusOK, gin.H{
		"object":          "credit_summary",
		"total_granted":   quota,
		"total_used":      0, // not supported currently
		"total_available": userQuota,
		"expires_at":      0,
	})
}

func GetTokenUsage(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "No Authorization header",
		})
		return
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "Invalid Bearer token",
		})
		return
	}
	tokenKey := parts[1]

	rawKey, _ := common.ParseTokenAPIKey(tokenKey)
	token, err := model.GetTokenByKey(rawKey, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	userQuota, _ := model.GetUserQuota(token.UserId, false)
	usedQuota, _ := model.GetUserUsedQuota(token.UserId)
	quota := userQuota + usedQuota

	c.JSON(http.StatusOK, gin.H{
		"code":    true,
		"message": "ok",
		"data": gin.H{
			"object":               "token_usage",
			"name":                 token.Name,
			"total_granted":        quota,
			"total_used":           usedQuota,
			"total_available":      userQuota,
			"unlimited_quota":      true,
			"model_limits":         map[string]bool{},
			"model_limits_enabled": false,
			"expires_at":           0,
		},
	})
}

func AddToken(c *gin.Context) {
	token := model.Token{}
	err := c.ShouldBindJSON(&token)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(token.Name) > 50 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Token name is too long",
		})
		return
	}
	key, err := common.GenerateKey()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Failed to generate token",
		})
		common.SysLog("failed to generate token key: " + err.Error())
		return
	}
	cleanToken := model.Token{
		UserId:             c.GetInt("id"),
		Name:               token.Name,
		Key:                key,
		Status:             common.TokenStatusEnabled,
		CreatedTime:        common.GetTimestamp(),
		AccessedTime:       common.GetTimestamp(),
		ExpiredTime:        -1,
		RemainQuota:        0,
		UnlimitedQuota:     true,
		ModelLimitsEnabled: false,
		ModelLimits:        "",
		AllowIps:           nil,
		// group is internal-only; don't allow users to set it.
		Group:           "",
		CrossGroupRetry: false,
	}
	err = cleanToken.Insert()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteToken(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	err := model.DeleteTokenById(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func RollTokenKey(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userId := c.GetInt("id")
	token, err := model.RollTokenKey(id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	sanitizeTokenForUser(token)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    token,
	})
}

func UpdateToken(c *gin.Context) {
	userId := c.GetInt("id")
	statusOnly := c.Query("status_only")
	token := model.Token{}
	err := c.ShouldBindJSON(&token)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(token.Name) > 50 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Token name is too long",
		})
		return
	}
	cleanToken, err := model.GetTokenByIds(token.Id, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if statusOnly != "" {
		if token.Status != common.TokenStatusEnabled && token.Status != common.TokenStatusDisabled {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "Invalid token status",
			})
			return
		}
		cleanToken.Status = token.Status
	} else {
		// If you add more fields, please also update token.Update()
		cleanToken.Name = token.Name
		// group is internal-only; don't allow users to set or change it.
	}
	err = cleanToken.Update()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	sanitizeTokenForUser(cleanToken)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    cleanToken,
	})
}

type TokenBatch struct {
	Ids []int `json:"ids"`
}

func DeleteTokenBatch(c *gin.Context) {
	tokenBatch := TokenBatch{}
	if err := c.ShouldBindJSON(&tokenBatch); err != nil || len(tokenBatch.Ids) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "Invalid parameters",
		})
		return
	}
	userId := c.GetInt("id")
	count, err := model.BatchDeleteTokens(tokenBatch.Ids, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    count,
	})
}
