
import { GoogleGenAI, Type } from "@google/genai";
import { ListingMode, CopyStyle, PropertyData, TerminologyItem, HashtagSet } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const buildTerminologyGuide = (terminology: TerminologyItem[]): string => {
  const mappings = terminology.map(t => `- ${t.japanese} -> ${t.taiwanese}`).join('\n');
  return `
CRITICAL TAIWANESE TERMINOLOGY MAPPING:
${mappings}

TRANSPORTATION EXTRACTION:
- MUST extract ALL rail lines and stations mentioned.
- Format: "{Line1}「{Station1}」站、{Line2}「{Station2}」站".
`;
};

const RENTAL_TEMPLATE = `
【{Area} ❀ {Station} 徒歩{Min}分 {Target_Audience} 海外審查OK】
💰 租金：{Price} (管理費 {ManagementFee})
✨ 禮金 {KeyMoney} ／ 押金 {Deposit}
-
🚶‍♂️ 交通方便
🚃 {Line_Station_Combined}
-
🏠 房屋亮點
🏢 {Floor}階／{Layout}／{Size}㎡／{Structure}
📅 入居日期：{MoveInDate}
{Features_List}
-
📌 適合族群
⭕ 海外審查  ⭕ 社會人 ⭕ 留學生 ⭕ 打工度假
-
在日台灣人仲介為您服務
✔️ 打工渡假簽證租房成功率100%
✔️ 提供全中文溝通，協助處理租房、水電瓦斯、網路開通！
-
📲 馬上聯絡，快速找房！
☛ Line : linus0922
☛ Wechat : linus352410
{Mode_Specific_Hashtags}
`;

const SALE_TEMPLATE = `
✴︎ 東京買賣公寓推薦 ✴︎
{Renovation_Status_Line}
▫︎ {Structure_Type} {Total_Floors_Line} {Floor_Part}
▫︎ {Layout} 雙面採光邊間可選
▫︎ 🚃 {Line_Station_Combined}
▫︎ 📅 引渡時期：{MoveInDate}
-
🏠 物件亮點
{Features_List}
-
————————𝕀𝕟𝕗𝕠————————
〖所在地〗{Address}
〖售價〗{Price}
〖面積〗專有 {Size} ㎡ / 陽台 {Balcony_Size} ㎡
〖間取〗{Layout}
〖樓層〗{Floor_Detail}
〖築年〗{Year_Month}
〖管理費〗{ManagementFee} / 月
〖修繕積立金〗{RepairFund} / 月
——————————————————
台灣人Linus 最懂台灣人租屋買房心情🇹🇼
貸款協助・資料準備・總價議價，買房一條龍支援!!
找我買房您放心🙌🏻
-
Line : linus0922
Wechat : linus352410
{Mode_Specific_Hashtags}
`;

const EDITORIAL_RENTAL_TEMPLATE = `
░ {Label}｜{Area} 徒歩{Min}分 ░

{Opening_Narrative}

━━━━━━━━━━━━━━

📍 {Area_Ward}

💰 租金｜{Price}
💰 管理費｜{ManagementFee}

🏠 {Layout}｜{Size}㎡
🏢 {Structure} {TotalFloors}層樓｜{Floor}戶別
📅 {MoveInDate}

━━━━━━━━━━━━━━

✔ 禮金 {KeyMoney}
✔ 押金 {Deposit}
✔ 海外審查可相談
✔ 留學生可相談
✔ 打工度假簽證可相談

━━━━━━━━━━━━━━

設備完善

{Features_List}

━━━━━━━━━━━━━━

{Closing_Narrative}

━━━━━━━━━━━━━━

🇯🇵 在日台灣人仲介協助

✔ 中文全程溝通
✔ 海外審查協助
✔ 留學生・打工度假簽證租房對應
✔ 水電瓦斯開通協助

📲 Line：linus0922
📲 WeChat：linus352410

{Mode_Specific_Hashtags}
`;

export const generateListingText = async (
  data: PropertyData,
  mode: ListingMode,
  terminology: TerminologyItem[],
  hashtags: HashtagSet,
  style: CopyStyle = CopyStyle.CLASSIC,
  files: { mimeType: string; data: string }[] = [],
  variationHint: string = ""
): Promise<string> => {
  const modelName = "gemini-2.5-flash";
  const terminologyGuide = buildTerminologyGuide(terminology);

  const rentalHashtags = hashtags.rental;
  const saleHashtags = `${hashtags.sale} #${data.station}房產`;

  // 編輯雜誌風只用於租賃；限動短版兩種模式皆可；其餘維持經典條列式
  const useEditorial = style === CopyStyle.EDITORIAL && mode === ListingMode.RENTAL;
  const useShort = style === CopyStyle.SHORT;
  const hasImages = files.length > 0;

  const visionNote = hasImages
    ? `IMPORTANT — PROPERTY PHOTOS ARE ATTACHED. Look carefully at the attached images and describe what you ACTUALLY SEE: interior materials (e.g. 清水模/exposed concrete, 木地板/wood flooring), natural light and window size, ceiling height, layout openness, fittings, balcony, and the overall atmosphere. Weave these REAL observed details into the narrative. NEVER invent visual features that are not visible in the photos or stated in the data.`
    : `No photos are attached. Write the narrative only from the data and do NOT fabricate visual details (materials, light, view) you cannot confirm.`;

  let prompt: string;

  if (useShort) {
    const shortHashtags = mode === ListingMode.RENTAL ? rentalHashtags : saleHashtags;
    prompt = `
    You are Linus, a Taiwanese real estate agent in Tokyo, writing a SHORT, punchy ${mode} post for Instagram Stories / Threads in TRADITIONAL CHINESE (Taiwan style).

    ${hasImages ? visionNote : ''}

    Data: ${JSON.stringify(data)}

    Write a COMPACT post (about 6–10 short lines total). Keep it scannable and high-impact:
    1. Line 1: a punchy hook headline with 1–2 emojis (area + nearest station + shortest walk time, e.g. 「✨ 高圓寺站徒步5分 ｜ 設計感 1DK」).
    2. 2–4 short lines for the strongest selling points (price + management fee, layout + size, and the 1–2 best features you see in the photos / data). Each line starts with a relevant emoji. One point per line.
    3. ${mode === ListingMode.RENTAL ? 'One line on terms (禮金/押金) and 海外審查 if relevant.' : 'One line on the headline price and handover timing.'}
    4. One short call-to-action line + contacts: 📲 Line：linus0922 ／ WeChat：linus352410
    5. End with 5–8 of the most relevant hashtags chosen from: ${shortHashtags}

    Rules: be concise — NO long paragraphs, NO big divider blocks. Use Taiwanese terminology. For bare-number money values add thousands separators and 円. STRICTLY NO markdown (no *, **, __, heading #); the only # allowed are the hashtags at the end. Plain text + emojis only (posted to social media).

    ${terminologyGuide}
    `;
  } else if (useEditorial) {
    prompt = `
    You are Linus, a Taiwanese real estate agent in Tokyo, writing an upscale, editorial magazine-style Facebook RENTAL post in TRADITIONAL CHINESE (Taiwan style).

    ${visionNote}

    Data: ${JSON.stringify(data)}

    Fill the template below EXACTLY — keep every ░, ━ divider, emoji and the contact block unchanged.

    Detailed instructions:
    1. BANNER (first line) → ░ {Label}｜{Area} 徒歩{Min}分 ░
       - {Label}: a short UPPERCASE English tag YOU choose to fit this property's real character (judge from the photos + data), e.g. DESIGNER'S ROOM, BRIGHT STUDIO, MINIMAL FLAT, CORNER RESIDENCE, COZY HIDEAWAY, SKY VIEW SUITE. Choose honestly — only use DESIGNER'S ROOM for genuinely design-led interiors.
       - {Area}: the neighbourhood name (derive from the nearest station or the address).
       - {Min}: the SHORTEST walk time among the stations.
    2. {Opening_Narrative}: keep it SHORT and minimal — 2 brief paragraphs only (blank line between), BEFORE the first divider. Each paragraph 1–2 short sentences. Do NOT write long flowing intros.
       - Para 1: nearest station + walk minutes, plus one phrase on the home's design / light / atmosphere you SEE in the photos.
       - Para 2: one line on transport — name the stations with their own walk times and one or two major hubs (新宿 / 澀谷 / 下北澤 etc.) that are easy to reach.
       - data.line / data.station / data.walkTime are comma-separated, same order. Match each station to its own walk time. Never reuse one time for all.
       - Total opening should feel light and editorial, not a paragraph-heavy description.
    3. INFO BLOCK: {Area_Ward} = area or ward; {Price} = rent; {ManagementFee} = management fee; {Layout}, {Size}, {Structure}, {TotalFloors}, {Floor}, {MoveInDate} from data. For monetary values that are bare numbers, show thousands separators and append 円 (e.g. 102,000円).
    4. TERMS: {KeyMoney} = 禮金 value, {Deposit} = 押金 value. Keep the three 可相談 lines unchanged.
    5. {Features_List}: each feature on its own line starting with ✓ (one per line, Taiwanese terms, do NOT join with ／).
    6. {Closing_Narrative}: 1–2 short paragraphs about the neighbourhood lifestyle and who this home suits — warm and tasteful, not hard-sell.
    7. Keep the 🇯🇵 agent block and 📲 contacts EXACTLY as written.
    8. {Mode_Specific_Hashtags}: end the post with: ${rentalHashtags}
    9. STRICTLY NO markdown. Never use *, **, __, or heading #. The only allowed # are the hashtags at the very end. Plain text + emojis only (posted to Facebook).

    ${terminologyGuide}

    Template:
    ${EDITORIAL_RENTAL_TEMPLATE}
    `;
  } else {
    const templateToUse = mode === ListingMode.RENTAL ? RENTAL_TEMPLATE : SALE_TEMPLATE;
    prompt = `
    You are Linus, a Taiwanese Real Estate Agent in Tokyo.
    Task: Populate the ${mode} template using provided data.

    ${hasImages ? visionNote + '\n    Use what you see in the photos to enrich the 房屋亮點 / features with REAL observed details. Do not invent.' : ''}

    Data: ${JSON.stringify(data)}

    Instructions:
    1. Use Taiwanese real estate terms from the terminology guide below.
    2. For "Line_Station_Combined", list ALL stations with their INDIVIDUAL walk times, one per line, each starting with 🚃.
       - data.line contains lines (comma-separated), data.station contains stations (comma-separated), data.walkTime contains walk times in minutes (comma-separated, same order as stations).
       - Match each station with its own walk time.
       - Format (one station per line, all with 🚃):
         🚃 JR山手線「新宿」站 徒歩5分
         🚃 東京メトロ丸ノ内線「赤坂」站 徒歩12分
       - Each station must have its own 徒歩XX分. Never use one time for all stations.
    3. For {Station} and {Min} in the header/title, use the station with the SHORTEST walk time.
    4. Mode: ${mode}.
       - If RENTAL: Use these hashtags: ${rentalHashtags}
       - If SALE: Use these hashtags: ${saleHashtags}
    5. Features: List each feature on its own line, starting with ✅. One feature per line. Do NOT use "／" to join features.
       Format:
       ✅ 乾濕分離
       ✅ 獨立洗臉台
       ✅ 空調
    6. STRICTLY NO markdown formatting. Never use *, **, __, #, or any markdown symbols anywhere in the output. Plain text and emojis only. The output will be posted to Facebook where markdown does NOT render.

    ${terminologyGuide}

    Template:
    ${templateToUse}
  `;
  }

  if (variationHint) {
    prompt += `\n\n    VARIATION DIRECTION (make this version distinct from other versions): ${variationHint}\n    Keep all the same facts and required structure, but vary the wording, hook angle and emphasis accordingly.`;
  }

  const contents = hasImages
    ? { parts: [...files.map(f => ({ inlineData: f })), { text: prompt }] }
    : prompt;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });
    return response.text || "Error generating text.";
  } catch (error) {
    console.error(error);
    return "Generation failed.";
  }
};

export const rewriteListingText = async (
  currentText: string,
  instruction: string,
  terminology: TerminologyItem[],
  files: { mimeType: string; data: string }[] = []
): Promise<string> => {
  const modelName = "gemini-2.5-flash";
  const terminologyGuide = buildTerminologyGuide(terminology);
  const hasImages = files.length > 0;
  const prompt = `
    Rewrite this property listing.
    Instruction: ${instruction}
    ${hasImages ? 'Property photos are attached — if the instruction asks about the room, interior, materials, light or atmosphere, base your edits on what you ACTUALLY SEE in the photos. Never invent visual details not visible in the photos.' : ''}
    Text: ${currentText}
    ${terminologyGuide}
    Maintain Taiwanese terminology. Keep the overall layout, emojis and structure unless the instruction says otherwise. STRICTLY NO markdown formatting. Never use *, **, __, #(except hashtags), or any markdown symbols. Plain text and emojis only.
  `;
  const contents = hasImages
    ? { parts: [...files.map(f => ({ inlineData: f })), { text: prompt }] }
    : prompt;
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });
    return response.text || currentText;
  } catch (error) {
    return currentText;
  }
};

export type TranslateLang = 'JA' | 'EN';

export const translateListingText = async (
  currentText: string,
  targetLang: TranslateLang
): Promise<string> => {
  const modelName = "gemini-2.5-flash";
  const langName = targetLang === 'JA' ? 'Japanese (natural, native-level Japanese suitable for a Japanese audience)' : 'English (natural, native-level English suitable for an international audience)';
  const prompt = `
    Translate the following real-estate social-media post into ${langName}.
    CRITICAL — keep the EXACT same visual layout: every emoji, every ░/━/✔/✓/📍/💰/🏠 symbol, every divider line and every line break must stay in the same place. Only translate the human-readable words.
    Translate the hashtags into natural ${targetLang === 'JA' ? 'Japanese' : 'English'} hashtags (keep the # prefix, no spaces inside a tag).
    Keep contact lines (Line / WeChat IDs) unchanged.
    Output ONLY the translated post, nothing else. STRICTLY NO markdown symbols (no *, **, __, heading #).

    Post:
    ${currentText}
  `;
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || currentText;
  } catch (error) {
    console.error(error);
    return currentText;
  }
};

export const extractPropertyData = async (
  files: { mimeType: string; data: string }[],
  supplementaryText: string = "",
  terminology: TerminologyItem[] = []
): Promise<{ data: Partial<PropertyData>, detectedMode?: ListingMode }> => {
  const modelName = "gemini-2.5-flash";

  const terminologyList = terminology.length > 0
    ? terminology.map(t => `- ${t.japanese} -> ${t.taiwanese}`).join('\n')
    : '';

  const prompt = `
    Analyze real estate documents/images. Extract fields into JSON.
    Translate terms to TRADITIONAL CHINESE (TAIWAN STYLE).

    MODE DETECTION (CRITICAL):
    - Determine if this is a "RENTAL" (租賃) or "SALE" (買賣) document.
    - Look for keywords like "賃貸" (Rental), "売買" (Sale), "売マンション" (Sale Condo), "賃貸マンション" (Rental Condo).

    TRANSPORTATION (CRITICAL):
    - Scan the entire document for all railway lines, stations, and their individual walk times.
    - Put all found lines into 'line' field (comma-separated).
    - Put all found station names into 'station' field (comma-separated, same order as lines).
    - Put each station's walk time (in minutes) into 'walkTime' field (comma-separated, same order as stations).
    - Example: line="JR山手線,東京メトロ丸ノ内線", station="新宿,赤坂", walkTime="5,12"
    - NEVER put the same walk time for all stations if they are different.

    EQUIPMENT / FEATURES EXTRACTION (CRITICAL):
    - When reading tables or lists of equipment/features, ONLY extract items that are explicitly marked as present (e.g., marked with a circle "⭕️", "○", a checkmark "✓", or filled in).
    - DO NOT extract items that are listed but not marked, crossed out, or left blank.

    TAIWAN STYLE TERMS:
    ${terminologyList}

    JAPANESE RENTAL LOGIC:
    - '1ヶ月' for Key Money/Deposit should be extracted as '1個月'.

    ${supplementaryText ? `SUPPLEMENTARY INFO: ${supplementaryText}` : ''}

    Fields:
    - mode (RENTAL or SALE), address, line, station, walkTime, price, keyMoney, deposit, managementFee, layout, size, balconySize, floor, totalFloors, age, repairFund, moveInDate, renovationDate, features.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          ...files.map(f => ({ inlineData: f })),
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mode: { type: Type.STRING, description: "Detected mode: RENTAL or SALE" },
            address: { type: Type.STRING },
            line: { type: Type.STRING, description: "All rail lines found, comma separated" },
            station: { type: Type.STRING, description: "All station names found, comma separated" },
            walkTime: { type: Type.STRING },
            price: { type: Type.STRING },
            keyMoney: { type: Type.STRING },
            deposit: { type: Type.STRING },
            managementFee: { type: Type.STRING },
            layout: { type: Type.STRING },
            size: { type: Type.STRING },
            balconySize: { type: Type.STRING },
            floor: { type: Type.STRING },
            totalFloors: { type: Type.STRING },
            age: { type: Type.STRING },
            repairFund: { type: Type.STRING },
            moveInDate: { type: Type.STRING },
            renovationDate: { type: Type.STRING },
            features: { type: Type.STRING },
          },
        }
      }
    });

    const text = response.text;
    if (!text) return { data: {} };

    const parsed = JSON.parse(text);
    const { mode, ...data } = parsed;

    return {
      data: data as Partial<PropertyData>,
      detectedMode: mode === 'SALE' ? ListingMode.SALE : ListingMode.RENTAL
    };
  } catch (error) {
    console.error("Extraction error:", error);
    throw error;
  }
};
