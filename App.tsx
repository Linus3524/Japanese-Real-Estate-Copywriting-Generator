
import React, { useState, useEffect } from 'react';
import {
  ListingMode,
  CopyStyle,
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
import { generateListingText, extractPropertyData, rewriteListingText, translateListingText, generateHooks, suggestHashtags, TranslateLang } from './services/geminiService';
import {
  Building2,
  Sparkles,
  Copy,
  RefreshCcw,
  CheckCircle2,
  Bot,
  ScanSearch,
  Loader2,
  X,
  Wand2,
  SendHorizontal,
  Undo2,
  Redo2,
  Settings,
  BookmarkPlus,
  BookmarkCheck,
  Trash2,
  ArrowRight,
  SlidersHorizontal,
  Users,
  Lightbulb,
  Hash,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ImagePlus
} from 'lucide-react';

interface UploadedFile {
  id: string;
  file: File;
  previewUrl: string;
  base64: string;
  mimeType: string;
}

// --- localStorage helpers (持久化：避免重整後資料遺失) ---
const LS_KEYS = {
  terminology: 're_terminology',
  hashtags: 're_hashtags',
  saved: 're_saved_listings',
};
const loadLS = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

// 多版本生成：每版的差異化方向
const VARIATION_HINTS = [
  "Lead with lifestyle, mood and atmosphere; warm and emotive tone.",
  "Lead with hard specs and value — price, size, transport convenience; efficient, persuasive tone.",
  "Lead with the neighbourhood and location appeal; friendly, local insider tone.",
];

// 分段重寫：只改文案的某一段，其餘保持不變
const SECTION_PRESETS = [
  { label: "✍️ 只改開頭", prompt: "只重寫開頭的標題與開場敘述，讓它更吸引人，其餘所有內容（價格、設備、聯絡方式、hashtag）原封不動，輸出繁體中文。" },
  { label: "🛠 只改設備說明", prompt: "只重寫設備／房屋亮點那一段，讓描述更生動具體，其餘所有內容原封不動，輸出繁體中文。" },
  { label: "🏘 只改結尾", prompt: "只重寫結尾的街區生活／推薦段落，讓它更溫暖有感，其餘所有內容原封不動，輸出繁體中文。" },
  { label: "🎣 只換標題", prompt: "只重寫第一行的標題／開場 hook，給一個更搶眼的版本，其餘所有內容原封不動，輸出繁體中文。" },
];

// 客群一鍵切換：調整文案訴求重點，不動格式
const AUDIENCE_PRESETS = [
  { label: '🎒 留學生', prompt: '把文案的訴求重點調整為吸引留學生：強調離學校近、海外審查友善、生活機能、治安安全，語氣親切，保持原有格式、emoji、結構與所有事實數字不變，輸出繁體中文。' },
  { label: '📈 投資客', prompt: '把文案的訴求重點調整為吸引投資客：強調租金收益率、地段增值潛力、周邊開發題材，語氣專業理性，保持原有格式、emoji、結構與所有事實數字不變，輸出繁體中文。' },
  { label: '👨‍👩‍👧 家庭客', prompt: '把文案的訴求重點調整為吸引家庭客：強調周邊學區、公園、超市等生活機能、安靜環境、空間實用性，語氣溫暖，保持原有格式、emoji、結構與所有事實數字不變，輸出繁體中文。' },
  { label: '💼 上班族', prompt: '把文案的訴求重點調整為吸引上班族：強調通勤便利、辦公商圈距離、深夜返家安全、周邊生活機能，語氣乾淨有效率，保持原有格式、emoji、結構與所有事實數字不變，輸出繁體中文。' },
];

// 語感旋鈕：三軸滑桿，0-100，50為中性不調整
const TONE_AXES: { key: 'friendliness' | 'length' | 'energy'; left: string; right: string }[] = [
  { key: 'friendliness', left: '親切', right: '專業' },
  { key: 'length', left: '簡短', right: '詳盡' },
  { key: 'energy', left: '平實', right: '熱情' },
];

interface PrePublishIssue {
  level: 'pass' | 'warn' | 'error';
  message: string;
}

// 發文前校對：本機純文字檢查，不呼叫 AI（markdown 符號 / emoji 密度 / 文中找不到來源的數字）
const runPrePublishCheck = (text: string, data: PropertyData): PrePublishIssue[] => {
  const issues: PrePublishIssue[] = [];

  const mdMatches = text.match(/(\*\*|\*|__|#{1,6}\s)/g);
  if (mdMatches && mdMatches.length > 0) {
    issues.push({ level: 'error', message: `偵測到 ${mdMatches.length} 處 markdown 符號（*、#等），Facebook 不會渲染，建議移除。` });
  }

  const emojiMatches = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [];
  const lineCount = text.split('\n').filter(l => l.trim()).length || 1;
  const density = emojiMatches.length / lineCount;
  if (density > 1.5) {
    issues.push({ level: 'warn', message: `emoji 密度偏高（平均每行 ${density.toFixed(1)} 個），閱讀起來可能太花，可考慮精簡。` });
  } else if (emojiMatches.length === 0) {
    issues.push({ level: 'warn', message: '完全沒有使用 emoji，貼文視覺上可能顯得單調。' });
  }

  const dataNumbers = new Set(
    Object.values(data).flatMap(v => String(v).match(/\d+/g) || [])
  );
  const textNumbers = [...new Set(text.match(/\d{3,}/g) || [])];
  const unknownNumbers = textNumbers.filter(n => !dataNumbers.has(n));
  if (unknownNumbers.length > 0) {
    issues.push({ level: 'warn', message: `文中出現原始資料找不到對應的數字：${unknownNumbers.join('、')}，請確認是否為 AI 誤植或編造。` });
  }

  if (issues.length === 0) {
    issues.push({ level: 'pass', message: '檢查通過，沒有發現明顯問題。' });
  }
  return issues;
};

const REWRITE_PRESETS = [
  { label: "🔥 熱情推薦", prompt: "把整體語氣改得更有活力、更吸引人，多用感嘆詞和強調語句，但保持原有格式與結構不變，輸出繁體中文。" },
  { label: "👔 專業穩重", prompt: "把語氣改得更正式、專業且有說服力，適合商務客或投資型買家，保持原有格式不變，輸出繁體中文。" },
  { label: "🚃 交通生活機能", prompt: "強調交通便利性、附近生活機能（超市、便利商店、餐廳等），適合重視通勤的上班族或留學生，保持格式不變，輸出繁體中文。" },
  { label: "📈 投資置產", prompt: "強調地點增值潛力、租金收益率、區域發展前景，用數字和地段優勢吸引投資型買家，保持格式不變，輸出繁體中文。" },
  { label: "🎒 留學打工度假", prompt: "語氣輕鬆親切，強調海外審查通過率高、入住手續簡便、附近生活便利，針對台灣留學生和打工度假族群，保持格式不變，輸出繁體中文。" },
  { label: "✂️ 精簡版", prompt: "把文案濃縮為精簡版本，去掉冗長說明，只保留最關鍵的資訊和賣點，適合在限制字數的平台發文，輸出繁體中文。" }
];

const App = () => {
  // --- Core State ---
  const [mode, setMode] = useState<ListingMode>(ListingMode.RENTAL);
  const [copyStyle, setCopyStyle] = useState<CopyStyle>(CopyStyle.CLASSIC);
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
  const [isTranslating, setIsTranslating] = useState<TranslateLang | null>(null);
  const [generateCount, setGenerateCount] = useState<number>(1);
  const [variants, setVariants] = useState<string[]>([]);

  // Phase 3: AI 寫作教練 State
  const [showCoach, setShowCoach] = useState(false);
  const [toneValues, setToneValues] = useState({ friendliness: 50, length: 50, energy: 50 });
  const [hookOptions, setHookOptions] = useState<string[]>([]);
  const [isGeneratingHooks, setIsGeneratingHooks] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [checkResults, setCheckResults] = useState<PrePublishIssue[] | null>(null);

  // History State
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Settings State (持久化)
  const [terminology, setTerminology] = useState<TerminologyItem[]>(() => loadLS(LS_KEYS.terminology, DEFAULT_TERMINOLOGY));
  const [hashtags, setHashtags] = useState<HashtagSet>(() => loadLS(LS_KEYS.hashtags, DEFAULT_HASHTAGS));
  const [showSettings, setShowSettings] = useState(true);

  // Saved Listings State (持久化)
  const [savedListings, setSavedListings] = useState<SavedListing[]>(() => loadLS(LS_KEYS.saved, []));

  // --- Persistence: 任一改動即寫入 localStorage ---
  useEffect(() => { localStorage.setItem(LS_KEYS.terminology, JSON.stringify(terminology)); }, [terminology]);
  useEffect(() => { localStorage.setItem(LS_KEYS.hashtags, JSON.stringify(hashtags)); }, [hashtags]);
  useEffect(() => { localStorage.setItem(LS_KEYS.saved, JSON.stringify(savedListings)); }, [savedListings]);

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
    setVariants([]);
    const imageParts = uploadedFiles.map(f => ({ mimeType: f.mimeType, data: f.base64 }));
    if (generateCount > 1) {
      const results = await Promise.all(
        Array.from({ length: generateCount }, (_, i) =>
          generateListingText(propertyData, mode, terminology, hashtags, copyStyle, imageParts, VARIATION_HINTS[i] || "")
        )
      );
      setVariants(results);
    } else {
      const text = await generateListingText(propertyData, mode, terminology, hashtags, copyStyle, imageParts);
      pushToHistory(text, true);
    }
    setIsGenerating(false);
  };

  const selectVariant = (text: string) => {
    setVariants([]);
    pushToHistory(text, true);
  };

  const handleRewrite = async (instruction: string) => {
    if (!generatedText || !instruction.trim()) return;
    setIsRewriting(true);
    const imageParts = uploadedFiles.map(f => ({ mimeType: f.mimeType, data: f.base64 }));
    const newText = await rewriteListingText(generatedText, instruction, terminology, imageParts);
    pushToHistory(newText, false);
    setIsRewriting(false);
    setCustomRewritePrompt("");
  };

  const handleTranslate = async (lang: TranslateLang) => {
    if (!generatedText) return;
    setIsTranslating(lang);
    setIsRewriting(true);
    const newText = await translateListingText(generatedText, lang);
    pushToHistory(newText, false);
    setIsRewriting(false);
    setIsTranslating(null);
  };

  // --- Phase 3: AI 寫作教練 Handlers ---
  const buildToneInstruction = (): string | null => {
    const parts: string[] = [];
    if (toneValues.friendliness <= 30) parts.push('語氣更親切隨和，像朋友聊天');
    else if (toneValues.friendliness >= 70) parts.push('語氣更專業正式，適合商務溝通');
    if (toneValues.length <= 30) parts.push('內容更精簡，去掉次要細節');
    else if (toneValues.length >= 70) parts.push('內容更詳盡，補充更多細節說明');
    if (toneValues.energy <= 30) parts.push('語氣更平實克制，少用驚嘆號');
    else if (toneValues.energy >= 70) parts.push('語氣更熱情有活力，多用感嘆與強調');
    if (parts.length === 0) return null;
    return `依照以下語感調整整體文案：${parts.join('；')}。保持原有格式、emoji、結構與所有事實數字不變，輸出繁體中文。`;
  };

  const applyTone = () => {
    const instruction = buildToneInstruction();
    if (!instruction) return;
    handleRewrite(instruction);
  };

  const handlePolishOnly = () => {
    const base = customRewritePrompt.trim() || '請潤飾文字讓語句更流暢自然';
    const instruction = `${base}。【重要限制】這是純潤色模式：絕對不可以新增、修改、刪除任何數字、價格、地址、車站名、坪數、樓層、日期等事實資訊，也不可以新增原文沒有的賣點或設備；只能調整詞句的順暢度與語感，保持格式、emoji、結構完全不變，輸出繁體中文。`;
    handleRewrite(instruction);
    setCustomRewritePrompt('');
  };

  const handleGenerateHooks = async () => {
    setIsGeneratingHooks(true);
    setHookOptions([]);
    const imageParts = uploadedFiles.map(f => ({ mimeType: f.mimeType, data: f.base64 }));
    const hooks = await generateHooks(propertyData, mode, imageParts);
    setHookOptions(hooks);
    setIsGeneratingHooks(false);
  };

  const applyHook = (hook: string) => {
    if (!generatedText) return;
    const lines = generatedText.split('\n');
    const idx = lines.findIndex(l => l.trim());
    if (idx >= 0) lines[idx] = hook;
    pushToHistory(lines.join('\n'), false);
    setHookOptions([]);
  };

  const handleSuggestHashtags = async () => {
    setIsSuggestingTags(true);
    setSuggestedTags([]);
    const tags = await suggestHashtags(propertyData, mode, generatedText);
    setSuggestedTags(tags);
    setIsSuggestingTags(false);
  };

  const insertHashtag = (tag: string) => {
    if (!generatedText || generatedText.includes(tag)) return;
    pushToHistory(`${generatedText.replace(/\s+$/, '')} ${tag}`, false);
  };

  const handlePrePublishCheck = () => {
    setCheckResults(runPrePublishCheck(generatedText, propertyData));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInputChange = (field: keyof PropertyData, value: string) => {
    setPropertyData(prev => ({ ...prev, [field]: value }));
  };

  const isRental = mode === ListingMode.RENTAL;
  const accentColor = isRental ? '#5856d6' : '#ff2d55';
  const styleOptions: { v: CopyStyle; label: string }[] = isRental
    ? [
        { v: CopyStyle.CLASSIC, label: '經典條列式' },
        { v: CopyStyle.EDITORIAL, label: '編輯雜誌風 ✨' },
        { v: CopyStyle.SHORT, label: 'Threads 短文雜誌風' },
      ]
    : [
        { v: CopyStyle.CLASSIC, label: '經典條列式' },
        { v: CopyStyle.SHORT, label: 'Threads 短文雜誌風' },
      ];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ===== HEADER ===== */}
      <header className="h-16 border-b border-white/40 bg-white/30 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md flex items-center justify-center text-white">
            <Bot className="w-[18px] h-[18px]" />
          </div>
          <h1 className="font-semibold text-[15px] tracking-wide hidden sm:block">日本不動產文案生成器</h1>
        </div>

        {/* Mode Switcher — Segmented Control */}
        <div className="segment-control w-40">
          <div
            className="segment-indicator"
            style={{ transform: isRental ? 'translateX(0)' : 'translateX(100%)' }}
          ></div>
          <button
            className={`segment-btn w-1/2 text-center ${isRental ? 'active' : ''}`}
            onClick={() => { setMode(ListingMode.RENTAL); setPropertyData(INITIAL_PROPERTY_DATA); setVariants([]); }}
          >
            租賃
          </button>
          <button
            className={`segment-btn w-1/2 text-center ${!isRental ? 'active' : ''}`}
            onClick={() => { setMode(ListingMode.SALE); setPropertyData(INITIAL_PROPERTY_DATA); setCopyStyle(CopyStyle.CLASSIC); setVariants([]); }}
          >
            買賣
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(s => !s)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition ${showSettings ? 'bg-black/5 text-gray-700' : 'hover:bg-black/5 text-gray-500'}`}
            title="台灣用語 & Hashtag 設定"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden max-w-[1400px] w-full mx-auto px-4 py-6 gap-6">

        {/* ===== LEFT COLUMN — 輸入 ===== */}
        <section className="w-full lg:w-[55%] lg:h-full lg:overflow-y-auto no-scrollbar lg:pb-20 lg:pr-2">
          <div className="space-y-6">

            {/* Card 1: 智慧圖紙掃描 */}
            <div className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-2">
                <ScanSearch className="w-[18px] h-[18px]" style={{ color: '#007aff' }} />
                <h2 className="text-[15px] font-semibold">智慧圖紙掃描</h2>
              </div>
              <p className="text-xs text-[#86868b] mb-4">AI 會自動識別並將術語轉化為「台灣慣用說法」與「多車站資訊」。</p>

              <div className="flex flex-wrap gap-3 mb-4">
                {uploadedFiles.map((file) => (
                  <div key={file.id} className="w-24 h-24 rounded-xl overflow-hidden border border-gray-200 shadow-sm relative group bg-white">
                    {file.mimeType.startsWith('image/') ? (
                      <img src={file.previewUrl} alt={file.file.name} className="w-full h-full object-cover" />
                    ) : (
                      // PDF：用瀏覽器原生 PDF 檢視器渲染第一頁當縮圖（pointer-events-none 讓 hover 刪除鈕可點）
                      <embed
                        src={`${file.previewUrl}#toolbar=0&navpanel=0&scrollbar=0&view=FitH`}
                        type="application/pdf"
                        className="w-full h-full pointer-events-none bg-gray-50"
                      />
                    )}
                    {/* 檔名標籤：讓使用者知道這張縮圖是哪個檔案 */}
                    <div className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[9px] leading-tight px-1.5 py-1 truncate pointer-events-none">
                      {file.file.name}
                    </div>
                    <button
                      onClick={() => removeFile(file.id)}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white z-10"
                      title="移除"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {uploadedFiles.length < 5 && (
                  <label className="w-24 h-24 upload-zone flex flex-col items-center justify-center text-[#86868b] hover:text-blue-500 hover:border-blue-300 transition cursor-pointer relative">
                    <ImagePlus className="w-7 h-7" strokeWidth={1.5} />
                    <span className="text-[10px] mt-1.5 font-medium">新增圖紙</span>
                    <span className="absolute bottom-1.5 text-[9px] text-gray-400">{uploadedFiles.length}/5</span>
                    <input type="file" className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileSelect} />
                  </label>
                )}
              </div>

              <textarea
                placeholder="補充說明 (例如：物件名稱、裝潢細節)..."
                value={supplementaryText}
                onChange={(e) => setSupplementaryText(e.target.value)}
                className="apple-input resize-none h-20 text-[13px]"
              />

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || (uploadedFiles.length === 0 && !supplementaryText)}
                className="mt-4 w-full bg-blue-50 hover:bg-blue-100 text-blue-600 py-2.5 rounded-xl text-[13px] font-semibold transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> 正在提取資訊...</> : <><Sparkles className="w-4 h-4" /> 一鍵智慧擷取</>}
              </button>
            </div>

            {/* Card 2: 設定 — 台灣用語 & Hashtag */}
            {showSettings && (
              <div className="glass-panel p-6">
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <Settings className="w-[18px] h-[18px]" style={{ color: '#5856d6' }} />
                    <h2 className="text-[15px] font-semibold">台灣用語 & Hashtag 設定</h2>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={resetTerminology} className="text-[12px] font-medium text-gray-500 hover:text-gray-700">重置</button>
                    <button onClick={addTerminology} className="text-[12px] font-medium text-blue-500 hover:text-blue-600">+ 新增欄位</button>
                  </div>
                </div>

                <div className="space-y-2 mb-6 max-h-64 overflow-y-auto no-scrollbar pr-1">
                  {terminology.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 bg-white/40 p-2 rounded-lg border border-white/50">
                      <input
                        value={item.japanese}
                        onChange={(e) => updateTerminology(item.id, 'japanese', e.target.value)}
                        className="flex-1 bg-transparent border-none text-[13px] outline-none px-2 min-w-0"
                        placeholder="日文"
                      />
                      <ArrowRight className="w-3.5 h-3.5 text-[#86868b] flex-shrink-0" />
                      <input
                        value={item.taiwanese}
                        onChange={(e) => updateTerminology(item.id, 'taiwanese', e.target.value)}
                        className="flex-1 bg-transparent border-none text-[13px] outline-none px-2 min-w-0"
                        placeholder="台灣用語"
                      />
                      <button onClick={() => removeTerminology(item.id)} className="text-gray-300 hover:text-red-400 px-1 flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="field-label">租賃 Hashtag</label>
                    <textarea
                      value={hashtags.rental}
                      onChange={(e) => setHashtags(prev => ({ ...prev, rental: e.target.value }))}
                      className="apple-input resize-none h-16 text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="field-label">買賣 Hashtag</label>
                    <textarea
                      value={hashtags.sale}
                      onChange={(e) => setHashtags(prev => ({ ...prev, sale: e.target.value }))}
                      className="apple-input resize-none h-16 text-[12px]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Card 3: 物件詳情 */}
            <div className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-5">
                <Building2 className="w-[18px] h-[18px]" style={{ color: accentColor }} />
                <h2 className="text-[15px] font-semibold">物件詳情 · {isRental ? '租賃' : '買賣'}</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="field-label">物件地址</label>
                  <input type="text" value={propertyData.address} onChange={(e) => handleInputChange('address', e.target.value)} className="apple-input" placeholder="例：東京都新宿區..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">路線</label>
                    <input type="text" value={propertyData.line} onChange={(e) => handleInputChange('line', e.target.value)} className="apple-input" placeholder="可多條，頓號分隔" />
                  </div>
                  <div>
                    <label className="field-label">車站名稱</label>
                    <input type="text" value={propertyData.station} onChange={(e) => handleInputChange('station', e.target.value)} className="apple-input" placeholder="可多個" />
                  </div>
                  <div>
                    <label className="field-label">價格 ({isRental ? '租金' : '總價'})</label>
                    <input type="text" value={propertyData.price} onChange={(e) => handleInputChange('price', e.target.value)} className="apple-input font-medium" placeholder="例：112,000円" />
                  </div>
                  <div>
                    <label className="field-label">徒步時間 (分)</label>
                    <input type="text" value={propertyData.walkTime} onChange={(e) => handleInputChange('walkTime', e.target.value)} className="apple-input" placeholder="例：5, 14" />
                  </div>

                  {isRental ? (
                    <>
                      <div>
                        <label className="field-label">管理費 / 共益費</label>
                        <input type="text" value={propertyData.managementFee} onChange={(e) => handleInputChange('managementFee', e.target.value)} className="apple-input" placeholder="例：8,000円" />
                      </div>
                      <div>
                        <label className="field-label">禮金</label>
                        <input type="text" value={propertyData.keyMoney} onChange={(e) => handleInputChange('keyMoney', e.target.value)} className="apple-input" placeholder="例：1個月" />
                      </div>
                      <div className="col-span-2">
                        <label className="field-label">押金</label>
                        <input type="text" value={propertyData.deposit} onChange={(e) => handleInputChange('deposit', e.target.value)} className="apple-input" placeholder="例：1個月" />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="field-label">管理費</label>
                        <input type="text" value={propertyData.managementFee} onChange={(e) => handleInputChange('managementFee', e.target.value)} className="apple-input" />
                      </div>
                      <div>
                        <label className="field-label">修繕積立金</label>
                        <input type="text" value={propertyData.repairFund} onChange={(e) => handleInputChange('repairFund', e.target.value)} className="apple-input" />
                      </div>
                      <div>
                        <label className="field-label">陽台面積 (㎡)</label>
                        <input type="text" value={propertyData.balconySize} onChange={(e) => handleInputChange('balconySize', e.target.value)} className="apple-input" placeholder="例：3.64" />
                      </div>
                      <div>
                        <label className="field-label">全棟層數</label>
                        <input type="text" value={propertyData.totalFloors} onChange={(e) => handleInputChange('totalFloors', e.target.value)} className="apple-input" placeholder="例：地上7階" />
                      </div>
                      <div className="col-span-2">
                        <label className="field-label">翻新 / 裝潢日期</label>
                        <input type="text" value={propertyData.renovationDate} onChange={(e) => handleInputChange('renovationDate', e.target.value)} className="apple-input" placeholder="例：2025年11月翻新完成" />
                      </div>
                    </>
                  )}

                  <div>
                    <label className="field-label">格局</label>
                    <input type="text" value={propertyData.layout} onChange={(e) => handleInputChange('layout', e.target.value)} className="apple-input" placeholder="例：1DK" />
                  </div>
                  <div>
                    <label className="field-label">專有面積 (㎡)</label>
                    <input type="text" value={propertyData.size} onChange={(e) => handleInputChange('size', e.target.value)} className="apple-input" />
                  </div>
                  <div>
                    <label className="field-label">所在樓層</label>
                    <input type="text" value={propertyData.floor} onChange={(e) => handleInputChange('floor', e.target.value)} className="apple-input" />
                  </div>
                  <div>
                    <label className="field-label">築年月</label>
                    <input type="text" value={propertyData.age} onChange={(e) => handleInputChange('age', e.target.value)} className="apple-input" placeholder="例：2010年10月" />
                  </div>

                  <div className="col-span-2">
                    <label className="field-label">{isRental ? '入居可能日' : '引渡可能日'}</label>
                    <input type="text" value={propertyData.moveInDate} onChange={(e) => handleInputChange('moveInDate', e.target.value)} className="apple-input" placeholder={isRental ? "即入居, 2024/10/01..." : "相談, 即時, 居住中..."} />
                  </div>
                </div>

                <div>
                  <label className="field-label">特色重點 (AI 將轉化為流暢文案)</label>
                  <textarea value={propertyData.features} onChange={(e) => handleInputChange('features', e.target.value)} className="apple-input resize-none h-20 text-[13px]" placeholder="輸入特點，逗號分隔..." />
                </div>
              </div>

              {/* 文案風格 + 版本數 + 生成 */}
              <div className="mt-8 pt-6 border-t border-gray-200/50">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[13px] font-semibold text-gray-700">文案風格</span>
                  {(copyStyle === CopyStyle.EDITORIAL || copyStyle === CopyStyle.SHORT) && (
                    <span className="text-[11px] text-blue-500 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> 會參考上傳照片描述室內
                    </span>
                  )}
                </div>
                <div className={`grid ${isRental ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mb-5`}>
                  {styleOptions.map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setCopyStyle(opt.v)}
                      className={`text-[12px] py-2 rounded-lg font-medium border transition ${copyStyle === opt.v ? 'bg-blue-500 text-white border-blue-600/20 shadow-sm' : 'bg-white/60 text-gray-700 hover:bg-white border-gray-200'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-6">
                  <span className="text-[13px] font-semibold text-gray-700">生成版本數</span>
                  <div className="segment-control w-44">
                    <div className="segment-indicator" style={{ width: 'calc(33.333% - 2px)', transform: `translateX(${generateCount - 1}00%)` }}></div>
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        onClick={() => setGenerateCount(n)}
                        className={`segment-btn flex-1 text-center whitespace-nowrap ${generateCount === n ? 'active' : ''}`}
                      >
                        {n} 版
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleGenerateText}
                  disabled={isGenerating}
                  className="btn-primary w-full py-3.5 text-[15px]"
                >
                  {isGenerating ? <><RefreshCcw className="w-[18px] h-[18px] animate-spin" /> AI 正在生成{generateCount > 1 ? ` ${generateCount} 個版本` : '專業文案'}...</> : <><Wand2 className="w-[18px] h-[18px]" /> 生成{isRental ? '租賃' : '買賣'}社群文案{generateCount > 1 ? `（${generateCount} 版）` : ''}</>}
                </button>
              </div>
            </div>

            {/* Card 4: 已儲存文案 */}
            {savedListings.length > 0 && (
              <div className="glass-panel p-6">
                <h3 className="text-[15px] font-semibold mb-4 flex items-center gap-2">
                  <BookmarkCheck className="w-[18px] h-[18px] text-amber-500" /> 已儲存文案
                  <span className="ml-auto text-xs text-gray-400 font-normal">{savedListings.length} 筆</span>
                </h3>
                <div className="space-y-2 max-h-52 overflow-y-auto no-scrollbar">
                  {savedListings.map((listing) => (
                    <div key={listing.id} className="flex items-center gap-2 p-2.5 bg-white/40 rounded-lg border border-white/50">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold shrink-0 ${listing.mode === ListingMode.RENTAL ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700'}`}>
                        {listing.mode === ListingMode.RENTAL ? '租賃' : '買賣'}
                      </span>
                      <span className="text-xs text-gray-600 flex-1 truncate">{listing.title}</span>
                      <button onClick={() => loadSavedListing(listing)} className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0">載入</button>
                      <button onClick={() => deleteSavedListing(listing.id)} className="text-gray-300 hover:text-red-400 shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===== RIGHT COLUMN — 結果 ===== */}
        <section className="w-full lg:w-[45%] lg:h-full">
          <div className="glass-panel w-full lg:h-[calc(100vh-120px)] flex flex-col overflow-hidden">

            {/* Toolbar */}
            <div className="h-14 border-b border-gray-200/40 bg-white/40 flex items-center justify-between px-5 flex-shrink-0">
              <span className="text-[13px] font-semibold text-gray-800">文案結果</span>
              <div className="flex items-center gap-1">
                <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 text-gray-500 hover:text-gray-900 transition hover:bg-black/5 rounded-md disabled:opacity-30" title="復原"><Undo2 className="w-3.5 h-3.5" /></button>
                <button onClick={handleRedo} disabled={historyIndex >= textHistory.length - 1} className="p-2 text-gray-500 hover:text-gray-900 transition hover:bg-black/5 rounded-md disabled:opacity-30" title="重做"><Redo2 className="w-3.5 h-3.5" /></button>
                <div className="w-px h-4 bg-gray-300 mx-2"></div>
                {generatedText && (
                  <button
                    onClick={() => setShowCoach(s => !s)}
                    className={`text-[12px] font-medium px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${showCoach ? 'bg-indigo-500 text-white border-indigo-600/20 shadow-sm' : 'text-gray-700 bg-white shadow-sm border-gray-200 hover:bg-indigo-50 hover:border-indigo-300'}`}
                  >
                    <SlidersHorizontal className="w-3 h-3" /> 寫作教練
                  </button>
                )}
                {generatedText && (
                  <button onClick={saveCurrentListing} className="text-[12px] font-medium text-gray-700 bg-white shadow-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-amber-50 hover:border-amber-300 transition flex items-center gap-1.5">
                    <BookmarkPlus className="w-3 h-3 text-amber-500" /> 儲存
                  </button>
                )}
                <button onClick={copyToClipboard} className="text-[12px] font-medium text-gray-700 bg-white shadow-sm border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5">
                  {copied ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  {copied ? '已複製' : '複製全文'}
                </button>
              </div>
            </div>

            {/* Text Area */}
            <div className="flex-1 overflow-y-auto p-6 relative min-h-[300px]">
              {isRewriting && (
                <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-20">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              )}
              {variants.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-gray-700">挑選一個版本（共 {variants.length} 版）</span>
                    <button onClick={() => setVariants([])} className="text-[11px] text-gray-400 hover:text-gray-600">取消</button>
                  </div>
                  {variants.map((v, i) => (
                    <div key={i} className="bg-white/60 border border-white/60 rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-bold text-blue-600">版本 {String.fromCharCode(65 + i)}</span>
                        <button
                          onClick={() => selectVariant(v)}
                          className="text-[11px] font-semibold bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg transition"
                        >
                          使用這版
                        </button>
                      </div>
                      <div className="text-[12px] leading-relaxed text-[#444] whitespace-pre-wrap max-h-48 overflow-y-auto no-scrollbar">{v}</div>
                    </div>
                  ))}
                </div>
              ) : generatedText ? (
                <textarea
                  value={generatedText}
                  onChange={(e) => updateCurrentHistory(e.target.value)}
                  className="w-full h-full min-h-[400px] bg-transparent border-none outline-none resize-none text-[14px] leading-relaxed text-[#333336] whitespace-pre-wrap"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-20">
                  {isGenerating ? (
                    <><Loader2 className="w-8 h-8 mb-3 animate-spin text-blue-400" /><span className="text-sm italic">AI 正在生成{generateCount > 1 ? ` ${generateCount} 個版本` : ''}...</span></>
                  ) : (
                    <><Wand2 className="w-8 h-8 mb-3 opacity-40" /><span className="text-sm italic">準備生成... 請填寫左側資訊後點擊生成</span></>
                  )}
                </div>
              )}
            </div>

            {generatedText && (
              <div className="px-6 pb-2 text-right text-xs text-gray-400 flex-shrink-0">{generatedText.length} 字元</div>
            )}

            {/* AI 寫作教練（Phase 3） */}
            {generatedText && showCoach && (
              <div className="p-4 border-t border-indigo-100 bg-indigo-50/40 flex-shrink-0 space-y-3">
                {/* 客群一鍵切換 */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase mr-1 flex-shrink-0 flex items-center gap-1"><Users className="w-3 h-3" /> 客群切換</span>
                  {AUDIENCE_PRESETS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleRewrite(opt.prompt)}
                      disabled={isRewriting}
                      className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* 語感旋鈕 */}
                <div className="bg-white/70 rounded-xl p-3 border border-white/60">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase flex items-center gap-1 mb-2"><SlidersHorizontal className="w-3 h-3" /> 語感旋鈕</span>
                  <div className="space-y-2">
                    {TONE_AXES.map((axis) => (
                      <div key={axis.key} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-7 text-right flex-shrink-0">{axis.left}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={10}
                          value={toneValues[axis.key]}
                          onChange={(e) => setToneValues(prev => ({ ...prev, [axis.key]: Number(e.target.value) }))}
                          className="flex-1 accent-indigo-500"
                        />
                        <span className="text-[10px] text-gray-500 w-7 flex-shrink-0">{axis.right}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={applyTone}
                    disabled={isRewriting}
                    className="mt-2 w-full text-[11px] font-semibold bg-indigo-500 hover:bg-indigo-600 text-white py-1.5 rounded-lg transition disabled:opacity-50"
                  >
                    套用語感
                  </button>
                </div>

                {/* 純潤色 / Hook / Hashtag / 校對 */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <button onClick={handlePolishOnly} disabled={isRewriting} className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" /> 純潤色模式
                  </button>
                  <button onClick={handleGenerateHooks} disabled={isGeneratingHooks} className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50 flex items-center gap-1">
                    {isGeneratingHooks ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3 text-amber-500" />} 開場 Hook
                  </button>
                  <button onClick={handleSuggestHashtags} disabled={isSuggestingTags} className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50 flex items-center gap-1">
                    {isSuggestingTags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hash className="w-3 h-3 text-blue-500" />} 智慧 Hashtag
                  </button>
                  <button onClick={handlePrePublishCheck} className="flex-shrink-0 tag-chip text-[11px] py-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-violet-500" /> 發文前校對
                  </button>
                </div>

                {/* Hook 選項 */}
                {hookOptions.length > 0 && (
                  <div className="bg-white/70 rounded-xl p-3 border border-white/60 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-500 uppercase flex items-center gap-1"><Lightbulb className="w-3 h-3" /> 選一個取代開頭第一行</span>
                    {hookOptions.map((h, i) => (
                      <button
                        key={i}
                        onClick={() => applyHook(h)}
                        className="w-full text-left text-[12px] text-gray-700 bg-white hover:bg-amber-50 border border-gray-200 rounded-lg px-3 py-2 transition"
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}

                {/* Hashtag 建議 */}
                {suggestedTags.length > 0 && (
                  <div className="bg-white/70 rounded-xl p-3 border border-white/60">
                    <span className="text-[10px] font-bold text-blue-500 uppercase flex items-center gap-1 mb-2"><Hash className="w-3 h-3" /> 點擊加入文末</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestedTags.map((tag, i) => (
                        <button
                          key={i}
                          onClick={() => insertHashtag(tag)}
                          className="text-[11px] tag-chip py-1"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 校對結果 */}
                {checkResults && (
                  <div className="bg-white/70 rounded-xl p-3 border border-white/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-violet-500 uppercase flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 發文前校對結果</span>
                      <button onClick={() => setCheckResults(null)} className="text-[10px] text-gray-400 hover:text-gray-600">關閉</button>
                    </div>
                    {checkResults.map((issue, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[12px]">
                        {issue.level === 'pass' && <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />}
                        {issue.level === 'warn' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />}
                        {issue.level === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />}
                        <span className="text-gray-600">{issue.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* AI Copilot 潤飾區 */}
            {generatedText && (
              <div className="p-4 border-t border-white/60 bg-white/40 flex-shrink-0">
                <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-gray-400 uppercase mr-1 flex-shrink-0">AI 微調建議</span>
                  {REWRITE_PRESETS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleRewrite(opt.prompt)}
                      disabled={isRewriting}
                      className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-gray-400 uppercase mr-1 flex-shrink-0">多語輸出</span>
                  <button
                    onClick={() => handleTranslate('JA')}
                    disabled={isRewriting}
                    className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50"
                  >
                    {isTranslating === 'JA' ? <Loader2 className="w-3 h-3 animate-spin" /> : '🇯🇵'} 日文版
                  </button>
                  <button
                    onClick={() => handleTranslate('EN')}
                    disabled={isRewriting}
                    className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50"
                  >
                    {isTranslating === 'EN' ? <Loader2 className="w-3 h-3 animate-spin" /> : '🇬🇧'} 英文版
                  </button>
                  <span className="flex-shrink-0 text-[10px] text-gray-400">（翻譯前可先「儲存」中文版）</span>
                </div>

                <div className="flex items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] font-bold text-gray-400 uppercase mr-1 flex-shrink-0">分段重寫</span>
                  {SECTION_PRESETS.map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => handleRewrite(opt.prompt)}
                      disabled={isRewriting}
                      className="flex-shrink-0 tag-chip text-[11px] py-1 disabled:opacity-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="relative flex items-center bg-white rounded-2xl border border-gray-200 shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all p-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-100 to-purple-100 flex items-center justify-center text-blue-600 ml-1 flex-shrink-0">
                    <Wand2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={customRewritePrompt}
                    onChange={(e) => setCustomRewritePrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleRewrite(customRewritePrompt);
                      }
                    }}
                    className="flex-1 bg-transparent border-none outline-none text-[13px] px-3 text-gray-800"
                    placeholder="讓 AI 幫你修改... (例如：加上適合養貓的描述)"
                  />
                  <button
                    onClick={() => handleRewrite(customRewritePrompt)}
                    disabled={isRewriting || !customRewritePrompt.trim()}
                    className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition shadow-sm mr-1 disabled:opacity-50 flex-shrink-0"
                  >
                    <SendHorizontal className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
