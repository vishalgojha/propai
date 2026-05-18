import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import PublicNav from '@/components/PublicNav';
import Footer from '@/components/Footer';
import Home from '@/pages/Home';
import Listings from '@/pages/Listings';
import ListingDetail from '@/pages/ListingDetail';
import Locality from '@/pages/Locality';
import BrokerSignup from '@/pages/BrokerSignup';
import MCP from '@/pages/MCP';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import Terms from '@/pages/Terms';
import RefundPolicy from '@/pages/RefundPolicy';
import CancellationPolicy from '@/pages/CancellationPolicy';
import Contact from '@/pages/Contact';

export default function App() {
  return (
    <Router>
      <div 
        className="flex min-h-screen flex-col font-sans selection:bg-[var(--accent)] selection:text-[var(--on-propai-green)] bg-[#090d12] text-[#e2e8f0]"
        style={{
          background: "radial-gradient(circle at top left, rgba(62, 232, 138, 0.08), transparent 28%), radial-gradient(circle at bottom right, rgba(59, 130, 246, 0.05), transparent 30%), linear-gradient(180deg, #090d12 0%, #090d12 100%)"
        }}
      >
        <PublicNav />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/listings" element={<Listings />} />
            <Route path="/listings/:slug" element={<ListingDetail />} />
            <Route path="/locality/:slug" element={<Locality />} />
            <Route path="/broker/signup" element={<BrokerSignup />} />
            <Route path="/mcp" element={<MCP />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/refund" element={<RefundPolicy />} />
            <Route path="/cancellation" element={<CancellationPolicy />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}
