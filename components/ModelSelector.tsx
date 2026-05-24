import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type ModelId = 'gemini' | 'groq' | 'cohere' | 'openai';

export interface ModelOption {
  id: ModelId;
  name: string;
  label: string;
  dotColor: string;
  description: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { 
    id: 'groq', 
    name: 'Groq Llama 3.3', 
    label: 'Fastest', 
    dotColor: 'bg-yellow-400', 
    description: 'Ultra-low latency' 
  },
  { 
    id: 'gemini', 
    name: 'Gemini 2.0 Flash', 
    label: 'Fast', 
    dotColor: 'bg-green-400', 
    description: 'Best for quick answers' 
  },
  { 
    id: 'cohere', 
    name: 'Cohere Command-R', 
    label: 'Balanced', 
    dotColor: 'bg-blue-400', 
    description: 'Good for long documents' 
  },
  { 
    id: 'openai', 
    name: 'GPT-4o-mini', 
    label: 'Powerful', 
    dotColor: 'bg-purple-400', 
    description: 'Best reasoning quality' 
  },
];

// Hook to manage selected model state and localStorage
export function useModelSelection() {
  const [model, setModel] = useState<ModelId>('gemini');

  useEffect(() => {
    const saved = localStorage.getItem('vectormind_chatgpt_model');
    if (saved && ['gemini', 'groq', 'cohere', 'openai'].includes(saved)) {
      setModel(saved as ModelId);
    }
  }, []);

  const handleModelChange = (newModel: ModelId) => {
    setModel(newModel);
    localStorage.setItem('vectormind_chatgpt_model', newModel);
  };

  return { model, setModel: handleModelChange };
}

export interface ModelSelectorProps {
  value: ModelId;
  onChange: (model: ModelId) => void;
}

export default function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = MODEL_OPTIONS.find((o) => o.id === value) || MODEL_OPTIONS[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (modelId: ModelId) => {
    onChange(modelId);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-[#0c1622] hover:bg-[#121f2f] border border-[#1e2d3d] rounded-xl text-sm text-gray-200 transition-colors shadow-sm focus:outline-none"
      >
        <span className="font-semibold text-[13px]">{selectedOption.name}</span>
        <span className={`w-2 h-2 rounded-full ${selectedOption.dotColor} shadow-[0_0_8px_currentColor] ml-1 opacity-90`} />
        <ChevronDown size={14} className="text-gray-400 ml-0.5" />
      </button>

      {/* Dropdown Panel with CSS Animation */}
      <div 
        className={`absolute bottom-[calc(100%+8px)] left-0 w-72 bg-[#0c1622] border border-[#1e2d3d] rounded-xl shadow-2xl z-50 overflow-hidden transform origin-bottom-left transition-all duration-200 ease-out
          ${isOpen ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 translate-y-2 pointer-events-none'}`}
      >
        <div className="p-1.5 flex flex-col gap-0.5">
          {MODEL_OPTIONS.map((option) => {
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option.id)}
                className={`w-full text-left flex items-start px-3 py-2.5 rounded-lg transition-colors focus:outline-none
                  ${isSelected ? 'bg-[#121f2f]' : 'hover:bg-[#1a2838]'}`}
              >
                <div className="mt-1 mr-3 shrink-0">
                  <span className={`block w-2 h-2 rounded-full ${option.dotColor} shadow-[0_0_6px_currentColor] opacity-80`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-semibold text-gray-100 text-[14px]">{option.name}</span>
                    {isSelected && <Check size={14} className="text-gray-100 shrink-0 ml-2" />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-gray-400 tracking-wide uppercase">{option.label}</span>
                    <span className="text-gray-600 text-[10px]">•</span>
                    <span className="text-[12px] text-gray-500 truncate">{option.description}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
