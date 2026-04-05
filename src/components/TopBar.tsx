import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Activity, User, LogOut, Settings, Key } from 'lucide-react';
import { cn } from '../lib/utils';
import AuthModal from './AuthModal';
import AccountModal from './AccountModal';

interface TopBarProps {
  currentView: 'home' | 'map' | 'pricing';
  onNavigate: (view: 'home' | 'map' | 'pricing') => void;
}

export default function TopBar({ currentView, onNavigate }: TopBarProps) {
  const [showAuth, setShowAuth] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [user, setUser] = useState<{ username: string, tier?: string } | null>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('leakfeed_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {}
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('leakfeed_token');
    localStorage.removeItem('leakfeed_user');
    setUser(null);
  };

  return (
    <>
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between px-6 py-3 bg-[#0a0a0a]/80 backdrop-blur-xl border border-white/10 rounded-full w-[90%] max-w-5xl shadow-2xl">
        
        {/* Logo */}
        <div 
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => onNavigate('home')}
        >
          <div className="w-7 h-7 bg-blue-600 flex items-center justify-center rounded-md shadow-[0_0_15px_rgba(37,99,235,0.4)] group-hover:bg-blue-500 transition-colors">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight flex items-center">
            LEAK<span className="text-blue-500">FEED</span>
          </span>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          {['home', 'map', 'pricing'].map((item) => (
            <button
              key={item}
              onClick={() => onNavigate(item as any)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 capitalize",
                currentView === item 
                  ? "bg-white/10 text-white" 
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {/* Auth Section */}
        <div className="flex items-center gap-3">
          {user ? (
            <button 
              onClick={() => setShowAccount(true)}
              className="flex items-center gap-3 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full border border-white/5 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-white font-medium">
                <User className="w-4 h-4 text-blue-400" />
                <span>{user.username}</span>
                <span className="ml-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] uppercase tracking-wider rounded font-bold">
                  {user.tier || 'Premium'}
                </span>
              </div>
            </button>
          ) : (
            <button 
              onClick={() => setShowAuth(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium text-zinc-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              <Key className="w-4 h-4 text-zinc-400" />
              <span>Free Tier</span>
            </button>
          )}
        </div>
      </div>

      <AuthModal 
        isOpen={showAuth} 
        onClose={() => setShowAuth(false)} 
        onSuccess={(userData) => setUser(userData)}
      />

      <AccountModal
        isOpen={showAccount}
        onClose={() => setShowAccount(false)}
        user={user}
        onLogout={handleLogout}
      />
    </>
  );
}
