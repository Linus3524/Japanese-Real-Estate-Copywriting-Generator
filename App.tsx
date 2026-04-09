
import React, { useState, useEffect } from 'react';
import { 
  ListingMode, 
  PropertyData
} from './types';
import { 
  INITIAL_PROPERTY_DATA
} from './constants';
import { generateListingText, extractPropertyData, rewriteListingText } from './services/geminiService';
import { 
  Building2, 
  Sparkles, 
  Copy, 
  RefreshCcw,
  CheckCircle2,
  Upload,
  Bot,
  FileText,
  ScanSearch,
  Loader2,
  X,
  Plus,
  Wand2,
  Pencil,
  SendHorizontal,
  Undo2,
  Redo2,
  CalendarDays,
  Info,
  MapPin,
  Train
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Type for uploaded file preview
interface UploadedFile {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

const App = () => {
  // --- State ---
  const [mode, setMode] = useState<ListingMode>(ListingMode.RENTAL);
  const [propertyData, setPropertyData] = useState<PropertyData>(INITIAL_PROPERTY_DATA);
  
  // Smart Import State
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [supplementaryText, setSupplementaryText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Generation State
  const [generatedText, setGeneratedText] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [customRewritePrompt, setCustomRewritePrompt] = useState("");

  // History State
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // --- Helpers ---
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // --- History Management ---
  
  const updateCurrentHistory = (text: string) => {
    setGeneratedText(text);
    if (historyIndex >= 0) {
      const newHistory = [...textHistory];
      newHistory[historyIndex] = text;
      setTextHistory(newHistory);
    }
  };

  const pushToHistory = (text: string, reset: boolean = false) => {
    setGeneratedText(text);
    if (reset) {
      setTextHistory([text]);
      setHistoryIndex(0);
    } else {
      const newHistory = textHistory.slice(0, historyIndex + 1);
      newHistory.push(text);
      setTextHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGeneratedText(textHistory[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < textHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGeneratedText(textHistory[newIndex]);
    }
  };

  // --- Handlers: Smart Import ---

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const newFiles: UploadedFile[] = [];
    const maxFiles = 5;
    const currentCount = uploadedFiles.length;

    const filesArray = Array.from(e.target.files).slice(0, maxFiles - currentCount) as File[];

    for (const file of filesArray) {
      const base64 = await fileToBase64(file);
      newFiles.push({
        id: Math.random().toString(36).substring(7),
        file,
        previewUrl: URL.createObjectURL(file),
        base64,
        mimeType: file.type
      });
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleAnalyze = async () => {
    if (uploadedFiles.length === 0 && !supplementaryText) {
      alert("請上傳檔案或輸入文字以進行分析。");
      return;
    }

    setIsAnalyzing(true);
    try {
      const parts = uploadedFiles.map(f => ({
        mimeType: f.mimeType,
        data: f.base64
      }));

      const { data: extractedData, detectedMode } = await extractPropertyData(parts, supplementaryText);
      
      if (detectedMode) {
        setMode(detectedMode);
      }

      setPropertyData(prev => {
        const next = { ...prev };
        (Object.keys(extractedData) as Array<keyof PropertyData>).forEach(key => {
          if (extractedData[key]) {
            next[key] = extractedData[key]!;
          }
        });
        return next;
      });

    } catch (error) {
      console.error("Analysis failed", error);
      alert("無法分析檔案，請重試。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Handlers: Generation & Rewrite ---

  const handleGenerateText = async () => {
    setIsGenerating(true);
    const text = await generateListingText(propertyData, mode);
    pushToHistory(text, true);
    setIsGenerating(false);
  };

  const handleRewrite = async (instruction: string) => {
    if (!generatedText || !instruction.trim()) return;
    setIsRewriting(true);
    const newText = await rewriteListingText(generatedText, instruction);
    pushToHistory(newText, false);
    setIsRewriting(false);
    setCustomRewritePrompt("");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInputChange = (field: keyof PropertyData, value: string) => {
    setPropertyData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Bot className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">日本不動產文案生成器</h1>
          </div>
          <div className="flex gap-2 p-1 bg-slate-100 rounded-full border border-slate-200 shadow-inner">
            <button 
              onClick={() => { setMode(ListingMode.RENTAL); setPropertyData(INITIAL_PROPERTY_DATA); }}
              className={`px-6 py-1.5 rounded-full text-sm font-bold transition-all ${mode === ListingMode.RENTAL ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
            >
              租賃模式
            </button>
            <button 
              onClick={() => { setMode(ListingMode.SALE); setPropertyData(INITIAL_PROPERTY_DATA); }}
              className={`px-6 py-1.5 rounded-full text-sm font-bold transition-all ${mode === ListingMode.SALE ? 'bg-rose-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
            >
              買賣模式
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
        <div className="space-y-6">
          <section className="bg-white border border-indigo-100 rounded-2xl p-6 shadow-sm relative overflow-hidden group">
             <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-indigo-50 blur-3xl rounded-full transition-transform group-hover:scale-150"></div>
             <h2 className="text-lg font-semibold flex items-center gap-2 mb-2 text-indigo-700">
               <ScanSearch className="w-5 h-5" /> 智慧圖紙掃描
             </h2>
             <p className="text-sm text-slate-500 mb-4">AI 會自動識別並將術語轉化為「台灣慣用說法」與「多車站資訊」。</p>
             {uploadedFiles.length > 0 && (
               <div className="mb-4 grid grid-cols-4 sm:grid-cols-5 gap-2">
                 {uploadedFiles.map((file) => (
                   <div key={file.id} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group/img">
                     {file.mimeType.startsWith('image/') ? (
                       <img src={file.previewUrl} alt="preview" className="w-full h-full object-cover" />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400">
                         <FileText className="w-6 h-6" />
                       </div>
                     )}
                     <button onClick={() => removeFile(file.id)} className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity">
                       <X className="w-3 h-3" />
                     </button>
                   </div>
                 ))}
                 {uploadedFiles.length < 5 && (
                    <label className="flex items-center justify-center aspect-square bg-slate-50 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 text-slate-400 transition-colors">
                      <Plus className="w-5 h-5" />
                      <input type="file" className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileSelect} />
                    </label>
                 )}
               </div>
             )}
             {uploadedFiles.length === 0 && (
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-colors mb-4">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Upload className="w-5 h-5" />
                      <span className="text-sm font-medium">點擊上傳圖紙照片</span>
                    </div>
                    <input type="file" className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileSelect} />
                </label>
             )}
             <div className="mb-4">
               <textarea 
                 placeholder="補充說明 (例如：物件名稱、裝潢細節)..."
                 value={supplementaryText}
                 onChange={(e) => setSupplementaryText(e.target.value)}
                 className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20 placeholder:text-slate-400"
               />
             </div>
             <button 
               onClick={handleAnalyze}
               disabled={isAnalyzing || (uploadedFiles.length === 0 && !supplementaryText)}
               className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm shadow-md hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
             >
               {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> 正在提取資訊...</> : <><Sparkles className="w-4 h-4" /> 智慧提取</>}
             </button>
          </section>
          
          <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4 text-slate-700">
              <Building2 className="w-5 h-5" /> 物件詳情 - {mode === ListingMode.RENTAL ? '租賃' : '買賣'}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3"/> 物件地址</label>
                <input type="text" value={propertyData.address} onChange={(e) => handleInputChange('address', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例：東京都新宿區..." />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1"><Train className="w-3 h-3"/> 路線</label>
                <input type="text" value={propertyData.line} onChange={(e) => handleInputChange('line', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="可輸入多條線路，以頓號分隔" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider flex items-center gap-1"><Train className="w-3 h-3"/> 車站名稱</label>
                <input type="text" value={propertyData.station} onChange={(e) => handleInputChange('station', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="可輸入多個車站" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">價格 ({mode === ListingMode.RENTAL ? '租金' : '總價'})</label>
                <input type="text" value={propertyData.price} onChange={(e) => handleInputChange('price', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例：15.5萬" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">徒步時間 (分)</label>
                <input type="text" value={propertyData.walkTime} onChange={(e) => handleInputChange('walkTime', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              
              {mode === ListingMode.RENTAL ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-indigo-600">管理費 / 共益費</label>
                    <input type="text" value={propertyData.managementFee} onChange={(e) => handleInputChange('managementFee', e.target.value)} className="w-full bg-slate-50 border border-indigo-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例：8000" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-indigo-600">禮金</label>
                    <input type="text" value={propertyData.keyMoney} onChange={(e) => handleInputChange('keyMoney', e.target.value)} className="w-full bg-slate-50 border border-indigo-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例：1個月" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-indigo-600">押金</label>
                    <input type="text" value={propertyData.deposit} onChange={(e) => handleInputChange('deposit', e.target.value)} className="w-full bg-slate-50 border border-indigo-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例：1個月" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-rose-600">管理費</label>
                    <input type="text" value={propertyData.managementFee} onChange={(e) => handleInputChange('managementFee', e.target.value)} className="w-full bg-slate-50 border border-rose-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-rose-600">修繕積立金</label>
                    <input type="text" value={propertyData.repairFund} onChange={(e) => handleInputChange('repairFund', e.target.value)} className="w-full bg-slate-50 border border-rose-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-rose-600 flex items-center gap-1">陽台面積 (㎡) <Info className="w-3 h-3"/></label>
                    <input type="text" value={propertyData.balconySize} onChange={(e) => handleInputChange('balconySize', e.target.value)} className="w-full bg-slate-50 border border-rose-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none" placeholder="例：3.64" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-rose-600">全棟層數</label>
                    <input type="text" value={propertyData.totalFloors} onChange={(e) => handleInputChange('totalFloors', e.target.value)} className="w-full bg-slate-50 border border-rose-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none" placeholder="例：地上7階" />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-rose-600">翻新/裝潢日期</label>
                    <input type="text" value={propertyData.renovationDate} onChange={(e) => handleInputChange('renovationDate', e.target.value)} className="w-full bg-slate-50 border border-rose-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none" placeholder="例：2025年11月翻新完成" />
                  </div>
                </>
              )}

              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">格局</label>
                <input type="text" value={propertyData.layout} onChange={(e) => handleInputChange('layout', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">專有面積 (㎡)</label>
                <input type="text" value={propertyData.size} onChange={(e) => handleInputChange('size', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">所在樓層</label>
                <input type="text" value={propertyData.floor} onChange={(e) => handleInputChange('floor', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">築年月</label>
                <input type="text" value={propertyData.age} onChange={(e) => handleInputChange('age', e.target.value)} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="例：2010年10月" />
              </div>
              
              <div className="space-y-1 col-span-2">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider text-green-600 flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" /> {mode === ListingMode.RENTAL ? '入居可能日' : '引渡可能日'}
                </label>
                <input type="text" value={propertyData.moveInDate} onChange={(e) => handleInputChange('moveInDate', e.target.value)} className="w-full bg-slate-50 border border-green-200 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 outline-none" placeholder={mode === ListingMode.RENTAL ? "即入居, 2024/10/01..." : "相談, 即時, 居住中..."} />
              </div>
            </div>
            <div className="mt-4 space-y-1">
               <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">特色重點 (AI將轉化為台灣在地術語)</label>
               <textarea value={propertyData.features} onChange={(e) => handleInputChange('features', e.target.value)} rows={2} className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
            </div>
          </section>

           <button 
            onClick={handleGenerateText}
            disabled={isGenerating}
            className={`w-full py-4 text-white rounded-xl font-bold text-lg shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${mode === ListingMode.RENTAL ? 'bg-indigo-600' : 'bg-rose-600'}`}
           >
             {isGenerating ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
             {isGenerating ? 'AI 正在生成專業文案...' : `生成${mode === ListingMode.RENTAL ? '租賃' : '買賣'}社群文案`}
           </button>
        </div>

        <div className="flex flex-col h-full min-h-[600px] bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative">
            <div className="flex-1 p-6 relative bg-slate-50/50">
              <AnimatePresence mode="wait">
                  <motion.div key="text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="h-full flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm uppercase tracking-widest font-bold text-slate-400">文案結果</h3>
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                          <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 transition-colors" title="上一步"><Undo2 className="w-4 h-4" /></button>
                          <div className="w-px h-4 bg-slate-200"></div>
                          <button onClick={handleRedo} disabled={historyIndex >= textHistory.length - 1} className="p-1.5 hover:bg-slate-100 disabled:opacity-30 transition-colors" title="下一步"><Redo2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                      <button onClick={copyToClipboard} className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                         {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                         {copied ? '已複製' : '複製文字'}
                      </button>
                    </div>
                    <div className="flex-1 relative mb-4">
                      {isRewriting && <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-lg"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>}
                      {generatedText ? (
                        <textarea value={generatedText} onChange={(e) => updateCurrentHistory(e.target.value)} className="w-full h-full min-h-[300px] bg-white rounded-lg p-4 font-mono text-sm border border-slate-200 focus:ring-2 focus:ring-indigo-100 outline-none resize-none text-slate-700 shadow-inner" />
                      ) : (
                         <div className="w-full h-full min-h-[300px] bg-white rounded-lg p-4 flex items-center justify-center border border-slate-200 shadow-inner"><span className="text-slate-400 italic">準備生成... 請點擊左側按鈕！</span></div>
                      )}
                    </div>
                    {generatedText && (
                      <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                        <h4 className="text-xs font-bold text-indigo-900 mb-3 flex items-center gap-2"><Pencil className="w-3 h-3" /> AI 優化調整</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {[{ label: "更熱情一點 🔥", prompt: "Make it more enthusiastic." }, { label: "更專業穩重 👔", prompt: "Make it more formal and professional." }, { label: "強調翻新細節 ✨", prompt: "Emphasize renovation details and like-new condition." }, { label: "適合投資置產 📈", prompt: "Focus on investment potential and location value." }].map((opt) => (
                            <button key={opt.label} onClick={() => handleRewrite(opt.prompt)} disabled={isRewriting} className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 hover:bg-indigo-100 transition-colors">{opt.label}</button>
                          ))}
                        </div>
                        <div className="flex gap-2 items-end">
                          <textarea 
                            value={customRewritePrompt} 
                            onChange={(e) => setCustomRewritePrompt(e.target.value)} 
                            placeholder="自定義調整要求... (按兩下 Enter 送出)" 
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm outline-none resize-none min-h-[80px]" 
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                const target = e.target as HTMLTextAreaElement;
                                if (target.selectionStart > 0 && target.value[target.selectionStart - 1] === '\n') {
                                  e.preventDefault();
                                  handleRewrite(customRewritePrompt);
                                }
                              }
                            }} 
                          />
                          <button onClick={() => handleRewrite(customRewritePrompt)} disabled={isRewriting || !customRewritePrompt.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 h-fit"><SendHorizontal className="w-4 h-4" /></button>
                        </div>
                      </div>
                    )}
                  </motion.div>
              </AnimatePresence>
            </div>
        </div>
      </main>
    </div>
  );
};

export default App;
