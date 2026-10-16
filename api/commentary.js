// Vercel 서버 함수: 게임 결과를 받아 OpenRouter 무료 AI에게 한 줄 해설을 받아 돌려줘요.
// 비밀 키는 Vercel 환경변수(OPENROUTER_API_KEY)에서만 읽어요. 브라우저로는 절대 나가지 않아요.

// 첫 모델이 붐비면(429 등) 다음 모델로 넘어가요.
const MODELS = [
  "nvidia/nemotron-3.5-lightning:free",
  "poolside/laguna-s-2.1:free",
  "google/gemma-4-26b-a4b-it:free",
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 가능해요" });
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "서버에 키가 설정되지 않았어요" });
  }

  // 게임이 보낸 값 검사: 승자는 두 가지 중 하나, 핑퐁 횟수는 0~999 정수만 허용
  const { winner, hits } = req.body || {};
  if ((winner !== "me" && winner !== "ai") || !Number.isInteger(hits) || hits < 0 || hits > 999) {
    return res.status(400).json({ error: "잘못된 요청이에요" });
  }

  const who = winner === "me" ? "사람 플레이어" : "AI";
  const prompt =
    `퐁(탁구) 게임이 끝났어요. 승자: ${who}, 공이 패들에 맞은 핑퐁 횟수: ${hits}번. ` +
    `이 결과를 스포츠 중계처럼 재치 있게 한국어 한 문장(40자 이내)으로만 해설해 주세요.`;

  for (const model of MODELS) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 100,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!r.ok) continue;  // 429 등 실패하면 다음 모델 시도
      const data = await r.json();
      const text = (data.choices?.[0]?.message?.content || "").trim().replace(/\s+/g, " ");
      if (text) return res.status(200).json({ comment: text.slice(0, 80) });
    } catch (e) {
      // 네트워크 오류도 다음 모델로 넘어가요
    }
  }

  return res.status(502).json({ error: "지금은 해설을 받을 수 없어요" });
};
