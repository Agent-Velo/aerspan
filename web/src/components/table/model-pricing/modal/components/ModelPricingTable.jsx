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
import { Card, Avatar, Typography, Table, Tag } from '@douyinfe/semi-ui';
import { IconCoinMoneyStroked } from '@douyinfe/semi-icons';
import { API, calculateModelPrice } from '../../../../../helpers';

const { Text } = Typography;

const ModelPricingTable = ({
  modelData,
  tokenUnit,
  displayPrice,
  usableGroup,
  autoGroups = [],
  t,
}) => {
  const modelEnableGroups = Array.isArray(modelData?.enable_groups)
    ? modelData.enable_groups
    : [];
  const autoChain = autoGroups.filter((g) => modelEnableGroups.includes(g));
  const availableGroups = useMemo(
    () =>
      Object.keys(usableGroup || {})
        .filter((g) => g !== '' && g !== 'auto')
        .filter((g) => modelEnableGroups.includes(g)),
    [usableGroup, modelEnableGroups],
  );

  const [groupPricingMap, setGroupPricingMap] = useState({});
  const [tableLoading, setTableLoading] = useState(false);

  useEffect(() => {
    if (!modelData?.model_name || availableGroups.length === 0) {
      setGroupPricingMap({});
      return;
    }

    let cancelled = false;

    const fetchGroupPricing = async () => {
      setTableLoading(true);
      try {
        const results = await Promise.all(
          availableGroups.map(async (group) => {
            try {
              const res = await API.get(
                `/api/pricing?group=${encodeURIComponent(group)}&model=${encodeURIComponent(modelData.model_name)}`,
              );
              if (res.data?.success && Array.isArray(res.data?.data)) {
                return [group, res.data.data[0] || null];
              }
            } catch (e) {
              // ignore per-group errors
            }
            return [group, null];
          }),
        );

        if (cancelled) return;

        const next = {};
        results.forEach(([group, pricing]) => {
          next[group] = pricing;
        });
        setGroupPricingMap(next);
      } finally {
        if (!cancelled) setTableLoading(false);
      }
    };

    fetchGroupPricing();
    return () => {
      cancelled = true;
    };
  }, [modelData?.model_name, availableGroups]);

  const tableData = useMemo(
    () =>
      availableGroups.map((group) => {
        const record = groupPricingMap[group];
        const priceData = record
          ? calculateModelPrice({
              record,
              tokenUnit,
              displayPrice,
            })
          : null;

        return {
          key: group,
          group,
          billingType:
            modelData?.quota_type === 0
              ? t('按量计费')
              : modelData?.quota_type === 1
                ? t('按次计费')
                : '-',
          inputPrice:
            modelData?.quota_type === 0 ? priceData?.inputPrice || '-' : '-',
          outputPrice:
            modelData?.quota_type === 0 ? priceData?.outputPrice || '-' : '-',
          fixedPrice: modelData?.quota_type === 1 ? priceData?.price || '-' : '-',
        };
      }),
    [availableGroups, displayPrice, groupPricingMap, modelData?.quota_type, t, tokenUnit],
  );

  const columns = useMemo(() => {
    const cols = [
      {
        title: t('分组'),
        dataIndex: 'group',
        render: (text) => (
          <Tag color='white' size='small' shape='circle'>
            {text}
            {t('分组')}
          </Tag>
        ),
      },
      {
        title: t('计费类型'),
        dataIndex: 'billingType',
        render: (text) => {
          let color = 'white';
          if (text === t('按量计费')) color = 'violet';
          else if (text === t('按次计费')) color = 'teal';
          return (
            <Tag color={color} size='small' shape='circle'>
              {text || '-'}
            </Tag>
          );
        },
      },
    ];

    if (modelData?.quota_type === 0) {
      cols.push(
        {
          title: t('输入'),
          dataIndex: 'inputPrice',
          render: (text) => (
            <>
              <div className='font-semibold text-orange-600'>{text}</div>
              <div className='text-xs text-gray-500'>
                / {tokenUnit === 'K' ? '1K' : '1M'} tokens
              </div>
            </>
          ),
        },
        {
          title: t('输出'),
          dataIndex: 'outputPrice',
          render: (text) => (
            <>
              <div className='font-semibold text-orange-600'>{text}</div>
              <div className='text-xs text-gray-500'>
                / {tokenUnit === 'K' ? '1K' : '1M'} tokens
              </div>
            </>
          ),
        },
      );
    } else {
      cols.push({
        title: t('价格'),
        dataIndex: 'fixedPrice',
        render: (text) => (
          <>
            <div className='font-semibold text-orange-600'>{text}</div>
            <div className='text-xs text-gray-500'>/ 次</div>
          </>
        ),
      });
    }

    return cols;
  }, [modelData?.quota_type, t, tokenUnit]);

  return (
    <Card className='!rounded-2xl shadow-sm border-0'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='orange' className='mr-2 shadow-md'>
          <IconCoinMoneyStroked size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('分组价格')}</Text>
          <div className='text-xs text-gray-600'>
            {t('不同用户分组的价格信息')}
          </div>
        </div>
      </div>
      {autoChain.length > 0 && (
        <div className='flex flex-wrap items-center gap-1 mb-4'>
          <span className='text-sm text-gray-600'>{t('auto分组调用链路')}</span>
          <span className='text-sm'>→</span>
          {autoChain.map((g, idx) => (
            <React.Fragment key={g}>
              <Tag color='white' size='small' shape='circle'>
                {g}
                {t('分组')}
              </Tag>
              {idx < autoChain.length - 1 && <span className='text-sm'>→</span>}
            </React.Fragment>
          ))}
        </div>
      )}
      <Table
        dataSource={tableData}
        columns={columns}
        loading={tableLoading}
        pagination={false}
        size='small'
        bordered={false}
        className='!rounded-lg'
      />
    </Card>
  );
};

export default ModelPricingTable;
