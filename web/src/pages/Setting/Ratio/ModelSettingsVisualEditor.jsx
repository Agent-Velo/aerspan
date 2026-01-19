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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Table,
  Button,
  Input,
  Modal,
  Form,
  Space,
  RadioGroup,
  Radio,
  Checkbox,
  Tag,
} from '@douyinfe/semi-ui';
import { IconDelete, IconEdit, IconPlus, IconSave, IconSearch } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';

function parseJSONObject(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function buildModelRows({ modelPriceMap, modelInputPriceMap, modelOutputPriceMap }) {
  const modelNames = new Set([
    ...Object.keys(modelPriceMap),
    ...Object.keys(modelInputPriceMap),
    ...Object.keys(modelOutputPriceMap),
  ]);

  return Array.from(modelNames)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const modelPrice =
        modelPriceMap[name] === undefined ? '' : String(modelPriceMap[name]);
      const inputPrice =
        modelInputPriceMap[name] === undefined
          ? ''
          : String(modelInputPriceMap[name]);
      const outputPrice =
        modelOutputPriceMap[name] === undefined
          ? ''
          : String(modelOutputPriceMap[name]);

      const hasConflict =
        modelPrice !== '' && (inputPrice !== '' || outputPrice !== '');

      return {
        name,
        modelPrice,
        inputPrice,
        outputPrice,
        hasConflict,
      };
    });
}

export default function ModelSettingsVisualEditor(props) {
  const { t } = useTranslation();
  const [models, setModels] = useState([]);
  const [visible, setVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentModel, setCurrentModel] = useState(null);
  const [pricingMode, setPricingMode] = useState('per-token');
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [conflictOnly, setConflictOnly] = useState(false);
  const formRef = useRef(null);
  const pageSize = 10;

  useEffect(() => {
    const modelPriceMap = parseJSONObject(props.options?.ModelPrice);
    const modelInputPriceMap = parseJSONObject(props.options?.ModelInputPrice);
    const modelOutputPriceMap = parseJSONObject(props.options?.ModelOutputPrice);

    setModels(
      buildModelRows({
        modelPriceMap,
        modelInputPriceMap,
        modelOutputPriceMap,
      }),
    );
  }, [props.options]);

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      const keywordMatch = searchText ? model.name.includes(searchText) : true;
      const conflictMatch = conflictOnly ? model.hasConflict : true;
      return keywordMatch && conflictMatch;
    });
  }, [models, searchText, conflictOnly]);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredModels.slice(start, end);
  }, [filteredModels, currentPage]);

  const updateModelField = (name, field, value) => {
    if (value !== '' && Number.isNaN(Number(value))) {
      showError(t('请输入数字'));
      return;
    }

    setModels((prev) =>
      prev.map((m) => {
        if (m.name !== name) return m;
        const next = { ...m, [field]: value };
        next.hasConflict =
          next.modelPrice !== '' && (next.inputPrice !== '' || next.outputPrice !== '');
        return next;
      }),
    );
  };

  const openAddModal = () => {
    setIsEditMode(false);
    setPricingMode('per-token');
    setCurrentModel({ name: '', modelPrice: '', inputPrice: '', outputPrice: '' });
    setVisible(true);
  };

  const openEditModal = (record) => {
    setIsEditMode(true);
    const next = {
      name: record.name,
      modelPrice: record.modelPrice,
      inputPrice: record.inputPrice,
      outputPrice: record.outputPrice,
    };
    setPricingMode(next.modelPrice !== '' ? 'per-request' : 'per-token');
    setCurrentModel(next);
    setVisible(true);
  };

  const upsertModel = (model) => {
    setModels((prev) => {
      const exists = prev.some((m) => m.name === model.name);
      const nextRow = {
        name: model.name,
        modelPrice: model.modelPrice || '',
        inputPrice: model.inputPrice || '',
        outputPrice: model.outputPrice || '',
      };
      nextRow.hasConflict =
        nextRow.modelPrice !== '' &&
        (nextRow.inputPrice !== '' || nextRow.outputPrice !== '');

      const nextList = exists
        ? prev.map((m) => (m.name === model.name ? nextRow : m))
        : [...prev, nextRow];
      return nextList.sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  const deleteModel = (name) => {
    Modal.confirm({
      title: t('确认删除模型？'),
      content: name,
      okType: 'danger',
      onOk: () => {
        setModels((prev) => prev.filter((m) => m.name !== name));
      },
    });
  };

  const submitData = async () => {
    setLoading(true);
    try {
      const output = {
        ModelPrice: {},
        ModelInputPrice: {},
        ModelOutputPrice: {},
      };

      models.forEach((m) => {
        if (m.modelPrice !== '') {
          output.ModelPrice[m.name] = parseFloat(m.modelPrice);
          return;
        }
        if (m.inputPrice !== '') {
          output.ModelInputPrice[m.name] = parseFloat(m.inputPrice);
        }
        if (m.outputPrice !== '') {
          output.ModelOutputPrice[m.name] = parseFloat(m.outputPrice);
        }
      });

      const requestQueue = Object.entries(output).map(([key, value]) =>
        API.put('/api/option/', {
          key,
          value: JSON.stringify(value, null, 2),
        }),
      );
      const results = await Promise.all(requestQueue);
      for (const res of results) {
        if (!res?.data?.success) {
          showError(res?.data?.message || t('保存失败'));
          return;
        }
      }

      showSuccess(t('保存成功'));
      props.refresh();
    } catch (error) {
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: t('模型名称'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <span>
          {text}
          {record.hasConflict && (
            <Tag color='red' shape='circle' className='ml-2'>
              {t('矛盾')}
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: t('按次价格'),
      dataIndex: 'modelPrice',
      key: 'modelPrice',
      render: (text, record) => (
        <Input
          value={text}
          placeholder={t('$/次')}
          onChange={(value) => updateModelField(record.name, 'modelPrice', value)}
        />
      ),
    },
    {
      title: t('输入价格'),
      dataIndex: 'inputPrice',
      key: 'inputPrice',
      render: (text, record) => (
        <Input
          value={text}
          placeholder={t('$/1M tokens')}
          onChange={(value) => updateModelField(record.name, 'inputPrice', value)}
        />
      ),
    },
    {
      title: t('输出价格'),
      dataIndex: 'outputPrice',
      key: 'outputPrice',
      render: (text, record) => (
        <Input
          value={text}
          placeholder={t('$/1M tokens')}
          onChange={(value) => updateModelField(record.name, 'outputPrice', value)}
        />
      ),
    },
    {
      title: t('操作'),
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            icon={<IconEdit />}
            theme='borderless'
            onClick={() => openEditModal(record)}
          />
          <Button
            icon={<IconDelete />}
            theme='borderless'
            type='danger'
            onClick={() => deleteModel(record.name)}
          />
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space vertical style={{ width: '100%' }}>
        <Space wrap>
          <Button icon={<IconPlus />} onClick={openAddModal}>
            {t('添加模型')}
          </Button>
          <Button icon={<IconSave />} loading={loading} onClick={submitData}>
            {t('保存')}
          </Button>
          <Input
            prefix={<IconSearch />}
            placeholder={t('搜索模型')}
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              setCurrentPage(1);
            }}
            style={{ width: 220 }}
            showClear
          />
          <Checkbox
            checked={conflictOnly}
            onChange={(e) => {
              setConflictOnly(e.target.checked);
              setCurrentPage(1);
            }}
          >
            {t('仅显示矛盾定价')}
          </Checkbox>
        </Space>

        <Table
          columns={columns}
          dataSource={pagedData}
          pagination={{
            currentPage,
            pageSize,
            total: filteredModels.length,
            onPageChange: (page) => setCurrentPage(page),
            showTotal: true,
            showSizeChanger: false,
          }}
        />
      </Space>

      <Modal
        title={isEditMode ? t('编辑模型') : t('添加模型')}
        visible={visible}
        onCancel={() => {
          setVisible(false);
          setCurrentModel(null);
        }}
        onOk={() => {
          if (!currentModel?.name) {
            showError(t('请输入模型名称'));
            return;
          }
          if (
            currentModel.modelPrice !== '' &&
            Number.isNaN(Number(currentModel.modelPrice))
          ) {
            showError(t('请输入数字'));
            return;
          }
          if (
            currentModel.inputPrice !== '' &&
            Number.isNaN(Number(currentModel.inputPrice))
          ) {
            showError(t('请输入数字'));
            return;
          }
          if (
            currentModel.outputPrice !== '' &&
            Number.isNaN(Number(currentModel.outputPrice))
          ) {
            showError(t('请输入数字'));
            return;
          }

          const valuesToSave = { ...currentModel };
          if (pricingMode === 'per-request') {
            valuesToSave.inputPrice = '';
            valuesToSave.outputPrice = '';
          } else {
            valuesToSave.modelPrice = '';
          }

          upsertModel(valuesToSave);
          setVisible(false);
          setCurrentModel(null);
        }}
      >
        <Form getFormApi={(api) => (formRef.current = api)}>
          <Form.Input
            field='name'
            label={t('模型名称')}
            placeholder='gpt-4o'
            required
            disabled={isEditMode}
            initValue={currentModel?.name || ''}
            onChange={(value) =>
              setCurrentModel((prev) => ({ ...(prev || {}), name: value }))
            }
          />

          <Form.Section text={t('定价模式')}>
            <div style={{ marginBottom: 16 }}>
              <RadioGroup
                type='button'
                value={pricingMode}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setPricingMode(nextMode);
                  if (!currentModel) return;
                  if (nextMode === 'per-request') {
                    setCurrentModel((prev) => ({
                      ...(prev || {}),
                      inputPrice: '',
                      outputPrice: '',
                    }));
                  } else {
                    setCurrentModel((prev) => ({ ...(prev || {}), modelPrice: '' }));
                  }
                }}
              >
                <Radio value='per-token'>{t('按量计费')}</Radio>
                <Radio value='per-request'>{t('按次计费')}</Radio>
              </RadioGroup>
            </div>
          </Form.Section>

          {pricingMode === 'per-request' ? (
            <Form.Input
              field='modelPrice'
              label={t('按次价格')}
              placeholder={t('$/次')}
              initValue={currentModel?.modelPrice || ''}
              onChange={(value) =>
                setCurrentModel((prev) => ({
                  ...(prev || {}),
                  modelPrice: value,
                }))
              }
            />
          ) : (
            <>
              <Form.Input
                field='inputPrice'
                label={t('输入价格')}
                placeholder={t('$/1M tokens')}
                initValue={currentModel?.inputPrice || ''}
                onChange={(value) =>
                  setCurrentModel((prev) => ({
                    ...(prev || {}),
                    inputPrice: value,
                  }))
                }
              />
              <Form.Input
                field='outputPrice'
                label={t('输出价格')}
                placeholder={t('$/1M tokens')}
                initValue={currentModel?.outputPrice || ''}
                onChange={(value) =>
                  setCurrentModel((prev) => ({
                    ...(prev || {}),
                    outputPrice: value,
                  }))
                }
              />
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}

