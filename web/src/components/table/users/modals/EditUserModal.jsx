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
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showSuccess,
  renderQuota,
  renderQuotaWithPrompt,
} from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  Modal,
  SideSheet,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Form,
  Avatar,
  Row,
  Col,
  Input,
  InputNumber,
  DatePicker,
} from '@douyinfe/semi-ui';
import {
  IconUser,
  IconSave,
  IconClose,
  IconLink,
  IconUserGroup,
  IconPlus,
} from '@douyinfe/semi-icons';

const { Text, Title } = Typography;

const EditUserModal = (props) => {
  const { t } = useTranslation();
  const userId = props.editingUser.id;
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();
  const [groupOptions, setGroupOptions] = useState([]);
  const formApiRef = useRef(null);

  const [creditGrantsLoading, setCreditGrantsLoading] = useState(false);
  const [creditGrants, setCreditGrants] = useState([]);

  const [addGrantModalOpen, setAddGrantModalOpen] = useState(false);
  const [grantQuota, setGrantQuota] = useState(0);
  const [grantExpiredTime, setGrantExpiredTime] = useState(null);
  const [grantRemark, setGrantRemark] = useState('');
  const [grantReference, setGrantReference] = useState('');
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  const isEdit = Boolean(userId);

  const getInitValues = () => ({
    username: '',
    display_name: '',
    password: '',
    github_id: '',
    oidc_id: '',
    discord_id: '',
    wechat_id: '',
    telegram_id: '',
    email: '',
    group: 'default',
    remark: '',
  });

  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      setGroupOptions(res.data.data.map((g) => ({ label: g, value: g })));
    } catch (e) {
      showError(e.message);
    }
  };

  const handleCancel = () => props.handleClose();

  const loadUser = async () => {
    setLoading(true);
    const url = userId ? `/api/user/${userId}` : `/api/user/self`;
    const res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      data.password = '';
      formApiRef.current?.setValues({ ...getInitValues(), ...data });
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const loadCreditGrants = async () => {
    if (!userId) return;
    setCreditGrantsLoading(true);
    try {
      const res = await API.get(`/api/user/${userId}/credit_grants`, {
        params: { p: 1, page_size: 20 },
      });
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setCreditGrants(data.items || []);
    } catch (e) {
      showError(e.message);
    } finally {
      setCreditGrantsLoading(false);
    }
  };

  useEffect(() => {
    loadUser();
    if (userId) {
      fetchGroups();
      loadCreditGrants();
    }
  }, [props.editingUser.id]);

  /* ----------------------- submit ----------------------- */
  const submit = async (values) => {
    setLoading(true);
    let payload = { ...values };
    delete payload.quota;
    if (userId) {
      payload.id = parseInt(userId);
    }
    const url = userId ? `/api/user/` : `/api/user/self`;
    const res = await API.put(url, payload);
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('用户信息更新成功！'));
      props.refresh();
      props.handleClose();
    } else {
      showError(message);
    }
    setLoading(false);
  };

  /* --------------------- credit grant -------------------- */
  const submitCreditGrant = async () => {
    if (!userId) return;
    const quota = parseInt(String(grantQuota), 10) || 0;
    if (quota <= 0) {
      showError(t('请输入大于 0 的额度'));
      return;
    }
    const expiredTime = grantExpiredTime
      ? Math.floor(grantExpiredTime.getTime() / 1000)
      : 0;

    setGrantSubmitting(true);
    try {
      const res = await API.post(`/api/user/${userId}/credit_grants`, {
        quota,
        expired_time: expiredTime,
        remark: grantRemark,
        reference: grantReference,
      });
      const { success, message } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      showSuccess(t('Credit Grant 创建成功！'));
      setAddGrantModalOpen(false);
      setGrantQuota(0);
      setGrantExpiredTime(null);
      setGrantRemark('');
      setGrantReference('');
      await loadUser();
      await loadCreditGrants();
    } catch (e) {
      showError(e.message);
    } finally {
      setGrantSubmitting(false);
    }
  };

  /* --------------------------- UI --------------------------- */
  return (
    <>
      <SideSheet
        placement='right'
        title={
          <Space>
            <Tag color='blue' shape='circle'>
              {t(isEdit ? '编辑' : '新建')}
            </Tag>
            <Title heading={4} className='m-0'>
              {isEdit ? t('编辑用户') : t('创建用户')}
            </Title>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
        visible={props.visible}
        width={isMobile ? '100%' : 600}
        footer={
          <div className='flex justify-end bg-white'>
            <Space>
              <Button
                theme='solid'
                onClick={() => formApiRef.current?.submitForm()}
                icon={<IconSave />}
                loading={loading}
              >
                {t('提交')}
              </Button>
              <Button
                theme='light'
                type='primary'
                onClick={handleCancel}
                icon={<IconClose />}
              >
                {t('取消')}
              </Button>
            </Space>
          </div>
        }
        closeIcon={null}
        onCancel={handleCancel}
      >
        <Spin spinning={loading}>
          <Form
            initValues={getInitValues()}
            getFormApi={(api) => (formApiRef.current = api)}
            onSubmit={submit}
          >
            {({ values }) => (
              <div className='p-2'>
                {/* 基本信息 */}
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar
                      size='small'
                      color='blue'
                      className='mr-2 shadow-md'
                    >
                      <IconUser size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>
                        {t('基本信息')}
                      </Text>
                      <div className='text-xs text-gray-600'>
                        {t('用户的基本账户信息')}
                      </div>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col span={24}>
                      <Form.Input
                        field='username'
                        label={t('用户名')}
                        placeholder={t('请输入新的用户名')}
                        rules={[{ required: true, message: t('请输入用户名') }]}
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='password'
                        label={t('密码')}
                        placeholder={t('请输入新的密码，最短 8 位')}
                        mode='password'
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='display_name'
                        label={t('显示名称')}
                        placeholder={t('请输入新的显示名称')}
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='remark'
                        label={t('备注')}
                        placeholder={t('请输入备注（仅管理员可见）')}
                        showClear
                      />
                    </Col>
                  </Row>
                </Card>

                {/* 权限设置 */}
                {userId && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='green'
                        className='mr-2 shadow-md'
                      >
                        <IconUserGroup size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('权限设置')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('用户分组和额度管理')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Select
                          field='group'
                          label={t('分组')}
                          placeholder={t('请选择分组')}
                          optionList={groupOptions}
                          allowAdditions
                          search
                          rules={[{ required: true, message: t('请选择分组') }]}
                        />
                      </Col>

                      <Col span={24}>
                        <Form.Slot label={t('剩余额度')}>
                          <div className='flex w-full items-center justify-between gap-3'>
                            <div>
                              <div className='text-base font-medium'>
                                {renderQuota(values.quota || 0)}
                              </div>
                              <div className='text-xs text-gray-600'>
                                {renderQuotaWithPrompt(values.quota || 0)}
                              </div>
                            </div>
                            <Button
                              icon={<IconPlus />}
                              onClick={() => setAddGrantModalOpen(true)}
                            >
                              {t('新增 Credit Grant')}
                            </Button>
                          </div>
                        </Form.Slot>
                      </Col>
                    </Row>
                  </Card>
                )}

                {userId && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center justify-between mb-2'>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('Credit Grants')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('历史 Grant 只读，可通过新增 Grant 调整额度')}
                        </div>
                      </div>
                      <Button
                        theme='light'
                        type='primary'
                        icon={<IconPlus />}
                        onClick={() => setAddGrantModalOpen(true)}
                      >
                        {t('新增')}
                      </Button>
                    </div>

                    <Spin spinning={creditGrantsLoading}>
                      <div className='space-y-2 text-sm'>
                        {creditGrants.length === 0 ? (
                          <Text type='secondary'>{t('暂无 Credit Grants')}</Text>
                        ) : (
                          creditGrants.map((g) => {
                            const remaining = (g.quota || 0) - (g.used_quota || 0);
                            const created = g.created_time
                              ? new Date(g.created_time * 1000).toLocaleString()
                              : '—';
                            const expired = g.expired_time
                              ? new Date(g.expired_time * 1000).toLocaleString()
                              : t('永久');

                            return (
                              <div
                                key={g.id}
                                className='flex flex-col gap-1 rounded-lg bg-gray-50 p-3'
                              >
                                <div className='flex items-center justify-between gap-2'>
                                  <div className='font-medium'>
                                    #{g.id} · {g.grant_type || '—'}
                                  </div>
                                  <div className='text-right'>
                                    {renderQuota(remaining)}
                                  </div>
                                </div>
                                <div className='text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1'>
                                  <span>
                                    {t('总额')}: {renderQuota(g.quota || 0)}
                                  </span>
                                  <span>
                                    {t('已用')}: {renderQuota(g.used_quota || 0)}
                                  </span>
                                  <span>
                                    {t('创建')}: {created}
                                  </span>
                                  <span>
                                    {t('到期')}: {expired}
                                  </span>
                                </div>
                                {g.remark ? (
                                  <div className='text-xs text-gray-600'>
                                    {t('备注')}: {g.remark}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </Spin>
                  </Card>
                )}

                {/* 绑定信息 */}
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar
                      size='small'
                      color='purple'
                      className='mr-2 shadow-md'
                    >
                      <IconLink size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>
                        {t('绑定信息')}
                      </Text>
                      <div className='text-xs text-gray-600'>
                        {t('第三方账户绑定状态（只读）')}
                      </div>
                    </div>
                  </div>

                  <Row gutter={12}>
                    {[
                      'github_id',
                      'discord_id',
                      'oidc_id',
                      'wechat_id',
                      'email',
                      'telegram_id',
                    ].map((field) => (
                      <Col span={24} key={field}>
                        <Form.Input
                          field={field}
                          label={t(
                            `已绑定的 ${field.replace('_id', '').toUpperCase()} 账户`,
                          )}
                          readonly
                          placeholder={t(
                            '此项只读，需要用户通过个人设置页面的相关绑定按钮进行绑定，不可直接修改',
                          )}
                        />
                      </Col>
                    ))}
                  </Row>
                </Card>
              </div>
            )}
          </Form>
        </Spin>
      </SideSheet>

      {/* 新增 Credit Grant */}
      <Modal
        centered
        visible={addGrantModalOpen}
        confirmLoading={grantSubmitting}
        onOk={submitCreditGrant}
        onCancel={() => setAddGrantModalOpen(false)}
        closable={null}
        title={
          <div className='flex items-center'>
            <IconPlus className='mr-2' />
            {t('新增 Credit Grant')}
          </div>
        }
      >
        <div className='space-y-3'>
          <div>
            <Text type='secondary' className='block mb-2'>
              {t('额度')}
            </Text>
            <InputNumber
              placeholder={t('请输入额度')}
              value={grantQuota}
              onChange={setGrantQuota}
              style={{ width: '100%' }}
              showClear
              step={500000}
            />
            <div className='mt-1 text-xs text-gray-600'>
              {renderQuotaWithPrompt(Number(grantQuota) || 0)}
            </div>
          </div>

          <div>
            <Text type='secondary' className='block mb-2'>
              {t('到期时间')}
            </Text>
            <DatePicker
              type='dateTime'
              placeholder={t('可选，留空为永久')}
              value={grantExpiredTime}
              onChange={setGrantExpiredTime}
              style={{ width: '100%' }}
              showClear
            />
          </div>

          <div>
            <Text type='secondary' className='block mb-2'>
              {t('备注')}
            </Text>
            <Input
              value={grantRemark}
              onChange={setGrantRemark}
              placeholder={t('可选')}
              showClear
            />
          </div>

          <div>
            <Text type='secondary' className='block mb-2'>
              {t('关联标识')}
            </Text>
            <Input
              value={grantReference}
              onChange={setGrantReference}
              placeholder={t('可选，用于追踪')}
              showClear
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default EditUserModal;
