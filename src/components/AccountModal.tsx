import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Settings, Key, CreditCard, Shield, LogOut, Copy, Clock, Plus, Trash } from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onLogout: () => void;
}

export default function AccountModal({ isOpen, onClose, user, onLogout }: AccountModalProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'settings' | 'subscription' | 'admin'>('profile');
  const [apiKey, setApiKey] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [generatedKeys, setGeneratedKeys] = useState<{ key: string, tier: string, expiresAt: number }[]>([]);
  const [newKeyDuration, setNewKeyDuration] = useState<number>(1);

  useEffect(() => {
    const savedKeys = localStorage.getItem('leakfeed_generated_keys');
    if (savedKeys) {
      try {
        setGeneratedKeys(JSON.parse(savedKeys));
      } catch (e) {}
    }
  }, []);

  const handleGenerateKey = () => {
    const durationMs = newKeyDuration * 24 * 60 * 60 * 1000;
    const key = `LK-${Math.random().toString(36).substring(2, 10).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const newKey = {
      key,
      tier: 'Premium',
      expiresAt: Date.now() + durationMs
    };
    const updatedKeys = [...generatedKeys, newKey];
    setGeneratedKeys(updatedKeys);
    localStorage.setItem('leakfeed_generated_keys', JSON.stringify(updatedKeys));
  };

  const handleRemoveKey = (keyToRemove: string) => {
    const updatedKeys = generatedKeys.filter(k => k.key !== keyToRemove);
    setGeneratedKeys(updatedKeys);
    localStorage.setItem('leakfeed_generated_keys', JSON.stringify(updatedKeys));
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('leakfeed_theme');
    if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.add('light-theme');
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.remove('light-theme');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      localStorage.setItem('leakfeed_theme', 'dark');
      document.documentElement.classList.remove('light-theme');
    } else {
      localStorage.setItem('leakfeed_theme', 'light');
      document.documentElement.classList.add('light-theme');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-2xl bg-[#050505] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[400px]"
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 z-20" />

          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors z-20"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Sidebar */}
          <div className="w-full md:w-64 bg-[#0a0a0a] border-r border-white/5 p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                <User className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{user?.username || 'Account'}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{user?.tier || 'Free Tier'}</div>
              </div>
            </div>

            <nav className="space-y-2 flex-1">
              <TabButton 
                active={activeTab === 'profile'} 
                onClick={() => setActiveTab('profile')} 
                icon={<User className="w-4 h-4" />} 
                label="Profile Info" 
              />
              <TabButton 
                active={activeTab === 'settings'} 
                onClick={() => setActiveTab('settings')} 
                icon={<Settings className="w-4 h-4" />} 
                label="Settings" 
              />
              <TabButton 
                active={activeTab === 'subscription'} 
                onClick={() => setActiveTab('subscription')} 
                icon={<CreditCard className="w-4 h-4" />} 
                label="Subscription" 
              />
              {user?.tier === 'Owner' && (
                <TabButton 
                  active={activeTab === 'admin'} 
                  onClick={() => setActiveTab('admin')} 
                  icon={<Shield className="w-4 h-4" />} 
                  label="Admin Panel" 
                />
              )}
            </nav>

            <button 
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="mt-auto flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all w-full"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-8 bg-[#050505]">
            {activeTab === 'profile' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Account Profile</h3>
                  <p className="text-sm text-zinc-500">Manage your identity on the network.</p>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Username</label>
                    <input 
                      type="text" 
                      value={user?.username || ''} 
                      readOnly
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none opacity-70 cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Account ID</label>
                    <input 
                      type="text" 
                      value={user?.id || 'USR-00000000'} 
                      readOnly
                      className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-500 font-mono focus:outline-none opacity-70 cursor-not-allowed"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">System Settings</h3>
                  <p className="text-sm text-zinc-500">Configure your terminal preferences.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-white/5 rounded-xl">
                    <div>
                      <div className="text-sm font-medium text-white">Dark Mode</div>
                      <div className="text-xs text-zinc-500">Force dark theme across the interface</div>
                    </div>
                    <div 
                      onClick={toggleDarkMode}
                      className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${isDarkMode ? 'bg-blue-600' : 'bg-zinc-600'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isDarkMode ? 'right-1' : 'left-1'}`} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-[#0a0a0a] border border-white/5 rounded-xl">
                    <div>
                      <div className="text-sm font-medium text-white">Live Alerts</div>
                      <div className="text-xs text-zinc-500">Receive notifications for new breaches</div>
                    </div>
                    <div className="w-10 h-5 bg-zinc-800 rounded-full relative cursor-pointer">
                      <div className="absolute left-1 top-1 w-3 h-3 bg-zinc-500 rounded-full" />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'subscription' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Subscription & Access</h3>
                  <p className="text-sm text-zinc-500">Manage your API keys and access tier.</p>
                </div>
                
                <div className="p-5 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-4">
                  <Shield className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-white mb-1">{user?.tier === 'Premium' ? 'Premium Access Active' : 'Free Tier Active'}</h4>
                    <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                      {user?.tier === 'Premium' 
                        ? 'You have full access to the LeakFeed network, including advanced filtering, API access, and historical data.'
                        : 'You currently have basic access to the LeakFeed network. Upgrade your key to unlock advanced filtering, API access, and historical data.'}
                    </p>
                    {user?.tier !== 'Premium' && (
                      <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors">
                        View Plans
                      </button>
                    )}
                  </div>
                </div>

                {user?.tier === 'Premium' ? (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Active Access Key</label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input 
                        type="password" 
                        value="••••••••••••••••••••••••"
                        readOnly
                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-zinc-500 focus:outline-none opacity-70 cursor-not-allowed"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wider">Access Key</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input 
                          type="password" 
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="Enter your premium access key..."
                          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                        />
                      </div>
                      <button className="px-4 py-2.5 bg-white text-black text-sm font-bold rounded-xl hover:bg-zinc-200 transition-colors">
                        Verify
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activeTab === 'admin' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Admin Panel</h3>
                  <p className="text-sm text-zinc-500">Generate access keys for other users.</p>
                </div>
                
                <div className="p-5 bg-[#0a0a0a] border border-white/5 rounded-xl space-y-4">
                  <h4 className="text-sm font-bold text-white">Generate New Key</h4>
                  <div className="flex gap-2">
                    <select
                      value={newKeyDuration}
                      onChange={(e) => setNewKeyDuration(Number(e.target.value))}
                      className="bg-[#111] border border-white/10 rounded-xl px-4 text-sm text-white focus:outline-none"
                    >
                      <option value={1}>1 Day</option>
                      <option value={7}>7 Days</option>
                      <option value={30}>1 Month</option>
                    </select>
                    <button 
                      onClick={handleGenerateKey}
                      className="flex bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm font-bold rounded-xl transition-all items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Generate
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white mb-3">Active Keys</h4>
                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
                    {generatedKeys.length === 0 ? (
                      <p className="text-xs text-zinc-500">No keys generated yet.</p>
                    ) : (
                      generatedKeys.map((key) => {
                        const isExpired = Date.now() > key.expiresAt;
                        return (
                          <div key={key.key} className={`flex items-center justify-between p-3 rounded-xl border ${isExpired ? 'bg-red-500/5 border-red-500/10' : 'bg-[#0a0a0a] border-white/5'}`}>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-mono ${isExpired ? 'text-red-400 line-through opacity-70' : 'text-zinc-300'}`}>{key.key}</span>
                                <button 
                                  onClick={() => navigator.clipboard.writeText(key.key)}
                                  className="text-zinc-500 hover:text-white"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                                <span className="text-xs text-zinc-500">
                                  {isExpired ? 'Expired' : `Expires: ${new Date(key.expiresAt).toLocaleDateString()}`}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveKey(key.key)}
                              className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active 
          ? 'bg-white/10 text-white' 
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
