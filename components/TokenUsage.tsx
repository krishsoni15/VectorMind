import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, ChevronUp, ChevronDown, DollarSign } from 'lucide-react';
import { getUsageStats, FREE_TIER_LIMITS, ModelProvider, resetUsage, DailyUsage } from '../lib/tokenTracker';

export default function TokenUsage() {
  const [isOpen, setIsOpen] = useState(false);
  const [usage, setUsage] = useState<DailyUsage | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUsage(getUsageStats());
    
    const handleUpdate = () => setUsage(getUsageStats());
    window.addEventListener('token-usage-updated', handleUpdate);
    
    return () => window.removeEventListener('token-usage-updated', handleUpdate);
  }, []);

  if (!mounted || !usage) return null;

  const renderModelStats = (model: ModelProvider, label: string) => {
    const stats = usage[model];
    const limits = FREE_TIER_LIMITS[model];
    if (!stats || !limits) return null;

    const reqPct = Math.min(100, (stats.requests / limits.maxRequestsPerDay) * 100);
    const tokPct = Math.min(100, (stats.tokens / limits.maxTokensPerDay) * 100);
    
    const worstPct = Math.max(reqPct, tokPct);
    const barColor = worstPct > 80 ? 'bg-red-500' : worstPct > 50 ? 'bg-yellow-500' : 'bg-emerald-500';
    
    const estCost = ((stats.tokens / 1000000) * limits.costPerMillion).toFixed(4);

    return (
      <div key={model} className="bg-[#0c1622] rounded-lg p-3.5 border border-[#1e2d3d] shadow-sm relative overflow-hidden group hover:border-[#2a3f54] transition-colors">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold text-gray-200">{label}</span>
          <span className="text-[10px] text-gray-400 font-mono flex items-center gap-0.5 bg-[#121f2f] px-1.5 py-0.5 rounded-md border border-[#1e2d3d]">
            <DollarSign size={10} className="text-emerald-400" />
            {estCost} eq.
          </span>
        </div>
        
        <div className="space-y-3">
          {/* Requests */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
              <span className="font-medium">Requests: {stats.requests} / {limits.maxRequestsPerDay}</span>
              <span className={reqPct > 80 ? 'text-red-400 font-bold' : ''}>{reqPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-[#1e2d3d] rounded-full overflow-hidden">
              <div className={`h-full ${barColor} transition-all duration-700 ease-out`} style={{ width: `${reqPct}%` }} />
            </div>
          </div>
          
          {/* Tokens */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
              <span className="font-medium">Tokens: {(stats.tokens / 1000).toFixed(1)}k / {(limits.maxTokensPerDay / 1000).toFixed(0)}k</span>
              <span className={tokPct > 80 ? 'text-red-400 font-bold' : ''}>{tokPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full bg-[#1e2d3d] rounded-full overflow-hidden">
              <div className={`h-full ${barColor} transition-all duration-700 ease-out`} style={{ width: `${tokPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end print:hidden">
      {/* Collapsible Panel */}
      <div 
        className={`w-80 bg-[#121f2f] border border-[#1e2d3d] rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out transform origin-bottom-right mb-2
          ${isOpen ? 'scale-100 opacity-100 max-h-[600px]' : 'scale-95 opacity-0 max-h-0 pointer-events-none'}`}
      >
        <div className="px-4 py-3.5 border-b border-[#1e2d3d] flex justify-between items-center bg-gradient-to-r from-[#121f2f] to-[#0c1622]">
          <h3 className="text-[11px] font-bold text-gray-200 uppercase tracking-widest flex items-center gap-2">
            <Activity size={14} className="text-emerald-400" /> Free Tier Usage
          </h3>
          <button 
            onClick={resetUsage}
            className="text-gray-400 hover:text-white transition-colors bg-[#1e2d3d] p-1.5 rounded-md hover:bg-red-500/20 hover:text-red-400"
            title="Reset counters for testing"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        
        <div className="p-3 space-y-2 max-h-[350px] overflow-y-auto custom-scrollbar">
          {renderModelStats('groq', 'Groq (Llama 3.3)')}
          {renderModelStats('gemini', 'Gemini (2.0 Flash)')}
          {renderModelStats('cohere', 'Cohere (Command-R)')}
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-[#121f2f] hover:bg-[#1a2838] border border-[#1e2d3d] rounded-full shadow-2xl transition-all"
      >
        <Activity size={16} className={isOpen ? 'text-emerald-400' : 'text-gray-400'} />
        <span className="text-xs font-semibold text-gray-300 hidden sm:inline">Usage Stats</span>
        {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronUp size={14} className="text-gray-400" />}
      </button>
    </div>
  );
}
