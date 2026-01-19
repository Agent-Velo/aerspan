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

import React, { useMemo } from 'react';
import { Card, Avatar, Typography, Tag } from '@douyinfe/semi-ui';
import { IconCoinMoneyStroked } from '@douyinfe/semi-icons';
import { calculateModelPrice } from '../../../../../helpers';

const { Text } = Typography;

const ModelPricingTable = ({
  modelData,
  tokenUnit,
  displayPrice,
  t,
}) => {
  const priceData = useMemo(() => {
    if (!modelData) return null;
    return calculateModelPrice({
      record: modelData,
      tokenUnit,
      displayPrice,
    });
  }, [displayPrice, modelData, tokenUnit]);

  if (!modelData || !priceData) {
    return null;
  }

  const unitLabel = tokenUnit === 'K' ? '1K' : '1M';
  const billingTypeTag =
    modelData?.quota_type === 0 ? t('按量计费') : t('按次计费');

  return (
    <Card className='!rounded-2xl shadow-sm border-0'>
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='orange' className='mr-2 shadow-md'>
          <IconCoinMoneyStroked size={16} />
        </Avatar>
        <div>
          <Text className='text-lg font-medium'>{t('模型价格')}</Text>
        </div>
      </div>

      <div className='flex items-center gap-2 mb-3'>
        <Tag color='white' size='small' shape='circle'>
          {billingTypeTag}
        </Tag>
      </div>

      {modelData?.quota_type === 0 ? (
        <div className='space-y-3'>
          <div className='flex items-end justify-between'>
            <div className='text-sm text-gray-600'>{t('输入')}</div>
            <div className='text-right'>
              <div className='font-semibold text-orange-600'>
                {priceData.inputPrice}
              </div>
              <div className='text-xs text-gray-500'>/ {unitLabel} tokens</div>
            </div>
          </div>
          <div className='flex items-end justify-between'>
            <div className='text-sm text-gray-600'>{t('输出')}</div>
            <div className='text-right'>
              <div className='font-semibold text-orange-600'>
                {priceData.outputPrice}
              </div>
              <div className='text-xs text-gray-500'>/ {unitLabel} tokens</div>
            </div>
          </div>
        </div>
      ) : (
        <div className='flex items-end justify-between'>
          <div className='text-sm text-gray-600'>{t('价格')}</div>
          <div className='text-right'>
            <div className='font-semibold text-orange-600'>{priceData.price}</div>
            <div className='text-xs text-gray-500'>/ {t('次')}</div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default ModelPricingTable;
