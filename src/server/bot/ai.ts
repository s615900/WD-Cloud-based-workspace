// AI 輔助辨識模組 — 用 Gemini API 做「沒打關鍵字的自然語言分類」跟「圖片內容辨識」
// 需要 Replit Secret：GEMINI_API_KEY
import type { BotRecord } from "./flex";

const MODEL = "gemini-2.0-flash";

function getApiKey(): string {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

function apiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getApiKey()}`;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

async function callGemini(parts: GeminiPart[]): Promise<string> {
  const response = await fetch(apiUrl(MODEL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.2 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API 呼叫失敗: ${response.status} ${errText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    ""
  );
}

// 沒打關鍵字的自由文字（例如口語輸入），交給 AI 判斷要歸類成哪一種
export async function classifyTextWithAI(text: string): Promise<BotRecord> {
  const prompt = `你是記事機器人的分類助手。判斷使用者輸入的文字要歸類成「行程」還是「備忘」。
如果是行程，內容請整理成「MM/DD HH:MM 標題」的格式；抓不到確切日期時間就歸類成「備忘」。
只回傳這個格式的JSON，不要加任何其他文字、說明或markdown code block：
{"type": "行程或備忘", "content": "整理後的內容"}

使用者輸入：${text}`;

  const raw = await callGemini([{ text: prompt }]);

  try {
    // Gemini 有時會多包 ```json ... ```，先去掉再解析
    const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    return { ...(JSON.parse(cleaned) as BotRecord), matched: true };
  } catch {
    console.error("Gemini 回傳格式無法解析，改用預設備忘錄:", raw);
    return { type: "備忘", content: text, matched: true };
  }
}

// 圖片辨識：把截圖/照片內容轉成一段文字描述，方便之後查詢搜尋
export async function describeImageWithAI(
  imageBuffer: Buffer,
  mimeType = "image/jpeg",
): Promise<string> {
  const base64Image = imageBuffer.toString("base64");

  const parts: GeminiPart[] = [
    { inlineData: { mimeType, data: base64Image } },
    {
      text: "這是使用者傳的截圖或照片，請用一到兩句話簡短描述畫面內容或文字重點，方便之後搜尋用，不要加任何多餘的開場白。",
    },
  ];

  const description = await callGemini(parts);
  return description.trim();
}
