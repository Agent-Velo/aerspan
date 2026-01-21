import { useEffect, useState } from 'react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useAuth } from '@/stores/auth/AuthStore';
import {
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';
import { parseJson } from './helpers';
import type { UserSetting } from './types';

export function NotificationSettingsPage() {
  const { user, refreshSelf } = useAuth();

  const [settingDraft, setSettingDraft] = useState<UserSetting>(() => {
    const setting = parseJson<any>((user as any)?.setting);
    return {
      notify_type: (setting?.notify_type as UserSetting['notify_type']) || 'email',
      quota_warning_threshold: Number(setting?.quota_warning_threshold) || 10,
      webhook_url: setting?.webhook_url || '',
      webhook_secret: setting?.webhook_secret || '',
      notification_email: setting?.notification_email || (user?.email || ''),
      bark_url: setting?.bark_url || '',
      gotify_url: setting?.gotify_url || '',
      gotify_token: setting?.gotify_token || '',
      gotify_priority: Number.isFinite(setting?.gotify_priority) ? Number(setting?.gotify_priority) : 5,
      accept_unset_model_ratio_model: Boolean(setting?.accept_unset_model_ratio_model),
      record_ip_log: Boolean(setting?.record_ip_log),
    };
  });

  useEffect(() => {
    const setting = parseJson<any>((user as any)?.setting);
    if (!setting) return;
    setSettingDraft((prev) => ({
      ...prev,
      notify_type: (setting?.notify_type as UserSetting['notify_type']) || prev.notify_type,
      quota_warning_threshold:
        Number(setting?.quota_warning_threshold) || prev.quota_warning_threshold,
      webhook_url: setting?.webhook_url || '',
      webhook_secret: setting?.webhook_secret || '',
      notification_email: setting?.notification_email || prev.notification_email,
      bark_url: setting?.bark_url || '',
      gotify_url: setting?.gotify_url || '',
      gotify_token: setting?.gotify_token || '',
      gotify_priority: Number.isFinite(setting?.gotify_priority) ? Number(setting?.gotify_priority) : prev.gotify_priority,
      accept_unset_model_ratio_model: Boolean(setting?.accept_unset_model_ratio_model),
      record_ip_log: Boolean(setting?.record_ip_log),
    }));
  }, [(user as any)?.setting, user?.email]);

  const saveSetting = async () => {
    await fetchJson<ApiResponse<any>>('/api/user/setting', {
      method: 'PUT',
      body: {
        notify_type: settingDraft.notify_type,
        quota_warning_threshold: settingDraft.quota_warning_threshold,
        webhook_url: settingDraft.webhook_url || undefined,
        webhook_secret: settingDraft.webhook_secret || undefined,
        notification_email: settingDraft.notification_email || undefined,
        bark_url: settingDraft.bark_url || undefined,
        gotify_url: settingDraft.gotify_url || undefined,
        gotify_token: settingDraft.gotify_token || undefined,
        gotify_priority: settingDraft.gotify_priority ?? 5,
        accept_unset_model_ratio_model: settingDraft.accept_unset_model_ratio_model,
        record_ip_log: settingDraft.record_ip_log,
      },
    });
    toast.success('Saved');
    await refreshSelf();
  };

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Notification Settings'
        description='Configure how you receive notifications'
      />

      <Card>
        <Card.Content>
          <div className='space-y-4'>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              <Select
                placeholder='Notify type'
                value={settingDraft.notify_type}
                onChange={(value) =>
                  setSettingDraft((prev) => ({
                    ...prev,
                    notify_type: String(value || 'email') as UserSetting['notify_type'],
                  }))
                }
              >
                <Label>Notify type</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {[
                      { id: 'email', label: 'Email' },
                      { id: 'webhook', label: 'Webhook' },
                      { id: 'bark', label: 'Bark' },
                      { id: 'gotify', label: 'Gotify' },
                    ].map((opt) => (
                      <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                        {opt.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>

              <TextField
                name='quotaWarningThreshold'
                type='number'
                onChange={(value) =>
                  setSettingDraft((prev) => ({
                    ...prev,
                    quota_warning_threshold: Number(value),
                  }))
                }
              >
                <Label>Quota warning threshold</Label>
                <Input min={0} value={String(settingDraft.quota_warning_threshold)} />
              </TextField>
            </div>

            {settingDraft.notify_type === 'email' ? (
              <TextField
                name='notificationEmail'
                onChange={(value) =>
                  setSettingDraft((prev) => ({ ...prev, notification_email: value }))
                }
              >
                <Label>Notification email</Label>
                <Input value={settingDraft.notification_email || ''} autoComplete='email' />
              </TextField>
            ) : null}

            {settingDraft.notify_type === 'webhook' ? (
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                <TextField
                  name='webhookUrl'
                  onChange={(value) => setSettingDraft((prev) => ({ ...prev, webhook_url: value }))}
                >
                  <Label>Webhook URL</Label>
                  <Input value={settingDraft.webhook_url || ''} />
                </TextField>
                <TextField
                  name='webhookSecret'
                  onChange={(value) =>
                    setSettingDraft((prev) => ({ ...prev, webhook_secret: value }))
                  }
                >
                  <Label>Webhook secret (optional)</Label>
                  <Input value={settingDraft.webhook_secret || ''} />
                </TextField>
              </div>
            ) : null}

            {settingDraft.notify_type === 'bark' ? (
              <TextField
                name='barkUrl'
                onChange={(value) => setSettingDraft((prev) => ({ ...prev, bark_url: value }))}
              >
                <Label>Bark URL</Label>
                <Input value={settingDraft.bark_url || ''} />
              </TextField>
            ) : null}

            {settingDraft.notify_type === 'gotify' ? (
              <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
                <TextField
                  name='gotifyUrl'
                  onChange={(value) => setSettingDraft((prev) => ({ ...prev, gotify_url: value }))}
                >
                  <Label>Gotify URL</Label>
                  <Input value={settingDraft.gotify_url || ''} />
                </TextField>
                <TextField
                  name='gotifyToken'
                  onChange={(value) => setSettingDraft((prev) => ({ ...prev, gotify_token: value }))}
                >
                  <Label>Gotify token</Label>
                  <Input value={settingDraft.gotify_token || ''} />
                </TextField>
                <TextField
                  name='gotifyPriority'
                  type='number'
                  onChange={(value) =>
                    setSettingDraft((prev) => ({ ...prev, gotify_priority: Number(value) }))
                  }
                >
                  <Label>Priority (0-10)</Label>
                  <Input min={0} max={10} value={String(settingDraft.gotify_priority ?? 5)} />
                </TextField>
              </div>
            ) : null}

            <div className='space-y-3'>
              <div className='flex items-center gap-3'>
                <Checkbox
                  id='setting-accept-unset-model-ratio-model'
                  isSelected={settingDraft.accept_unset_model_ratio_model}
                  onChange={(isSelected) =>
                    setSettingDraft((prev) => ({
                      ...prev,
                      accept_unset_model_ratio_model: isSelected,
                    }))
                  }
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <Label htmlFor='setting-accept-unset-model-ratio-model'>
                  Accept unset model ratio model
                </Label>
              </div>
              <div className='flex items-center gap-3'>
                <Checkbox
                  id='setting-record-ip-log'
                  isSelected={settingDraft.record_ip_log}
                  onChange={(isSelected) =>
                    setSettingDraft((prev) => ({ ...prev, record_ip_log: isSelected }))
                  }
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <Label htmlFor='setting-record-ip-log'>Record IP in logs</Label>
              </div>
            </div>

            <div>
              <Button onPress={() => saveSetting().catch(() => {})}>Save</Button>
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
