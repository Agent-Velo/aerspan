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

import React from 'react';
import { Tag, Space } from '@douyinfe/semi-ui';
import {
  renderModelTag,
  stringToColor,
  calculateModelPrice,
  getLobeHubIcon,
} from '../../../../../helpers';
import {
  renderLimitedItems,
  renderDescription,
} from '../../../../common/ui/RenderUtils';
import { useIsMobile } from '../../../../../hooks/common/useIsMobile';

function renderQuotaType(type, t) {
  switch (type) {
    case 1:
      return (
        <Tag color='teal' shape='circle'>
          {t('按次计费')}
        </Tag>
      );
    case 0:
      return (
        <Tag color='violet' shape='circle'>
          {t('按量计费')}
        </Tag>
      );
    default:
      return t('未知');
  }
}

const renderTokenCount = (value) => {
  if (value === undefined || value === null || value === 0) return '-';
  return value;
};

// Render vendor name
const renderVendor = (vendorName, vendorIcon, t) => {
  if (!vendorName) return '-';
  return (
    <Tag
      color='white'
      shape='circle'
      prefixIcon={getLobeHubIcon(vendorIcon || 'Layers', 14)}
    >
      {vendorName}
    </Tag>
  );
};

// Render tags list using RenderUtils
const renderTags = (text) => {
  if (!text) return '-';
  const tagsArr = text.split(',').filter((tag) => tag.trim());
  return renderLimitedItems({
    items: tagsArr,
    renderItem: (tag, idx) => (
      <Tag
        key={idx}
        color={stringToColor(tag.trim())}
        shape='circle'
        size='small'
      >
        {tag.trim()}
      </Tag>
    ),
    maxDisplay: 3,
  });
};

function renderSupportedEndpoints(endpoints) {
  if (!endpoints || endpoints.length === 0) {
    return null;
  }
  return (
    <Space wrap>
      {endpoints.map((endpoint, idx) => (
        <Tag key={endpoint} color={stringToColor(endpoint)} shape='circle'>
          {endpoint}
        </Tag>
      ))}
    </Space>
  );
}

export const getPricingTableColumns = ({
  t,
  copyText,
  tokenUnit,
  displayPrice,
}) => {
  const isMobile = useIsMobile();
  const priceDataCache = new WeakMap();

  const getPriceData = (record) => {
    let cache = priceDataCache.get(record);
    if (!cache) {
      cache = calculateModelPrice({
        record,
        tokenUnit,
        displayPrice,
      });
      priceDataCache.set(record, cache);
    }
    return cache;
  };

  const endpointColumn = {
    title: t('可用端点类型'),
    dataIndex: 'supported_endpoint_types',
    render: (text, record, index) => {
      return renderSupportedEndpoints(text);
    },
  };

  const modelNameColumn = {
    title: t('模型名称'),
    dataIndex: 'model_name',
    render: (text, record, index) => {
      return renderModelTag(text, {
        label: record.display_name || text,
        onClick: () => {
          copyText(text);
        },
      });
    },
    onFilter: (value, record) =>
      record.model_name.toLowerCase().includes(value.toLowerCase()) ||
      (record.display_name || '').toLowerCase().includes(value.toLowerCase()),
  };

  const quotaColumn = {
    title: t('计费类型'),
    dataIndex: 'quota_type',
    render: (text, record, index) => {
      return renderQuotaType(parseInt(text), t);
    },
    sorter: (a, b) => a.quota_type - b.quota_type,
  };

  const descriptionColumn = {
    title: t('描述'),
    dataIndex: 'description',
    render: (text) => renderDescription(text, 200),
  };

  const tagsColumn = {
    title: t('标签'),
    dataIndex: 'tags',
    render: renderTags,
  };

  const vendorColumn = {
    title: t('供应商'),
    dataIndex: 'vendor_name',
    render: (text, record) => renderVendor(text, record.vendor_icon, t),
  };

  const baseColumns = [
    modelNameColumn,
    vendorColumn,
    descriptionColumn,
    tagsColumn,
    {
      title: t('Total Context'),
      dataIndex: 'total_context',
      render: renderTokenCount,
      sorter: (a, b) => (a.total_context || 0) - (b.total_context || 0),
    },
    {
      title: t('Max Output'),
      dataIndex: 'max_output',
      render: renderTokenCount,
      sorter: (a, b) => (a.max_output || 0) - (b.max_output || 0),
    },
    quotaColumn,
  ];

  const priceColumn = {
    title: t('模型价格'),
    dataIndex: 'model_price',
    ...(isMobile ? {} : { fixed: 'right' }),
    render: (text, record, index) => {
      const priceData = getPriceData(record);

      if (priceData.isPerToken) {
        return (
          <div className='space-y-1'>
            <div className='text-gray-700'>
              {t('输入')} {priceData.inputPrice} / 1{priceData.unitLabel} tokens
            </div>
            <div className='text-gray-700'>
              {t('输出')} {priceData.outputPrice} / 1{priceData.unitLabel}{' '}
              tokens
            </div>
          </div>
        );
      } else {
        return (
          <div className='text-gray-700'>
            {t('模型价格')}：{priceData.price}
          </div>
        );
      }
    },
  };

  const columns = [...baseColumns];
  columns.push(endpointColumn);
  columns.push(priceColumn);
  return columns;
};
