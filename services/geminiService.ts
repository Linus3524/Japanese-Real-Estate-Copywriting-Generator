
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
【{Area} ❀ {Station} 徒歩{Min}分】
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
{Explicit_Eligibility_Only}
-
在日台灣人仲介為您服務
✔️ 提供全中文溝通，協助處理租房、水電瓦斯、網路開通！
-
📲 馬上聯絡，快速找房！
☛ Line : linus0922
☛ Wechat : linus352410
💬 Facebook 有時會漏掉私訊通知，傳訊後記得在文章下方留言提醒我，才不會錯過您喔！
{Mode_Specific_Hashtags}
`;

const SALE_TEMPLATE = `
✴︎ 東京買賣公寓推薦 ✴︎
{Renovation_Status_Line}
▫︎ {Structure_Type} {Total_Floors_Line} {Floor_Part}
▫︎ {Layout}
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
💬 Facebook 有時會漏掉私訊通知，傳訊後記得在文章下方留言提醒我，才不會錯過您喔！
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
{Explicit_Eligibility_Only}

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
💬 Facebook 有時會漏掉私訊通知，傳訊後記得在文章下方留言提醒我，才不會錯過您喔！

{Mode_Specific_Hashtags}
`;

const EDITORIAL_SALE_TEMPLATE = `
░ {Label}｜{Area} PROPERTY ░

{Opening_Narrative}

━━━━━━━━━━━━━━

📍 {Address}

💰 售價｜{Price}
🏠 {Layout}｜專有 {Size}㎡
🏢 {Floor_Detail}｜{Year_Month}
🚃 {Line_Station_Combined}

━━━━━━━━━━━━━━

{Features_List}

━━━━━━━━━━━━━━

管理費｜{ManagementFee}／月
修繕積立金｜{RepairFund}／月
陽台面積｜{Balcony_Size}㎡
引渡時期｜{MoveInDate}

━━━━━━━━━━━━━━

{Closing_Narrative}

📲 Line：linus0922
📲 WeChat：linus352410
💬 Facebook 有時會漏掉私訊通知，傳訊後記得在文章下方留言提醒我，才不會錯過您喔！

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

  const useEditorial = style === CopyStyle.EDITORIAL;
  const useShort = style === CopyStyle.SHORT;
  const hasImages = files.length > 0;

  const visionNote = hasImages
    ? `IMPORTANT — PROPERTY PHOTOS ARE ATTACHED. Look carefully at the attached images and describe what you ACTUALLY SEE: interior materials (e.g. 清水模/exposed concrete, 木地板/wood flooring), natural light and window size, ceiling height, layout openness, fittings, balcony, and the overall atmosphere. Weave these REAL observed details into the narrative. NEVER invent visual features that are not visible in the photos or stated in the data.`
    : `No photos are attached. Write the narrative only from the data and do NOT fabricate visual details (materials, light, view) you cannot confirm.`;

  let prompt: string;

  if (useShort) {
    const shortHashtags = mode === ListingMode.RENTAL ? rentalHashtags : saleHashtags;
    prompt = `
    You are Linus, a Taiwanese real estate agent in Tokyo, writing a SHORT editorial / magazine-style ${mode} post for THREADS in TRADITIONAL CHINESE (Taiwan style).

    ${visionNote}

    Data: ${JSON.stringify(data)}

    This is the magazine "editorial" voice but CONDENSED for Threads — text-forward, tasteful, calm. Think of a short magazine caption, NOT a punchy ad with an emoji on every line. Target length: about 10–16 lines total.

    Structure:
    1. OPENING (the heart of this style): 1–2 short narrative paragraphs (blank line between), describing the home's atmosphere, light, materials and the neighbourhood feel — drawn from the photos if attached, otherwise only from the data. Editorial and evocative but brief: each paragraph 1–2 sentences. Mention the nearest station + its walk time naturally inside the prose. Do NOT start with a loud hook headline.
    2. A SINGLE thin divider line: ━━━━━━━━━━
    3. A COMPACT info block — a few clean lines, each starting with one tasteful emoji (not every line needs one):
       📍 area / ward
       💰 租金 {price}（管理費 {mgmt}）  ${mode === ListingMode.RENTAL ? '' : '— for SALE use 售價 instead of 租金, and omit management line if not relevant'}
       🏠 {layout}｜{size}㎡
       🚃 list each station with its OWN walk time (data.line / data.station / data.walkTime are comma-separated in the same order — match each station to its own time, never reuse one time).
       ${mode === ListingMode.RENTAL ? '✔ 禮金 {keyMoney}／押金 {deposit}（海外審查等資格資訊僅在 data.features 明確提供時才可加入）' : '📅 引渡時期 {moveInDate}'}
    4. One short warm closing line on who this home suits (留學生 / 上班族 / 投資 etc., judged from the data) — not hard-sell.
    5. Contacts on their own line: 📲 Line：linus0922 ／ WeChat：linus352410
    6. Immediately after the contacts, include this exact reminder on its own line: 💬 Facebook 有時會漏掉私訊通知，傳訊後記得在文章下方留言提醒我，才不會錯過您喔！
    7. End with 5–8 of the most relevant hashtags chosen from: ${shortHashtags}

    Rules: keep it SHORTER than a full magazine post — at most ONE ━ divider, no ░ banner block. Use Taiwanese terminology. For bare-number money values add thousands separators and 円 (e.g. 102,000円). Omit empty fields. Never add eligibility, safety, yield, scarcity or equipment claims not supported by Data/photos. STRICTLY NO markdown (no *, **, __, heading #); the only # allowed are the hashtags at the end. Plain text + emojis only (posted to social media).

    ${terminologyGuide}
    `;
  } else if (useEditorial && mode === ListingMode.RENTAL) {
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
    4. TERMS: {KeyMoney} = 禮金 value, {Deposit} = 押金 value. {Explicit_Eligibility_Only} may include eligibility claims only when explicitly present in data.features; otherwise omit it and the empty section.
    5. {Features_List}: each feature on its own line starting with ✓ (one per line, Taiwanese terms, do NOT join with ／).
    6. {Closing_Narrative}: 1–2 short paragraphs about the neighbourhood lifestyle and who this home suits — warm and tasteful, not hard-sell.
    7. Keep the 🇯🇵 agent service block, 📲 contacts and Facebook message reminder EXACTLY as written, but do not present unverified property eligibility as fact.
    8. {Mode_Specific_Hashtags}: end the post with: ${rentalHashtags}
    9. Omit empty fields. Never add eligibility, safety, yield, scarcity, renovation or equipment claims not supported by Data/photos.
    10. STRICTLY NO markdown. Never use *, **, __, or heading #. The only allowed # are the hashtags at the very end. Plain text + emojis only (posted to Facebook).

    ${terminologyGuide}

    Template:
    ${EDITORIAL_RENTAL_TEMPLATE}
    `;
  } else if (useEditorial && mode === ListingMode.SALE) {
    prompt = `
    You are Linus, a Taiwanese real estate agent in Tokyo, writing an upscale editorial magazine-style Facebook SALE post in TRADITIONAL CHINESE (Taiwan style).

    ${visionNote}

    Data: ${JSON.stringify(data)}

    Fill the template below while keeping its restrained magazine rhythm. Omit a field's entire line when its source value is empty; never print empty labels or placeholders.

    Detailed instructions:
    1. BANNER: choose a short, honest English label based only on verified data/photos, such as CITY RESIDENCE, RENOVATED HOME, CORNER RESIDENCE or URBAN LIVING. Do not claim renovation, corner placement, a view or design quality unless confirmed.
    2. {Opening_Narrative}: exactly 2 brief paragraphs, each 1–2 short sentences. First establish the location and nearest station; then explain one verified spatial, building or neighbourhood advantage. No loud sales headline and no invented investment return.
    3. TRANSPORT: data.line, data.station and data.walkTime are comma-separated in matching order. List every station with its own time; never reuse one time for all stations.
    4. INFO: use sale-specific facts exactly as provided: sale price, layout, exclusive area, floor/total floors, building date, management fee, repair reserve, balcony area and handover timing. For bare-number yen values, add thousands separators and 円.
    5. {Features_List}: show only explicitly provided or visibly confirmed features, one per line beginning with ✓. If none exist, omit this section and its adjacent redundant divider.
    6. {Closing_Narrative}: 1 short paragraph describing who the property may suit based on layout/location facts. Do not promise appreciation, yield, loan approval, safety or scarcity.
    7. Keep contacts and the Facebook message reminder unchanged, then end with these sale hashtags: ${saleHashtags}
    8. STRICTLY NO markdown. The only # characters allowed are hashtags. Keep the post concise, tasteful and easy to scan.

    ${terminologyGuide}

    Template:
    ${EDITORIAL_SALE_TEMPLATE}
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
       - Never add eligibility, corner-room, lighting, school, safety, yield, scarcity, renovation or equipment claims unless explicitly present in Data or visibly confirmed in attached photos.
       - {Explicit_Eligibility_Only}: include eligibility lines only when the corresponding fact is explicitly present in data.features. Otherwise omit this placeholder and its surrounding empty section.
       - Omit any template line whose source field is empty. Never print a placeholder, "未提供", an invented value, or an empty label.
    6. STRICTLY NO markdown formatting. Never use *, **, __, #, or any markdown symbols anywhere in the output. Plain text and emojis only. The output will be posted to Facebook where markdown does NOT render.
    7. Keep the Line, WeChat and Facebook message reminder block from the template exactly as written in both RENTAL and SALE output.

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
    if (!response.text) throw new Error('Empty generation response');
    return response.text;
  } catch (error) {
    console.error(error);
    throw error;
  }
};

export const rewriteListingText = async (
  currentText: string,
  instruction: string,
  terminology: TerminologyItem[],
  files: { mimeType: string; data: string }[] = [],
  maxBodyChars?: number
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
    const firstDraft = response.text || currentText;
    const bodyLength = firstDraft
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n')
      .replace(/\s/g, '').length;

    // 字數是產品承諾而非建議：第一次超標時自動再壓縮一次。
    if (maxBodyChars && bodyLength > maxBodyChars) {
      const retryPrompt = `
        Compress the draft below to AT MOST ${maxBodyChars} non-whitespace characters, excluding hashtag-only lines.
        This is a hard limit. Preserve price, nearest station and walk time, layout, area, up to 3 key features, contacts and hashtags.
        Delete repeated service copy, secondary details, decorative dividers and verbose calls to action first.
        Never change any retained fact or number and never invent information.
        Output only the final Traditional Chinese post with no markdown.

        ORIGINAL SOURCE (facts must agree with this):
        ${currentText}

        DRAFT TO COMPRESS:
        ${firstDraft}
      `;
      const retry = await ai.models.generateContent({ model: modelName, contents: retryPrompt });
      return retry.text || firstDraft;
    }
    return firstDraft;
  } catch (error) {
    console.error(error);
    throw error;
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
    throw error;
  }
};

export const generateHooks = async (
  data: PropertyData,
  mode: ListingMode,
  files: { mimeType: string; data: string }[] = []
): Promise<string[]> => {
  const modelName = "gemini-2.5-flash";
  const hasImages = files.length > 0;
  const prompt = `
    You are a Taiwanese real estate copywriter in Tokyo. Generate 5 DIFFERENT punchy opening hook lines (the very first line of a Facebook ${mode} post) in TRADITIONAL CHINESE (Taiwan style).
    Each hook is exactly ONE line, includes 0-2 emojis, and takes a DIFFERENT angle: (1) location/station, (2) price/value, (3) layout or an explicitly provided feature, (4) lifestyle fit supported by the data, (5) another verified key fact.
    Never imply urgency, scarcity, investment return, safety, eligibility, a view, lighting or equipment unless that exact claim is present in the data or visibly confirmed in an attached photo.
    ${hasImages ? 'Property photos are attached — you may reference what you actually see for the design/atmosphere hook.' : ''}
    Data: ${JSON.stringify(data)}
    Output STRICTLY as a JSON array of 5 strings. No markdown symbols (no *, **, #) other than the emojis. No extra commentary.
  `;
  const contents = hasImages
    ? { parts: [...files.map(f => ({ inlineData: f })), { text: prompt }] }
    : prompt;
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    });
    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error(error);
    return [];
  }
};

export const suggestHashtags = async (
  data: PropertyData,
  mode: ListingMode,
  currentText: string
): Promise<string[]> => {
  const modelName = "gemini-2.5-flash";
  const prompt = `
    Suggest 8 relevant TRADITIONAL CHINESE (Taiwan-style) hashtags for this ${mode} Tokyo real-estate Facebook post.
    Mix broad-reach tags (e.g. #東京租屋, #東京買房) with specific ones derived from the area/station, layout, price range and likely audience (留學生/打工度假/投資客/家庭客 etc.).
    Data: ${JSON.stringify(data)}
    Post: ${currentText}
    Output STRICTLY as a JSON array of 8 strings, each starting with # and containing no spaces.
  `;
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    });
    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error) {
    console.error(error);
    return [];
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
    - Return exactly "RENTAL" or "SALE" in uppercase English. Never return a translated label.
    - SALE signals: 売買, 売マンション, 中古マンション, 販売価格, 売却, 修繕積立金, or a price expressed in 万円/億円.
    - RENTAL signals: 賃貸, 賃料, 家賃, 敷金, 礼金, 保証金, or a monthly rent amount.
    - Some sale sheets show a management fee and some investment sheets show an estimated rent. Those facts alone do NOT make it a rental. Identify the document's primary transaction and price label.
    - If signals conflict, prioritize the main heading and the label immediately beside the primary price.

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
            mode: { type: Type.STRING, enum: ["RENTAL", "SALE"], description: "Primary transaction type. Must be exactly RENTAL or SALE." },
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
    const normalizedMode = String(mode || '').trim().toUpperCase();

    return {
      data: data as Partial<PropertyData>,
      detectedMode: normalizedMode === 'SALE'
        ? ListingMode.SALE
        : normalizedMode === 'RENTAL'
          ? ListingMode.RENTAL
          : undefined
    };
  } catch (error) {
    console.error("Extraction error:", error);
    throw error;
  }
};
