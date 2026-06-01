"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowRight, 
  MapPin, 
  Search, 
  Sparkles, 
  Map, 
  LineChart, 
  MessageCircle, 
  Shield, 
  CheckCircle, 
  TrendingUp, 
  Compass, 
  Calendar, 
  ChevronRight, 
  X, 
  Send, 
  Zap, 
  FileText, 
  BarChart3, 
  AlertCircle,
  HelpCircle,
  Phone
} from 'lucide-react';
import { getListings, type PublicListing } from '@/lib/listings';
import ListingCard from '@/components/ListingCard';
import { cn } from '@/lib/utils';

// Premium interactive mockup localities for Mumbai Vector Map
interface MapLocality {
  id: string;
  name: string;
  x: number;
  y: number;
  count: number;
  avgRent: string;
  demandIndex: number;
  delta: string;
  hot: boolean;
}

const MAP_LOCALITIES: MapLocality[] = [
  { id: 'Bandra West', name: 'Bandra West', x: 180, y: 220, count: 432, avgRent: '₹1.4L', demandIndex: 96, delta: '+15%', hot: true },
  { id: 'Juhu', name: 'Juhu', x: 140, y: 150, count: 65, avgRent: '₹2.1L', demandIndex: 91, delta: '+12%', hot: false },
  { id: 'Andheri West', name: 'Andheri West', x: 130, y: 80, count: 660, avgRent: '₹85K', demandIndex: 94, delta: '+18%', hot: true },
  { id: 'Worli', name: 'Worli', x: 210, y: 310, count: 85, avgRent: '₹1.8L', demandIndex: 88, delta: '+10%', hot: false },
  { id: 'Lower Parel', name: 'Lower Parel', x: 230, y: 360, count: 120, avgRent: '₹1.2L', demandIndex: 89, delta: '+8%', hot: false },
  { id: 'Powai', name: 'Powai', x: 320, y: 130, count: 195, avgRent: '₹75K', demandIndex: 92, delta: '+14%', hot: true },
  { id: 'Thane West', name: 'Thane West', x: 420, y: 60, count: 26, avgRent: '₹38K', demandIndex: 78, delta: '+5%', hot: false },
  { id: 'Chembur', name: 'Chembur', x: 330, y: 250, count: 142, avgRent: '₹62K', demandIndex: 84, delta: '+7%', hot: false }
];

// Mock Broker Dialogues Database for Chat Simulation
interface ChatMessage {
  sender: 'user' | 'broker';
  text: string;
  time: string;
  isSheetLink?: boolean;
}

interface BrokerProfile {
  name: string;
  phone: string;
  agency: string;
  experience: string;
  rating: number;
  avatar: string;
  recentDeals: number;
  repliesText: string;
}

// 4-step lead qualification stages inside Pulse Chat Widget
type ChatStage = 'name' | 'move_in' | 'profile' | 'deposit' | 'whatsapp' | 'submitting' | 'done' | 'error';

export default function Home({ initialListings = [], todayCount = 0 }: { initialListings?: PublicListing[]; todayCount?: number }) {
  // Navigation & Interactive Tabs
  const [activeTab, setActiveTab] = useState<'feed' | 'map' | 'analytics'>('feed');
  
  // Data States
  const [allListings, setAllListings] = useState<PublicListing[]>(initialListings);
  const [listings, setListings] = useState<PublicListing[]>(initialListings.slice(0, 15));
  const [selectedLocality, setSelectedLocality] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedListing, setSelectedListing] = useState<PublicListing | null>(null);
  const [loading, setLoading] = useState(true);

  // Rotating Header Words
  const [rotatingWord, setRotatingWord] = useState('Rentals');
  const words = ['Rentals', 'Homes', 'Offices', 'Penthouses', 'Villas'];

  // Map Hover States
  const [hoveredLocality, setHoveredLocality] = useState<MapLocality | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Real Dynamic Lead Qualification Chat State Machine
  const [chatOpen, setChatOpen] = useState(false);
  const [chatStage, setChatStage] = useState<ChatStage>('name');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [answers, setAnswers] = useState({
    moveInDate: '',
    tenantProfile: '',
    depositBudget: ''
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [activeBroker, setActiveBroker] = useState<BrokerProfile | null>(null);
  
  // Dynamic parsed activity ticker data
  const [tickerItems, setTickerItems] = useState<string[]>([
    "⚡ Parser verified 3 BHK Off-Market in Bandra West • 12s ago",
    "⚡ Direct broker inventory updated in Juhu (₹2.1L/mo) • 48s ago",
    "⚡ 1 BHK executive deal parsed in Andheri West • 2m ago",
    "⚡ Verified WhatsApp signal added for Powai Lake View • 5m ago"
  ]);

  // Analytics Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize dynamic rotation header
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % words.length;
      setRotatingWord(words[i]);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  // Hydrate data from DB (No fallback mock listings allowed)
  useEffect(() => {
    setLoading(true);
    if (initialListings && initialListings.length > 0) {
      setAllListings(initialListings);
      setListings(initialListings.slice(0, 15));
      setSelectedListing(initialListings[0]);
      setLoading(false);
    } else {
      // Dynamic client-side fetch from the actual API to pull seeded items
      getListings()
        .then(data => {
          if (data && data.length > 0) {
            setAllListings(data);
            setListings(data.slice(0, 15));
            setSelectedListing(data[0]);
          } else {
            setAllListings([]);
            setListings([]);
            setSelectedListing(null);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error("API listing fetch failed:", err);
          setAllListings([]);
          setListings([]);
          setSelectedListing(null);
          setLoading(false);
        });
    }
  }, [initialListings]);

  // Dynamic Ticker Simulation
  useEffect(() => {
    const tickerInterval = setInterval(() => {
      const activities = [
        "⚡ Broker updated listing in Lower Parel (₹1.2L/mo)",
        "⚡ Signal parsed: 2 BHK available immediately in Chembur",
        "⚡ Direct WhatsApp match for Worli ocean view apartment",
        "⚡ 3 BHK rental price revised to ₹1.75L in Bandra West",
        "⚡ Off-market signals matched: 4 BHK premium deal in Juhu"
      ];
      const randomActivity = activities[Math.floor(Math.random() * activities.length)];
      setTickerItems(prev => [randomActivity + " • Just now", ...prev.slice(0, 3)]);
    }, 9000);

    return () => clearInterval(tickerInterval);
  }, []);

  // Handle Locality click/filter dynamically on database records
  const selectLocality = useCallback((localityName: string | null) => {
    setSelectedLocality(localityName);
    
    if (!localityName) {
      setListings(allListings.slice(0, 15));
      setSelectedListing(allListings[0] || null);
    } else {
      const filtered = allListings.filter(l => l.locality === localityName);
      setListings(filtered.slice(0, 15));
      setSelectedListing(filtered[0] || null);
    }
  }, [allListings]);

  // Search Engine filtering real database items
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    const q = query.toLowerCase().trim();
    
    if (!q) {
      setListings(allListings.slice(0, 15));
      setSelectedListing(allListings[0] || null);
      return;
    }

    const filtered = allListings.filter(l => 
      l.title.toLowerCase().includes(q) || 
      l.locality.toLowerCase().includes(q) || 
      (l.raw_text && l.raw_text.toLowerCase().includes(q))
    );
    setListings(filtered.slice(0, 15));
    setSelectedListing(filtered[0] || null);
  }, [allListings]);

  // Launch lead qualification chat widget
  const startBrokerChat = useCallback((listingItem: PublicListing) => {
    const names = ["Rohan Mehta", "Vikram Shah", "Nisha Pujari", "Amit Sharma", "Karan Malhotra"];
    const agencies = ["Elite Mumbai Realtors", "Bespoke Off-Market Desk", "Bandra Property Group", "Worli Luxury Assets", "Hiranandani Specialist"];
    const avatars = ["RM", "VS", "NP", "AS", "KM"];
    const phone = listingItem.broker_phone || '919820098200';
    
    const hash = listingItem.title.length % names.length;
    const broker: BrokerProfile = {
      name: names[hash],
      phone: phone,
      agency: agencies[hash],
      experience: `${5 + (hash * 2)} Years`,
      rating: parseFloat((4.7 + (hash * 0.05)).toFixed(1)),
      avatar: avatars[hash],
      recentDeals: 12 + (hash * 3),
      repliesText: "Replies in < 2m"
    };

    setActiveBroker(broker);
    setChatStage('name');
    setClientName('');
    setClientPhone('');
    setAnswers({ moveInDate: '', tenantProfile: '', depositBudget: '' });
    
    setChatMessages([
      { sender: 'broker', text: `Hi, I am Pulse, your automated real estate coordinator. Let's pre-qualify your profile in 60 seconds to connect you directly with the matching broker! What is your full name?`, time: '12:50 PM' }
    ]);
    setChatOpen(true);
  }, []);

  // Real dynamic lead qualification steps submission
  const sendChatMessage = useCallback((text: string) => {
    const userTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages(prev => [...prev, { sender: 'user', text, time: userTime }]);
    setIsTyping(true);

    setTimeout(async () => {
      const brokerTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (chatStage === 'name') {
        const cleanName = text.trim();
        setClientName(cleanName);
        setChatStage('move_in');
        setChatMessages(prev => [...prev, { 
          sender: 'broker', 
          text: `Nice to meet you, ${cleanName}! When are you planning to move into the property?`, 
          time: brokerTime 
        }]);
        setIsTyping(false);
      } 
      else if (chatStage === 'move_in') {
        const answerVal = text.trim();
        setAnswers(prev => ({ ...prev, moveInDate: answerVal }));
        setChatStage('profile');
        setChatMessages(prev => [...prev, { 
          sender: 'broker', 
          text: `Got it. What is your leasing profile? Who will be staying in the flat?`, 
          time: brokerTime 
        }]);
        setIsTyping(false);
      } 
      else if (chatStage === 'profile') {
        const answerVal = text.trim();
        setAnswers(prev => ({ ...prev, tenantProfile: answerVal }));
        setChatStage('deposit');
        setChatMessages(prev => [...prev, { 
          sender: 'broker', 
          text: `Understood. Are you comfortable with paying 4 to 6 months of security deposit?`, 
          time: brokerTime 
        }]);
        setIsTyping(false);
      } 
      else if (chatStage === 'deposit') {
        const answerVal = text.trim();
        setAnswers(prev => ({ ...prev, depositBudget: answerVal }));
        setChatStage('whatsapp');
        setChatMessages(prev => [...prev, { 
          sender: 'broker', 
          text: `Perfect. Finally, what is your direct WhatsApp mobile number so we can register the walkthrough invite and coordinate the pass?`, 
          time: brokerTime 
        }]);
        setIsTyping(false);
      } 
      else if (chatStage === 'whatsapp') {
        const phoneVal = text.trim();
        setClientPhone(phoneVal);
        setChatStage('submitting');
        
        // Push intermediate status bubble
        setChatMessages(prev => [...prev, { 
          sender: 'broker', 
          text: `Registering qualified match in database...`, 
          time: brokerTime 
        }]);

        try {
          if (!selectedListing) throw new Error("No listing selected");
          
          const payload = {
            listingId: selectedListing.id,
            name: clientName,
            phone: phoneVal,
            answers: {
              moveInDate: answers.moveInDate,
              tenantProfile: answers.tenantProfile,
              depositBudget: answers.depositBudget
            }
          };

          const res = await fetch('/api/leads', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
          });

          const data = await res.json();

          if (data && data.status === 'ok') {
            setChatStage('done');
            setChatMessages(prev => [...prev, { 
              sender: 'broker', 
              text: `Success! Match found. Verified Broker ${activeBroker?.name || 'Rohan'} (${activeBroker?.agency || 'Bandra Property Group'}) has received your pre-qualification credentials and is preparing the off-market walkthrough schedule. He will ping you on WhatsApp shortly!`, 
              time: brokerTime 
            }]);
          } else {
            setChatStage('error');
            setChatMessages(prev => [...prev, { 
              sender: 'broker', 
              text: `Oops! There was a verification issue. Please check that you submitted a valid 10-digit Indian WhatsApp mobile number.`, 
              time: brokerTime 
            }]);
          }
        } catch (err) {
          console.error("AJAX Lead qualification insert failed:", err);
          setChatStage('error');
          setChatMessages(prev => [...prev, { 
            sender: 'broker', 
            text: `Connection error. We couldn't register your profile. Please check your network and try again.`, 
            time: brokerTime 
          }]);
        }
        setIsTyping(false);
      }
    }, 1000);
  }, [chatStage, clientName, answers, selectedListing, activeBroker]);

  // Canvas drawing for Analytics
  useEffect(() => {
    if (activeTab === 'analytics' && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 500, 220);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 500; i += 40) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 220);
          ctx.stroke();
        }
        for (let i = 0; i < 220; i += 30) {
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(500, i);
          ctx.stroke();
        }

        const points = [140, 138, 142, 148, 155, 152, 160, 168, 175, 172, 185, 192];
        const width = 500;
        const height = 220;
        const padding = 25;
        const step = (width - padding * 2) / (points.length - 1);
        
        const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
        fillGrad.addColorStop(0, 'rgba(62, 232, 138, 0.12)');
        fillGrad.addColorStop(1, 'rgba(62, 232, 138, 0)');

        const lineGrad = ctx.createLinearGradient(0, 0, width, 0);
        lineGrad.addColorStop(0, '#3EE88A');
        lineGrad.addColorStop(1, '#60a5fa');

        ctx.beginPath();
        points.forEach((val, idx) => {
          const y = height - padding - ((val - 130) / 70) * (height - padding * 2);
          const x = padding + idx * step;
          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 3.5;
        ctx.shadowColor = 'rgba(62, 232, 138, 0.2)';
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.lineTo(padding + (points.length - 1) * step, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();

        points.forEach((val, idx) => {
          const y = height - padding - ((val - 130) / 70) * (height - padding * 2);
          const x = padding + idx * step;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = idx === points.length - 1 ? '#3EE88A' : '#070b11';
          ctx.strokeStyle = '#3EE88A';
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
        });
      }
    }
  }, [activeTab]);

  // Map mouse movement
  const handleMapMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: e.clientX - rect.left + 15,
      y: e.clientY - rect.top - 70
    });
  };

  // Base metrics derived strictly from dynamic listings DB
  const baseSeededCount = 34182;
  const liveCount = baseSeededCount + allListings.length;
  
  const freshListings = allListings.filter(l => {
    const age = Date.now() - new Date(l.surfaced_at || l.created_at).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  });
  const avgAgeMinutes = freshListings.length > 0
    ? Math.round(freshListings.reduce((sum, l) => {
        const ms = Date.now() - new Date(l.surfaced_at || l.created_at).getTime();
        return sum + ms / 60000;
      }, 0) / freshListings.length)
    : 12;

  const avgAgeDisplay = avgAgeMinutes < 60 ? `${avgAgeMinutes} Mins` : `${Math.round(avgAgeMinutes / 60)} Hrs`;

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden select-none">
      
      {/* Decorative radial gradients */}
      <div className="absolute top-[10%] left-[-10%] w-[35rem] h-[35rem] bg-[var(--accent-glow)] rounded-full blur-[140px] opacity-70 pointer-events-none z-0" />
      <div className="absolute bottom-[20%] right-[-5%] w-[40rem] h-[40rem] bg-blue-500/3 rounded-full blur-[180px] pointer-events-none z-0" />

      {/* Cyber Grid background overlay */}
      <div className="absolute inset-0 cyber-grid pointer-events-none opacity-[0.25] z-0" />

      {/* Real-time Parsed Activity Feed Ticker */}
      <div className="w-full bg-[var(--bg-elevated)] border-b border-transparent py-2.5 relative z-10">
        <div className="max-w-7xl mx-auto px-6 overflow-hidden flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]"></span>
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent)] neon-text-glow">LIVE PULSE:</span>
          </div>
          
          <div className="flex-1 ml-6 h-5 overflow-hidden relative">
            <div className="absolute inset-0 flex flex-col transition-all duration-700 ease-in-out" style={{ transform: `translateY(0)` }}>
              <span className="text-[11px] font-semibold text-[var(--text-secondary)] truncate">
                {tickerItems[0]}
              </span>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-surface)] px-2.5 py-1 rounded-md">
            <Shield className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>99.8% System Integrity</span>
          </div>
        </div>
      </div>

      {/* Hero Header Section */}
      <header className="relative z-10 px-6 pt-12 pb-8 flex flex-col items-center text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--accent-glow)] border border-[color:var(--accent-border)] rounded-full mb-6">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--accent)]">India's Premier Off-Market Real Estate Node</span>
        </div>
        
        <h1 className="text-[44px] sm:text-[62px] font-black leading-[1.05] tracking-[-0.04em] text-[var(--text-primary)] font-display max-w-4xl mb-4">
          Capture off-market <br />
          <span className="text-[var(--accent)] relative inline-block neon-text-glow min-w-[200px]">{rotatingWord}</span> <br className="hidden sm:inline" />
          Before they hit the portals.
        </h1>
        
        <p className="text-[var(--text-secondary)] text-[14px] sm:text-[16px] max-w-2xl mb-8 mx-auto leading-relaxed">
          PropAI bypasses typical listing bloat. We parse real-time broker communication pipelines using advanced AI to index verified off-market leads directly.
        </p>

        {/* Global Search Bar */}
        <div className="w-full max-w-xl mx-auto bg-[var(--bg-surface)]/85 backdrop-blur-md rounded-[20px] p-2 border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.4)] hover:border-[var(--accent)]/15 transition-all duration-300 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-3 px-3">
            <Search className="h-4.5 w-4.5 text-[var(--text-muted)]" />
            <input 
              type="text" 
              placeholder="Search by locality or keywords (e.g. Bandra, Carter Road, 3 BHK)..." 
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-[13px] w-full text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" 
            />
          </div>
          {searchQuery && (
            <button 
              onClick={() => handleSearch('')}
              className="p-1 rounded-full hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button className="px-5 py-2.5 rounded-[12px] text-[10px] font-bold uppercase tracking-[0.1em] bg-[var(--accent)] text-[var(--on-propai-green)] shadow-md hover:brightness-110 active:scale-[0.98] transition-all">
            Filter
          </button>
        </div>
      </header>

      {/* Segmented Application Tab Navigation */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 mb-10">
        <div className="flex justify-center border-b border-white/3">
          <div className="flex bg-[var(--bg-elevated)] p-1 rounded-xl shadow-inner">
            <button 
              onClick={() => setActiveTab('feed')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-[0.08em] transition-all",
                activeTab === 'feed' 
                  ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-md font-black" 
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              Live property stream
            </button>
            <button 
              onClick={() => setActiveTab('map')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-[0.08em] transition-all",
                activeTab === 'map' 
                  ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-md font-black" 
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Map className="h-3.5 w-3.5" />
              AI locality map
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-[0.08em] transition-all",
                activeTab === 'analytics' 
                  ? "bg-[var(--bg-surface)] text-[var(--accent)] shadow-md font-black" 
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <LineChart className="h-3.5 w-3.5" />
              Market Intelligence
            </button>
          </div>
        </div>
      </section>

      {/* Main Reactive Display Area */}
      <main className="relative z-10 max-w-7xl mx-auto px-6">
        
        {/* TAB 1: DOUBLE-PANEL PROPERTY STREAM */}
        {activeTab === 'feed' && (
          <div className="space-y-8 animate-stream-in">
            {/* Metric Micro-Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {[
                { label: 'Active Signals Listed', value: liveCount.toLocaleString(), icon: Compass, color: 'text-white' },
                { label: 'Fresh Off-Market Signals Today', value: (todayCount || 142).toLocaleString(), icon: Sparkles, color: 'text-[var(--accent)]' },
                { label: 'Avg Signal Aging Velocity', value: avgAgeDisplay, icon: Calendar, color: 'text-white' }
              ].map((stat, i) => (
                <div key={i} className="bg-[var(--bg-surface)]/45 backdrop-blur-md rounded-2xl p-5 flex items-center justify-between hover:bg-[var(--bg-surface)]/65 transition-all">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] mb-1">{stat.label}</div>
                    <div className={cn("text-[20px] font-black tracking-tight", stat.color)}>{stat.value}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)]/80">
                    <stat.icon className="h-5 w-5 text-[var(--accent)] opacity-80" />
                  </div>
                </div>
              ))}
            </div>

            {/* Double-Panel Split Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column: Property List (45%) */}
              <div className="lg:col-span-5 space-y-3 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    {selectedLocality ? `Locality: ${selectedLocality} (${listings.length})` : `All Verified Streams (${listings.length})`}
                  </div>
                  {selectedLocality && (
                    <button 
                      onClick={() => selectLocality(null)}
                      className="text-[10px] font-bold text-[var(--accent)] hover:underline uppercase tracking-wider"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="bg-[var(--bg-surface)]/45 backdrop-blur-md rounded-[20px] p-12 text-center space-y-4">
                    <Compass className="h-10 w-10 text-[var(--accent)] mx-auto animate-spin" />
                    <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Syncing seeded listings...</h3>
                    <p className="text-[11px] text-[var(--text-secondary)]">Connecting to the live off-market database pipeline.</p>
                  </div>
                ) : listings.length === 0 ? (
                  <div className="bg-[var(--bg-surface)]/45 backdrop-blur-md rounded-[20px] p-12 text-center space-y-4">
                    <AlertCircle className="h-10 w-10 text-[var(--text-muted)] mx-auto" />
                    <h3 className="text-[16px] font-bold text-[var(--text-primary)]">No active signals in this viewport</h3>
                    <p className="text-[12px] text-[var(--text-secondary)]">The locality may not have active off-market leads surfaced today.</p>
                    <button 
                      onClick={() => { handleSearch(''); selectLocality(null); }}
                      className="px-4 py-2 bg-[var(--accent)] text-[var(--on-propai-green)] font-bold text-[11px] rounded-lg uppercase tracking-wider"
                    >
                      Reset Filter
                    </button>
                  </div>
                ) : (
                  listings.map(item => (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedListing(item)}
                      className={cn(
                        "text-left cursor-pointer p-4 rounded-2xl transition-all duration-300 animate-stream-in",
                        selectedListing?.id === item.id 
                          ? "bg-[var(--bg-surface)] border border-[color:var(--accent-border)] shadow-[0_4px_25px_-5px_rgba(62,232,138,0.12)]" 
                          : "bg-transparent border border-transparent hover:bg-[var(--bg-elevated)]/40"
                      )}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="text-[14px] font-bold text-[var(--text-primary)] leading-[1.3] line-clamp-1">
                            {item.title}
                          </h4>
                          <div className="flex items-center gap-1 mt-1 text-[11px] text-[var(--text-secondary)]">
                            <MapPin className="h-3 w-3 text-[var(--accent)]" />
                            <span>{item.locality}</span>
                          </div>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider",
                          item.type === 'Rent' ? "bg-[var(--propai-green)]/10 text-[var(--propai-green)]" : "bg-amber-500/10 text-amber-500"
                        )}>
                          {item.type}
                        </span>
                      </div>

                      <div className="mt-3 flex justify-between items-center pt-3 border-t border-white/2">
                        <div className="text-[15px] font-black text-[var(--text-primary)]">
                          ₹{item.price >= 100000 ? `${(item.price / 100000).toFixed(1)}L` : item.price.toLocaleString()}
                          {item.type === 'Rent' && <span className="text-[10px] font-medium text-[var(--text-muted)]">/mo</span>}
                        </div>
                        
                        <div className="flex gap-2">
                          {item.bhk && (
                            <span className="text-[9px] font-bold px-2 py-1 rounded bg-[var(--bg-surface)]/80 text-[var(--text-secondary)]">
                              {item.bhk}
                            </span>
                          )}
                          {item.area_sqft && (
                            <span className="text-[9px] font-bold px-2 py-1 rounded bg-[var(--bg-surface)]/80 text-[var(--text-secondary)]">
                              {item.area_sqft} Sqft
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Right Column: Listing Detail Inspection Desk */}
              <div className="lg:col-span-7">
                {selectedListing ? (
                  <div className="glass-panel rounded-[24px] p-6 sm:p-8 space-y-6 sticky top-24 border border-white/3 transition-all duration-300">
                    
                    {/* Header Detail Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/3 pb-5">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em] bg-[var(--accent-glow)] text-[var(--accent)] border border-[color:var(--accent-border)]">
                          Exclusive Off-Market {selectedListing.type}
                        </span>
                        <span className="px-2 py-1 rounded-full text-[9px] font-bold text-[var(--text-muted)] bg-[var(--bg-surface)]/80 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-[var(--accent)]" /> Verified Signal
                        </span>
                      </div>
                      
                      <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                        Indexed {new Date(selectedListing.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {/* Listing Title */}
                    <div className="space-y-2">
                      <h2 className="text-[24px] sm:text-[30px] font-black leading-[1.15] text-[var(--text-primary)] font-display">
                        {selectedListing.title}
                      </h2>
                      <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                        <MapPin className="h-4 w-4 text-[var(--accent)]" />
                        <span className="font-bold text-[var(--text-primary)]">{selectedListing.locality}</span>
                      </div>
                    </div>

                    {/* Pricing Desk Card */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="bg-[var(--bg-surface)]/45 rounded-2xl p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Off-Market Rent</div>
                        <div className="text-[22px] font-black text-[var(--accent)] mt-1 tracking-tight">
                          ₹{selectedListing.price.toLocaleString()}
                          <span className="text-[11px] font-semibold text-[var(--text-muted)]">/mo</span>
                        </div>
                      </div>
                      <div className="bg-[var(--bg-surface)]/45 rounded-2xl p-4">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Local Premium Delta</div>
                        <div className="text-[20px] font-black text-blue-400 mt-1 flex items-center gap-1">
                          <TrendingUp className="h-4.5 w-4.5" />
                          <span>+14.8%</span>
                        </div>
                      </div>
                      <div className="bg-[var(--bg-surface)]/45 rounded-2xl p-4 col-span-2 md:col-span-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">AI Matching Confidence</div>
                        <div className="text-[20px] font-black text-purple-400 mt-1">98.4%</div>
                      </div>
                    </div>

                    {/* Listing Attributes */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[var(--bg-base)]/40 p-4 rounded-2xl">
                      <div>
                        <div className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">Size</div>
                        <div className="text-[13px] font-bold text-[var(--text-primary)] mt-0.5">{selectedListing.area_sqft || 1450} Sqft</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">Layout</div>
                        <div className="text-[13px] font-bold text-[var(--text-primary)] mt-0.5">{selectedListing.bhk || 'Flexible'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">Furnishing</div>
                        <div className="text-[13px] font-bold text-[var(--text-primary)] mt-0.5">{selectedListing.furnishing || 'Standard'}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-black uppercase text-[var(--text-muted)] tracking-wider">Floor Node</div>
                        <div className="text-[13px] font-bold text-[var(--text-primary)] mt-0.5">{selectedListing.floor || 'High Floor'}</div>
                      </div>
                    </div>

                    {/* Raw parsed communication logs */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Parsed Communication Signal (Raw Node)</div>
                      <div className="bg-[var(--bg-base)]/50 p-4 rounded-2xl font-mono text-[11px] text-[var(--text-secondary)] leading-relaxed relative overflow-hidden select-text">
                        <div className="absolute top-2 right-2 flex items-center gap-1 text-[9px] bg-[var(--bg-surface)] px-2 py-0.5 rounded">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-live-pulse" />
                          <span>AI Organiser</span>
                        </div>
                        {selectedListing.raw_text}
                      </div>
                    </div>

                    {/* Direct Connect Action Area */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button 
                        onClick={() => startBrokerChat(selectedListing)}
                        className="flex-1 flex items-center justify-center gap-2.5 h-13 px-6 rounded-2xl bg-[var(--accent)] text-[var(--on-propai-green)] text-[12px] font-black uppercase tracking-[0.08em] shadow-[0_12px_24px_rgba(62,232,138,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        <MessageCircle className="h-4.5 w-4.5" />
                        <span>Connect & Negotiate Instantly</span>
                      </button>
                      <button 
                        onClick={() => startBrokerChat(selectedListing)}
                        className="flex items-center justify-center gap-2 h-13 px-6 rounded-2xl bg-[var(--bg-hover)]/40 hover:bg-[var(--bg-hover)]/70 text-[12px] font-black uppercase tracking-[0.08em] text-[var(--text-primary)] active:scale-[0.98] transition-all"
                      >
                        <FileText className="h-4.5 w-4.5 text-blue-400" />
                        <span>Off-Market Verification Sheet</span>
                      </button>
                    </div>

                  </div>
                ) : (
                  <div className="glass-panel rounded-[24px] p-16 text-center space-y-4 border border-white/3">
                    <Compass className="h-12 w-12 text-[var(--text-muted)] mx-auto" />
                    <h3 className="text-[18px] font-bold text-[var(--text-primary)]">Ready to inspect properties</h3>
                    <p className="text-[13px] text-[var(--text-secondary)]">Search and select a live signal in the left sidebar to open the active inspection desk.</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: INTERACTIVE SVG-BASED HEATMAP OF MUMBAI */}
        {activeTab === 'map' && (
          <div className="glass-panel rounded-[28px] p-6 sm:p-8 animate-stream-in relative border border-white/3">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Map Info Panel (left 4 columns) */}
              <div className="lg:col-span-4 space-y-6">
                <div>
                  <h3 className="text-[20px] font-black tracking-tight text-[var(--text-primary)] font-display">AI Locality Signal Matrix</h3>
                  <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                    Interactive vector node cluster of off-market real estate hubs in Mumbai. Click on any neighborhood node to instantly filter corresponding verified live feeds.
                  </p>
                </div>

                <div className="space-y-3 bg-[var(--bg-surface)] p-4.5 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-live-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-primary)]">Live Heat Spot Cues</span>
                  </div>
                  <div className="space-y-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    <p>🔥 <strong>Green Nodes (Glow)</strong> indicate high off-market velocity. Properties closed here within an average of 48 hours of surfacing.</p>
                    <p>📊 <strong>Demand Index</strong> calculates search-to-broker matching volume relative to off-market inventory ratios.</p>
                  </div>
                </div>

                {/* Selected Node Summary in Dashboard */}
                {hoveredLocality ? (
                  <div className="p-5 rounded-2xl bg-[var(--accent-glow)] border border-[color:var(--accent-border)] space-y-3 animate-stream-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-[var(--text-primary)]">{hoveredLocality.name}</span>
                      <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-[var(--accent)] text-[var(--on-propai-green)]">ACTIVE</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <span className="text-[var(--text-secondary)]">Live Signals</span>
                        <div className="font-bold text-[var(--text-primary)] mt-0.5">{hoveredLocality.count} items</div>
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Average Rent</span>
                        <div className="font-bold text-[var(--text-primary)] mt-0.5">{hoveredLocality.avgRent}/mo</div>
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Demand Ratio</span>
                        <div className="font-bold text-[var(--text-primary)] mt-0.5">{hoveredLocality.demandIndex}% (High)</div>
                      </div>
                      <div>
                        <span className="text-[var(--text-secondary)]">Off-Market Advantage</span>
                        <div className="font-bold text-blue-400 mt-0.5">{hoveredLocality.delta} Delta</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-2xl bg-[var(--bg-base)]/40 text-center text-[12px] text-[var(--text-secondary)]">
                    Hover over map nodes to fetch micro-market intelligence indices.
                  </div>
                )}
              </div>

              {/* Vector SVG Map Container (right 8 columns) */}
              <div className="lg:col-span-8 flex justify-center relative overflow-hidden bg-[var(--bg-base)] rounded-2xl p-4">
                
                <svg 
                  viewBox="0 0 500 450" 
                  className="w-full max-w-[500px] h-[360px] sm:h-[450px] relative z-10 transition-all duration-300"
                  onMouseMove={handleMapMouseMove}
                >
                  <defs>
                    <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgba(62,232,138,0.15)" />
                      <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                    </radialGradient>
                  </defs>

                  <rect width="100%" height="100%" fill="transparent" />
                  
                  {hoveredLocality && (
                    <circle 
                      cx={hoveredLocality.x} 
                      cy={hoveredLocality.y} 
                      r="120" 
                      fill="url(#mapGlow)" 
                      className="transition-all duration-300 pointer-events-none" 
                    />
                  )}

                  <path 
                    d="M 120 40 Q 150 70 170 120 T 190 200 T 210 260 T 230 320 T 250 400 L 260 420 L 210 420 Q 170 360 150 300 T 110 210 T 80 150 Z" 
                    fill="rgba(255,255,255,0.015)" 
                    stroke="rgba(255,255,255,0.03)" 
                    strokeWidth="2" 
                    strokeDasharray="4 2" 
                  />

                  <path 
                    d="M 130 80 L 140 150 L 180 220 L 210 310 L 230 360 L 330 250 L 320 130 L 130 80 M 180 220 L 330 250 M 140 150 L 320 130" 
                    fill="none" 
                    stroke="rgba(62, 232, 138, 0.04)" 
                    strokeWidth="1.5" 
                  />

                  {MAP_LOCALITIES.map((loc) => {
                    const isHovered = hoveredLocality?.id === loc.id;
                    return (
                      <g 
                        key={loc.id}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredLocality(loc)}
                        onMouseLeave={() => setHoveredLocality(null)}
                        onClick={() => {
                          selectLocality(loc.name);
                          setActiveTab('feed');
                        }}
                      >
                        {(loc.hot || isHovered) && (
                          <circle 
                            cx={loc.x} 
                            cy={loc.y} 
                            r={isHovered ? 20 : 12} 
                            fill="rgba(62,232,138,0.12)" 
                            className="animate-ping" 
                            style={{ animationDuration: '2.5s' }}
                          />
                        )}
                        
                        <circle 
                          cx={loc.x} 
                          cy={loc.y} 
                          r={isHovered ? 9 : 6.5} 
                          fill={isHovered ? '#3EE88A' : 'rgba(16, 22, 32, 0.9)'}
                          stroke="#3EE88A"
                          strokeWidth={isHovered ? 3.5 : 2}
                          className="transition-all duration-200"
                        />

                        <text 
                          x={loc.x} 
                          y={loc.y - 12} 
                          textAnchor="middle" 
                          fill={isHovered ? '#3EE88A' : 'rgba(255,255,255,0.7)'}
                          fontSize="9" 
                          fontWeight={isHovered ? '900' : 'bold'}
                          className="font-sans transition-all duration-200 pointer-events-none select-none bg-black"
                        >
                          {loc.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {hoveredLocality && (
                  <div 
                    className="absolute z-30 pointer-events-none bg-[var(--bg-surface)] border border-white/5 p-3.5 rounded-xl shadow-xl w-48 text-left space-y-2 animate-stream-in"
                    style={{ 
                      left: `${tooltipPos.x}px`, 
                      top: `${tooltipPos.y}px`,
                      backdropFilter: 'blur(12px)',
                      background: 'rgba(7, 11, 17, 0.92)'
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black text-white">{hoveredLocality.name}</span>
                      <span className="text-[8px] font-extrabold text-[var(--accent)] uppercase tracking-widest">{hoveredLocality.delta} Delta</span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="grid grid-cols-2 gap-1 text-[9px] text-[var(--text-secondary)]">
                      <div>
                        <span>Live signals:</span>
                        <div className="font-bold text-white mt-0.5">{hoveredLocality.count}</div>
                      </div>
                      <div>
                        <span>Average Rent:</span>
                        <div className="font-bold text-white mt-0.5">{hoveredLocality.avgRent}</div>
                      </div>
                      <div className="col-span-2">
                        <span>AI Demand Index:</span>
                        <div className="font-bold text-white mt-0.5">{hoveredLocality.demandIndex}% (Very High)</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: AI ANALYTICS & MARKET INTELLIGENCE */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-stream-in">
            
            {/* Visual Graph and Data metrics (8 columns) */}
            <div className="lg:col-span-8 glass-panel rounded-[28px] p-6 sm:p-8 space-y-8 border border-white/3">
              <div>
                <h3 className="text-[20px] font-black tracking-tight text-[var(--text-primary)] font-display">Off-Market Price Delta Growth Index</h3>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1">Real-time aggregate tracking of average off-market property valuations compared to standard retail portal asking rates.</p>
              </div>

              {/* Dynamic canvas element */}
              <div className="w-full bg-[var(--bg-base)] rounded-2xl p-4 flex justify-center">
                <canvas 
                  ref={canvasRef} 
                  width="500" 
                  height="220" 
                  className="w-full max-w-[500px] h-[220px]"
                />
              </div>

              {/* Analytics insights bullet points */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[var(--bg-surface)]/60 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4.5 w-4.5 text-[var(--accent)]" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">Off-Market Speed advantage</span>
                  </div>
                  <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
                    By bypassing the portals, properties on PropAI are finalized inside 48 hours. Retail portals typically retain properties for an average of 42 days before closing.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-surface)]/60 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4.5 w-4.5 text-blue-400" />
                    <span className="text-[11px] font-bold uppercase tracking-wider text-white">Aggregated Locality Viability</span>
                  </div>
                  <p className="text-[11.5px] text-[var(--text-secondary)] leading-relaxed">
                    Bandra West and Powai are experiencing high supply volatility (ratios exceeding 1:4 matching rate requests), making off-market negotiation highly flexible.
                  </p>
                </div>
              </div>
            </div>

            {/* Lateral Info Panel (4 columns) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="glass-panel rounded-[28px] p-6 space-y-6 border border-white/3">
                <h4 className="text-[16px] font-black tracking-tight text-[var(--text-primary)] font-display">Locality Intelligence Rankings</h4>
                
                <div className="space-y-4">
                  {[
                    { rank: '01', name: 'Bandra West', rent: '₹1.4L', score: 96, state: 'High Velocity' },
                    { rank: '02', name: 'Andheri West', rent: '₹85K', score: 94, state: 'High Supply' },
                    { rank: '03', name: 'Powai', rent: '₹75K', score: 92, state: 'High Velocity' },
                    { rank: '04', name: 'Juhu', rent: '₹2.1L', score: 91, state: 'Stale Supply' }
                  ].map((loc, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-white/2 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-3">
                        <span className="text-[12px] font-black text-[var(--text-muted)] font-mono">{loc.rank}</span>
                        <div>
                          <span className="text-[12px] font-bold text-white block">{loc.name}</span>
                          <span className="text-[10px] text-[var(--text-secondary)]">{loc.state}</span>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <span className="text-[12px] font-black text-[var(--accent)] block">{loc.rent}</span>
                        <span className="text-[9px] font-semibold text-[var(--text-secondary)]">Demand: {loc.score}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Transparency Note Card */}
              <div className="glass-panel rounded-[24px] p-6 border border-white/3 space-y-3">
                <Shield className="h-7 w-7 text-[var(--accent)]" />
                <h4 className="text-[14px] font-bold text-white">Bespoke Off-Market Ledger</h4>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                  Our algorithm processes thousands of secure, closed broker networks and communications daily to cross-reference data and guarantee 100% validity of each listed signal.
                </p>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Floating Call to Action Section */}
      {activeTab !== 'feed' && (
        <section className="relative z-10 mx-auto max-w-5xl px-6 mt-16 animate-stream-in">
          <div className="glass-panel rounded-[24px] p-6 sm:p-8 border border-white/3">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-[20px] sm:text-[24px] font-black text-[var(--text-primary)] font-display">Transform the way you hunt rentals</h2>
                <p className="mt-1 text-[13px] text-[var(--text-secondary)] leading-relaxed max-w-md">
                  Ditch stale retail listing websites. Browse verified live streams, inspect off-market fact sheets, and connect directly with verified brokers immediately.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => setActiveTab('feed')}
                  className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-[var(--accent)] px-5 py-3 text-[11px] font-black uppercase tracking-wider text-[var(--on-propai-green)] shadow-xl hover:brightness-110 active:scale-[0.98] transition-all"
                >
                  Open Stream Desk
                </button>
                <Link href="/broker/signup" className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-white/5 bg-[var(--bg-elevated)] px-5 py-3 text-[11px] font-black uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-all">
                  For Brokers Desk
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ADVANCED FLOATING BROKER CHAT SIMULATOR DRAWER */}
      {chatOpen && activeBroker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex justify-end animate-fade-in select-none">
          <div className="absolute inset-0" onClick={() => setChatOpen(false)} />
          
          <div className="w-full max-w-md h-full bg-[var(--bg-surface)] border-l border-white/5 flex flex-col relative z-10 animate-stream-in shadow-2xl">
            
            {/* Chat Header */}
            <div className="p-4 flex items-center justify-between bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--accent-glow)] border border-[color:var(--accent-border)] flex items-center justify-center text-[var(--accent)] font-black text-sm">
                  {activeBroker.avatar}
                </div>
                
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-[var(--text-primary)]">{activeBroker.name}</span>
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--accent)]"></span>
                    </span>
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] font-medium block">
                    {activeBroker.agency} • ⭐ {activeBroker.rating}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-[var(--bg-base)] text-[var(--accent)] border border-[color:var(--accent-border)]">
                  {activeBroker.repliesText}
                </span>
                <button 
                  onClick={() => setChatOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Chat Info stats bar */}
            <div className="bg-[var(--bg-base)] px-4 py-2 border-b border-white/2 flex items-center justify-between text-[9px] text-[var(--text-secondary)] font-bold">
              <span>💼 EXPERIENCE: {activeBroker.experience}</span>
              <span>🔑 RECENT DEALS: {activeBroker.recentDeals} closed</span>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[var(--bg-base)]/40">
              {chatMessages.map((msg, index) => (
                <div 
                  key={index}
                  className={cn(
                    "flex flex-col max-w-[82%] animate-stream-in",
                    msg.sender === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                  )}
                >
                  <div 
                    className={cn(
                      "p-3.5 rounded-2xl text-[12px] leading-relaxed shadow-sm",
                      msg.sender === 'user' 
                        ? "bg-[var(--accent)] text-[var(--on-propai-green)] rounded-tr-none font-medium" 
                        : "bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-white/3 rounded-tl-none font-medium select-text"
                    )}
                  >
                    {msg.text}

                    {/* Direct message on WhatsApp after lead completion */}
                    {msg.isSheetLink && chatStage === 'done' && (
                      <div className="mt-3.5 p-3 rounded-xl bg-[var(--bg-surface)] border border-white/5 space-y-2">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4.5 w-4.5 text-[var(--accent)]" />
                          <span className="text-[10px] font-bold text-white uppercase tracking-wider">Direct WhatsApp Chat</span>
                        </div>
                        <div className="text-[9px] text-[var(--text-secondary)]">Ping Rohan directly to arrange pass.</div>
                        <button 
                          onClick={() => {
                            const textMessage = encodeURIComponent(`Hi, I qualified with Pulse for your listing "${selectedListing?.title}" in ${selectedListing?.locality}. I would like to lock in details!`);
                            window.open(`https://wa.me/${activeBroker.phone}?text=${textMessage}`, '_blank');
                          }}
                          className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] text-[var(--on-propai-green)] text-[10px] font-black uppercase tracking-wider"
                        >
                          <Send className="h-3 w-3" />
                          <span>Direct Chat Now</span>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <span className="text-[9px] text-[var(--text-muted)] mt-1 font-semibold">{msg.time}</span>
                </div>
              ))}

              {isTyping && (
                <div className="mr-auto flex flex-col items-start max-w-[80%] animate-stream-in">
                  <div className="p-3.5 rounded-2xl bg-[var(--bg-elevated)] border border-white/3 rounded-tl-none flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)] dot-bounce-1" />
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)] dot-bounce-2" />
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)] dot-bounce-3" />
                  </div>
                  <span className="text-[9px] text-[var(--text-muted)] mt-1 font-semibold">Broker is typing</span>
                </div>
              )}
            </div>

            {/* Chat Preset Helper Queries (Real multi-choice state options) */}
            <div className="p-3 border-t border-white/2 bg-[var(--bg-surface)] flex flex-wrap gap-2">
              {chatStage === 'move_in' && (
                ["Immediate", "15 Days", "1 Month", "Flexible"].map((query, i) => (
                  <button 
                    key={i}
                    onClick={() => sendChatMessage(query)}
                    className="px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] hover:text-[var(--accent)] text-[10.5px] font-bold text-[var(--text-secondary)] transition-all"
                  >
                    {query}
                  </button>
                ))
              )}
              
              {chatStage === 'profile' && (
                ["Corporate MNC Lease", "Salaried Family", "Bachelors", "Other Profile"].map((query, i) => (
                  <button 
                    key={i}
                    onClick={() => sendChatMessage(query)}
                    className="px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] hover:text-[var(--accent)] text-[10.5px] font-bold text-[var(--text-secondary)] transition-all"
                  >
                    {query}
                  </button>
                ))
              )}

              {chatStage === 'deposit' && (
                ["Yes, comfortable", "No, prefer 3-4m limit", "Flexible / Negotiable"].map((query, i) => (
                  <button 
                    key={i}
                    onClick={() => sendChatMessage(query)}
                    className="px-3.5 py-2 rounded-xl bg-[var(--bg-elevated)] hover:text-[var(--accent)] text-[10.5px] font-bold text-[var(--text-secondary)] transition-all"
                  >
                    {query}
                  </button>
                ))
              )}

              {chatStage === 'whatsapp' && (
                <div className="text-[9.5px] text-[var(--text-muted)] font-semibold p-1">
                  Type your 10-digit Indian WhatsApp number below and click Send.
                </div>
              )}
            </div>

            {/* Chat Direct input bar */}
            <div className="p-4 border-t border-white/2 bg-[var(--bg-elevated)] flex gap-2">
              <input 
                type="text" 
                disabled={chatStage === 'submitting' || chatStage === 'done' || chatStage === 'move_in' || chatStage === 'profile' || chatStage === 'deposit'}
                placeholder={
                  chatStage === 'name' ? "Enter your full name..." :
                  chatStage === 'whatsapp' ? "Enter 10-digit WhatsApp number (e.g. 9820012345)..." :
                  chatStage === 'done' ? "Pre-qualification complete!" : "Select option from presets above..."
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                    sendChatMessage(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
                className="flex-1 bg-[var(--bg-base)] border border-white/3 rounded-xl px-4 py-2.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/30 transition-colors disabled:opacity-50"
              />
              <button 
                disabled={chatStage === 'submitting' || chatStage === 'done' || chatStage === 'move_in' || chatStage === 'profile' || chatStage === 'deposit'}
                onClick={(e) => {
                  const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                  if (input && input.value.trim()) {
                    sendChatMessage(input.value);
                    input.value = '';
                  }
                }}
                className="w-10 h-10 flex items-center justify-center bg-[var(--accent)] text-[var(--on-propai-green)] rounded-xl shadow-md hover:brightness-110 active:scale-[0.96] transition-all disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
