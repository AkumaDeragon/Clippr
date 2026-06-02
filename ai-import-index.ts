// ════════════════════════════════════════════════════════════════
//  Supabase Edge Function：ai-import
//  作用：把 AI 金鑰藏在伺服器端。
//  前端看不到金鑰 → Google 不會偵測到外洩 → 不會再被自動封鎖。
//  部署後，前端只要把 GEMINI_KEY 設成 ''（空字串），就會自動走這支。
// ════════════════════════════════════════════════════════════════

// ── 模型設定（免費層額度最大、最不容易被限流的）──
const GEMINI_MODEL = "gemini-2.5-flash-lite";
// 金鑰「不要」寫在這裡！用 Supabase 密鑰存（見下方部署說明第 3 步）

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS 預檢（瀏覽器會先打一次 OPTIONS）
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = await req.json();
    const system = body?.system ?? "";
    const userText = body?.messages?.[0]?.content ?? "";

    const GEMINI_KEY = Deno.env.get("GEMINI_KEY");
    if (!GEMINI_KEY) {
      return json({ error: "伺服器尚未設定 GEMINI_KEY 密鑰，請到 Supabase 設定" }, 500);
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message ?? `Gemini 錯誤 ${r.status}`;
      return json({ error: msg }, r.status);
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";

    // 回傳成前端看得懂的格式：前端讀的是 data.content[].text
    return json({ content: [{ type: "text", text }] }, 200);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
