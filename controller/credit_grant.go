package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type CreateUserCreditGrantRequest struct {
	Quota       int    `json:"quota"`
	ExpiredTime int64  `json:"expired_time"` // unix seconds, 0 means never
	Remark      string `json:"remark"`
	Reference   string `json:"reference"`
}

func GetUserCreditGrants(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "Invalid user id")
		return
	}
	pageInfo := common.GetPageQuery(c)
	grants, total, err := model.ListUserCreditGrants(userId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(grants)
	common.ApiSuccess(c, pageInfo)
}

func GetSelfCreditGrants(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorMsg(c, "Invalid user id")
		return
	}
	pageInfo := common.GetPageQuery(c)
	grants, total, err := model.ListUserCreditGrants(userId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(grants)
	common.ApiSuccess(c, pageInfo)
}

func CreateUserCreditGrant(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "Invalid user id")
		return
	}
	var req CreateUserCreditGrantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Quota <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Quota must be greater than 0"})
		return
	}
	now := common.GetTimestamp()
	if req.ExpiredTime != 0 && req.ExpiredTime <= now {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Expiration time must be in the future"})
		return
	}

	adminId := c.GetInt("id")
	grant, err := model.CreateCreditGrant(model.CreateCreditGrantParams{
		UserId:      userId,
		Quota:       req.Quota,
		GrantType:   "admin",
		Reference:   req.Reference,
		Remark:      req.Remark,
		CreatedBy:   adminId,
		CreatedTime: now,
		ExpiredTime: req.ExpiredTime,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordLog(userId, model.LogTypeManage, fmt.Sprintf("Admin %d created credit grant: %s", adminId, logger.LogQuota(req.Quota)))
	common.ApiSuccess(c, grant)
}
