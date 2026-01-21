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

import React, { useEffect, useRef, useState } from 'react';
import { Banner, Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  API,
  compareObjects,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';

const defaultLLMEndpointInputs = {
  'llm_endpoint_setting.enable_completions': true,
  'llm_endpoint_setting.enable_chat_completions': true,
  'llm_endpoint_setting.enable_responses': false,
  'llm_endpoint_setting.enable_claude_messages': false,
  'llm_endpoint_setting.enable_embeddings': false,
  'llm_endpoint_setting.enable_images': false,
  'llm_endpoint_setting.enable_audio': false,
  'llm_endpoint_setting.enable_moderations': false,
  'llm_endpoint_setting.enable_rerank': false,
  'llm_endpoint_setting.enable_realtime': false,
  'llm_endpoint_setting.enable_gemini': false,
};

export default function SettingsLLMEndpoints(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState(defaultLLMEndpointInputs);
  const [inputsRow, setInputsRow] = useState(inputs);
  const refForm = useRef();

  function handleFieldChange(fieldName) {
    return (value) => {
      setInputs((prev) => ({ ...prev, [fieldName]: value }));
    };
  }

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));

    const requestQueue = updateArray.map((item) =>
      API.put('/api/option/', {
        key: item.key,
        value: String(inputs[item.key]),
      }),
    );

    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    const currentInputs = {};
    for (const key of Object.keys(defaultLLMEndpointInputs)) {
      if (props.options[key] !== undefined) {
        currentInputs[key] = props.options[key];
      }
    }

    const mergedInputs = { ...defaultLLMEndpointInputs, ...currentInputs };
    setInputs(mergedInputs);
    setInputsRow(structuredClone(mergedInputs));
    refForm.current?.setValues(mergedInputs);
  }, [props.options]);

  return (
    <Spin spinning={loading}>
      <Form
        values={inputs}
        getFormApi={(formAPI) => (refForm.current = formAPI)}
        style={{ marginBottom: 15 }}
      >
        <Form.Section text={t('LLM 端点开关')}>
          <Banner
            type='warning'
            description={t(
              '关闭端点后，该端点将按 Not Found (404) 返回，用于隐藏未启用的能力。',
            )}
            bordered
            fullMode={false}
            closeIcon={null}
            style={{ marginBottom: 12 }}
          />

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_completions'}
                label={t('Completions (/v1/completions)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange(
                  'llm_endpoint_setting.enable_completions',
                )}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_chat_completions'}
                label={t('Chat Completions (/v1/chat/completions)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange(
                  'llm_endpoint_setting.enable_chat_completions',
                )}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_responses'}
                label={t('Responses (/v1/responses)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange(
                  'llm_endpoint_setting.enable_responses',
                )}
              />
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_claude_messages'}
                label={t('Claude Messages (/v1/messages)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange(
                  'llm_endpoint_setting.enable_claude_messages',
                )}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_embeddings'}
                label={t('Embeddings (/v1/embeddings)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange(
                  'llm_endpoint_setting.enable_embeddings',
                )}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_images'}
                label={t('Images (/v1/images/*)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange('llm_endpoint_setting.enable_images')}
              />
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_audio'}
                label={t('Audio (/v1/audio/*)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange('llm_endpoint_setting.enable_audio')}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_moderations'}
                label={t('Moderations (/v1/moderations)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange(
                  'llm_endpoint_setting.enable_moderations',
                )}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_rerank'}
                label={t('Rerank (/v1/rerank)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange('llm_endpoint_setting.enable_rerank')}
              />
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_realtime'}
                label={t('Realtime (/v1/realtime)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange('llm_endpoint_setting.enable_realtime')}
              />
            </Col>
            <Col xs={24} sm={12} md={8} lg={8} xl={8}>
              <Form.Switch
                field={'llm_endpoint_setting.enable_gemini'}
                label={t('Gemini (/v1beta/* & /v1/models/*path)')}
                size='default'
                checkedText='｜'
                uncheckedText='〇'
                onChange={handleFieldChange('llm_endpoint_setting.enable_gemini')}
              />
            </Col>
          </Row>

          <Row>
            <Button size='default' onClick={onSubmit}>
              {t('保存端点设置')}
            </Button>
          </Row>
        </Form.Section>
      </Form>
    </Spin>
  );
}
