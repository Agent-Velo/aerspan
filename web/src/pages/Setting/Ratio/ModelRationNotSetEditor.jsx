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

import React, { useEffect, useMemo, useState } from 'react';
import { Table, Button, Input, Modal, Space, RadioGroup, Radio } from '@douyinfe/semi-ui';
import { IconSave, IconBolt, IconSearch } from '@douyinfe/semi-icons';
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

export default function ModelRatioNotSetEditor(props) {
  const { t } = useTranslation();
  const [enabledModels, setEnabledModels] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const [batchVisible, setBatchVisible] = useState(false);
  const [batchMode, setBatchMode] = useState('per-token');
  const [batchInputPrice, setBatchInputPrice] = useState('');
  const [batchOutputPrice, setBatchOutputPrice] = useState('');
  const [batchModelPrice, setBatchModelPrice] = useState('');

  const fetchEnabledModels = async () => {
    try {
      const res = await API.get('/api/channel/models_enabled');
      const { success, message, data } = res.data;
      if (success) {
        setEnabledModels(Array.isArray(data) ? data : []);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('获取启用模型失败'));
    }
  };

  useEffect(() => {
    fetchEnabledModels();
  }, []);

  useEffect(() => {
    const modelPriceMap = parseJSONObject(props.options?.ModelPrice);
    const modelInputPriceMap = parseJSONObject(props.options?.ModelInputPrice);
    const modelOutputPriceMap = parseJSONObject(props.options?.ModelOutputPrice);

    const unsetModels = enabledModels.filter((name) => {
      const hasPerCall = modelPriceMap[name] !== undefined;
      const hasPerToken = modelInputPriceMap[name] !== undefined;
      return !hasPerCall && !hasPerToken;
    });

    setRows(
      unsetModels
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          key: name,
          name,
          modelPrice: '',
          inputPrice: '',
          outputPrice: '',
        })),
    );
    setSelectedRowKeys([]);
  }, [props.options, enabledModels]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim();
    if (!keyword) return rows;
    return rows.filter((r) => r.name.includes(keyword));
  }, [rows, searchText]);

  const updateRow = (name, field, value) => {
    if (value !== '' && Number.isNaN(Number(value))) {
      showError(t('请输入数字'));
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.name === name ? { ...r, [field]: value } : r)),
    );
  };

  const applyBatch = () => {
    if (selectedRowKeys.length === 0) {
      showError(t('请先选择模型'));
      return;
    }

    if (batchMode === 'per-request') {
      if (batchModelPrice !== '' && Number.isNaN(Number(batchModelPrice))) {
        showError(t('请输入数字'));
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          selectedRowKeys.includes(r.key)
            ? {
                ...r,
                modelPrice: batchModelPrice,
                inputPrice: '',
                outputPrice: '',
              }
            : r,
        ),
      );
    } else {
      if (batchInputPrice !== '' && Number.isNaN(Number(batchInputPrice))) {
        showError(t('请输入数字'));
        return;
      }
      if (batchOutputPrice !== '' && Number.isNaN(Number(batchOutputPrice))) {
        showError(t('请输入数字'));
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          selectedRowKeys.includes(r.key)
            ? {
                ...r,
                modelPrice: '',
                inputPrice: batchInputPrice,
                outputPrice: batchOutputPrice,
              }
            : r,
        ),
      );
    }

    setBatchVisible(false);
  };

  const submit = async () => {
    setLoading(true);
    try {
      const modelPriceMap = parseJSONObject(props.options?.ModelPrice);
      const modelInputPriceMap = parseJSONObject(props.options?.ModelInputPrice);
      const modelOutputPriceMap = parseJSONObject(props.options?.ModelOutputPrice);

      rows.forEach((r) => {
        if (r.modelPrice !== '') {
          modelPriceMap[r.name] = parseFloat(r.modelPrice);
          delete modelInputPriceMap[r.name];
          delete modelOutputPriceMap[r.name];
          return;
        }
        if (r.inputPrice !== '') {
          modelInputPriceMap[r.name] = parseFloat(r.inputPrice);
        }
        if (r.outputPrice !== '') {
          modelOutputPriceMap[r.name] = parseFloat(r.outputPrice);
        }
      });

      const updates = [
        ['ModelPrice', modelPriceMap],
        ['ModelInputPrice', modelInputPriceMap],
        ['ModelOutputPrice', modelOutputPriceMap],
      ].map(([key, value]) =>
        API.put('/api/option/', { key, value: JSON.stringify(value, null, 2) }),
      );

      const results = await Promise.all(updates);
      for (const res of results) {
        if (!res?.data?.success) {
          showError(res?.data?.message || t('保存失败'));
          return;
        }
      }

      showSuccess(t('保存成功'));
      props.refresh();
      fetchEnabledModels();
    } catch (error) {
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
  };

  const columns = [
    {
      title: t('模型名称'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('按次价格'),
      dataIndex: 'modelPrice',
      key: 'modelPrice',
      render: (text, record) => (
        <Input
          value={text}
          placeholder={t('$/次')}
          onChange={(value) => updateRow(record.name, 'modelPrice', value)}
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
          onChange={(value) => updateRow(record.name, 'inputPrice', value)}
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
          onChange={(value) => updateRow(record.name, 'outputPrice', value)}
        />
      ),
    },
  ];

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          prefix={<IconSearch />}
          placeholder={t('搜索模型')}
          value={searchText}
          onChange={(value) => setSearchText(value)}
          showClear
          style={{ width: 220 }}
        />
        <Button
          icon={<IconBolt />}
          disabled={selectedRowKeys.length === 0}
          onClick={() => setBatchVisible(true)}
        >
          {t('批量设置')}
        </Button>
        <Button icon={<IconSave />} loading={loading} onClick={submit}>
          {t('保存')}
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={filteredRows}
        rowSelection={rowSelection}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={t('批量设置')}
        visible={batchVisible}
        onCancel={() => setBatchVisible(false)}
        onOk={applyBatch}
      >
        <Space vertical style={{ width: '100%' }}>
          <RadioGroup
            type='button'
            value={batchMode}
            onChange={(e) => setBatchMode(e.target.value)}
          >
            <Radio value='per-token'>{t('按量计费')}</Radio>
            <Radio value='per-request'>{t('按次计费')}</Radio>
          </RadioGroup>

          {batchMode === 'per-request' ? (
            <Input
              value={batchModelPrice}
              placeholder={t('$/次')}
              onChange={(value) => setBatchModelPrice(value)}
            />
          ) : (
            <>
              <Input
                value={batchInputPrice}
                placeholder={t('输入价格 $/1M tokens')}
                onChange={(value) => setBatchInputPrice(value)}
              />
              <Input
                value={batchOutputPrice}
                placeholder={t('输出价格 $/1M tokens')}
                onChange={(value) => setBatchOutputPrice(value)}
              />
            </>
          )}
        </Space>
      </Modal>
    </>
  );
}

