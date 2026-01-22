/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState, useRef } from 'react';
import { Button, Form, Spin } from '@douyinfe/semi-ui';
import {
  API,
  removeTrailingSlash,
  showError,
  showSuccess,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

export default function SettingsGeneralPayment(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    BackendBaseUrl: '',
    FrontendBaseUrl: '',
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (props.options && formApiRef.current) {
      const legacyServerAddress = props.options.ServerAddress || '';
      const currentInputs = {
        BackendBaseUrl: props.options.BackendBaseUrl || legacyServerAddress,
        FrontendBaseUrl: props.options.FrontendBaseUrl || legacyServerAddress,
      };
      setInputs(currentInputs);
      formApiRef.current.setValues(currentInputs);
    }
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
  };

  const submitBaseUrls = async () => {
    setLoading(true);
    try {
      const backendBaseUrl = removeTrailingSlash(inputs.BackendBaseUrl);
      const frontendBaseUrl = removeTrailingSlash(inputs.FrontendBaseUrl);
      const requests = [
        API.put('/api/option/', {
          key: 'BackendBaseUrl',
          value: backendBaseUrl,
        }),
        API.put('/api/option/', {
          key: 'FrontendBaseUrl',
          value: frontendBaseUrl,
        }),
        // Backward compatibility.
        API.put('/api/option/', {
          key: 'ServerAddress',
          value: backendBaseUrl,
        }),
      ];
      const results = await Promise.all(requests);
      const failed = results.find((res) => !res.data.success);
      if (failed) {
        showError(failed.data.message);
        return;
      }
      showSuccess(t('更新成功'));
      props.refresh && props.refresh();
    } catch (error) {
      showError(t('更新失败'));
    }
    setLoading(false);
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={t('通用设置')}>
          <Form.Input
            field='BackendBaseUrl'
            label={t('后端 Base URL')}
            placeholder={'https://api.yourdomain.com'}
            style={{ width: '100%' }}
            extraText={t(
              '用于 OAuth/支付回调/Webhook 等后端回调地址；留空则回退到旧的服务器地址',
            )}
          />
          <Form.Input
            field='FrontendBaseUrl'
            label={t('前端 Base URL')}
            placeholder={'https://app.yourdomain.com'}
            style={{ width: '100%' }}
            extraText={t(
              '用于邮件中的用户跳转链接（如 magic link）；留空则回退到旧的服务器地址',
            )}
          />
          <Button onClick={submitBaseUrls}>{t('更新 Base URL')}</Button>
        </Form.Section>
      </Form>
    </Spin>
  );
}
