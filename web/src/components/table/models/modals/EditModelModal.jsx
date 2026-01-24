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

import React, { useState, useEffect, useRef, useMemo } from 'react';
import JSONEditor from '../../../common/ui/JSONEditor';
import {
  SideSheet,
  Form,
  Button,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Avatar,
  Col,
  Row,
  Tooltip,
} from '@douyinfe/semi-ui';
import { Save, X, FileText } from 'lucide-react';
import { IconInfoCircle, IconLink } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../../../helpers';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const { Text, Title } = Typography;

// Example endpoint template for quick fill
const ENDPOINT_TEMPLATE = {
  openai: { name: 'Chat Completions', uri: '/v1/chat/completions' },
  'openai-response': { name: 'Responses', uri: '/v1/responses' },
  anthropic: { name: 'Messages', uri: '/v1/messages' },
  gemini: { name: 'Generate Content', uri: '/v1beta/models/{model}:generateContent' },
  'jina-rerank': { name: 'Rerank', uri: '/rerank' },
  'image-generation': { name: 'Image Generation', uri: '/v1/images/generations' },
};

const nameRuleOptions = [
  { label: '精确名称匹配', value: 0 },
  { label: '前缀名称匹配', value: 1 },
  { label: '包含名称匹配', value: 2 },
  { label: '后缀名称匹配', value: 3 },
];

const splitCsv = (val) => {
  if (val === undefined || val === null || val === '') return [];
  if (Array.isArray(val)) {
    return val.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof val !== 'string') return [];
  return val
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeEndpoints = (val) => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch (_) {
    return String(val);
  }
};

const normalizeBooleanFlag = (value, defaultValue = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true') return true;
    if (normalized === '0' || normalized === 'false') return false;
  }
  return defaultValue;
};

const normalizeModelForForm = (raw) => {
  const model = raw && typeof raw === 'object' ? raw : {};
  const tags = Array.isArray(model.tags)
    ? model.tags
    : typeof model.tags === 'string'
      ? model.tags.split(',')
      : [];

  const nameRule =
    model.name_rule === undefined || model.name_rule === null || model.name_rule === ''
      ? undefined
      : Number(model.name_rule);

  const vendorId =
    model.vendor_id === undefined || model.vendor_id === null || model.vendor_id === ''
      ? undefined
      : typeof model.vendor_id === 'string'
        ? parseInt(model.vendor_id, 10)
        : model.vendor_id;

  return {
    model_name: model.model_name || '',
    display_name: model.display_name || '',
    description: model.description || '',
    icon: model.icon || '',
    tags: tags.map((tag) => String(tag).trim()).filter(Boolean),
    vendor_id: vendorId || undefined,
    endpoints: normalizeEndpoints(model.endpoints),
    input_types: splitCsv(model.input_types),
    output_types: splitCsv(model.output_types),
    total_context: model.total_context ?? undefined,
    max_output: model.max_output ?? undefined,
    openrouter_slug: model.openrouter_slug || '',
    openrouter_created: model.openrouter_created ?? undefined,
    openrouter_hugging_face_id: model.openrouter_hugging_face_id || '',
    openrouter_input_modalities: splitCsv(model.openrouter_input_modalities),
    openrouter_output_modalities: splitCsv(model.openrouter_output_modalities),
    openrouter_quantization: model.openrouter_quantization || '',
    openrouter_pricing_prompt: model.openrouter_pricing_prompt || '',
    openrouter_pricing_completion: model.openrouter_pricing_completion || '',
    openrouter_pricing_image: model.openrouter_pricing_image || '',
    openrouter_pricing_request: model.openrouter_pricing_request || '',
    openrouter_pricing_input_cache_read: model.openrouter_pricing_input_cache_read || '',
    openrouter_pricing_input_cache_write: model.openrouter_pricing_input_cache_write || '',
    openrouter_supported_sampling_parameters: splitCsv(
      model.openrouter_supported_sampling_parameters,
    ),
    openrouter_supported_features: splitCsv(model.openrouter_supported_features),
    name_rule: Number.isFinite(nameRule) ? nameRule : undefined,
    status: normalizeBooleanFlag(model.status, true),
    sync_official: normalizeBooleanFlag(model.sync_official ?? 1, true),
  };
};

const EditModelModal = (props) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();
  const formApiRef = useRef(null);
  const isEdit = props.editingModel && props.editingModel.id !== undefined;
  const placement = useMemo(() => (isEdit ? 'right' : 'left'), [isEdit]);

  // 供应商列表
  const [vendors, setVendors] = useState([]);

  // 预填组（标签、端点）
  const [tagGroups, setTagGroups] = useState([]);
  const [endpointGroups, setEndpointGroups] = useState([]);

  // 获取供应商列表
  const fetchVendors = async () => {
    try {
      const res = await API.get('/api/vendors/?page_size=1000'); // 获取全部供应商
      if (res.data.success) {
        const items = res.data.data.items || res.data.data || [];
        setVendors(Array.isArray(items) ? items : []);
      }
    } catch (error) {
      // ignore
    }
  };

  // 获取预填组（标签、端点）
  const fetchPrefillGroups = async () => {
    try {
      const [tagRes, endpointRes] = await Promise.all([
        API.get('/api/prefill_group?type=tag'),
        API.get('/api/prefill_group?type=endpoint'),
      ]);
      if (tagRes?.data?.success) {
        setTagGroups(tagRes.data.data || []);
      }
      if (endpointRes?.data?.success) {
        setEndpointGroups(endpointRes.data.data || []);
      }
    } catch (error) {
      // ignore
    }
  };

  useEffect(() => {
    if (props.visiable) {
      fetchVendors();
      fetchPrefillGroups();
    }
  }, [props.visiable]);

  const getInitValues = () => {
    const prefill = normalizeModelForForm(props.editingModel);
    const nameRule =
      prefill.name_rule !== undefined ? prefill.name_rule : prefill.model_name ? 0 : undefined;

    return {
      model_name: '',
      display_name: '',
      description: '',
      icon: '',
      tags: [],
      vendor_id: undefined,
      vendor: '',
      vendor_icon: '',
      endpoints: '',
      input_types: [],
      output_types: [],
      total_context: undefined,
      max_output: undefined,
      openrouter_slug: '',
      openrouter_created: undefined,
      openrouter_hugging_face_id: '',
      openrouter_input_modalities: [],
      openrouter_output_modalities: [],
      openrouter_quantization: '',
      openrouter_pricing_prompt: '',
      openrouter_pricing_completion: '',
      openrouter_pricing_image: '',
      openrouter_pricing_request: '',
      openrouter_pricing_input_cache_read: '',
      openrouter_pricing_input_cache_write: '',
      openrouter_supported_sampling_parameters: [],
      openrouter_supported_features: [],
      status: true,
      sync_official: true,
      ...prefill,
      name_rule: nameRule, // 通过未配置模型过来的固定为精确匹配
    };
  };

  const handleCancel = () => {
    props.handleClose();
  };

  const loadModel = async () => {
    if (!isEdit || !props.editingModel.id) return;

    setLoading(true);
    try {
      const res = await API.get(`/api/models/${props.editingModel.id}`);
      const { success, message, data } = res.data;
      if (success) {
        const normalized = normalizeModelForForm(data);
        if (formApiRef.current) {
          formApiRef.current.setValues({ ...getInitValues(), ...normalized });
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('加载模型信息失败'));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (formApiRef.current) {
      if (!isEdit) {
        formApiRef.current.setValues(getInitValues());
      }
    }
  }, [props.editingModel?.id, props.editingModel?.model_name]);

  useEffect(() => {
    if (props.visiable) {
      if (isEdit) {
        loadModel();
      } else {
        formApiRef.current?.setValues(getInitValues());
      }
    } else {
      formApiRef.current?.reset();
    }
  }, [props.visiable, props.editingModel?.id, props.editingModel?.model_name]);

  const submit = async (values) => {
    setLoading(true);
    try {
      const joinCsv = (val) => {
        if (!val) return '';
        if (Array.isArray(val)) {
          return val
            .map((v) => String(v).trim())
            .filter(Boolean)
            .join(',');
        }
        return String(val);
      };
      const submitData = {
        ...values,
        tags: Array.isArray(values.tags) ? values.tags.join(',') : values.tags,
        endpoints: values.endpoints || '',
        input_types: joinCsv(values.input_types).toLowerCase(),
        output_types: joinCsv(values.output_types).toLowerCase(),
        openrouter_input_modalities: joinCsv(values.openrouter_input_modalities),
        openrouter_output_modalities: joinCsv(values.openrouter_output_modalities),
        openrouter_supported_sampling_parameters: joinCsv(
          values.openrouter_supported_sampling_parameters,
        ),
        openrouter_supported_features: joinCsv(values.openrouter_supported_features),
        status: values.status ? 1 : 0,
        sync_official: values.sync_official ? 1 : 0,
      };

      if (isEdit) {
        submitData.id = props.editingModel.id;
        const res = await API.put('/api/models/', submitData);
        const { success, message } = res.data;
        if (success) {
          showSuccess(t('模型更新成功！'));
          props.refresh();
          props.handleClose();
        } else {
          showError(t(message));
        }
      } else {
        const res = await API.post('/api/models/', submitData);
        const { success, message } = res.data;
        if (success) {
          showSuccess(t('模型创建成功！'));
          props.refresh();
          props.handleClose();
        } else {
          showError(t(message));
        }
      }
    } catch (error) {
      showError(error.response?.data?.message || t('操作失败'));
    }
    setLoading(false);
    formApiRef.current?.setValues(getInitValues());
  };

  return (
    <SideSheet
      placement={placement}
      title={
        <Space>
          {isEdit ? (
            <Tag color='blue' shape='circle'>
              {t('更新')}
            </Tag>
          ) : (
            <Tag color='green' shape='circle'>
              {t('新建')}
            </Tag>
          )}
          <Title heading={4} className='m-0'>
            {isEdit ? t('更新模型信息') : t('创建新的模型')}
          </Title>
        </Space>
      }
      bodyStyle={{ padding: '0' }}
      visible={props.visiable}
      width={isMobile ? '100%' : 600}
      footer={
        <div className='flex justify-end bg-white'>
          <Space>
            <Button
              theme='solid'
              className='!rounded-lg'
              onClick={() => formApiRef.current?.submitForm()}
              icon={<Save size={16} />}
              loading={loading}
            >
              {t('提交')}
            </Button>
            <Button
              theme='light'
              className='!rounded-lg'
              type='primary'
              onClick={handleCancel}
              icon={<X size={16} />}
            >
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
      closeIcon={null}
      onCancel={() => handleCancel()}
    >
      <Spin spinning={loading}>
        <Form
          key={isEdit ? 'edit' : 'new'}
          initValues={getInitValues()}
          getFormApi={(api) => (formApiRef.current = api)}
          onSubmit={submit}
        >
          {({ values }) => (
            <div className='p-2'>
              {/* 基本信息 */}
              <Card className='!rounded-2xl shadow-sm border-0'>
                <div className='flex items-center mb-2'>
                  <Avatar size='small' color='green' className='mr-2 shadow-md'>
                    <FileText size={16} />
                  </Avatar>
                  <div>
                    <Text className='text-lg font-medium'>{t('基本信息')}</Text>
                    <div className='text-xs text-gray-600'>
                      {t('设置模型的基本信息')}
                    </div>
                  </div>
                </div>
                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='model_name'
                      label={t('模型 ID')}
                      placeholder={t('请输入模型 ID，如：gpt-4')}
                      rules={[{ required: true, message: t('请输入模型 ID') }]}
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.Input
                      field='display_name'
                      label={t('模型名称')}
                      placeholder={t('用于前端展示的名称（可选）')}
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.Select
                      field='name_rule'
                      label={t('名称匹配类型')}
                      placeholder={t('请选择名称匹配类型')}
                      optionList={nameRuleOptions.map((o) => ({
                        label: t(o.label),
                        value: o.value,
                      }))}
                      rules={[
                        { required: true, message: t('请选择名称匹配类型') },
                      ]}
                      extraText={t(
                        '根据模型名称和匹配规则查找模型元数据，优先级：精确 > 前缀 > 后缀 > 包含',
                      )}
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.Input
                      field='icon'
                      label={t('模型图标')}
                      placeholder={t('请输入图标名称')}
                      extraText={
                        <span>
                          {t(
                            "图标使用@lobehub/icons库，如：OpenAI、Claude.Color，支持链式参数：OpenAI.Avatar.type={'platform'}、OpenRouter.Avatar.shape={'square'}，查询所有可用图标请 ",
                          )}
                          <Typography.Text
                            link={{
                              href: 'https://icons.lobehub.com/components/lobe-hub',
                              target: '_blank',
                            }}
                            icon={<IconLink />}
                            underline
                          >
                            {t('请点击我')}
                          </Typography.Text>
                        </span>
                      }
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.TextArea
                      field='description'
                      label={t('描述')}
                      placeholder={t('请输入模型描述')}
                      rows={3}
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.InputNumber
                      field='total_context'
                      label={t('Total Context')}
                      placeholder='e.g. 128000'
                      min={0}
                      extraText='Unit: tokens; leave empty if unknown'
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.InputNumber
                      field='max_output'
                      label={t('Max Output')}
                      placeholder='e.g. 4096'
                      min={0}
                      extraText='Unit: tokens; leave empty if unknown'
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.TagInput
                      field='tags'
                      label={t('标签')}
                      placeholder={t('输入标签或使用","分隔多个标签')}
                      addOnBlur
                      showClear
                      onChange={(newTags) => {
                        if (!formApiRef.current) return;
                        const normalize = (tags) => {
                          if (!Array.isArray(tags)) return [];
                          return [
                            ...new Set(
                              tags.flatMap((tag) =>
                                tag
                                  .split(',')
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              ),
                            ),
                          ];
                        };
                        const normalized = normalize(newTags);
                        formApiRef.current.setValue('tags', normalized);
                      }}
                      style={{ width: '100%' }}
                      {...(tagGroups.length > 0 && {
                        extraText: (
                          <Space wrap>
                            {tagGroups.map((group) => (
                              <Button
                                key={group.id}
                                size='small'
                                type='primary'
                                onClick={() => {
                                  if (formApiRef.current) {
                                    const currentTags =
                                      formApiRef.current.getValue('tags') || [];
                                    const newTags = [
                                      ...currentTags,
                                      ...(group.items || []),
                                    ];
                                    const uniqueTags = [...new Set(newTags)];
                                    formApiRef.current.setValue(
                                      'tags',
                                      uniqueTags,
                                    );
                                  }
                                }}
                              >
                                {group.name}
                              </Button>
                            ))}
                          </Space>
                        ),
                      })}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Select
                      field='vendor_id'
                      label={t('供应商')}
                      placeholder={t('选择模型供应商')}
                      optionList={vendors.map((v) => ({
                        label: v.name,
                        value: v.id,
                      }))}
                      filter
                      showClear
                      onChange={(value) => {
                        const vendorInfo = vendors.find((v) => v.id === value);
                        if (vendorInfo && formApiRef.current) {
                          formApiRef.current.setValue(
                            'vendor',
                            vendorInfo.name,
                          );
                        }
                      }}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.TagInput
                      field='input_types'
                      label={t('支持输入类型')}
                      placeholder='Text / Image / Video / Audio'
                      addOnBlur
                      showClear
                      extraText={t('可选：text, image, video, audio')}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={24}>
                    <Form.TagInput
                      field='output_types'
                      label={t('支持输出类型')}
                      placeholder='Text / Image / Video / Audio'
                      addOnBlur
                      showClear
                      extraText={t('可选：text, image, video, audio')}
                      style={{ width: '100%' }}
                    />
                  </Col>
                  <Col span={24}>
                    <JSONEditor
                      field='endpoints'
                      label={
                        <span className='inline-flex items-center gap-2'>
                          <span>{t('端点映射')}</span>
                          <Tooltip
                            position='top'
                            content={t(
                              '提示：端点映射仅用于模型广场展示，不会影响模型真实调用。如需配置真实调用，请前往「渠道管理」。',
                            )}
                          >
                            <IconInfoCircle
                              size='small'
                              className='text-gray-400 cursor-help'
                            />
                          </Tooltip>
                        </span>
                      }
                      placeholder={
                        '{\n  "openai": {"name": "Chat Completions", "uri": "/v1/chat/completions"}\n}'
                      }
                      value={values.endpoints}
                      onChange={(val) =>
                        formApiRef.current?.setValue('endpoints', val)
                      }
                      formApi={formApiRef.current}
                      editorType='object'
                      template={ENDPOINT_TEMPLATE}
                      templateLabel={t('填入模板')}
                      extraText={t('用于模型详情页展示；支持 string(URI) 或 {name, uri}（历史 {path, method} 仍兼容）')}
                      extraFooter={
                        endpointGroups.length > 0 && (
                          <Space wrap>
                            {endpointGroups.map((group) => (
                              <Button
                                key={group.id}
                                size='small'
                                type='primary'
                                onClick={() => {
                                  try {
                                    const current =
                                      formApiRef.current?.getValue(
                                        'endpoints',
                                      ) || '';
                                    let base = {};
                                    if (current && current.trim())
                                      base = JSON.parse(current);
                                    const groupObj =
                                      typeof group.items === 'string'
                                        ? JSON.parse(group.items || '{}')
                                        : group.items || {};
                                    const merged = { ...base, ...groupObj };
                                    formApiRef.current?.setValue(
                                      'endpoints',
                                      JSON.stringify(merged, null, 2),
                                    );
                                  } catch (e) {
                                    try {
                                      const groupObj =
                                        typeof group.items === 'string'
                                          ? JSON.parse(group.items || '{}')
                                          : group.items || {};
                                      formApiRef.current?.setValue(
                                        'endpoints',
                                        JSON.stringify(groupObj, null, 2),
                                      );
                                    } catch {}
                                  }
                                }}
                              >
                                {group.name}
                              </Button>
                            ))}
                          </Space>
                        )
                      }
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Switch
                      field='sync_official'
                      label={t('参与官方同步')}
                      extraText={t(
                        '关闭后，此模型将不会被“同步官方”自动覆盖或创建',
                      )}
                      size='large'
                    />
                  </Col>
                  <Col span={24}>
                    <Form.Switch
                      field='status'
                      label={t('状态')}
                      size='large'
                    />
                  </Col>
                </Row>
              </Card>

              {/* OpenRouter 元数据 */}
              <Card className='!rounded-2xl shadow-sm border-0 mt-3'>
                <div className='flex items-center mb-2'>
                  <Avatar size='small' color='violet' className='mr-2 shadow-md'>
                    <FileText size={16} />
                  </Avatar>
                  <div>
                    <Text className='text-lg font-medium'>
                      {t('OpenRouter 元数据')}
                    </Text>
                    <div className='text-xs text-gray-600'>
                      {t(
                        '用于 /v1/models/openrouter 输出展示；不影响真实计费与调用。',
                      )}
                    </div>
                  </div>
                </div>

                <Row gutter={12}>
                  <Col span={24}>
                    <Form.Input
                      field='openrouter_slug'
                      label={t('OpenRouter Slug')}
                      placeholder={t('留空则默认等于模型 ID')}
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.InputNumber
                      field='openrouter_created'
                      label={t('Created (Unix Timestamp)')}
                      placeholder='e.g. 1690502400'
                      min={0}
                      extraText={t('留空则使用本条元数据的创建时间')}
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.Input
                      field='openrouter_hugging_face_id'
                      label={t('HuggingFace ID')}
                      placeholder={t('模型位于 Hugging Face 时填写（可选）')}
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.Input
                      field='openrouter_quantization'
                      label={t('Quantization')}
                      placeholder='e.g. fp8'
                      showClear
                    />
                  </Col>

                  <Col span={24}>
                    <Form.TagInput
                      field='openrouter_input_modalities'
                      label={t('Input Modalities')}
                      placeholder={t('例如：text,image,file')}
                      addOnBlur
                      showClear
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.TagInput
                      field='openrouter_output_modalities'
                      label={t('Output Modalities')}
                      placeholder={t('例如：text,image,file')}
                      addOnBlur
                      showClear
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.TagInput
                      field='openrouter_supported_sampling_parameters'
                      label={t('Supported Sampling Parameters')}
                      placeholder={t('例如：temperature,stop')}
                      addOnBlur
                      showClear
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={24}>
                    <Form.TagInput
                      field='openrouter_supported_features'
                      label={t('Supported Features')}
                      placeholder={t(
                        '例如：tools,json_mode,structured_outputs,web_search,reasoning',
                      )}
                      addOnBlur
                      showClear
                      style={{ width: '100%' }}
                    />
                  </Col>

                  <Col span={12}>
                    <Form.Input
                      field='openrouter_pricing_prompt'
                      label={t('Pricing: prompt (per token)')}
                      placeholder='e.g. 0.000008'
                      showClear
                    />
                  </Col>
                  <Col span={12}>
                    <Form.Input
                      field='openrouter_pricing_completion'
                      label={t('Pricing: completion (per token)')}
                      placeholder='e.g. 0.000024'
                      showClear
                    />
                  </Col>

                  <Col span={12}>
                    <Form.Input
                      field='openrouter_pricing_image'
                      label={t('Pricing: image (per image)')}
                      placeholder='e.g. 0'
                      showClear
                    />
                  </Col>
                  <Col span={12}>
                    <Form.Input
                      field='openrouter_pricing_request'
                      label={t('Pricing: request (per request)')}
                      placeholder='e.g. 0'
                      showClear
                    />
                  </Col>

                  <Col span={12}>
                    <Form.Input
                      field='openrouter_pricing_input_cache_read'
                      label={t('Pricing: input_cache_read (per token)')}
                      placeholder='e.g. 0'
                      showClear
                    />
                  </Col>
                  <Col span={12}>
                    <Form.Input
                      field='openrouter_pricing_input_cache_write'
                      label={t('Pricing: input_cache_write (per token)')}
                      placeholder='e.g. 0'
                      showClear
                    />
                  </Col>
                </Row>
              </Card>
            </div>
          )}
        </Form>
      </Spin>
    </SideSheet>
  );
};

export default EditModelModal;
