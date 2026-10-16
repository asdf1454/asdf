// Vercel 서버 함수: 게임 결과를 받아 OpenRouter 무료 AI에게 한 줄 해설을 받아 돌려줘요.
// 비밀 키는 Vercel 환경변수(OPENROUTER_API_KEY)에서만 읽어요. 브라우저로는 절대 나가지 않아요.

// 첫 모델이 붐비거나(429) 멈추거나 빈 답을 주면 다음 모델로 넘어가요.
// (직접 시험해서 '생각 끄기'로 빠르게 답이 오는 무료 모델만 골랐어요.)
const MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "dots-studio/dots-3-note-preview:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST만 가능해요" });
  }

  // 다른 사이트에서 이 주소를 몰래 호출하는 것을 막아요 (같은 사이트에서 온 요청만 허용).
  const origin = req.headers.origin;
  if (origin && new URL(origin).host !== req.headers.host) {
    return res.status(403).json({ error: "허용되지 않은 요청이에요" });
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
        signal: AbortSignal.timeout(6000),  // 6초 안에 답이 없으면 포기하고 다음 모델로
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          // 생각(reasoning)을 끄지 않으면 모델이 생각하다 글자 수를 다 써서 답이 비어 와요.
          reasoning: { enabled: false },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!r.ok) continue;  // 429 등 실패하면 다음 모델 시도
      const data = await r.json();
      // 여러 줄이면 첫 줄만, 따옴표는 걷어내요
      const text = (data.choices?.[0]?.message?.content || "").trim().split("\n")[0].replace(/^["'“”]+|["'“”]+$/g, "").trim();
      if (text) return res.status(200).json({ comment: text.slice(0, 80) });
    } catch (e) {
      // 네트워크 오류도 다음 모델로 넘어가요
    }
  }

  return res.status(502).json({ error: "지금은 해설을 받을 수 없어요" });
};
