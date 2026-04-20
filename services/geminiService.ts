
import { GoogleGenAI, Type } from "@google/genai";
import { ListingMode, PropertyData, TerminologyItem, HashtagSet } from "../types";

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
🚃 {Line_Station_Combined} 徒歩{Min}分
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
▫︎ 🚃 {Line_Station_Combined} 徒歩僅 {Min} 分鐘
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

export const generateListingText = async (
  data: PropertyData,
  mode: ListingMode,
  terminology: TerminologyItem[],
  hashtags: HashtagSet
): Promise<string> => {
  const modelName = "gemini-2.5-flash";
  const templateToUse = mode === ListingMode.RENTAL ? RENTAL_TEMPLATE : SALE_TEMPLATE;
  const terminologyGuide = buildTerminologyGuide(terminology);

  const rentalHashtags = hashtags.rental;
  const saleHashtags = `${hashtags.sale} #${data.station}房產`;

  const prompt = `
    You are Linus, a Taiwanese Real Estate Agent in Tokyo.
    Task: Populate the ${mode} template using provided data.

    Data: ${JSON.stringify(data)}

    Instructions:
    1. Use Taiwanese real estate terms from the terminology guide below.
    2. For "Line_Station_Combined", list all stations found in data (e.g., "JR山手線「新宿」站、大江戶線「都廳前」站").
    3. Mode: ${mode}.
       - If RENTAL: Use these hashtags: ${rentalHashtags}
       - If SALE: Use these hashtags: ${saleHashtags}
    4. Features: Concatenate with "／".
    5. No markdown bold/italics. Plain text only.

    ${terminologyGuide}

    Template:
    ${templateToUse}
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
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
  terminology: TerminologyItem[]
): Promise<string> => {
  const modelName = "gemini-2.5-flash";
  const terminologyGuide = buildTerminologyGuide(terminology);
  const prompt = `
    Rewrite this property listing.
    Instruction: ${instruction}
    Text: ${currentText}
    ${terminologyGuide}
    Maintain Taiwanese terminology. Plain text only.
  `;
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || currentText;
  } catch (error) {
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
    - Scan the entire document for all railway lines and stations.
    - Put all found transport into 'line' and 'station' fields.
    - Use commas to separate multiple entries.

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
