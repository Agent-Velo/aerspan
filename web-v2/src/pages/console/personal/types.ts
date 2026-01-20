export type PasskeyStatus = {
  enabled: boolean;
  last_used_at?: number;
};

export type TwoFaStatus = {
  enabled: boolean;
  locked: boolean;
  backup_codes_remaining?: number;
};

export type TwoFaSetup = {
  secret: string;
  qr_code_data: string;
  backup_codes: string[];
};

export type CheckinStatusResponse = {
  enabled: boolean;
  min_quota: number;
  max_quota: number;
  stats: {
    total_quota: number;
    total_checkins: number;
    checkin_count: number;
    checked_in_today: boolean;
    records: Array<{ checkin_date: string; quota_awarded: number }>;
  };
};

export type UserSetting = {
  notify_type: 'email' | 'webhook' | 'bark' | 'gotify';
  quota_warning_threshold: number;
  webhook_url?: string;
  webhook_secret?: string;
  notification_email?: string;
  bark_url?: string;
  gotify_url?: string;
  gotify_token?: string;
  gotify_priority?: number;
  accept_unset_model_ratio_model: boolean;
  record_ip_log: boolean;
};
