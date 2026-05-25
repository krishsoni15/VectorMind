import React, { useState, useEffect } from 'react';
import { Clipboard, FileText, FileDown, ChevronDown, ChevronUp, Check, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { getEmoji } from '../lib/emojiMapper';

export type PriorityListSection = {
  type: 'priority_list';
  title?: string;
  items: { num: number; text: string; weightage: string; keywords: string[] }[];
};

export type WeightageTableSection = {
  type: 'weightage_table';
  title?: string;
  rows: { topic: string; pct: number; keyAreas: string }[];
};

export type PaperStructureSection = {
  type: 'paper_structure';
  title?: string;
  stats: { label: string; value: string }[];
  notes: string[];
};

export type SmartTipsSection = {
  type: 'smart_tips';
  title?: string;
  tips: { emoji: string; text: string }[];
};

export type ComparisonTableSection = {
  type: 'comparison_table';
  title?: string;
  columns: [string, string];
  rows: [string, string][];
};

export type PlainTextSection = {
  type: 'plain_text';
  title?: string;
  text: string;
};

export type Section = 
  | PriorityListSection 
  | WeightageTableSection 
  | PaperStructureSection 
  | SmartTipsSection 
  | ComparisonTableSection 
  | PlainTextSection;

export type AIOutputProps = {
  output: {
    title: string;
    subtitle?: string;
    sources?: string[];
    sections: Section[];
  };
  grounding?: {
    score: number;
    level: 'high' | 'medium' | 'low';
    unsupportedSentences?: string[];
  };
  citations?: {
    id: number;
    chunk: string;
    score: number;
    sourceName: string;
    pageNum?: number;
  }[];
};

const PrintStyles = () => (
  <style dangerouslySetInnerHTML={{__html: `
    @media print {
      body * {
        visibility: hidden;
      }
      .ai-print-container, .ai-print-container * {
        visibility: visible;
      }
      .ai-print-container {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        background-color: white !important;
        color: black !important;
        box-shadow: none !important;
        border: none !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .ai-print-container .print-hidden, 
      .ai-print-container button {
        display: none !important;
      }
      .ai-print-container * {
        background: transparent !important;
        color: black !important;
        border-color: #ccc !important;
      }
      .ai-print-container table, 
      .ai-print-container th, 
      .ai-print-container td {
        border: 1px solid #ddd !important;
        border-collapse: collapse !important;
      }
      .ai-print-container th, 
      .ai-print-container td {
        padding: 8px !important;
      }
    }
  `}} />
);

const SectionHeader = ({ title }: { title?: string }) => {
  if (!title) return null;
  const emoji = getEmoji(title);
  return (
    <h3 className="text-lg font-semibold text-gray-100 flex items-center mb-4 mt-6">
      <div className="w-1.5 h-5 bg-blue-500 rounded-full mr-2 print-hidden"></div>
      {emoji && <span className="mr-2 select-none" style={{ fontSize: '15px' }}>{emoji}</span>}
      {title}
    </h3>
  );
};

const SourceChunkCard = ({ citation }: { citation: any }) => {
  const [expanded, setExpanded] = useState(false);
  const isStrong = citation.score > 0.85;

  return (
    <div className="bg-[#0c1622] border border-[#1e2d3d] rounded-lg overflow-hidden transition-all duration-200">
      <div 
        className="px-4 py-2.5 bg-[#121f2f] border-b border-[#1e2d3d] flex justify-between items-center cursor-pointer hover:bg-[#1a2838]" 
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200 truncate max-w-[150px] sm:max-w-[200px]" title={citation.sourceName}>
            {citation.sourceName}
          </span>
          {citation.pageNum && <span className="text-[10px] bg-[#1e2d3d] text-gray-400 px-1.5 py-0.5 rounded border border-[#2a3f54]">p. {citation.pageNum}</span>}
          {isStrong && <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 ml-2 hidden sm:inline-block">Strong match</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="w-16 h-1.5 bg-[#1e2d3d] rounded-full overflow-hidden">
            <div className={`h-full ${isStrong ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.round(citation.score * 100)}%` }} />
          </div>
          <span className="text-[10px] font-mono text-gray-400 w-6 text-right">{Math.round(citation.score * 100)}%</span>
          {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </div>
      <div className="p-3.5 text-[13px] text-gray-400 leading-relaxed bg-[#0c1622]">
        {expanded ? citation.chunk : (citation.chunk.length > 150 ? citation.chunk.substring(0, 150) + '...' : citation.chunk)}
        {citation.chunk.length > 150 && !expanded && (
          <button onClick={() => setExpanded(true)} className="text-blue-400 ml-2 hover:underline focus:outline-none font-medium text-xs">View full chunk</button>
        )}
        {expanded && citation.chunk.length > 150 && (
          <button onClick={() => setExpanded(false)} className="text-blue-400 block mt-3 hover:underline focus:outline-none font-medium text-xs">Show less</button>
        )}
      </div>
    </div>
  );
};

const PriorityListRenderer = ({ section }: { section: PriorityListSection }) => {
  const [expandedItems, setExpandedItems] = useState<number[]>([]);

  const toggleItem = (num: number) => {
    if (expandedItems.includes(num)) {
      setExpandedItems(expandedItems.filter(i => i !== num));
    } else {
      setExpandedItems([...expandedItems, num]);
    }
  };

  return (
    <div className="space-y-3">
      <SectionHeader title={section.title} />
      {section.items.map((item) => {
        const isExpanded = expandedItems.includes(item.num);
        return (
          <div 
            key={item.num} 
            className="border border-[#1e2d3d] bg-[#0c1622] rounded-lg overflow-hidden transition-all duration-200"
          >
            <div 
              className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-[#121f2f]"
              onClick={() => toggleItem(item.num)}
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-sm border border-blue-500/20">
                  {item.num}
                </div>
                <div className="font-medium text-gray-200 text-[14px]">{item.text}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold px-2 py-1 bg-[#1e2d3d] text-gray-300 rounded border border-[#2a3f54]">
                  {item.weightage}
                </span>
                <div className="print-hidden">
                  {isExpanded ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronDown size={16} className="text-gray-400"/>}
                </div>
              </div>
            </div>
            {(isExpanded || typeof window === 'undefined') && item.keywords && item.keywords.length > 0 && (
              <div className="px-4 pb-4 pt-2 bg-[#0c1622] border-t border-[#1e2d3d]/50">
                <p className="text-xs text-gray-400 mb-2">Keywords:</p>
                <div className="flex flex-wrap gap-2">
                  {item.keywords.map((kw, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const WeightageTableRenderer = ({ section }: { section: WeightageTableSection }) => {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mb-6">
      <SectionHeader title={section.title} />
      <div className="border border-[#1e2d3d] rounded-lg overflow-hidden bg-[#0c1622]">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead className="bg-[#121f2f] border-b border-[#1e2d3d]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-300 whitespace-nowrap">Topic</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300 w-[140px] md:w-1/3">Weightage</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-300">Key Areas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d]">
              {section.rows.map((row, i) => (
                <tr key={i} className="hover:bg-[#0f1a27] transition-colors">
                  <td className="px-4 py-3 text-gray-200 font-medium">{row.topic}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-9 text-right text-xs font-semibold text-blue-400 shrink-0">{row.pct}%</span>
                      <div className="flex-1 h-2 rounded-full bg-[#1e2d3d] overflow-hidden print-hidden">
                        <div 
                          className="h-full bg-blue-500 transition-all duration-1000 ease-out" 
                          style={{ width: mounted ? `${row.pct}%` : '0%' }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs leading-relaxed">{row.keyAreas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PaperStructureRenderer = ({ section }: { section: PaperStructureSection }) => {
  return (
    <div className="mb-6">
      <SectionHeader title={section.title} />
      
      {section.stats && section.stats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {section.stats.map((stat, i) => (
            <div key={i} className="bg-gradient-to-b from-[#121f2f] to-[#0c1622] border border-[#1e2d3d] rounded-lg p-4 text-center shadow-sm">
              <div className="text-xl md:text-2xl font-bold text-gray-100">{stat.value}</div>
              <div className="text-[11px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {section.notes && section.notes.length > 0 && (
        <div className="bg-[#0c1622] border border-[#1e2d3d] rounded-lg p-4 sm:p-5">
          <ul className="space-y-2.5">
            {section.notes.map((note, i) => (
              <li key={i} className="flex gap-3 text-[14px] text-gray-300">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                <span className="leading-relaxed">{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const SmartTipsRenderer = ({ section }: { section: SmartTipsSection }) => {
  return (
    <div className="mb-6">
      <SectionHeader title={section.title} />
      <div className="grid sm:grid-cols-2 gap-3">
        {section.tips.map((tip, i) => (
          <div key={i} className="flex gap-3 bg-gradient-to-br from-[#121f2f] to-[#0c1622] border border-[#1e2d3d] rounded-lg p-3.5 items-start shadow-sm transition-transform hover:-translate-y-0.5">
            <span className="text-xl leading-none pt-0.5 shrink-0 select-none">{tip.emoji}</span>
            <span className="text-[14px] text-gray-200 leading-relaxed">{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ComparisonTableRenderer = ({ section }: { section: ComparisonTableSection }) => {
  return (
    <div className="mb-6">
      <SectionHeader title={section.title} />
      <div className="border border-[#1e2d3d] rounded-lg overflow-hidden bg-[#0c1622]">
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] min-w-[500px]">
            <thead className="bg-[#121f2f] border-b border-[#1e2d3d]">
              <tr>
                {section.columns.map((col, i) => (
                  <th key={i} className={`px-4 py-3 text-left font-semibold text-gray-300 w-1/2 ${i === 0 ? 'border-r border-[#1e2d3d]' : ''}`}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2d3d]">
              {section.rows.map((row, i) => (
                <tr key={i} className="hover:bg-[#0f1a27] transition-colors">
                  <td className="px-4 py-3.5 text-gray-300 leading-relaxed align-top border-r border-[#1e2d3d]">{row[0]}</td>
                  <td className="px-4 py-3.5 text-gray-300 leading-relaxed align-top">{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const PlainTextRenderer = ({ section }: { section: PlainTextSection }) => {
  return (
    <div className="mb-6">
      <SectionHeader title={section.title} />
      <div className="text-[14px] text-gray-300 leading-relaxed whitespace-pre-wrap">
        {section.text}
      </div>
    </div>
  );
};

export default function AIOutput({ output, grounding, citations }: AIOutputProps) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);

  // BUTTON 1: Copy Plain Text
  const handleCopy = () => {
    let text = `${output.title}\n${output.subtitle ? output.subtitle + '\n' : ''}\n`;
    
    if (output.sources && output.sources.length > 0) {
      text += `Sources: ${output.sources.join(', ')}\n\n`;
    }
    
    output.sections.forEach(s => {
      if (s.title) text += `${s.title}\n${'-'.repeat(s.title.length)}\n`;
      if (s.type === 'plain_text') {
        text += s.text + '\n\n';
      } else if (s.type === 'smart_tips') {
        s.tips.forEach(t => text += `${t.emoji} ${t.text}\n`);
        text += '\n';
      } else if (s.type === 'priority_list') {
        s.items.forEach(i => {
          text += `${i.num}. ${i.text} (${i.weightage})\n`;
          if (i.keywords && i.keywords.length > 0) {
            text += `   Keywords: ${i.keywords.join(', ')}\n`;
          }
        });
        text += '\n';
      } else if (s.type === 'comparison_table') {
        text += `${s.columns[0]} vs ${s.columns[1]}\n`;
        s.rows.forEach(r => text += `- ${r[0]}: ${r[1]}\n`);
        text += '\n';
      } else if (s.type === 'weightage_table') {
        s.rows.forEach(r => text += `${r.topic} (${r.pct}%) - ${r.keyAreas}\n`);
        text += '\n';
      } else if (s.type === 'paper_structure') {
        if (s.stats && s.stats.length > 0) {
          s.stats.forEach(st => text += `${st.label}: ${st.value}\n`);
        }
        if (s.notes && s.notes.length > 0) {
          s.notes.forEach(n => text += `- ${n}\n`);
        }
        text += '\n';
      }
    });

    navigator.clipboard.writeText(text.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // BUTTON 2: Export as Markdown
  const handleExportMarkdown = () => {
    let md = `# ${output.title}\n\n`;
    if (output.subtitle) md += `_${output.subtitle}_\n\n`;
    if (output.sources && output.sources.length > 0) {
      md += `**Sources:** ${output.sources.join(', ')}\n\n`;
    }

    output.sections.forEach(s => {
      if (s.title) md += `## ${s.title}\n\n`;
      if (s.type === 'plain_text') {
        md += s.text + '\n\n';
      } else if (s.type === 'smart_tips') {
        s.tips.forEach(t => md += `- ${t.emoji} ${t.text}\n`);
        md += '\n';
      } else if (s.type === 'priority_list') {
        s.items.forEach(i => {
          md += `${i.num}. **${i.text}** (Weightage: ${i.weightage})\n`;
          if (i.keywords && i.keywords.length > 0) {
            md += `   - Keywords: ${i.keywords.join(', ')}\n`;
          }
        });
        md += '\n';
      } else if (s.type === 'comparison_table') {
        md += `| ${s.columns[0]} | ${s.columns[1]} |\n`;
        md += `|---|---|\n`;
        s.rows.forEach(r => md += `| ${r[0]} | ${r[1]} |\n`);
        md += '\n';
      } else if (s.type === 'weightage_table') {
        md += `| Topic | Weightage | Key Areas |\n`;
        md += `|---|---|---|\n`;
        s.rows.forEach(r => md += `| ${r.topic} | ${r.pct}% | ${r.keyAreas} |\n`);
        md += '\n';
      } else if (s.type === 'paper_structure') {
        if (s.stats && s.stats.length > 0) {
          s.stats.forEach(st => md += `- **${st.label}:** ${st.value}\n`);
        }
        if (s.notes && s.notes.length > 0) {
          s.notes.forEach(n => md += `- ${n}\n`);
        }
        md += '\n';
      }
    });

    const blob = new Blob([md.trim()], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'answer.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // BUTTON 3: Export as PDF
  const handleExportPDF = () => {
    const originalTitle = document.title;
    document.title = output.title || 'AI Answer';
    window.print();
    document.title = originalTitle;
  };

  if (!output || !output.sections) return null;

  return (
    <>
      <PrintStyles />
      <div className="ai-print-container w-full bg-[#080f17] border border-[#1e2d3d] rounded-xl shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-5 md:px-8 border-b border-[#1e2d3d] bg-gradient-to-r from-[#0c1622] to-[#080f17] flex justify-between items-start">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-50">{output.title}</h2>
            {output.subtitle && (
              <p className="text-sm text-gray-400 mt-1.5">{output.subtitle}</p>
            )}
            
            {/* Sources Pills */}
            {output.sources && output.sources.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3 print-hidden">
                {output.sources.map((src, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs bg-[#1e2d3d] text-gray-300 px-2.5 py-1 rounded-md border border-[#2a3f54]">
                    <FileText size={12} className="text-blue-400" />
                    {src}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Actions & Badge */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 shrink-0 ml-4 print-hidden items-end sm:items-center">
            {/* Grounding Badge */}
            {grounding && citations && citations.length > 0 && (
              <button 
                onClick={() => setShowSources(!showSources)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold border shadow-sm transition-colors sm:mr-2 ${
                  grounding.level === 'high' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' :
                  grounding.level === 'medium' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20' :
                  'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'
                }`}
                title="Toggle source chunks"
              >
                {grounding.level === 'high' ? <CheckCircle size={14} /> : 
                 grounding.level === 'medium' ? <AlertTriangle size={14} /> : 
                 <XCircle size={14} />}
                {grounding.level === 'high' ? `Grounded ${grounding.score}%` : 
                 grounding.level === 'medium' ? `Check sources ${grounding.score}%` : 
                 `Low confidence ${grounding.score}%`}
              </button>
            )}

            <div className="flex gap-2">
              <button 
                onClick={handleCopy}
                className="h-8 min-w-[32px] px-2 bg-[#121f2f] hover:bg-[#1e2d3d] text-gray-300 rounded-md transition-colors border border-[#1e2d3d] flex items-center justify-center gap-1.5 shadow-sm"
                title="Copy plain text"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    <span className="text-[11px] font-medium text-emerald-400 px-1">Copied!</span>
                  </>
                ) : (
                  <Clipboard size={14} />
                )}
              </button>
              <button 
                onClick={handleExportMarkdown}
                className="h-8 w-8 bg-[#121f2f] hover:bg-[#1e2d3d] text-gray-300 rounded-md transition-colors border border-[#1e2d3d] flex items-center justify-center shadow-sm"
                title="Export as Markdown (.md)"
              >
                <FileText size={14} />
              </button>
              <button 
                onClick={handleExportPDF}
                className="h-8 w-8 bg-[#121f2f] hover:bg-[#1e2d3d] text-gray-300 rounded-md transition-colors border border-[#1e2d3d] flex items-center justify-center shadow-sm"
                title="Export as PDF"
              >
                <FileDown size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Source Preview Panel */}
        {showSources && citations && citations.length > 0 && (
          <div className="px-6 md:px-8 py-5 border-b border-[#1e2d3d] bg-[#0c1622] print-hidden animate-slide-up">
            <h4 className="text-sm font-bold text-gray-200 mb-4 flex items-center gap-2">
              <FileText size={16} className="text-blue-400" /> Source Chunks used for generation
            </h4>
            <div className="space-y-3">
              {citations.slice(0, 3).map((cit) => (
                <SourceChunkCard key={cit.id} citation={cit} />
              ))}
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-8">
          {output.sections.map((section, idx) => {
            switch (section.type) {
              case 'priority_list':
                return <PriorityListRenderer key={idx} section={section} />;
              case 'weightage_table':
                return <WeightageTableRenderer key={idx} section={section} />;
              case 'paper_structure':
                return <PaperStructureRenderer key={idx} section={section} />;
              case 'smart_tips':
                return <SmartTipsRenderer key={idx} section={section} />;
              case 'comparison_table':
                return <ComparisonTableRenderer key={idx} section={section} />;
              case 'plain_text':
                return <PlainTextRenderer key={idx} section={section} />;
              default:
                return null;
            }
          })}
        </div>
      </div>
    </>
  );
}
