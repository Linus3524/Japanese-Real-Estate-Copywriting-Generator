
import React, { useState, useEffect, useRef } from 'react';
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
];

// 客群一鍵切換：調整文案訴求重點，不動格式
const AUDIENCE_PRESETS = [
  { id: 'student', label: '🎒 留學生', focus: '從現有資料中優先呈現交通、生活便利與海外入住相關資訊' },
  { id: 'investor', label: '📈 投資客', focus: '從現有資料中優先呈現價格、地段與可量化的投資資訊' },
  { id: 'family', label: '👨‍👩‍👧 家庭客', focus: '從現有資料中優先呈現空間、環境與家庭生活機能' },
  { id: 'worker', label: '💼 上班族', focus: '從現有資料中優先呈現通勤效率與日常生活便利性' },
];

const STYLE_PRESETS = [
  { label: '自然平衡', values: { friendliness: 50, length: 50, energy: 50 } },
  { label: '親切精簡', values: { friendliness: 20, length: 15, energy: 55 } },
  { label: '專業穩重', values: { friendliness: 82, length: 65, energy: 25 } },
  { label: '熱情吸睛', values: { friendliness: 32, length: 45, energy: 88 } },
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

// 生成前的本機防呆：以只有買賣／租賃才會出現的欄位與價格單位交叉檢查。
// 無明確證據時保留使用者目前選擇，不用單一模糊欄位擅自切換。
const inferListingMode = (data: PropertyData, currentMode: ListingMode): ListingMode => {
  let saleScore = 0;
  let rentalScore = 0;
  const price = data.price.replace(/[,，\s]/g, '');

  if (data.repairFund.trim()) saleScore += 4;
  if (/萬円|万円|億円|售價|販売価格|売買/.test(price)) saleScore += 5;
  const numericPrice = Number(price.replace(/[^\d.]/g, ''));
  if (Number.isFinite(numericPrice) && numericPrice >= 1000000) saleScore += 3;

  if (data.keyMoney.trim()) rentalScore += 3;
  if (data.deposit.trim()) rentalScore += 3;
  if (/月額|每月|租金|賃料|家賃/.test(price)) rentalScore += 5;

  if (saleScore >= rentalScore + 3) return ListingMode.SALE;
  if (rentalScore >= saleScore + 3) return ListingMode.RENTAL;
  return currentMode;
};

// 發文前校對：本機純文字檢查，不呼叫 AI（markdown 符號 / emoji 密度 / 文中找不到來源的數字）
const runPrePublishCheck = (text: string, data: PropertyData, mode: ListingMode): PrePublishIssue[] => {
  const issues: PrePublishIssue[] = [];

  if (mode === ListingMode.SALE && /租金|賃料|敷金|押金|禮金/.test(text)) {
    issues.push({ level: 'error', message: '目前是買賣物件，但文案出現租金／押金／禮金等租賃用語，請確認文案類型。' });
  }
  if (mode === ListingMode.RENTAL && /售價|販売価格|修繕積立金|買賣公寓/.test(text)) {
    issues.push({ level: 'error', message: '目前是租賃物件，但文案出現售價／修繕積立金等買賣用語，請確認文案類型。' });
  }

  const normalizedText = text.replace(/[,，\s]/g, '');
  const missingCore = [
    { label: '價格', value: data.price },
    { label: '車站', value: data.station },
    { label: '格局', value: data.layout },
  ].filter(item => item.value.trim() && !normalizedText.includes(item.value.replace(/[,，\s]/g, '')));
  if (missingCore.length > 0) {
    issues.push({ level: 'warn', message: `文案可能遺漏核心資訊：${missingCore.map(item => item.label).join('、')}。` });
  }

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
  const factualText = text
    .split('\n')
    .filter(line => !/(?:line|wechat|微信|聯絡|联系)\s*[:：]/i.test(line) && !line.trim().startsWith('#'))
    .join('\n');
  const textNumbers = [...new Set(factualText.match(/\d{3,}/g) || [])];
  const unknownNumbers = textNumbers.filter(n => !dataNumbers.has(n));
  if (unknownNumbers.length > 0) {
    issues.push({ level: 'warn', message: `文中出現原始資料找不到對應的數字：${unknownNumbers.join('、')}，請確認是否為 AI 誤植或編造。` });
  }

  if (issues.length === 0) {
    issues.push({ level: 'pass', message: '檢查通過，沒有發現明顯問題。' });
  }
  return issues;
};

type CoachTab = 'rewrite' | 'section' | 'tools' | 'language';

const App = () => {
  // --- Core State ---
  const [mode, setMode] = useState<ListingMode>(ListingMode.RENTAL);
  const [copyStyle, setCopyStyle] = useState<CopyStyle>(CopyStyle.CLASSIC);
  const [propertyData, setPropertyData] = useState<PropertyData>(INITIAL_PROPERTY_DATA);

  // Smart Import State
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [supplementaryText, setSupplementaryText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [modeDetectionNotice, setModeDetectionNotice] = useState<string>('');

  // Generation State
  const [generatedText, setGeneratedText] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [customRewritePrompt, setCustomRewritePrompt] = useState("");
  const rewriteInputRef = useRef<HTMLTextAreaElement>(null);
  const [isTranslating, setIsTranslating] = useState<TranslateLang | null>(null);
  const [generateCount, setGenerateCount] = useState<number>(1);
  const [variants, setVariants] = useState<string[]>([]);

  // Phase 3: AI 寫作教練 State
  const [showCoach, setShowCoach] = useState(false);
  const [coachTab, setCoachTab] = useState<CoachTab>('rewrite');
  const [selectedAudience, setSelectedAudience] = useState<string | null>(null);
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

  // AI 改文輸入框：打字時自動長高，上限 200px 後內部捲動；清空（送出後）自動縮回單行
  useEffect(() => {
    const el = rewriteInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [customRewritePrompt]);

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
    setHookOptions([]);
    setSuggestedTags([]);
    setCheckResults(null);
    if (historyIndex >= 0) {
      const newHistory = [...textHistory];
      newHistory[historyIndex] = text;
      setTextHistory(newHistory);
    }
  };

  const pushToHistory = (text: string, reset: boolean = false) => {
    setGeneratedText(text);
    setCheckResults(null);
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
      setHookOptions([]);
      setSuggestedTags([]);
      setCheckResults(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < textHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGeneratedText(textHistory[newIndex]);
      setHookOptions([]);
      setSuggestedTags([]);
      setCheckResults(null);
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
      const nextData = { ...propertyData };
      (Object.keys(extractedData) as Array<keyof PropertyData>).forEach(key => {
        if (extractedData[key]) nextData[key] = extractedData[key]!;
      });
      const resolvedMode = inferListingMode(nextData, detectedMode || mode);
      setPropertyData(nextData);
      setMode(resolvedMode);
      setModeDetectionNotice(`已自動判斷為「${resolvedMode === ListingMode.SALE ? '買賣' : '租賃'}」物件`);
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
    const resolvedMode = inferListingMode(propertyData, mode);
    if (resolvedMode !== mode) {
      setMode(resolvedMode);
      setModeDetectionNotice(`生成前已修正為「${resolvedMode === ListingMode.SALE ? '買賣' : '租賃'}」物件`);
    }
    try {
      const imageParts = uploadedFiles.map(f => ({ mimeType: f.mimeType, data: f.base64 }));
      if (generateCount > 1) {
        const results = await Promise.all(
          Array.from({ length: generateCount }, (_, i) =>
            generateListingText(propertyData, resolvedMode, terminology, hashtags, copyStyle, imageParts, VARIATION_HINTS[i] || "")
          )
        );
        setVariants(results);
      } else {
        const text = await generateListingText(propertyData, resolvedMode, terminology, hashtags, copyStyle, imageParts);
        pushToHistory(text, true);
      }
    } catch (error) {
      console.error('Generation failed', error);
      alert('文案生成失敗，原有內容沒有被修改，請稍後重試。');
    } finally {
      setIsGenerating(false);
    }
  };

  const selectVariant = (text: string) => {
    setVariants([]);
    pushToHistory(text, true);
  };

  const handleRewrite = async (instruction: string, maxBodyChars?: number) => {
    if (!generatedText || !instruction.trim()) return;
    setIsRewriting(true);
    setHookOptions([]);
    setSuggestedTags([]);
    setCheckResults(null);
    try {
      const imageParts = uploadedFiles.map(f => ({ mimeType: f.mimeType, data: f.base64 }));
      const newText = await rewriteListingText(generatedText, instruction, terminology, imageParts, maxBodyChars);
      pushToHistory(newText, false);
      setCustomRewritePrompt("");
    } catch (error) {
      console.error('Rewrite failed', error);
      alert('修改失敗，原文已完整保留，請稍後重試。');
    } finally {
      setIsRewriting(false);
    }
  };

  const handleTranslate = async (lang: TranslateLang) => {
    if (!generatedText) return;
    setIsTranslating(lang);
    setIsRewriting(true);
    setHookOptions([]);
    setSuggestedTags([]);
    setCheckResults(null);
    try {
      const newText = await translateListingText(generatedText, lang);
      pushToHistory(newText, false);
    } catch (error) {
      console.error('Translation failed', error);
      alert('翻譯失敗，原文已完整保留，請稍後重試。');
    } finally {
      setIsRewriting(false);
      setIsTranslating(null);
    }
  };

  // --- Phase 3: AI 寫作教練 Handlers ---
  const toneDescription = (key: keyof typeof toneValues, value: number) => {
    const levels = value < 20 ? 0 : value < 40 ? 1 : value < 60 ? 2 : value < 80 ? 3 : 4;
    const labels = {
      friendliness: ['非常親切', '偏親切', '自然', '偏專業', '非常專業'],
      length: ['極精簡 ≤260字', '精簡 ≤340字', '適中', '較詳盡', '非常詳盡'],
      energy: ['沉穩克制', '偏平實', '自然', '較有活力', '熱情吸睛'],
    };
    return labels[key][levels];
  };

  const buildToneInstruction = (): string => {
    const audience = AUDIENCE_PRESETS.find(item => item.id === selectedAudience);
    const friendlinessRule = toneValues.friendliness < 20
      ? '使用自然口語、短句與直接稱呼，避免官腔、艱深術語及過度推銷。'
      : toneValues.friendliness < 40
        ? '語氣溫和易讀，可使用少量口語，但保持資訊清楚。'
        : toneValues.friendliness < 60
          ? '使用自然、中性的台灣繁體中文。'
          : toneValues.friendliness < 80
            ? '使用有條理的專業語氣，避免口語助詞與誇張形容。'
            : '使用正式、精準、商務式語氣；以可驗證資訊為主，不用口語、感嘆詞或情緒化推銷。';
    const lengthRule = toneValues.length < 20
      ? '【硬性篇幅限制】Hashtag 不計，正文最多 260 個中文字元。刪除重複敘述、制式服務介紹、次要賣點與冗長 CTA；只保留價格、車站與步行時間、格局、面積、最重要的 3 個特色及聯絡方式。不得為了湊格式而增加文字。'
      : toneValues.length < 40
        ? '【硬性篇幅限制】Hashtag 不計，正文最多 340 個中文字元。刪除重複段落、次要形容與冗長 CTA，優先保留價格、交通、格局、面積、重要特色及聯絡方式。'
        : toneValues.length < 60
          ? '篇幅維持與原文接近，刪除明顯重複的句子。'
          : toneValues.length < 80
            ? '可在原始資料足夠時補充解釋，但正文不要超過原文的 1.25 倍。'
            : '可更完整地組織原文已有資訊，但正文不要超過原文的 1.5 倍。';
    const energyRule = toneValues.energy < 20
      ? '全文最多 2 個 emoji、不可使用驚嘆號，避免「必看、超值、搶手」等煽動詞。'
      : toneValues.energy < 40
        ? '降低情緒用語，每個段落最多 1 個 emoji，全文最多 1 個驚嘆號。'
        : toneValues.energy < 60
          ? '維持自然張力，emoji 與驚嘆號不超過原文密度。'
          : toneValues.energy < 80
            ? '可以增加節奏與行動感，但全文最多 6 個 emoji、2 個驚嘆號，不可製造虛假急迫感。'
            : '開場可更吸睛並使用有力短句，但全文最多 8 個 emoji、3 個驚嘆號；禁止虛構稀缺、搶購或保證性說法。';
    const parts = [
      `親切／專業程度：${toneDescription('friendliness', toneValues.friendliness)}`,
      `篇幅：${toneDescription('length', toneValues.length)}`,
      `情緒張力：${toneDescription('energy', toneValues.energy)}`,
    ];
    if (audience) parts.unshift(`目標讀者：${audience.label.replace(/^\S+\s/, '')}；${audience.focus}`);
    return `依照以下設定調整整體文案：${parts.join('；')}。${friendlinessRule} ${lengthRule} ${energyRule} 風格設定可調整段落、emoji 與標點，不必保持原有版型。只能重整原文已有資訊，不得推測或新增學區、治安、收益率、設備、距離等未提供的事實。凡保留在新版中的數字、價格、地址、站名、坪數、樓層與日期都必須與原文完全相同。輸出繁體中文。`;
  };

  const applyTone = () => {
    const maxBodyChars = toneValues.length < 20 ? 260 : toneValues.length < 40 ? 340 : undefined;
    handleRewrite(buildToneInstruction(), maxBodyChars);
  };

  const handlePolishOnly = () => {
    const base = customRewritePrompt.trim() || '請潤飾文字讓語句更流暢自然';
    const instruction = `${base}。【重要限制】這是純潤色模式：絕對不可以新增、修改、刪除任何數字、價格、地址、車站名、坪數、樓層、日期等事實資訊，也不可以新增原文沒有的賣點或設備；只能調整詞句的順暢度與語感，保持格式、emoji、結構完全不變，輸出繁體中文。`;
    handleRewrite(instruction);
    setCustomRewritePrompt('');
  };

  const handleGenerateHooks = async () => {
    if (!generatedText || isGeneratingHooks || isRewriting) return;
    setIsGeneratingHooks(true);
    setHookOptions([]);
    try {
      const imageParts = uploadedFiles.map(f => ({ mimeType: f.mimeType, data: f.base64 }));
      const hooks = await generateHooks(propertyData, mode, imageParts);
      setHookOptions(hooks);
      if (hooks.length === 0) alert('目前無法產生標題，請稍後重試。');
    } finally {
      setIsGeneratingHooks(false);
    }
  };

  const applyHook = (hook: string) => {
    if (!generatedText) return;
    const cleanHook = hook.trim();
    const firstLine = generatedText.split('\n').find(line => line.trim())?.trim();
    // 安全優先：無法可靠判斷使用者是否已有標題，因此永遠採用插入，絕不覆蓋原文。
    // 若同一個 Hook 已經位於文案開頭，則只關閉選項，不重複加入。
    if (firstLine !== cleanHook) {
      pushToHistory(`${cleanHook}\n\n${generatedText.replace(/^\s+/, '')}`, false);
    }
    setHookOptions([]);
  };

  const handleSuggestHashtags = async () => {
    if (!generatedText || isSuggestingTags || isRewriting) return;
    setIsSuggestingTags(true);
    setSuggestedTags([]);
    try {
      const tags = await suggestHashtags(propertyData, mode, generatedText);
      setSuggestedTags(tags);
      if (tags.length === 0) alert('目前無法取得 Hashtag 建議，請稍後重試。');
    } finally {
      setIsSuggestingTags(false);
    }
  };

  const insertHashtag = (tag: string) => {
    if (!generatedText || generatedText.includes(tag)) return;
    pushToHistory(`${generatedText.replace(/\s+$/, '')} ${tag}`, false);
  };

  const handlePrePublishCheck = () => {
    setCheckResults(runPrePublishCheck(generatedText, propertyData, mode));
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
        { v: CopyStyle.EDITORIAL, label: '編輯雜誌風 ✨' },
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
            onClick={() => { setMode(ListingMode.RENTAL); setModeDetectionNotice(''); setPropertyData(INITIAL_PROPERTY_DATA); setVariants([]); }}
          >
            租賃
          </button>
          <button
            className={`segment-btn w-1/2 text-center ${!isRental ? 'active' : ''}`}
            onClick={() => { setMode(ListingMode.SALE); setModeDetectionNotice(''); setPropertyData(INITIAL_PROPERTY_DATA); setCopyStyle(CopyStyle.CLASSIC); setVariants([]); }}
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
                {modeDetectionNotice && (
                  <span className={`ml-auto text-[10px] font-semibold px-2 py-1 rounded-full ${isRental ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-50 text-rose-600'}`}>
                    {modeDetectionNotice}
                  </span>
                )}
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
              <div className="coach-panel border-t border-indigo-100 bg-indigo-50/40 flex-shrink-0">
                <div className="coach-tabs" role="tablist" aria-label="寫作教練功能">
                  {([
                    ['rewrite', '整體改寫'], ['section', '局部修改'], ['tools', '發文工具'], ['language', '翻譯']
                  ] as [CoachTab, string][]).map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={coachTab === id} onClick={() => setCoachTab(id)} className={`coach-tab ${coachTab === id ? 'active' : ''}`}>{label}</button>
                  ))}
                </div>

                <div className="p-4 space-y-3 max-h-[320px] overflow-y-auto no-scrollbar">
                  {coachTab === 'rewrite' && <>
                    <div>
                      <div className="coach-label"><Users className="w-3.5 h-3.5" /> 目標讀者 <span>選填，不會立即改寫</span></div>
                      <div className="flex flex-wrap gap-1.5">
                        {AUDIENCE_PRESETS.map((opt) => <button key={opt.id} onClick={() => setSelectedAudience(a => a === opt.id ? null : opt.id)} className={`choice-chip ${selectedAudience === opt.id ? 'active' : ''}`}>{opt.label}</button>)}
                      </div>
                    </div>
                    <div>
                      <div className="coach-label"><Sparkles className="w-3.5 h-3.5" /> 快速風格</div>
                      <div className="flex flex-wrap gap-1.5">
                        {STYLE_PRESETS.map(opt => {
                          const isActive = toneValues.friendliness === opt.values.friendliness && toneValues.length === opt.values.length && toneValues.energy === opt.values.energy;
                          return <button key={opt.label} onClick={() => setToneValues(opt.values)} className={`choice-chip ${isActive ? 'active' : ''}`}>{opt.label}</button>;
                        })}
                      </div>
                    </div>
                    <div className="tone-card">
                      {TONE_AXES.map((axis) => (
                        <label key={axis.key} className="tone-row">
                          <span className="tone-name">{axis.left} ↔ {axis.right}</span>
                          <input type="range" min={0} max={100} step={5} value={toneValues[axis.key]} onChange={(e) => setToneValues(prev => ({ ...prev, [axis.key]: Number(e.target.value) }))} />
                          <span className="tone-value">{toneDescription(axis.key, toneValues[axis.key])}</span>
                        </label>
                      ))}
                    </div>
                    <button onClick={applyTone} disabled={isRewriting} className="coach-primary"><Wand2 className="w-4 h-4" /> 依以上設定改寫全文</button>
                    <p className="coach-help">
                      {toneValues.length < 40
                        ? `精簡模式會刪除次要內容；正文上限 ${toneValues.length < 20 ? '260' : '340'} 字，核心物件資訊仍會保留。`
                        : '不會新增或改動物件事實；只調整訴求順序、篇幅和語氣。'}
                    </p>
                  </>}

                  {coachTab === 'section' && <>
                    <div className="coach-label">選擇只要修改的段落</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {SECTION_PRESETS.map(opt => <button key={opt.label} onClick={() => handleRewrite(opt.prompt)} disabled={isRewriting} className="action-card">{opt.label}<small>其餘內容保持不變</small></button>)}
                    </div>
                    <button onClick={handleGenerateHooks} disabled={isGeneratingHooks || isRewriting} className="action-card w-full text-left">
                      <span className="flex items-center gap-2">{isGeneratingHooks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4 text-amber-500" />} 產生 5 個開場標題</span><small>選擇後插入文案最前面，不會刪除原文</small>
                    </button>
                  </>}

                  {coachTab === 'tools' && <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button onClick={handlePolishOnly} disabled={isRewriting} className="action-card"><span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-500" /> 安全潤飾</span><small>只修順暢度，不動事實</small></button>
                    <button onClick={handleSuggestHashtags} disabled={isSuggestingTags || isRewriting} className="action-card"><span className="flex items-center gap-2">{isSuggestingTags ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hash className="w-4 h-4 text-blue-500" />} 建議 Hashtag</span><small>預覽後逐一加入</small></button>
                    <button onClick={handlePrePublishCheck} disabled={isRewriting} className="action-card"><span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-violet-500" /> 檢查發文風險</span><small>數字、符號與 emoji</small></button>
                  </div>}

                  {coachTab === 'language' && <>
                    <p className="text-xs text-gray-600">翻譯會成為新的編輯版本，可用上方「復原」回到中文版。重要版本建議先儲存。</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => handleTranslate('JA')} disabled={isRewriting} className="action-card text-center">{isTranslating === 'JA' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '🇯🇵 日文版'}<small>自然日本房產用語</small></button>
                      <button onClick={() => handleTranslate('EN')} disabled={isRewriting} className="action-card text-center">{isTranslating === 'EN' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : '🇬🇧 英文版'}<small>自然國際受眾用語</small></button>
                    </div>
                  </>}

                {hookOptions.length > 0 && (
                  <div className="bg-white/70 rounded-xl p-3 border border-white/60 space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-500 uppercase flex items-center gap-1"><Lightbulb className="w-3 h-3" /> 選一個插入文案最前面（不會覆蓋原文）</span>
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
              </div>
            )}

            {/* AI Copilot 潤飾區 */}
            {generatedText && (
              <div className="p-4 border-t border-white/60 bg-white/40 flex-shrink-0">
                <div className="relative flex items-end gap-1 bg-white rounded-2xl border border-gray-200 shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all p-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-100 to-purple-100 flex items-center justify-center text-blue-600 ml-1 flex-shrink-0">
                    <Wand2 className="w-4 h-4" />
                  </div>
                  <textarea
                    ref={rewriteInputRef}
                    rows={1}
                    value={customRewritePrompt}
                    onChange={(e) => setCustomRewritePrompt(e.target.value)}
                    onKeyDown={(e) => {
                      // 中文/日文輸入法組字中(isComposing / keyCode 229)時，Enter 只用來確認候選字、消掉閃爍底線，不送出；
                      // 組字結束後再按一次 Enter 才真的送出。Shift+Enter 換行。
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                        e.preventDefault();
                        handleRewrite(customRewritePrompt);
                      }
                    }}
                    className="flex-1 bg-transparent border-none outline-none text-[13px] px-3 py-1.5 text-gray-800 resize-none overflow-y-auto leading-relaxed no-scrollbar"
                    placeholder="自訂修改，例如：把第二段縮短（請勿要求加入原始資料沒有的資訊）"
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
