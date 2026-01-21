package model

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func migrateLegacyLogsToSplitTables(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("log database is not initialized")
	}
	if !db.Migrator().HasTable(&LegacyLog{}) {
		return nil
	}

	common.SysLog("legacy logs table detected, migrating to usage_logs/audit_logs")

	var maxID int
	if err := db.Model(&LegacyLog{}).Select("max(id)").Scan(&maxID).Error; err != nil {
		return err
	}
	if maxID == 0 {
		if err := db.Migrator().DropTable(&LegacyLog{}); err != nil {
			return err
		}
		common.SysLog("legacy logs table is empty, dropped")
		return nil
	}

	usageTypes := []int{LogTypeConsume, LogTypeError}

	var expectedUsage int64
	if err := db.Model(&LegacyLog{}).Where("type IN ?", usageTypes).Count(&expectedUsage).Error; err != nil {
		return err
	}
	var expectedAudit int64
	if err := db.Model(&LegacyLog{}).Where("type NOT IN ?", usageTypes).Count(&expectedAudit).Error; err != nil {
		return err
	}

	const batchSize = 1000
	lastID := 0
	for {
		var batch []LegacyLog
		err := db.Where("id > ?", lastID).Order("id asc").Limit(batchSize).Find(&batch).Error
		if err != nil {
			return err
		}
		if len(batch) == 0 {
			break
		}

		usageRows := make([]UsageLog, 0, len(batch))
		auditRows := make([]AuditLog, 0, len(batch))
		for _, row := range batch {
			if isUsageLogType(row.Type) {
				usageRows = append(usageRows, UsageLog{
					Id:               row.Id,
					UserId:           row.UserId,
					CreatedAt:        row.CreatedAt,
					Type:             row.Type,
					Content:          row.Content,
					Username:         row.Username,
					TokenName:        row.TokenName,
					ModelName:        row.ModelName,
					Quota:            row.Quota,
					PromptTokens:     row.PromptTokens,
					CompletionTokens: row.CompletionTokens,
					UseTime:          row.UseTime,
					IsStream:         row.IsStream,
					ChannelId:        row.ChannelId,
					TokenId:          row.TokenId,
					Group:            row.Group,
					Ip:               row.Ip,
					Other:            row.Other,
				})
			} else {
				auditRows = append(auditRows, AuditLog{
					Id:               row.Id,
					UserId:           row.UserId,
					CreatedAt:        row.CreatedAt,
					Type:             row.Type,
					Content:          row.Content,
					Username:         row.Username,
					TokenName:        row.TokenName,
					ModelName:        row.ModelName,
					Quota:            row.Quota,
					PromptTokens:     row.PromptTokens,
					CompletionTokens: row.CompletionTokens,
					UseTime:          row.UseTime,
					IsStream:         row.IsStream,
					ChannelId:        row.ChannelId,
					TokenId:          row.TokenId,
					Group:            row.Group,
					Ip:               row.Ip,
					Other:            row.Other,
				})
			}
			lastID = row.Id
		}

		if len(usageRows) > 0 {
			if err := db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, UpdateAll: true}).CreateInBatches(&usageRows, batchSize).Error; err != nil {
				return err
			}
		}
		if len(auditRows) > 0 {
			if err := db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "id"}}, UpdateAll: true}).CreateInBatches(&auditRows, batchSize).Error; err != nil {
				return err
			}
		}
	}

	var migratedUsage int64
	if err := db.Model(&UsageLog{}).Where("id <= ? AND type IN ?", maxID, usageTypes).Count(&migratedUsage).Error; err != nil {
		return err
	}
	var migratedAudit int64
	if err := db.Model(&AuditLog{}).Where("id <= ? AND type NOT IN ?", maxID, usageTypes).Count(&migratedAudit).Error; err != nil {
		return err
	}
	if migratedUsage != expectedUsage || migratedAudit != expectedAudit {
		return fmt.Errorf("legacy logs migration mismatch: expected usage=%d audit=%d, got usage=%d audit=%d", expectedUsage, expectedAudit, migratedUsage, migratedAudit)
	}

	if err := db.Migrator().DropTable(&LegacyLog{}); err != nil {
		return err
	}
	common.SysLog("legacy logs migration finished, dropped logs")
	return nil
}
