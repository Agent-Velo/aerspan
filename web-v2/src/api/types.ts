export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type PaymentResponse = {
  message: 'success' | 'error';
  data: any;
  url?: string;
};

export type UserBase = {
  id: number;
  username: string;
  display_name?: string;
  role: number;
  status: number;
  group?: string;
  email?: string;
  quota?: number;
  used_quota?: number;
  request_count?: number;

  github_id?: string;
  discord_id?: string;
  oidc_id?: string;
  linux_do_id?: string;
  wechat_id?: string;
  telegram_id?: string;

  aff_code?: string;
  aff_count?: number;
  aff_quota?: number;
  aff_history_quota?: number;
  inviter_id?: number;

  stripe_customer?: string;
  setting?: string;
  sidebar_modules?: unknown;
  permissions?: Record<string, any>;
};
