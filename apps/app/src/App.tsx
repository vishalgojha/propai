/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Skeleton } from './components/ui/Skeleton';
import { track } from './services/analytics';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Listings } from './pages/Listings';
import { Sources as WhatsApp } from './pages/Sources';
import { Monitor } from './pages/Monitor';
import { Inbox } from './pages/Inbox';
import { Agent } from './pages/Agent';
import { Docs } from './pages/Docs';
import { Admin } from './pages/Admin';
import { Settings } from './pages/Settings';
import { ImpersonatePage } from './pages/ImpersonatePage';
import { Team } from './pages/Team';
import { HistorySync } from './pages/HistorySync';
import { AiUsage } from './pages/AiUsage';
import Analytics from './pages/Analytics';
import Intelligence from './pages/Intelligence';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { Terms } from './pages/Terms';
import { RefundPolicy } from './pages/RefundPolicy';
import { CancellationPolicy } from './pages/CancellationPolicy';
import { ContactUs } from './pages/ContactUs';
import { AuthCallback } from './pages/AuthCallback';

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

export default function App() {
  const landingRoute = '/login';

  return (
    <Router>
      <AuthProvider>
        <AnalyticsPageView />
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
          <Route path="/impersonate" element={<ImpersonatePage />} />
          <Route element={
            <ProtectedRoute>
              <Layout />
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
            <Route path="/ai-usage" element={<AiUsage />} />
            <Route path="/pricing" element={<WhatsApp />} />
            <Route path="/wabro" element={<WhatsApp />} />
            <Route path="/sources" element={<Navigate to="/whatsapp" replace />} />
            <Route path="/messages" element={<Navigate to="/inbox" replace />} />
            <Route path="/agent" element={<Agent />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/team" element={<Team />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/intelligence" element={<Intelligence />} />
          </Route>
          <Route path="*" element={<Navigate to={landingRoute} replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
