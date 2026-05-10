/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Skeleton } from './components/ui/Skeleton';
import { track } from './services/analytics';

const ProtectedLayout = React.lazy(async () => ({ default: (await import('./components/Layout')).Layout }));
const Login = React.lazy(async () => ({ default: (await import('./pages/Login')).Login }));
const Dashboard = React.lazy(async () => ({ default: (await import('./pages/Dashboard')).Dashboard }));
const Listings = React.lazy(async () => ({ default: (await import('./pages/Listings')).Listings }));
const WhatsApp = React.lazy(async () => ({ default: (await import('./pages/Sources')).Sources }));
const Monitor = React.lazy(async () => ({ default: (await import('./pages/Monitor')).Monitor }));
const Inbox = React.lazy(async () => ({ default: (await import('./pages/Inbox')).Inbox }));
const Agent = React.lazy(async () => ({ default: (await import('./pages/Agent')).Agent }));
const Docs = React.lazy(async () => ({ default: (await import('./pages/Docs')).Docs }));
const Admin = React.lazy(async () => ({ default: (await import('./pages/Admin')).Admin }));
const Settings = React.lazy(async () => ({ default: (await import('./pages/Settings')).Settings }));
const ImpersonatePage = React.lazy(async () => ({ default: (await import('./pages/ImpersonatePage')).ImpersonatePage }));
const Team = React.lazy(async () => ({ default: (await import('./pages/Team')).Team }));
const HistorySync = React.lazy(async () => ({ default: (await import('./pages/HistorySync')).HistorySync }));
const AiUsage = React.lazy(async () => ({ default: (await import('./pages/AiUsage')).AiUsage }));
const Analytics = React.lazy(() => import('./pages/Analytics'));
const PrivacyPolicy = React.lazy(async () => ({ default: (await import('./pages/PrivacyPolicy')).PrivacyPolicy }));
const Terms = React.lazy(async () => ({ default: (await import('./pages/Terms')).Terms }));
const RefundPolicy = React.lazy(async () => ({ default: (await import('./pages/RefundPolicy')).RefundPolicy }));
const CancellationPolicy = React.lazy(async () => ({ default: (await import('./pages/CancellationPolicy')).CancellationPolicy }));
const ContactUs = React.lazy(async () => ({ default: (await import('./pages/ContactUs')).ContactUs }));
const AuthCallback = React.lazy(async () => ({ default: (await import('./pages/AuthCallback')).AuthCallback }));
const ReferralCapture = React.lazy(async () => ({ default: (await import('./pages/ReferralCapture')).ReferralCapture }));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="h-screen bg-black flex items-center justify-center"><Skeleton className="w-64 h-8" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
};

const AnalyticsPageView: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    track('$pageview', {
      path: location.pathname,
      search: location.search,
      hash: location.hash,
    });
  }, [location.hash, location.pathname, location.search]);

  return null;
};

const RouteFallback: React.FC = () => (
  <div className="min-h-screen bg-black flex items-center justify-center px-6">
    <Skeleton className="h-8 w-56" />
  </div>
);

export default function App() {
  const landingRoute = '/login';

  return (
    <Router>
      <AuthProvider>
        <AnalyticsPageView />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/search" element={<Navigate to="/login" replace />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/cancellation-policy" element={<CancellationPolicy />} />
            <Route path="/contact" element={<ContactUs />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/confirm" element={<AuthCallback />} />
            <Route path="/ref/:code" element={<ReferralCapture />} />
            <Route path="/impersonate" element={<ImpersonatePage />} />
            <Route element={
              <ProtectedRoute>
                <ProtectedLayout />
              </ProtectedRoute>
            }>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/app/dashboard" element={<Dashboard />} />
              <Route path="/monitor" element={<Monitor />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/stream" element={<Listings />} />
              <Route path="/listings" element={<Navigate to="/stream" replace />} />
              <Route path="/whatsapp" element={<WhatsApp />} />
              <Route path="/history-sync" element={<HistorySync />} />
              <Route path="/aiusage" element={<AiUsage />} />
              <Route path="/ai-usage" element={<Navigate to="/aiusage" replace />} />
              <Route path="/pricing" element={<WhatsApp />} />
              <Route path="/sources" element={<Navigate to="/whatsapp" replace />} />
              <Route path="/messages" element={<Navigate to="/inbox" replace />} />
              <Route path="/agent" element={<Agent />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/team" element={<Team />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/intelligence" element={<Navigate to="/agent" replace />} />
            </Route>
            <Route path="*" element={<Navigate to={landingRoute} replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}
