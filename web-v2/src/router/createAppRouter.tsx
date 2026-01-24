import { Navigate, createBrowserRouter } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { ConsoleLayout } from '@/layouts/ConsoleLayout';
import { RequireAuth, AuthRedirect, RequirePricingAuth } from '@/router/guards';

import { HomePage } from '@/pages/public/HomePage';
import { ModelsPage } from '@/pages/public/ModelsPage';
import { ModelDetailsPage } from '@/pages/public/ModelDetailsPage';
import { ModelComparePage } from '@/pages/public/ModelComparePage';
import { AboutPage } from '@/pages/public/AboutPage';
import { TermsPage } from '@/pages/public/TermsPage';
import { PrivacyPolicyPage } from '@/pages/public/PrivacyPolicyPage';
import { LoginPage } from '@/pages/public/LoginPage';
import { RegisterPage } from '@/pages/public/RegisterPage';
import { ResetRequestPage } from '@/pages/public/ResetRequestPage';
import { ResetConfirmPage } from '@/pages/public/ResetConfirmPage';
import { MagicLinkCallbackPage } from '@/pages/public/MagicLinkCallbackPage';
import { OAuthCallbackPage } from '@/pages/public/OAuthCallbackPage';
import { SetupPage } from '@/pages/public/SetupPage';

import { DashboardPage } from '@/pages/console/DashboardPage';
import { TokenListPage } from '@/pages/console/TokenListPage';
import { TokenCreatePage } from '@/pages/console/TokenCreatePage';
import { TokenEditPage } from '@/pages/console/TokenEditPage';
import { PlaygroundPage } from '@/pages/console/PlaygroundPage';
import { ChatEmbedPage } from '@/pages/console/ChatEmbedPage';
import { UsageLogsPage } from '@/pages/console/UsageLogsPage';
import { AuditLogsPage } from '@/pages/console/AuditLogsPage';
import { MidjourneyLogsPage } from '@/pages/console/MidjourneyLogsPage';
import { TaskLogsPage } from '@/pages/console/TaskLogsPage';
import { TopUpPage } from '@/pages/console/TopUpPage';
import { TopUpHistoryPage } from '@/pages/console/TopUpHistoryPage';
import { PersonalHubPage } from '@/pages/console/personal/PersonalHubPage';
import { AccountBindingsPage } from '@/pages/console/personal/AccountBindingsPage';
import { PasswordPage } from '@/pages/console/personal/PasswordPage';
import { AccessTokenPage } from '@/pages/console/personal/AccessTokenPage';
import { PasskeyPage } from '@/pages/console/personal/PasskeyPage';
import { TwoFactorAuthPage } from '@/pages/console/personal/TwoFactorAuthPage';
import { CheckinPage } from '@/pages/console/personal/CheckinPage';
import { NotificationSettingsPage } from '@/pages/console/personal/NotificationSettingsPage';
import { NotFoundPage } from '@/pages/public/NotFoundPage';

export function createAppRouter() {
  return createBrowserRouter([
    {
      path: '/',
      element: <PublicLayout />,
      children: [
        { index: true, element: <HomePage /> },
        {
          path: 'models',
          element: (
            <RequirePricingAuth>
              <ModelsPage />
            </RequirePricingAuth>
          ),
        },
        {
          path: 'models/compare',
          element: (
            <RequirePricingAuth>
              <ModelComparePage />
            </RequirePricingAuth>
          ),
        },
        {
          path: 'models/:modelName',
          element: (
            <RequirePricingAuth>
              <ModelDetailsPage />
            </RequirePricingAuth>
          ),
        },
        { path: 'pricing', element: <Navigate to='/models' replace /> },
        { path: 'about', element: <AboutPage /> },
        { path: 'terms', element: <TermsPage /> },
        { path: 'user-agreement', element: <Navigate to='/terms' replace /> },
        { path: 'privacy-policy', element: <PrivacyPolicyPage /> },
        { path: 'setup', element: <SetupPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
    {
      path: '/auth',
      element: <AuthLayout />,
      children: [
        {
          path: 'signin',
          element: (
            <AuthRedirect>
              <LoginPage />
            </AuthRedirect>
          ),
        },
        {
          path: 'signup',
          element: (
            <AuthRedirect>
              <RegisterPage />
            </AuthRedirect>
          ),
        },
        { path: 'magic', element: <MagicLinkCallbackPage /> },
        { path: 'recover', element: <ResetRequestPage /> },
        { path: 'recover/confirm', element: <ResetConfirmPage /> },
        { path: 'callback/:provider', element: <OAuthCallbackPage /> },
      ],
    },
    {
      element: (
        <RequireAuth>
          <ConsoleLayout />
        </RequireAuth>
      ),
      children: [
        { path: '/dashboard', element: <DashboardPage /> },
        { path: '/api-keys', element: <TokenListPage /> },
        { path: '/api-keys/new', element: <TokenCreatePage /> },
        { path: '/api-keys/:id/edit', element: <TokenEditPage /> },
        { path: '/playground', element: <PlaygroundPage /> },
        { path: '/chat/:id?', element: <ChatEmbedPage /> },
        { path: '/usage-log', element: <UsageLogsPage /> },
        { path: '/audit-log', element: <AuditLogsPage /> },
        { path: '/midjourney', element: <MidjourneyLogsPage /> },
        { path: '/task', element: <TaskLogsPage /> },
        { path: '/billing', element: <TopUpPage /> },
        { path: '/billing/invoices', element: <TopUpHistoryPage /> },
        { path: '/personal', element: <PersonalHubPage /> },
        { path: '/personal/bindings', element: <AccountBindingsPage /> },
        { path: '/personal/password', element: <PasswordPage /> },
        { path: '/personal/access-token', element: <AccessTokenPage /> },
        { path: '/personal/passkey', element: <PasskeyPage /> },
        { path: '/personal/2fa', element: <TwoFactorAuthPage /> },
        { path: '/personal/checkin', element: <CheckinPage /> },
        { path: '/personal/notifications', element: <NotificationSettingsPage /> },
      ],
    },
  ]);
}
