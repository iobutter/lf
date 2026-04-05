import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import TopBar from './components/TopBar';
import { GoogleGenAI } from "@google/genai";
import Markdown from "react-markdown";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Sphere
} from 'react-simple-maps';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'motion/react';
import { 
  AlertTriangle, 
  Globe, 
  RefreshCw, 
  X, 
  Search,
  ExternalLink, 
  ShieldAlert, 
  ChevronRight, 
  Activity, 
  Calendar,
  FileText,
  Lock, 
  Zap,
  ArrowRight,
  MousePointer2,
  Info,
  ChevronDown,
  Database,
  Eye,
  Server,
  Terminal,
  Cpu,
  Plus,
  Minus
} from 'lucide-react';
import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Victim, COUNTRY_COORDINATES } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const geoUrl = "/api/map-data";

const sanitizeUrl = (url: string | undefined) => {
  if (!url) return "#";
  const trimmed = url.trim();
  try {
    // Use URL parser + protocol allowlist
    const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const allowedProtocols = ['http:', 'https:'];
    if (!allowedProtocols.includes(urlObj.protocol)) return "#";
    
    // Domain allowlist could be added here if needed
    return urlObj.toString();
  } catch (e) {
    return "#";
  }
};

const sanitizeImageSource = (src: string | undefined) => {
  if (!src) return "";
  const trimmed = src.trim();
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "";
  return trimmed;
};

export default function App() {
  const [view, setView] = useState<'home' | 'map' | 'pricing'>('home');
  const [victims, setVictims] = useState<Victim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVictim, setSelectedVictim] = useState<Victim | null>(null);
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [showGroupIntel, setShowGroupIntel] = useState(false);
  const [negotiations, setNegotiations] = useState<any[]>([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const [groupPopupPos, setGroupPopupPos] = useState({ x: 0, y: 0 });
  const [hoveredVictim, setHoveredVictim] = useState<Victim | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState<[number, number, number]>([0, -20, 0]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'breaches' | 'negotiations'>('breaches');
  const [sidebarSort, setSidebarSort] = useState<'newest' | 'oldest'>('newest');
  const [sizeFilter, setSizeFilter] = useState<'all' | 'large'>('all');
  const [daysAgo, setDaysAgo] = useState(100);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);
  const [timelineRange, setTimelineRange] = useState({ min: Date.now() - 7 * 24 * 60 * 60 * 1000, max: Date.now() });
  const [stats, setStats] = useState<any>(null);
  const [newBreach, setNewBreach] = useState<Victim | null>(null);
  const [newsContent, setNewsContent] = useState<string>('');
  const [isFetchingNews, setIsFetchingNews] = useState(false);
  const lastVictimId = useRef<string | null>(null);
  
  const [expandedOnions, setExpandedOnions] = useState(false);
  const [expandedTTPs, setExpandedTTPs] = useState(false);
  const [expandedTools, setExpandedTools] = useState(false);
  const [showTimelineTooltip, setShowTimelineTooltip] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<Victim[]>([]);
  
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  
  // Use refs and motion values to avoid re-renders on every mouse move
  const mousePosRef = useRef({ x: 0, y: 0 });

  const rotateTo = useCallback((lon: number, lat: number, date?: string) => {
    // Smoothly rotate to the target coordinates
    // We negate lon because the projection rotation is [lambda, phi, gamma]
    setRotation([-lon, -lat, 0]);
    setZoom(2.5); // Zoom in when focusing
    
    if (date && timelineRange.min && timelineRange.max) {
      const time = new Date(date).getTime();
      if (!isNaN(time)) {
        const percent = ((time - timelineRange.min) / (timelineRange.max - timelineRange.min)) * 100;
        setDaysAgo(Math.min(100, Math.max(0, percent)));
      }
    }
  }, [timelineRange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      
      const sensitivity = 0.25 / zoom;
      
      // Use requestAnimationFrame to throttle rotation updates
      requestAnimationFrame(() => {
        if (!isDragging.current) return;
        setRotation(prev => [
          prev[0] + dx * sensitivity,
          prev[1] - dy * sensitivity,
          prev[2]
        ]);
      });
      lastPos.current = { x: e.clientX, y: e.clientY };
    }
    mousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const fetchGroupIntel = async (groupName: string) => {
    if (!groupName || groupName === "Classified") return;
    setLoadingGroup(true);
    setShowGroupIntel(true);
    // Position group popup relative to main popup
    setGroupPopupPos({ x: popupPos.x + 380, y: popupPos.y });
    
    try {
      const response = await fetch(`/api/group/${encodeURIComponent(groupName.toLowerCase())}`);
      if (!response.ok) throw new Error('Failed to fetch group details');
      const data = await response.json();
      setGroupInfo(data);
    } catch (err) {
      console.error("Error fetching group details:", err);
      setGroupInfo(null);
    } finally {
      setLoadingGroup(false);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    setZoom(prev => {
      // More natural zoom sensitivity
      const zoomFactor = 0.0015 * prev;
      const next = prev - e.deltaY * zoomFactor;
      return Math.min(Math.max(next, 0.5), 12);
    });
  };

  // Optimized visibility check
  const isPointVisible = useCallback((lon: number, lat: number, rot: [number, number, number]) => {
    const rad = Math.PI / 180;
    const lambda = (lon + rot[0]) * rad;
    const phi = lat * rad;
    const phi0 = -rot[1] * rad;
    return Math.cos(phi) * Math.cos(lambda) * Math.cos(phi0) + Math.sin(phi) * Math.sin(phi0) > 0;
  }, []);

  // Helper to parse exfiltration size with better coverage
  const parseSize = (v: Victim) => {
    const str = (v.exfiltrated_data || v.summary || v.description || "").toLowerCase();
    const match = str.match(/(\d+(?:\.\d+)?)\s*(gb|mb|tb|kb)/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'TB') return val * 1024;
    if (unit === 'GB') return val;
    if (unit === 'MB') return val / 1024;
    return val / (1024 * 1024);
  };

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const [victimsRes, statsRes] = await Promise.all([
        fetch('/api/victims/recent'),
        fetch('/api/stats')
      ]);

      if (!victimsRes.ok) throw new Error('Failed to fetch victims');
      const data = await victimsRes.json();
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      let processedData: Victim[] = [];
      if (Array.isArray(data)) {
        processedData = data;
      } else if (data && typeof data === 'object' && Array.isArray((data as any).victims)) {
        processedData = (data as any).victims;
      }
      
      // Map the data to ensure consistent date fields
      processedData = processedData.map((v: any) => ({
        ...v,
        date: v.discovered || v.attackdate || v.attack_date || v.date || new Date().toISOString()
      }));
      
      setVictims(prev => {
        const merged = [...prev, ...processedData];
        const unique = Array.from(new Map(merged.map(v => [`${v.victim}-${v.date}`, v])).values());
        const finalSorted = unique.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 200);
        
        // Detect new breaches
        if (finalSorted.length > 0) {
          const latest = finalSorted[0];
          const latestId = `${latest.victim}-${latest.date}`;
          
          if (lastVictimId.current && lastVictimId.current !== latestId) {
            const isNewer = prev.length > 0 ? new Date(latest.date).getTime() > new Date(prev[0].date).getTime() : true;
            if (isNewer || !prev.some(p => `${p.victim}-${p.date}` === latestId)) {
              setNewBreach(latest);
              setTimeout(() => setNewBreach(null), 8000);
            }
          }
          lastVictimId.current = latestId;
        }
        
        return finalSorted;
      });
      
      if (processedData.length > 0) {
        const validDates = processedData
          .map(v => new Date(v.date).getTime())
          .filter(t => !isNaN(t));
        
        if (validDates.length > 0) {
          const max = Date.now();
          const min = max - 7 * 24 * 60 * 60 * 1000; // Past 7 days
          setTimelineRange({ min, max });
        }
      }

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError('Connection lost');
      console.error(err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchNegotiations();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchNegotiations = async () => {
    try {
      const response = await fetch('/api/negotiations');
      if (response.ok) {
        const data = await response.json();
        setNegotiations(data.groups || []);
      }
    } catch (err) {
      console.error("Failed to fetch negotiations:", err);
    }
  };

  const fetchInlineFacts = async (victim: Victim) => {
    setIsFetchingNews(true);
    setNewsContent('');
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        setNewsContent("Error: Gemini API key is missing.");
        setIsFetchingNews(false);
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      const companyName = victim.victim || victim.company;
      const prompt = `Find recent news and fact-check the data breach involving ${companyName}. Provide exactly 2-3 short bullet points of known facts. Keep it very concise. No more than 50 words total. Format as Markdown bullet points.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      let content = response.text || "No known facts found.";
      
      // Append grounding chunks (URLs) if available
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks && chunks.length > 0) {
        content += "\n\n**Sources:**\n";
        chunks.forEach((chunk: any) => {
          if (chunk.web?.uri && chunk.web?.title) {
            content += `- [${chunk.web.title}](${chunk.web.uri})\n`;
          }
        });
      }
      
      setNewsContent(content);
    } catch (error) {
      console.error("Failed to fetch facts:", error);
      setNewsContent("Failed to fetch facts. Please try again later.");
    } finally {
      setIsFetchingNews(false);
    }
  };

  useEffect(() => {
    const group = selectedVictim?.ransomware_group || selectedVictim?.group;
    if (!selectedVictim) {
      setGroupInfo(null);
      setShowGroupIntel(false);
      setNewsContent('');
    } else {
      setNewsContent('');
    }
  }, [selectedVictim]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const top2Ids = useMemo(() => {
    if (!Array.isArray(victims) || victims.length === 0) return [];
    const sortedByDate = [...victims].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sortedByDate.slice(0, 2).map(v => v.id || `${v.victim}-${v.date}`);
  }, [victims]);

  const markers = useMemo(() => {
    if (!Array.isArray(victims) || victims.length === 0) return [];
    
    const countryCounts: Record<string, number> = {};
    
    // Sort victims by date to find the absolute newest ones
    const sortedByDate = [...victims].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    const latestDateInData = sortedByDate.length > 0 ? new Date(sortedByDate[0].date).getTime() : Date.now();
    const referenceDate = new Date(latestDateInData);

    // Identify the top 2 most recent victims relative to the slider
    const minTime = timelineRange.min;
    const maxTime = timelineRange.max;
    // sliderTime maps 0-100 to minTime -> maxTime
    const sliderTime = minTime + (daysAgo / 100) * (maxTime - minTime);

    const filtered = searchQuery.trim() === '' 
      ? victims 
      : victims.filter(v => 
          (v.victim || v.company || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.group || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.country || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (v.industry || v.sector || '').toLowerCase().includes(searchQuery.toLowerCase())
        );

    // Sort filtered by date (newest first) before slicing to ensure we show the 30 most recent on the globe
    const sortedFiltered = [...filtered].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    return sortedFiltered
      .filter(v => {
        const leakDate = new Date(v.date);
        const leakTime = leakDate.getTime();
        
        if (isNaN(leakTime)) return false;

        // Only display the ones from the 24h window ending at sliderTime
        return leakTime <= sliderTime && leakTime >= (sliderTime - 24 * 60 * 60 * 1000);
      })
      .map((v, i) => {
      const countryCode = (v.country || '').toUpperCase();
      const baseCoords = COUNTRY_COORDINATES[countryCode];
      if (!baseCoords) return null;

      const count = countryCounts[countryCode] || 0;
      countryCounts[countryCode] = count + 1;
      
      const angle = (count * 137.5) % 360;
      const radius = Math.sqrt(count) * 1.1; 
      const jitterX = radius * Math.cos(angle * (Math.PI / 180));
      const jitterY = radius * Math.sin(angle * (Math.PI / 180));

      const summaryText = (v.summary || v.description || "").toLowerCase();
      const isCritical = summaryText.includes('critical') || summaryText.includes('major') || summaryText.length > 400;
      const isHigh = summaryText.includes('high') || summaryText.length > 200;
      const severity = isCritical ? 3 : isHigh ? 2 : 1;

      const leakDate = new Date(v.date);
      const diffTime = Math.abs(maxTime - leakDate.getTime());
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      const isTop2 = top2Ids.includes(v.id || `${v.victim}-${v.date}`);
      const isRecent = diffDays <= 4;

      return {
        ...v,
        id: v.id || `${v.victim || v.company || 'unk'}-${i}`,
        severity,
        isRecent,
        isTop2,
        coordinates: [baseCoords[0] + jitterX, baseCoords[1] + jitterY] as [number, number]
      };
    }).filter(Boolean);
  }, [victims, searchQuery, daysAgo, lastUpdated, timelineRange]);

  const getSeverityColor = (severity: number, isRecent?: boolean, isTop2?: boolean) => {
    if (isTop2) return "#ef4444"; // Red for top 2 as requested
    if (isRecent) return "#3b82f6"; // Blue for recent
    if (severity === 3) return "#60a5fa"; // Lighter blue
    if (severity === 2) return "#93c5fd"; // Even lighter blue
    return "#d1d5db"; // Zinc/Gray
  };

  const getSeveritySize = (severity: number, isRecent?: boolean, isTop2?: boolean) => {
    // Base size slightly bigger as requested
    // Scale slightly with zoom so they don't look tiny relative to the globe
    const base = (isTop2 ? 6.0 : isRecent ? 5.2 : 4.5) * (1 + (zoom - 1) * 0.05);
    const finalSize = base;

    if (severity === 3) return finalSize;
    if (severity === 2) return finalSize * 0.85;
    return finalSize * 0.7;
  };

  const memoizedGeographies = useMemo(() => (
    <Geographies geography={geoUrl}>
      {({ geographies }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill="#0a0a0a"
            stroke="#1a1a1a"
            strokeWidth={0.5}
            style={{
              default: { outline: "none" },
              hover: { fill: "#111", outline: "none" },
              pressed: { fill: "#1a1a1a", outline: "none" },
            }}
          />
        ))
      }
    </Geographies>
  ), []);

  const handleMarkerMouseEnter = useCallback((marker: any) => {
    setHoveredVictim(marker);
  }, []);

  const handleMarkerMouseLeave = useCallback(() => {
    setHoveredVictim(null);
  }, []);

  const handleMarkerClick = useCallback((marker: any) => {
    setSelectedVictim(marker);
    setPopupPos({ 
      x: Math.min(window.innerWidth - 380, Math.max(20, mousePosRef.current.x + 20)), 
      y: Math.min(window.innerHeight - 450, Math.max(100, mousePosRef.current.y - 200)) 
    });
    const countryCode = (marker.country || '').toUpperCase();
    const coords = COUNTRY_COORDINATES[countryCode];
    if (coords) {
      rotateTo(coords[0], coords[1], marker.date);
    }
  }, [rotateTo]);

  if (view === 'home') {
    return (
      <>
        <TopBar currentView={view} onNavigate={setView} />
        <LandingPage onEnter={() => setView('map')} victims={victims} />
      </>
    );
  }

  if (view === 'pricing') {
    return (
      <div className="relative w-full h-screen bg-[#020202] text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30">
        <TopBar currentView={view} onNavigate={setView} />
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4 capitalize">{view}</h1>
            <p className="text-zinc-400">This section is currently empty.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-[#020202] text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30">
      <TopBar currentView={view} onNavigate={setView} />
      {/* New Breach Notification */}
      <AnimatePresence>
        {newBreach && (
          <motion.div
            initial={{ opacity: 0, y: -100, x: '-50%' }}
            animate={{ opacity: 1, y: 20, x: '-50%' }}
            exit={{ opacity: 0, y: -100, x: '-50%' }}
            className="fixed top-24 left-1/2 z-[100] pointer-events-auto"
          >
            <div 
              className="bg-red-600/90 backdrop-blur-xl border border-red-500/50 px-6 py-3 rounded-2xl shadow-[0_20px_50px_rgba(220,38,38,0.3)] flex items-center gap-4 cursor-pointer hover:bg-red-600 transition-colors"
              onClick={() => {
                setSelectedVictim(newBreach);
                setNewBreach(null);
              }}
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/80">New Breach Detected</span>
                  <span className="px-1.5 py-0.5 bg-white text-red-600 rounded text-[7px] font-black uppercase tracking-widest animate-bounce">Live</span>
                </div>
                <h4 className="text-sm font-black text-white tracking-tight">
                  {newBreach.victim || newBreach.company}
                </h4>
              </div>
              <div className="ml-4 pl-4 border-l border-white/20">
                <X 
                  className="w-4 h-4 text-white/60 hover:text-white transition-colors" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setNewBreach(null);
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Background Mesh */}
      <MapBackground />

      {/* Zoom Controls */}
      <div className="absolute bottom-32 right-6 z-20 flex flex-col gap-2 pointer-events-auto">
        <button 
          onClick={() => setZoom(prev => Math.min(prev + 0.5, 12))}
          className="w-10 h-10 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all shadow-2xl active:scale-90"
          title="Zoom In"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setZoom(prev => Math.max(prev - 0.5, 0.5))}
          className="w-10 h-10 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/10 transition-all shadow-2xl active:scale-90"
          title="Zoom Out"
        >
          <Minus className="w-5 h-5" />
        </button>
      </div>

      {/* Header Overlay */}
      <header className="absolute top-0 left-0 w-full z-20 p-6 flex justify-end items-center pointer-events-none">
        {/* Global Stats */}
        {stats && stats.stats && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto flex items-center gap-6 px-6 py-2.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-2xl hidden lg:flex"
          >
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] leading-none mb-1.5">Victims</span>
              <span className="text-xs font-black text-white leading-none tracking-tight">{stats.stats.victims?.toLocaleString() || '0'}</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] leading-none mb-1.5">Groups</span>
              <span className="text-xs font-black text-white leading-none tracking-tight">{stats.stats.groups?.toLocaleString() || '0'}</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] leading-none mb-1.5">Press</span>
              <span className="text-xs font-black text-white leading-none tracking-tight">{stats.stats.press?.toLocaleString() || '0'}</span>
            </div>
            {stats.last_update && (
              <>
                <div className="w-px h-6 bg-white/10" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] leading-none mb-1.5">Updated</span>
                  <span className="text-xs font-black text-blue-500 leading-none tracking-tight">
                    {new Date(stats.last_update).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </>
            )}
          </motion.div>
        )}
      </header>

      {/* Search Bar - Positioned under TopBar */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 z-40 pointer-events-none w-full max-w-md">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="pointer-events-auto relative group w-full shadow-2xl"
        >
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text"
            placeholder="Search Breaches..."
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              if (val.trim()) {
                const filtered = victims.filter(v => 
                  (v.victim || v.company || '').toLowerCase().includes(val.toLowerCase()) ||
                  (v.group || '').toLowerCase().includes(val.toLowerCase())
                ).slice(0, 5);
                setSearchSuggestions(filtered);
                
                // Auto-rotate to the first match if it exists
                if (filtered.length > 0) {
                  const countryCode = (filtered[0].country || '').toUpperCase();
                  const coords = COUNTRY_COORDINATES[countryCode];
                  if (coords) {
                    rotateTo(coords[0], coords[1], filtered[0].date);
                  }
                }
              } else {
                setSearchSuggestions([]);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchSuggestions.length > 0) {
                const first = searchSuggestions[0];
                setSelectedVictim(first);
                setPopupPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                const countryCode = (first.country || '').toUpperCase();
                const coords = COUNTRY_COORDINATES[countryCode];
                if (coords) {
                  rotateTo(coords[0], coords[1], first.date);
                }
                setSearchSuggestions([]);
              }
            }}
            className="w-full bg-[#0a0a0a]/90 backdrop-blur-2xl border border-white/10 pl-11 pr-6 py-3 rounded-full text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <AnimatePresence>
            {searchQuery.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full left-0 w-full mt-2 bg-black/90 backdrop-blur-3xl border border-white/10 rounded-xl p-3 shadow-2xl z-50"
              >
                {searchSuggestions.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2">Suggestions</p>
                    {searchSuggestions.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedVictim(s);
                          setPopupPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                          const countryCode = (s.country || '').toUpperCase();
                          const coords = COUNTRY_COORDINATES[countryCode];
                          if (coords) {
                            rotateTo(coords[0], coords[1], s.date);
                          }
                          setSearchSuggestions([]);
                          setSearchQuery(s.victim || s.company || '');
                        }}
                        className="w-full text-left px-2 py-1.5 hover:bg-white/5 rounded-lg transition-colors flex flex-col gap-0.5"
                      >
                        <span className="text-[10px] font-bold text-white">{s.victim || s.company}</span>
                        <span className="text-[10px] text-zinc-500 uppercase">{s.group || 'Unknown Group'} • {s.country}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-2">Search Help</p>
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-zinc-300 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-blue-500" />
                        <span>Type victim names or groups</span>
                      </div>
                      <div className="text-[10px] text-zinc-300 flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-zinc-500" />
                        <span>Filter by country or sector</span>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Map Container */}
      <div 
        className="w-full h-full relative z-10 cursor-grab active:cursor-grabbing overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <ComposableMap
          projection="geoOrthographic"
          projectionConfig={{ 
            scale: 280 * zoom,
            rotate: rotation
          }}
          className="w-full h-full"
        >
          <Sphere fill="#080b14" stroke="#1a1a1a" strokeWidth={0.5} />
          {memoizedGeographies}

          <AnimatePresence>
            {markers.map((marker: any) => {
              // Check if marker is on the visible side of the globe
              if (!isPointVisible(marker.coordinates[0], marker.coordinates[1], rotation)) return null;

              const color = getSeverityColor(marker.severity, marker.isRecent, marker.isTop2);
              const size = getSeveritySize(marker.severity, marker.isRecent, marker.isTop2);

              return (
                <MemoizedMarker 
                  key={marker.id}
                  marker={marker}
                  color={color}
                  size={size}
                  zoom={zoom}
                  onMouseEnter={handleMarkerMouseEnter}
                  onMouseLeave={handleMarkerMouseLeave}
                  onClick={handleMarkerClick}
                />
              );
            })}
          </AnimatePresence>
        </ComposableMap>
      </div>

      {/* Latest Breaches Sidebar */}
      <div className={cn(
        "absolute top-24 right-6 bottom-24 z-20 pointer-events-none flex flex-col gap-4 transition-all duration-500",
        isSidebarOpen ? "w-80" : "w-16"
      )}>
        <div className="pointer-events-auto bg-black/40 backdrop-blur-3xl border border-white/10 rounded-2xl flex flex-col overflow-hidden h-full shadow-2xl">
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-500" />
              {isSidebarOpen && (
                <div className="flex gap-4">
                  <button 
                    onClick={() => setSidebarTab('breaches')}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest transition-colors",
                      sidebarTab === 'breaches' ? "text-white" : "text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    Breaches
                  </button>
                  <button 
                    onClick={() => setSidebarTab('negotiations')}
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest transition-colors",
                      sidebarTab === 'negotiations' ? "text-white" : "text-zinc-600 hover:text-zinc-400"
                    )}
                  >
                    Negotiations
                  </button>
                </div>
              )}
            </div>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2.5 hover:bg-white/10 rounded-xl transition-all text-zinc-400 hover:text-white border border-white/10 hover:border-white/30 shadow-2xl bg-white/5"
              title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
            >
              {isSidebarOpen ? <ChevronRight className="w-6 h-6" /> : <ChevronRight className="w-6 h-6 rotate-180" />}
            </button>
          </div>
          
          {isSidebarOpen && (
            <>
          {/* Sidebar Filters (Only for Breaches) */}
          {sidebarTab === 'breaches' && (
            <div className="p-3 border-b border-white/5 bg-black/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Sort Data</span>
                <button 
                  onClick={() => setSidebarSort(prev => prev === 'newest' ? 'oldest' : 'newest')}
                  className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase flex items-center gap-1 font-mono"
                >
                  <Calendar className="w-2.5 h-2.5" />
                  {sidebarSort === 'newest' ? 'Newest First' : 'Oldest First'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setSizeFilter('all')}
                  className={cn(
                    "text-[10px] py-1 px-2 rounded border transition-all uppercase font-mono",
                    sizeFilter === 'all' ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/5 text-zinc-600"
                  )}
                >
                  All Leaks
                </button>
                <button 
                  onClick={() => setSizeFilter('large')}
                  className={cn(
                    "text-[10px] py-1 px-2 rounded border transition-all uppercase font-mono",
                    sizeFilter === 'large' ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "bg-transparent border-white/5 text-zinc-600"
                  )}
                >
                  Large (&gt;1GB)
                </button>
              </div>
            </div>
          )}

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {sidebarTab === 'breaches' ? (
                  victims
                    .filter(v => {
                      if (sizeFilter === 'large') {
                        return parseSize(v) >= 1;
                      }
                      return true;
                    })
                    .sort((a, b) => {
                      // Robust date parsing: handle "YYYY-MM-DD" or other common formats
                      const parseDate = (d: string) => {
                        if (!d) return 0;
                        const timestamp = Date.parse(d);
                        return isNaN(timestamp) ? 0 : timestamp;
                      };
                      const dateA = parseDate(a.date);
                      const dateB = parseDate(b.date);
                      return sidebarSort === 'newest' ? dateB - dateA : dateA - dateB;
                    })
                    .slice(0, 50).map((v: any, i: number) => (
                    <motion.div
                      key={v.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => {
                        setSelectedVictim(v);
                        setPopupPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
                        const countryCode = (v.country || '').toUpperCase();
                        const coords = COUNTRY_COORDINATES[countryCode];
                        if (coords) {
                          rotateTo(coords[0], coords[1], v.date);
                        }
                      }}
                      className="group cursor-pointer bg-white/5 border border-white/5 rounded-xl p-3 hover:bg-white/10 hover:border-blue-500/50 active:border-blue-400 transition-all duration-300"
                    >
                      {v.screenshot && (
                        <div className="w-full h-20 mb-3 rounded-lg overflow-hidden border border-white/10 bg-zinc-900 flex items-center justify-center">
                          <img 
                            src={sanitizeImageSource(v.screenshot)} 
                            alt="" 
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" 
                            referrerPolicy="no-referrer" 
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-[11px] font-bold text-white truncate max-w-[180px]">{v.victim || v.company}</h4>
                        <span className="text-[10px] text-zinc-500">{v.date}</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed mb-2">
                        {v.summary || v.description || "Forensic analysis in progress..."}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-blue-500 uppercase tracking-tighter">{v.group || "Classified"}</span>
                        <div className="flex items-center gap-2">
                          {v.exfiltrated_data && (
                            <span className="text-[10px] text-zinc-400 uppercase tracking-tighter">{v.exfiltrated_data}</span>
                          )}
                          <div className="flex items-center gap-1">
                            <div className={cn("w-1 h-1 rounded-full", top2Ids.includes(v.id || `${v.victim}-${v.date}`) ? "bg-red-500" : "bg-blue-500")} />
                            <span className="text-[10px] text-zinc-600 uppercase">{v.country}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  negotiations.length > 0 ? (
                    negotiations.map((n, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/10 transition-all duration-300"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="text-sm font-bold text-white">{n.group}</h4>
                          <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-full">
                            {n.chats} Active
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">
                          Ongoing negotiations detected for this ransomware group.
                        </p>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center p-4 text-zinc-500 text-xs">
                      No active negotiations detected.
                    </div>
                  )
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Connection Line between popups - REMOVED AS REQUESTED */}
      <AnimatePresence>
        {/* Connection line removed to prevent visual clutter between tabs */}
      </AnimatePresence>

      {/* Tooltip */}
      <AnimatePresence>
        {hoveredVictim && (
          <Tooltip hoveredVictim={hoveredVictim} />
        )}
      </AnimatePresence>

      {/* On-Map Popup Square - Positioned near the spot but static once opened */}
      <AnimatePresence>
        {showGroupIntel && (
          <motion.div
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.95, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: 20 }}
            className="fixed z-50 bg-[#080808]/98 backdrop-blur-3xl border border-red-500/20 rounded-2xl shadow-[0_40px_120px_rgba(220,38,38,0.15)] p-6 w-[340px] pointer-events-auto cursor-default active:cursor-grabbing"
            style={{
              left: groupPopupPos.x,
              top: groupPopupPos.y,
            }}
          >
            <div className="flex justify-between items-start mb-5 cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-red-500">Group Data</span>
              </div>
              <button 
                onClick={() => {
                  setShowGroupIntel(false);
                  setExpandedOnions(false);
                  setExpandedTTPs(false);
                  setExpandedTools(false);
                }} 
                className="p-1.5 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingGroup ? (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Decrypting Data...</span>
              </div>
            ) : groupInfo && !groupInfo.error ? (
              <div className="space-y-5">
                <div>
                  <h4 className="text-xl font-black text-white uppercase tracking-tight mb-1">
                    {groupInfo.name || selectedVictim?.group}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] font-bold text-red-400 uppercase tracking-widest">Active Threat</span>
                    <span className="text-[10px] text-zinc-500 uppercase">{groupInfo.activity_period || "Unknown Period"}</span>
                  </div>
                </div>

                <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-2">Operational Profile</span>
                  <p className="text-xs text-zinc-400 leading-relaxed max-h-24 overflow-y-auto custom-scrollbar">
                    {typeof groupInfo.description === 'string' ? groupInfo.description : (groupInfo.description ? JSON.stringify(groupInfo.description) : "No detailed data available for this operator.")}
                  </p>
                </div>

                {groupInfo.locations && Array.isArray(groupInfo.locations) && groupInfo.locations.length > 0 && (
                  <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] text-red-400 uppercase tracking-widest block">Onion Infrastructure</span>
                      {groupInfo.locations.length > 3 && (
                        <button 
                          onClick={() => setExpandedOnions(!expandedOnions)}
                          className="text-[10px] text-zinc-500 hover:text-white uppercase tracking-widest font-bold transition-colors"
                        >
                          {expandedOnions ? 'Show Less' : `View All (${groupInfo.locations.length})`}
                        </button>
                      )}
                    </div>
                    <div className={cn(
                      "space-y-1.5",
                      expandedOnions ? "max-h-40 overflow-y-auto custom-scrollbar pr-1" : ""
                    )}>
                      {(expandedOnions ? groupInfo.locations : groupInfo.locations.slice(0, 3)).map((loc: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono truncate">
                          <Globe className="w-3 h-3 text-red-500/50" />
                          {loc.link || loc.title || loc.onion || "Hidden Node"}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(groupInfo.onion || groupInfo.location) && !groupInfo.locations && (
                  <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3">
                    <span className="text-[10px] text-red-400 uppercase tracking-widest block mb-2">Onion Infrastructure</span>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono truncate">
                      <Globe className="w-3 h-3 text-red-500/50" />
                      {groupInfo.onion || groupInfo.location}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">Victim Count</span>
                    <span className="text-sm font-black text-white">{groupInfo.victim_count || groupInfo.victims || "0"}</span>
                  </div>
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">Activity Rank</span>
                    <span className="text-sm font-black text-white">#{groupInfo.rank || groupInfo.activity_rank || "N/A"}</span>
                  </div>
                </div>

                {groupInfo.activity && (
                  <div>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-2">Recent Activity</span>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {typeof groupInfo.activity === 'string' ? groupInfo.activity : JSON.stringify(groupInfo.activity)}
                    </p>
                  </div>
                )}

                {groupInfo.ttps && (Array.isArray(groupInfo.ttps) ? groupInfo.ttps.length > 0 : Object.keys(groupInfo.ttps).length > 0) && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] text-zinc-600 uppercase tracking-widest block">Tactics & Techniques</span>
                      {(Array.isArray(groupInfo.ttps) ? groupInfo.ttps : Object.values(groupInfo.ttps)).length > 6 && (
                        <button 
                          onClick={() => setExpandedTTPs(!expandedTTPs)}
                          className="text-[10px] text-zinc-500 hover:text-white uppercase tracking-widest font-bold transition-colors"
                        >
                          {expandedTTPs ? 'Show Less' : `View All (${(Array.isArray(groupInfo.ttps) ? groupInfo.ttps : Object.values(groupInfo.ttps)).length})`}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(expandedTTPs 
                        ? (Array.isArray(groupInfo.ttps) ? groupInfo.ttps : Object.values(groupInfo.ttps)) 
                        : (Array.isArray(groupInfo.ttps) ? groupInfo.ttps : Object.values(groupInfo.ttps)).slice(0, 6)
                      ).map((ttp: any, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-red-500/5 border border-red-500/10 rounded text-[10px] text-red-400 font-medium">
                          {typeof ttp === 'string' ? ttp : ttp.tactic_name || ttp.name || JSON.stringify(ttp)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {groupInfo.tools && (Array.isArray(groupInfo.tools) ? groupInfo.tools.length > 0 : Object.keys(groupInfo.tools).length > 0) && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] text-zinc-600 uppercase tracking-widest block">Weaponization</span>
                      {(Array.isArray(groupInfo.tools) ? groupInfo.tools : Object.values(groupInfo.tools).flat()).length > 6 && (
                        <button 
                          onClick={() => setExpandedTools(!expandedTools)}
                          className="text-[10px] text-zinc-500 hover:text-white uppercase tracking-widest font-bold transition-colors"
                        >
                          {expandedTools ? 'Show Less' : `View All (${(Array.isArray(groupInfo.tools) ? groupInfo.tools : Object.values(groupInfo.tools).flat()).length})`}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(expandedTools 
                        ? (Array.isArray(groupInfo.tools) ? groupInfo.tools : Object.values(groupInfo.tools).flat()) 
                        : (Array.isArray(groupInfo.tools) ? groupInfo.tools : Object.values(groupInfo.tools).flat()).slice(0, 6)
                      ).map((tool: any, idx: number) => (
                        <span key={idx} className="px-2 py-1 bg-blue-500/5 border border-blue-500/10 rounded text-[10px] text-blue-400 font-medium">
                          {typeof tool === 'string' ? tool : JSON.stringify(tool)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {groupInfo.negotiations && Array.isArray(groupInfo.negotiations) && groupInfo.negotiations.length > 0 && (
                  <div>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-2">Recent Negotiations</span>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                      {groupInfo.negotiations.slice(0, 5).map((neg: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded-lg">
                          <span className="text-[11px] text-zinc-300 truncate max-w-[180px]">{neg.victim || "Active Chat"}</span>
                          <span className="text-[10px] text-zinc-600">{neg.date || "Recent"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center gap-4">
                <AlertTriangle className="w-6 h-6 text-zinc-700" />
                <span className="text-xs text-zinc-600 uppercase tracking-widest text-center">
                  {groupInfo?.error || "Data unavailable for this actor"}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedVictim && (
          <motion.div
            drag
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="fixed z-40 bg-[#050505]/98 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_40px_120px_rgba(0,0,0,0.9)] p-6 w-[360px] pointer-events-auto cursor-default active:cursor-grabbing"
            style={{
              left: popupPos.x,
              top: popupPos.y,
            }}
          >
            <div className="flex justify-between items-start mb-5 cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Data Leak</span>
              </div>
              <button 
                onClick={() => setSelectedVictim(null)} 
                className="p-1.5 hover:bg-white/5 rounded-lg text-zinc-500 hover:text-white transition-colors"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedVictim.screenshot && (
              <div className="relative w-full h-40 mb-5 rounded-xl overflow-hidden border border-white/10 bg-zinc-900 flex items-center justify-center">
                <img 
                  src={sanitizeImageSource(selectedVictim.screenshot)} 
                  alt="Leak Evidence" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <div className="px-2 py-0.5 bg-red-600 rounded text-[10px] font-black uppercase tracking-widest text-white">Evidence Captured</div>
                </div>
              </div>
            )}

            <h3 className="text-xl font-black text-white mb-1 tracking-tight leading-tight">
              {selectedVictim.victim || selectedVictim.company}
            </h3>
            
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] text-zinc-500 uppercase">{selectedVictim.country}</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-zinc-800" />
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] text-zinc-500 uppercase">{selectedVictim.date}</span>
              </div>
            </div>

            <div className="bg-black/40 rounded-xl p-4 mb-6 border border-white/5 max-h-48 overflow-y-auto custom-scrollbar">
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {selectedVictim.summary || selectedVictim.description || "No detailed data available for this node. Forensic analysis pending."}
              </p>
            </div>

            {selectedVictim.exfiltrated_data && (
              <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-3 h-3 text-blue-400" />
                  <span className="text-[10px] text-blue-400 uppercase tracking-widest">Exfiltrated Data</span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  {selectedVictim.exfiltrated_data}
                </p>
              </div>
            )}

            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl mb-6">
              <div className="flex flex-col gap-3">
                <div>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1 block">Threat Group</span>
                  <span className="text-sm font-black text-red-500 uppercase tracking-tight break-words">
                    {selectedVictim.ransomware_group || selectedVictim.group || "Classified"}
                  </span>
                </div>
                <button 
                  onClick={() => {
                    const group = selectedVictim.ransomware_group || selectedVictim.group;
                    if (group) fetchGroupIntel(group);
                  }}
                  className="w-full py-2 bg-zinc-900 border border-white/10 text-white text-[11px] font-black uppercase rounded-xl hover:bg-zinc-800 hover:border-blue-500/50 transition-all flex items-center justify-center gap-2 shadow-2xl active:scale-95"
                >
                  View Group Details
                  <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Industry / Sector</span>
                <span className="text-[11px] font-bold text-blue-400 truncate">{selectedVictim.industry || selectedVictim.sector || "General"}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Discovered</span>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-zinc-600" />
                  <span className="text-[11px] font-bold text-zinc-300">{selectedVictim.discovered || selectedVictim.date}</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Estimated Attack</span>
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-zinc-600" />
                  <span className="text-[11px] font-bold text-zinc-300">{selectedVictim.attack_date || "Unknown"}</span>
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Severity</span>
                <span className={cn(
                  "text-[10px] font-bold uppercase",
                  selectedVictim.severity === 3 ? "text-red-500" : selectedVictim.severity === 2 ? "text-orange-500" : "text-amber-500"
                )}>
                  {selectedVictim.severity === 3 ? "Critical" : selectedVictim.severity === 2 ? "High" : "Moderate"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Negotiation Status</span>
                <span className="text-[10px] font-bold text-zinc-400">
                  {(() => {
                    const groupName = (selectedVictim.ransomware_group || selectedVictim.group)?.toLowerCase();
                    const groupNegotiations = negotiations.find(n => n.group?.toLowerCase() === groupName);
                    return groupNegotiations ? `${groupNegotiations.chats} Active Chats` : "No Active Chat";
                  })()}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {(selectedVictim.url || selectedVictim.website) && (
                <a 
                  href={sanitizeUrl(selectedVictim.url || selectedVictim.website)}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all hover:scale-[1.02] active:scale-95"
                >
                  View Source Data
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {selectedVictim.post_url && (
                <a 
                  href={sanitizeUrl(selectedVictim.post_url)}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-zinc-900 border border-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all hover:scale-[1.02] active:scale-95"
                >
                  View Onion Post
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              
              <div className="mt-2 p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                {newsContent ? (
                  <div className="prose prose-invert prose-sm text-[11px] leading-relaxed max-w-none prose-a:text-blue-400 hover:prose-a:text-blue-300 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                    <Markdown>{newsContent}</Markdown>
                  </div>
                ) : isFetchingNews ? (
                  <div className="flex items-center justify-center gap-2 text-blue-400 text-[10px] uppercase tracking-widest py-2">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Acquiring Intel...
                  </div>
                ) : (
                  <button
                    onClick={() => fetchInlineFacts(selectedVictim)}
                    className="w-full py-2 bg-blue-600/20 border border-blue-500/30 text-blue-400 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-blue-600/30 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    Breach Details
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Country Victims List Sidebar */}
      {/* Footer Stats & Timeline */}
      <footer className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-full max-w-4xl px-6">
        <div className="flex flex-col gap-4 items-center">
          {/* Timeline Slider */}
          <AnimatePresence>
            {isTimelineOpen ? (
              <motion.div 
                initial={{ opacity: 0, y: 20, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 20, height: 0 }}
                className="pointer-events-auto w-full bg-black/80 backdrop-blur-3xl border border-white/10 p-2 rounded-2xl shadow-2xl overflow-hidden relative group"
              >
                {/* Clean Close Handle */}
                <button 
                  onClick={() => setIsTimelineOpen(false)}
                  className="absolute top-0 left-0 right-0 h-6 flex items-center justify-center group/close cursor-pointer z-50"
                  title="Close Timeline"
                >
                  <div className="w-20 h-1.5 bg-white/10 group-hover/close:bg-white/40 group-hover/close:w-24 rounded-full transition-all" />
                </button>

                <div className="flex items-center justify-between mb-1 px-1 mt-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-white">Week Timeline</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-blue-400 font-mono">
                      {(!isNaN(timelineRange.min) && !isNaN(timelineRange.max)) 
                        ? new Date(timelineRange.min + (daysAgo / 100) * (timelineRange.max - timelineRange.min)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                        : "Syncing..."}
                    </span>
                  </div>
                </div>
                <div className="relative pt-2 pb-1">
                  <AnimatePresence>
                    {showTimelineTooltip && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 10, x: '-50%' }}
                        className="absolute top-0 pointer-events-none bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black whitespace-nowrap shadow-2xl z-30"
                        style={{ left: `${daysAgo}%` }}
                      >
                        {(!isNaN(timelineRange.min) && !isNaN(timelineRange.max)) 
                          ? new Date(timelineRange.min + (daysAgo / 100) * (timelineRange.max - timelineRange.min)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : "..."}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-blue-600 rotate-45" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* Timeline Data Dots (Grouped) */}
                  <div className="absolute inset-x-0 top-[14px] h-1 pointer-events-none flex items-center">
                    {(() => {
                      const activeVictims = victims.filter(v => {
                        const time = new Date(v.date).getTime();
                        return time >= timelineRange.min && time <= timelineRange.max;
                      });
                      
                      // Group victims by percentage to avoid overlapping dots
                      const groups: Record<number, number> = {};
                      activeVictims.forEach(v => {
                        const time = new Date(v.date).getTime();
                        const percent = Math.round(((time - timelineRange.min) / (timelineRange.max - timelineRange.min)) * 100);
                        groups[percent] = (groups[percent] || 0) + 1;
                      });

                      return Object.entries(groups).map(([percent, count]) => (
                        <div 
                          key={percent}
                          className={cn(
                            "absolute rounded-full transition-all",
                            count > 3 ? "w-2 h-2 bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]" : 
                            count > 1 ? "w-1.5 h-1.5 bg-blue-400/80" : 
                            "w-1 h-1 bg-blue-400/40"
                          )}
                          style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
                        />
                      ));
                    })()}
                  </div>

                  <input 
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={daysAgo}
                    onChange={(e) => setDaysAgo(parseInt(e.target.value))}
                    onMouseEnter={() => setShowTimelineTooltip(true)}
                    onMouseLeave={() => setShowTimelineTooltip(false)}
                    onFocus={() => setShowTimelineTooltip(true)}
                    onBlur={() => setShowTimelineTooltip(false)}
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-600 hover:accent-blue-500 transition-all relative z-10"
                  />
                </div>
                <div className="flex justify-between mt-1 px-1">
                  <span className="text-[10px] text-zinc-600 uppercase font-bold font-mono">
                    {!isNaN(timelineRange.min) ? new Date(timelineRange.min).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "..."}
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase font-bold font-mono">Today</span>
                  <span className="text-[10px] text-zinc-600 uppercase font-bold font-mono">
                    {!isNaN(timelineRange.max) ? new Date(timelineRange.max).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "..."}
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setIsTimelineOpen(true)}
                className="pointer-events-auto px-4 py-2 bg-black/60 backdrop-blur-3xl border border-white/10 rounded-full text-[11px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all flex items-center gap-2"
              >
                <Calendar className="w-3 h-3" />
                Show Timeline
                <ChevronDown className="w-3 h-3 rotate-180" />
              </motion.button>
            )}
          </AnimatePresence>

          <div className="pointer-events-auto bg-black/40 backdrop-blur-2xl border border-white/10 px-8 py-3 rounded-full flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black text-white leading-none">{markers.length}</span>
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">Nodes</span>
              </div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="flex items-center gap-3">
              <RefreshCw className={cn("w-4 h-4 text-zinc-500", isRefreshing && "animate-spin")} />
              <div className="flex flex-col">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest leading-none mb-1">Sync Status</span>
                <span className="text-[10px] font-bold text-white leading-none">{lastUpdated.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Tooltip({ hoveredVictim }: { hoveredVictim: any }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      className="fixed z-50 pointer-events-none bg-[#050505]/95 backdrop-blur-2xl border border-white/10 p-4 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] min-w-[240px] max-w-[300px]"
      style={{
        left: pos.x + 20,
        top: pos.y + 20,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn(
          "w-2 h-2 rounded-full animate-pulse",
          hoveredVictim.severity === 3 ? "bg-red-500" : hoveredVictim.severity === 2 ? "bg-orange-500" : "bg-blue-500"
        )} />
        <p className="text-sm font-black text-white leading-tight truncate">
          {hoveredVictim.victim || hoveredVictim.company}
        </p>
      </div>
      
      <p className="text-xs text-zinc-400 leading-relaxed mb-3 line-clamp-3">
        {(() => {
          const text = hoveredVictim.summary || hoveredVictim.description || "Forensic analysis in progress...";
          const firstSentence = text.split(/[.!?]/)[0];
          return firstSentence.length > 100 ? firstSentence.substring(0, 97) + "..." : firstSentence + ".";
        })()}
      </p>

      <div className="flex flex-col gap-2 pt-3 border-t border-white/5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            {hoveredVictim.country}
          </span>
          <span className="text-[10px] text-blue-500 font-black uppercase tracking-tighter">
            {hoveredVictim.group || "Classified"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3 text-zinc-600" />
          <span className="text-[10px] text-zinc-400 font-bold">
            {hoveredVictim.date}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function MapBackground() {
  const mouseX = useSpring(0, { stiffness: 50, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.05),transparent_70%)]" />
      
      {/* Scanning Line Effect */}
      <motion.div 
        className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent z-10"
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      <motion.div 
        className="absolute inset-0"
        style={{ 
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(circle at ${x}px ${y}px, rgba(59,130,246,0.1) 0%, transparent 40%)`
          )
        }}
      />
    </div>
  );
}

const MemoizedMarker = memo(({ marker, color, size, zoom, onMouseEnter, onMouseLeave, onClick }: any) => {
  return (
    <Marker 
      coordinates={marker.coordinates}
      onMouseEnter={() => onMouseEnter(marker)}
      onMouseLeave={onMouseLeave}
      onClick={(e) => onClick(marker, e)}
    >
      {/* "LIVE" Text for Top 2 */}
      {marker.isTop2 && (
        <motion.text
          y={-size - 12}
          textAnchor="middle"
          style={{ fontSize: '10px', fontWeight: 'bold', fill: '#ef4444', letterSpacing: '0.1em' }}
          initial={{ opacity: 0, y: -size }}
          animate={{ opacity: 1, y: -size - 12 }}
        >
          LIVE
        </motion.text>
      )}

      {/* Core Node */}
      <motion.circle
        r={size}
        fill={color}
        className="cursor-pointer"
        style={{ 
          stroke: 'rgba(255,255,255,0.3)',
          strokeWidth: 0.8 / zoom
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0, opacity: 0 }}
        whileHover={{ scale: 1.3 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      />
      
      {/* Primary Pulse */}
      <motion.circle
        r={size}
        fill="none"
        stroke={color}
        strokeWidth={1 / zoom}
        animate={{ 
          scale: [1, 3],
          opacity: [0.6, 0]
        }}
        transition={{ 
          duration: marker.isTop2 ? 1.5 : 2.5, 
          repeat: Infinity,
          ease: "easeOut"
        }}
      />

      {/* Secondary Pulse (Delayed) */}
      <motion.circle
        r={size}
        fill="none"
        stroke={color}
        strokeWidth={0.5 / zoom}
        animate={{ 
          scale: [1, 4.5],
          opacity: [0.3, 0]
        }}
        transition={{ 
          duration: marker.isTop2 ? 2 : 3.5, 
          repeat: Infinity,
          ease: "easeOut",
          delay: 0.5
        }}
      />

      {/* Top 2 Highlight Ring */}
      {marker.isTop2 && (
        <motion.circle
          r={size * 1.5}
          fill="none"
          stroke={color}
          strokeWidth={0.5 / zoom}
          animate={{ 
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.2, 1]
          }}
          transition={{ 
            duration: 1, 
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      )}
    </Marker>
  );
});

function LandingPage({ onEnter, victims }: { onEnter: () => void, victims: Victim[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawMousePos, setRawMousePos] = useState({ x: 0, y: 0 });
  const [showAboutModal, setShowAboutModal] = useState(false);
  
  // Smooth mouse movement
  const mouseX = useSpring(0, { stiffness: 50, damping: 20 });
  const mouseY = useSpring(0, { stiffness: 50, damping: 20 });

  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end end"] });
  
  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.98]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setRawMousePos({ x: e.clientX, y: e.clientY });
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div ref={containerRef} className="relative w-full bg-[#020202] overflow-x-hidden scroll-smooth">
      {/* Interactive Background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.05),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:32px_32px]" />
        
        {/* Enlighten Effect - Smooth follow */}
        <motion.div 
          className="absolute inset-0 pointer-events-none"
          style={{ 
            background: useTransform(
              [mouseX, mouseY],
              ([x, y]) => `radial-gradient(circle at ${x}px ${y}px, rgba(59,130,246,0.04) 0%, transparent 40%)`
            )
          }}
        />

        {/* Interactive Grid Connection */}
        <InteractiveGrid mousePos={rawMousePos} />
      </div>

      {/* Hero Section */}
      <section className="relative h-screen w-full flex flex-col items-center justify-center px-6 z-10">
        <motion.div style={{ opacity, scale }} className="text-center max-w-5xl relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/10 border border-red-600/20 mb-8"
          >
            <div className="w-1 h-1 rounded-full bg-red-500 animate-ping" />
            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-red-500">Global Data Leaks</span>
          </motion.div>

          <h1 className="text-7xl md:text-[10rem] font-black tracking-tighter text-white mb-6 leading-none">
            LEAKFEED<span className="text-blue-600">.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-zinc-500 font-medium max-w-2xl mx-auto mb-12 leading-relaxed">
            Real-time information on the latest corporate data breaches and leaks worldwide.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button 
              onClick={onEnter}
              className="px-8 py-3.5 bg-white text-black rounded-xl font-black text-xs uppercase tracking-widest hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            >
              Open Map
            </button>
            <button 
              onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
              className="px-8 py-3.5 bg-white/5 text-white border border-white/10 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              Latest News
            </button>
          </div>
        </motion.div>

        <motion.div 
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-10 flex flex-col items-center gap-2 text-zinc-700"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Scroll to explore</span>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </section>

      {/* Recent Leaks Section */}
      <section className="relative w-full py-32 px-6 z-10 bg-[#020202] border-y border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center mb-16">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">Forensic Feed</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight">Recent Data Leaks</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {victims.length > 0 ? (
              victims.slice(0, 3).map((v, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group relative bg-[#050505] border border-white/5 rounded-2xl overflow-hidden hover:border-blue-500/20 transition-all duration-500"
                >
                  {v.screenshot && (
                    <div className="aspect-video bg-zinc-900 relative overflow-hidden flex items-center justify-center">
                      <img 
                        src={sanitizeImageSource(v.screenshot)} 
                        alt="Intelligence" 
                        className="w-full h-full object-cover opacity-40 grayscale group-hover:opacity-70 group-hover:scale-105 transition-all duration-700"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
                      <div className="absolute top-4 left-4">
                        <span className="px-2 py-1 bg-blue-600/10 border border-blue-600/30 text-[10px] font-black text-blue-500 uppercase tracking-widest rounded backdrop-blur-sm">Leak Detected</span>
                      </div>
                    </div>
                  )}
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] text-zinc-600 uppercase">{v.date}</span>
                        <div className="w-1 h-1 rounded-full bg-zinc-900" />
                        <span className="text-[11px] text-zinc-600 uppercase">{v.country}</span>
                      </div>
                      <h3 className="text-lg font-bold text-white mb-3 group-hover:text-blue-500 transition-colors truncate">
                        {v.victim || v.company}
                      </h3>
                      <p className="text-xs text-zinc-500 leading-relaxed mb-4 h-12 overflow-hidden line-clamp-3">
                        {v.summary || v.description || "A new data exfiltration event has been confirmed in this sector. Forensic analysis is currently in progress."}
                      </p>
                      <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                        <button 
                          onClick={onEnter}
                          className="text-[11px] text-blue-500 uppercase tracking-widest hover:text-blue-400 transition-colors flex items-center gap-1"
                        >
                          Read Data <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                </motion.div>
              ))
            ) : (
              [...Array(3)].map((_, i) => (
                <div key={i} className="bg-[#080808] border border-white/5 rounded-2xl h-[380px] animate-pulse" />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Info Section */}
      <section className="relative min-h-screen w-full flex flex-col items-center justify-center py-32 px-6 z-10">
        <div className="max-w-6xl w-full relative">
          {/* Connecting Line Background with animated dots */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-900/30 to-transparent -translate-y-1/2 hidden lg:block overflow-hidden">
            <motion.div 
              className="absolute inset-0 w-full"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            >
              <div className="w-20 h-full bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
            </motion.div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            <InfoCard 
              icon={<Database className="w-5 h-5 text-blue-500" />}
              title="Data Ingestion"
              description="Real-time scraping of .onion leak sites and dark web forums using distributed crawler nodes."
            />
            <InfoCard 
              icon={<Terminal className="w-5 h-5 text-blue-500" />}
              title="Threat Mapping"
              description="Automated cross-referencing of exfiltrated assets to identify corporate infrastructure vulnerabilities."
            />
            <InfoCard 
              icon={<Cpu className="w-5 h-5 text-zinc-100" />}
              title="Node Network"
              description="Global mesh of monitoring sensors detecting anomalous data transit and ransomware heartbeat signals."
            />
            <InfoCard 
              icon={<Lock className="w-5 h-5 text-zinc-100" />}
              title="Data Feed"
              description="High-fidelity forensic reports and raw data access for verified cybersecurity response teams."
            />
          </div>
        </div>
      </section>

      {/* Footer Info */}
      <footer className="relative w-full py-12 px-6 z-10 bg-black border-t border-white/5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex flex-col gap-2">
            <h3 className="text-xl font-black text-white tracking-tighter">LEAKFEED<span className="text-blue-600">.</span></h3>
            <p className="text-[11px] text-zinc-600 uppercase tracking-widest">© 2026 LeakFeed</p>
          </div>
          <div className="flex gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Community</span>
              <a href="https://t.me/+jrTFFUqwMCQ3YzA0" target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 hover:text-blue-500 transition-colors uppercase font-black tracking-widest">LeakFeed Telegram</a>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Information</span>
              <button onClick={() => setShowAboutModal(true)} className="text-left text-[11px] text-zinc-400 hover:text-blue-500 transition-colors uppercase font-black tracking-widest">About Us</button>
            </div>
          </div>
        </div>
      </footer>

      {/* About Us Modal */}
      <AnimatePresence>
        {showAboutModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-[#050505] border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-8"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 z-20" />
              <button 
                onClick={() => setShowAboutModal(false)}
                className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors z-20"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">About LeakFeed</span>
              </div>
              
              <h2 className="text-3xl font-black text-white mb-6">Global Cyber Intelligence</h2>
              
              <div className="space-y-4 text-sm text-zinc-400 leading-relaxed">
                <p>
                  LeakFeed is a specialized platform dedicated to tracking and analyzing data breaches, ransomware incidents, and cyber threats in real-time. Our mission is to provide actionable intelligence to cybersecurity professionals, researchers, and organizations.
                </p>
                <p>
                  We aggregate data from various sources across the clear, deep, and dark web to offer a comprehensive view of the current threat landscape. Our platform features an interactive global map, detailed forensic feeds, and in-depth analysis of threat actor groups.
                </p>
                <p>
                  By providing timely and accurate information, LeakFeed empowers defenders to proactively mitigate risks, understand adversary tactics, and respond effectively to cyber incidents.
                </p>
                <div className="mt-8 p-4 bg-white/5 border border-white/10 rounded-xl">
                  <h4 className="text-white font-bold mb-2">Disclaimer</h4>
                  <p className="text-xs text-zinc-500">
                    The information provided on LeakFeed is for educational and defensive purposes only. We do not condone or support any illegal activities. All data is gathered from public or semi-public sources.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InteractiveGrid({ mousePos }: { mousePos: { x: number, y: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const gridSize = 48; // Increased grid size for performance
    
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      
      ctx.clearRect(0, 0, rect.width, rect.height);
      
      const radius = 300;
      const startX = Math.floor((mousePos.x - radius) / gridSize) * gridSize;
      const startY = Math.floor((mousePos.y - radius) / gridSize) * gridSize;
      const endX = Math.ceil((mousePos.x + radius) / gridSize) * gridSize;
      const endY = Math.ceil((mousePos.y + radius) / gridSize) * gridSize;
      
      ctx.lineWidth = 0.5;
      
      for (let x = startX; x <= endX; x += gridSize) {
        for (let y = startY; y <= endY; y += gridSize) {
          const dx = mousePos.x - x;
          const dy = mousePos.y - y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < radius) {
            const opacity = Math.pow(1 - dist / radius, 2) * 0.15;
            
            // Draw connection line
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(mousePos.x, mousePos.y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`;
            ctx.stroke();
            
            // Draw a tiny dot at the intersection
            ctx.fillStyle = `rgba(59, 130, 246, ${opacity * 1.5})`;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [mousePos]);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none w-full h-full" />;
}

function InfoCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="group p-8 bg-white/[0.02] border border-white/5 rounded-2xl hover:bg-white/[0.05] hover:border-white/10 transition-all duration-500">
      <div className="mb-6 p-3 bg-white/5 w-fit rounded-xl group-hover:bg-blue-500/10 transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-white mb-3 tracking-tight uppercase">{title}</h3>
      <p className="text-zinc-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function Feature({ icon, text }: { icon: React.ReactNode, text: string }) {
  return (
    <div className="flex items-center gap-3 text-zinc-600">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
        {icon}
      </div>
      <span className="text-[10px] uppercase tracking-widest">{text}</span>
    </div>
  );
}
