
import React, { useState } from 'react';
import {
  ListingMode,
  PropertyData,
  TerminologyItem,
  SavedListing,
  HashtagSet
} from './types';
import {
  INITIAL_PROPERTY_DATA,
  DEFAULT_TERMINOLOGY,
  DEFAULT_HASHTAGS
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
  Train,
  Settings,
  ChevronDown,
  BookmarkPlus,
  BookmarkCheck,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadedFile {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

const App = () => {
  // --- Core State ---
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

  // Settings State
  const [terminology, setTerminology] = useState<TerminologyItem[]>(DEFAULT_TERMINOLOGY);
  const [hashtags, setHashtags] = useState<HashtagSet>(DEFAULT_HASHTAGS);
  const [showSettings, setShowSettings] = useState(false);

  // Saved Listings State
  const [savedListings, setSavedListings] = useState<SavedListing[]>([]);

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

  // --- Terminology Management ---
  const updateTerminology = (id: string, field: 'japanese' | 'taiwanese', value: string) => {
    setTerminology(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const removeTerminology = (id: string) => {
    setTerminology(prev => prev.filter(t => t.id !== id));
  };

  const addTerminology = () => {
    const newItem: TerminologyItem = {
      id: Math.random().toString(36).substring(7),
      japanese: '',
      taiwanese: ''
    };
    setTerminology(prev => [...prev, newItem]);
  };

  const resetTerminology = () => {
    setTerminology(DEFAULT_TERMINOLOGY);
  };

  // --- Saved Listings Management ---
  const saveCurrentListing = () => {
    if (!generatedText) return;
    const firstLine = generatedText.split('\n').find(l => l.trim()) || '未命名';
    const newListing: SavedListing = {
      id: Math.random().toString(36).substring(7),
      title: firstLine.substring(0, 40),
      text: generatedText,
      mode
    };
    setSavedListings(prev => [newListing, ...prev]);
  };

  const loadSavedListing = (listing: SavedListing) => {
    setMode(listing.mode);
    pushToHistory(listing.text, true);
  };

  const deleteSavedListing = (id: string) => {
    setSavedListings(prev => prev.filter(l => l.id !== id));
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
      const parts = uploadedFiles.map(f => ({ mimeType: f.mimeType, data: f.base64 }));
      const { data: extractedData, detectedMode } = await extractPropertyData(parts, supplementaryText, terminology);
      if (detectedMode) setMode(detectedMode);
      setPropertyData(prev => {
        const next = { ...prev };
        (Object.keys(extractedData) as Array<keyof PropertyData>).forEach(key => {
          if (extractedData[key]) next[key] = extractedData[key]!;
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
    const text = await generateListingText(propertyData, mode, terminology, hashtags);
    pushToHistory(text, true);
    setIsGenerating(false);
  };

  const handleRewrite = async (instruction: string) => {
    if (!generatedText || !instruction.trim()) return;
    setIsRewriting(true);
    const newText = await rewriteListingText(generatedText, instruction, terminology);
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
        {/* ===== LEFT COLUMN ===== */}
        <div className="space-y-6">

          {/* Smart Import */}
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

          {/* Settings Panel */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
            >
              <h2 className="text-base font-semibold flex items-center gap-2 text-slate-700">
                <Settings className="w-4 h-4" /> 台灣用語 & Hashtag 設定
              </h2>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showSettings ? 'rotate-180' : ''}`} />
            </button>

            {showSettings && (
              <div className="px-6 pb-6 space-y-5 border-t border-slate-100">
                {/* Terminology Editor */}
                <div className="pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-600">台灣用語對照表</h3>
                    <div className="flex gap-2">
                      <button
                        onClick={resetTerminology}
                        className="text-xs text-slate-500 border border-slate-200 px-3 py-1 rounded-full hover:bg-slate-100 transition-colors"
                      >
                        重置預設
                      </button>
                      <button
                        onClick={addTerminology}
                        className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> 新增
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-x-2 gap-y-0.5 mb-2 px-1">
                    <span className="text-xs text-slate-400 font-semibold">日文</span>
                    <span></span>
                    <span className="text-xs text-slate-400 font-semibold">台灣用語</span>
                    <span></span>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {terminology.map((item) => (
                      <div key={item.id} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
                        <input
                          value={item.japanese}
                          onChange={(e) => updateTerminology(item.id, 'japanese', e.target.value)}
                          className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-indigo-400 outline-none"
                          placeholder="日文"
                        />
                        <span className="text-slate-300 text-xs">→</span>
                        <input
                          value={item.taiwanese}
                          onChange={(e) => updateTerminology(item.id, 'taiwanese', e.target.value)}
                          className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-indigo-400 outline-none"
                          placeholder="台灣用語"
                        />
                        <button onClick={() => removeTerminology(item.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hashtag Editor */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-600 pt-2">Hashtag 設定</h3>
                  <div>
                    <label className="text-xs font-bold text-indigo-600 mb-1.5 block">租賃 Hashtag</label>
                    <textarea
                      value={hashtags.rental}
                      onChange={(e) => setHashtags(prev => ({ ...prev, rental: e.target.value }))}
                      className="w-full text-xs bg-slate-50 border border-indigo-200 rounded-lg px-3 py-2 resize-none h-16 focus:ring-2 focus:ring-indigo-300 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-rose-600 mb-1.5 block">買賣 Hashtag</label>
                    <textarea
                      value={hashtags.sale}
                      onChange={(e) => setHashtags(prev => ({ ...prev, sale: e.target.value }))}
                      className="w-full text-xs bg-slate-50 border border-rose-200 rounded-lg px-3 py-2 resize-none h-16 focus:ring-2 focus:ring-rose-300 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Property Details */}
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

        {/* ===== RIGHT COLUMN ===== */}
        <div className="flex flex-col gap-6">

          {/* Output Area */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden relative min-h-[600px]">
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
                    <div className="flex items-center gap-2">
                      {generatedText && (
                        <button onClick={saveCurrentListing} className="text-xs bg-white border border-slate-200 hover:bg-amber-50 hover:border-amber-300 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                          <BookmarkPlus className="w-3 h-3 text-amber-500" /> 儲存
                        </button>
                      )}
                      <button onClick={copyToClipboard} className="text-xs bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm">
                        {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copied ? '已複製' : '複製文字'}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 relative mb-1">
                    {isRewriting && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20 rounded-lg">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                      </div>
                    )}
                    {generatedText ? (
                      <textarea
                        value={generatedText}
                        onChange={(e) => updateCurrentHistory(e.target.value)}
                        className="w-full h-full min-h-[300px] bg-white rounded-lg p-4 font-mono text-sm border border-slate-200 focus:ring-2 focus:ring-indigo-100 outline-none resize-none text-slate-700 shadow-inner"
                      />
                    ) : (
                      <div className="w-full h-full min-h-[300px] bg-white rounded-lg p-4 flex items-center justify-center border border-slate-200 shadow-inner">
                        <span className="text-slate-400 italic">準備生成... 請點擊左側按鈕！</span>
                      </div>
                    )}
                  </div>

                  {/* Character Count */}
                  {generatedText && (
                    <div className="text-right text-xs text-slate-400 mb-3">
                      {generatedText.length} 字元
                    </div>
                  )}

                  {/* AI Rewrite */}
                  {generatedText && (
                    <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm">
                      <h4 className="text-xs font-bold text-indigo-900 mb-3 flex items-center gap-2"><Pencil className="w-3 h-3" /> AI 優化調整</h4>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {[
                          { label: "熱情推薦 🔥", prompt: "把整體語氣改得更有活力、更吸引人，多用感嘆詞和強調語句，但保持原有格式與結構不變，輸出繁體中文。" },
                          { label: "專業穩重 👔", prompt: "把語氣改得更正式、專業且有說服力，適合商務客或投資型買家，保持原有格式不變，輸出繁體中文。" },
                          { label: "交通生活機能 🚃", prompt: "強調交通便利性、附近生活機能（超市、便利商店、餐廳等），適合重視通勤的上班族或留學生，保持格式不變，輸出繁體中文。" },
                          { label: "投資置產 📈", prompt: "強調地點增值潛力、租金收益率、區域發展前景，用數字和地段優勢吸引投資型買家，保持格式不變，輸出繁體中文。" },
                          { label: "留學打工度假 🎒", prompt: "語氣輕鬆親切，強調海外審查通過率高、入住手續簡便、附近生活便利，針對台灣留學生和打工度假族群，保持格式不變，輸出繁體中文。" },
                          { label: "精簡版 ✂️", prompt: "把文案濃縮為精簡版本，去掉冗長說明，只保留最關鍵的資訊和賣點，適合在限制字數的平台發文，輸出繁體中文。" }
                        ].map((opt) => (
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
                        <button onClick={() => handleRewrite(customRewritePrompt)} disabled={isRewriting || !customRewritePrompt.trim()} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 h-fit disabled:opacity-50">
                          <SendHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Saved Listings */}
          {savedListings.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-amber-500" /> 已儲存文案
                <span className="ml-auto text-xs text-slate-400 font-normal">{savedListings.length} 筆</span>
              </h3>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {savedListings.map((listing) => (
                  <div key={listing.id} className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold shrink-0 ${listing.mode === ListingMode.RENTAL ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                      {listing.mode === ListingMode.RENTAL ? '租賃' : '買賣'}
                    </span>
                    <span className="text-xs text-slate-600 flex-1 truncate">{listing.title}</span>
                    <button onClick={() => loadSavedListing(listing)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium shrink-0 transition-colors">載入</button>
                    <button onClick={() => deleteSavedListing(listing.id)} className="text-slate-300 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
