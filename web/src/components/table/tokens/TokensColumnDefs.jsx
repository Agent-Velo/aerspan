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
import { Button, Dropdown, Space, SplitButtonGroup, Tag, Input, Modal } from '@douyinfe/semi-ui';
import {
  timestamp2string,
  showError,
  formatTokenApiKey,
  getTokenApiKeyPrefix,
} from '../../../helpers';
import {
  IconTreeTriangleDown,
  IconCopy,
  IconEyeOpened,
  IconEyeClosed,
  IconRefresh,
} from '@douyinfe/semi-icons';

// Render functions
function renderTimestamp(timestamp) {
  return <>{timestamp2string(timestamp)}</>;
}

// Render status column only (no usage)
const renderStatus = (text, record, t) => {
  const disabled = text === 2;
  const tagColor = disabled ? 'red' : 'green';
  const tagText = disabled ? t('已禁用') : t('已启用');

  return (
    <Tag color={tagColor} shape='circle' size='small'>
      {tagText}
    </Tag>
  );
};

// Render token key column with show/hide and copy functionality
const renderTokenKey = (
  text,
  record,
  showKeys,
  setShowKeys,
  copyText,
  manageToken,
  t,
) => {
  const fullKey = formatTokenApiKey(record.key);
  const prefix = getTokenApiKeyPrefix(record.key);
  const maskedKey =
    prefix + record.key.slice(0, 4) + '**********' + record.key.slice(-4);
  const revealed = !!showKeys[record.id];

  return (
    <div className='w-[200px]'>
      <Input
        readOnly
        value={revealed ? fullKey : maskedKey}
        size='small'
        suffix={
          <div className='flex items-center'>
            <Button
              theme='borderless'
              size='small'
              type='tertiary'
              icon={revealed ? <IconEyeClosed /> : <IconEyeOpened />}
              aria-label='toggle token visibility'
              onClick={(e) => {
                e.stopPropagation();
                setShowKeys((prev) => ({ ...prev, [record.id]: !revealed }));
              }}
            />
            <Button
              theme='borderless'
              size='small'
              type='tertiary'
              icon={<IconCopy />}
              aria-label='copy token key'
              onClick={async (e) => {
                e.stopPropagation();
                await copyText(fullKey);
              }}
            />
            <Button
              theme='borderless'
              size='small'
              type='tertiary'
              icon={<IconRefresh />}
              aria-label='roll token key'
              onClick={(e) => {
                e.stopPropagation();
                Modal.confirm({
                  title: t('确定是否要重新生成密钥？'),
                  content: t('旧密钥将立即失效，请确认已更新所有使用方。'),
                  onOk: async () => {
                    await manageToken(record.id, 'roll', record);
                    setShowKeys((prev) => ({ ...prev, [record.id]: true }));
                  },
                });
              }}
            />
          </div>
        }
      />
    </div>
  );
};

// Render operations column
const renderOperations = (
  text,
  record,
  onOpenLink,
  setEditingToken,
  setShowEdit,
  manageToken,
  refresh,
  t,
) => {
  let chatsArray = [];
  try {
    const raw = localStorage.getItem('chats');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (let i = 0; i < parsed.length; i++) {
        const item = parsed[i];
        const name = Object.keys(item)[0];
        if (!name) continue;
        chatsArray.push({
          node: 'item',
          key: i,
          name,
          value: item[name],
          onClick: () => onOpenLink(name, item[name], record),
        });
      }
    }
  } catch (_) {
    showError(t('聊天链接配置错误，请联系管理员'));
  }

  return (
    <Space wrap>
      <SplitButtonGroup
        className='overflow-hidden'
        aria-label={t('项目操作按钮组')}
      >
        <Button
          size='small'
          type='tertiary'
          onClick={() => {
            if (chatsArray.length === 0) {
              showError(t('请联系管理员配置聊天链接'));
            } else {
              const first = chatsArray[0];
              onOpenLink(first.name, first.value, record);
            }
          }}
        >
          {t('聊天')}
        </Button>
        <Dropdown trigger='click' position='bottomRight' menu={chatsArray}>
          <Button
            type='tertiary'
            icon={<IconTreeTriangleDown />}
            size='small'
          ></Button>
        </Dropdown>
      </SplitButtonGroup>

      {record.status === 2 ? (
        <Button
          size='small'
          onClick={async () => {
            await manageToken(record.id, 'enable', record);
            await refresh();
          }}
        >
          {t('启用')}
        </Button>
      ) : (
        <Button
          type='danger'
          size='small'
          onClick={async () => {
            await manageToken(record.id, 'disable', record);
            await refresh();
          }}
        >
          {t('禁用')}
        </Button>
      )}

      <Button
        type='tertiary'
        size='small'
        onClick={() => {
          setEditingToken(record);
          setShowEdit(true);
        }}
      >
        {t('编辑')}
      </Button>

      <Button
        type='danger'
        size='small'
        onClick={() => {
          Modal.confirm({
            title: t('确定是否要删除此令牌？'),
            content: t('此修改将不可逆'),
            onOk: () => {
              (async () => {
                await manageToken(record.id, 'delete', record);
                await refresh();
              })();
            },
          });
        }}
      >
        {t('删除')}
      </Button>
    </Space>
  );
};

export const getTokensColumns = ({
  t,
  showKeys,
  setShowKeys,
  copyText,
  manageToken,
  onOpenLink,
  setEditingToken,
  setShowEdit,
  refresh,
}) => {
  return [
    {
      title: t('名称'),
      dataIndex: 'name',
    },
    {
      title: t('状态'),
      dataIndex: 'status',
      key: 'status',
      render: (text, record) => renderStatus(text, record, t),
    },
    {
      title: t('密钥'),
      key: 'token_key',
      render: (text, record) =>
        renderTokenKey(
          text,
          record,
          showKeys,
          setShowKeys,
          copyText,
          manageToken,
          t,
        ),
    },
    {
      title: t('创建时间'),
      dataIndex: 'created_time',
      render: (text, record, index) => {
        return <div>{renderTimestamp(text)}</div>;
      },
    },
    {
      title: '',
      dataIndex: 'operate',
      fixed: 'right',
      render: (text, record, index) =>
        renderOperations(
          text,
          record,
          onOpenLink,
          setEditingToken,
          setShowEdit,
          manageToken,
          refresh,
          t,
        ),
    },
  ];
};
