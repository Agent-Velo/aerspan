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
import {
  Button,
  Col,
  Form,
  Popconfirm,
  Row,
  Space,
  Spin,
} from '@douyinfe/semi-ui';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
  verifyJSON,
} from '../../../helpers';
import { useTranslation } from 'react-i18next';

export default function ModelRatioSettings(props) {
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    ModelPrice: '',
    ModelInputPrice: '',
    ModelOutputPrice: '',
    ModelInputTokenPriceMultiplier: '',
    ModelOutputTokenPriceMultiplier: '',
    ModelCacheReadPrice: '',
    ModelImageInputPrice: '',
    ModelAudioInputPrice: '',
    ModelAudioOutputPrice: '',
    ExposePricingEnabled: false,
  });
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const { t } = useTranslation();

  async function onSubmit() {
    try {
      await refForm.current
        .validate()
        .then(() => {
          const updateArray = compareObjects(inputs, inputsRow);
          if (!updateArray.length)
            return showWarning(t('你似乎并没有修改什么'));

          const requestQueue = updateArray.map((item) => {
            const value =
              typeof inputs[item.key] === 'boolean'
                ? String(inputs[item.key])
                : inputs[item.key];
            return API.put('/api/option/', { key: item.key, value });
          });

          setLoading(true);
          Promise.all(requestQueue)
            .then((res) => {
              if (res.includes(undefined)) {
                return showError(
                  requestQueue.length > 1
                    ? t('部分保存失败，请重试')
                    : t('保存失败'),
                );
              }

              for (let i = 0; i < res.length; i++) {
                if (!res[i].data.success) {
                  return showError(res[i].data.message);
                }
              }

              showSuccess(t('保存成功'));
              props.refresh();
            })
            .catch((error) => {
              console.error('Unexpected error:', error);
              showError(t('保存失败，请重试'));
            })
            .finally(() => {
              setLoading(false);
            });
        })
        .catch(() => {
          showError(t('请检查输入'));
        });
    } catch (error) {
      showError(t('请检查输入'));
      console.error(error);
    }
  }

  async function resetModelPricing() {
    try {
      let res = await API.post(`/api/option/rest_model_ratio`);
      if (res.data.success) {
        showSuccess(res.data.message);
        props.refresh();
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error);
    }
  }

  useEffect(() => {
    const currentInputs = {};
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        currentInputs[key] = props.options[key];
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    refForm.current.setValues(currentInputs);
  }, [props.options]);

  return (
    <Spin spinning={loading}>
      <Form
        values={inputs}
        getFormApi={(formAPI) => (refForm.current = formAPI)}
        style={{ marginBottom: 15 }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
          label={t('模型固定价格')}
              extraText={t('按次计费模型：一次调用消耗多少美元（优先级最高）')}
              placeholder={t(
                '为一个 JSON 文本，键为模型名称，值为一次调用消耗多少刀，比如 "gpt-4-gizmo-*": 0.1，一次消耗0.1刀',
              )}
              field={'ModelPrice'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) => setInputs({ ...inputs, ModelPrice: value })}
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('模型输入价格（USD/1M tokens）')}
              placeholder={t('为一个 JSON 文本，键为模型名称，值为 USD/1M tokens')}
              field={'ModelInputPrice'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelInputPrice: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('模型输出价格（USD/1M tokens）')}
              placeholder={t('为一个 JSON 文本，键为模型名称，值为 USD/1M tokens')}
              field={'ModelOutputPrice'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelOutputPrice: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('模型输入 tokens 阶梯倍率')}
              extraText={t(
                '为一个 JSON 文本，键为模型名称，值为区间数组：[{"min":0,"max":4096,"multiplier":1},{"min":4096,"multiplier":1.2}]。min 为包含下界，max 为不包含上界，max 可省略表示无上界。',
              )}
              placeholder={t('为一个 JSON 文本，键为模型名称，值为区间倍率数组')}
              field={'ModelInputTokenPriceMultiplier'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelInputTokenPriceMultiplier: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('模型输出 tokens 阶梯倍率')}
              extraText={t(
                '为一个 JSON 文本，键为模型名称，值为区间数组：[{"min":0,"max":4096,"multiplier":1},{"min":4096,"multiplier":1.2}]。min 为包含下界，max 为不包含上界，max 可省略表示无上界。',
              )}
              placeholder={t('为一个 JSON 文本，键为模型名称，值为区间倍率数组')}
              field={'ModelOutputTokenPriceMultiplier'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelOutputTokenPriceMultiplier: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('模型缓存读取价格（USD/1M tokens）')}
              extraText={t('仅部分模型支持该计费，未设置时默认等于输入价格')}
              placeholder={t('为一个 JSON 文本，键为模型名称，值为 USD/1M tokens')}
              field={'ModelCacheReadPrice'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelCacheReadPrice: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('图片输入价格（USD/1M tokens）')}
              extraText={t(
                '图片输入相关的价格设置，键为模型名称，值为 USD/1M tokens，仅部分模型支持该计费',
              )}
              placeholder={t(
                '为一个 JSON 文本，键为模型名称，值为 USD/1M tokens，例如：{"gpt-image-1": 5}',
              )}
              field={'ModelImageInputPrice'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelImageInputPrice: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('音频输入价格（USD/1M tokens）')}
              extraText={t('音频输入相关的价格设置，键为模型名称，值为 USD/1M tokens')}
              placeholder={t(
                '为一个 JSON 文本，键为模型名称，值为 USD/1M tokens，例如：{"gpt-4o-audio-preview": 20}',
              )}
              field={'ModelAudioInputPrice'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelAudioInputPrice: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.TextArea
              label={t('音频输出价格（USD/1M tokens）')}
              extraText={t(
                '音频输出相关的价格设置，键为模型名称，值为 USD/1M tokens',
              )}
              placeholder={t(
                '为一个 JSON 文本，键为模型名称，值为 USD/1M tokens，例如：{"gpt-4o-realtime": 40}',
              )}
              field={'ModelAudioOutputPrice'}
              autosize={{ minRows: 6, maxRows: 12 }}
              trigger='blur'
              stopValidateWithError
              rules={[
                {
                  validator: (rule, value) => verifyJSON(value),
                  message: '不是合法的 JSON 字符串',
                },
              ]}
              onChange={(value) =>
                setInputs({ ...inputs, ModelAudioOutputPrice: value })
              }
            />
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={16}>
            <Form.Switch
              label={t('暴露定价接口')}
              field={'ExposePricingEnabled'}
              onChange={(value) =>
                setInputs({ ...inputs, ExposePricingEnabled: value })
              }
            />
          </Col>
        </Row>
      </Form>
      <Space>
        <Button onClick={onSubmit}>{t('保存模型定价设置')}</Button>
        <Popconfirm
          title={t('确定重置模型定价吗？')}
          content={t('此修改将不可逆')}
          okType={'danger'}
          position={'top'}
          onConfirm={resetModelPricing}
        >
          <Button type={'danger'}>{t('重置模型定价')}</Button>
        </Popconfirm>
      </Space>
    </Spin>
  );
}
