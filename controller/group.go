package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

func GetGroups(c *gin.Context) {
	groupNames := make([]string, 0)
	for groupName := range ratio_setting.GetGroupRatioCopy() {
		groupNames = append(groupNames, groupName)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    groupNames,
	})
}

func GetUserGroups(c *gin.Context) {
	// Only expose the user's own group.
	//
	// Groups are an internal routing/pricing concept. Users should not be aware of
	// other groups' existence, nor be able to select them.
	userId := c.GetInt("id")
	userGroup, err := model.GetUserGroup(userId, false)
	if err != nil || userGroup == "" {
		userGroup = "default"
	}

	usableGroups := map[string]map[string]interface{}{
		userGroup: {
			"ratio": service.GetUserGroupRatio(userGroup, userGroup),
			"desc":  setting.GetUsableGroupDescription(userGroup),
		},
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    usableGroups,
	})
}
