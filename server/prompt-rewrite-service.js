import { DEFAULT_REWRITE_SYSTEM_PROMPT } from "./constants.js";

function buildRewriteInput(prompt, instruction) {
  return [
    "原始图像生成提示词：",
    String(prompt || "").trim(),
    "",
    "用户修改要求：",
    String(instruction || "").trim() || "请提升提示词的画面细节、构图、风格一致性和可生成性。",
    "",
    "请返回一版完整的新提示词。"
  ].join("\n");
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function extractResponsesText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const results = [];
  const queue = [payload];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current !== "object") continue;

    if (typeof current.text === "string" && current.text.trim()) {
      results.push(current.text.trim());
    }
    if (typeof current.value === "string" && current.value.trim() && current.type === "output_text") {
      results.push(current.value.trim());
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return results.join("\n").trim();
}

function extractChatText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content || "")
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

async function postJson(endpoint, apiKey, requestPayload, timeoutSeconds = 120) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${String(apiKey).trim()}`,
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(requestPayload),
    signal: AbortSignal.timeout(Number(timeoutSeconds || 120) * 1000)
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(text ? `${response.status} ${response.statusText} | ${text}` : `${response.status} ${response.statusText}`);
  }
  return payload;
}

export async function rewritePromptWithModel({ settings, prompt, instruction, messages = [] }) {
  const protocol = String(settings.rewriteProtocol || "responses").toLowerCase() === "chat" ? "chat" : "responses";
  const model = String(settings.rewriteModel || "").trim();
  const baseUrl = normalizeBaseUrl(settings.rewriteBaseUrl || settings.baseUrl);
  const apiKey = String(settings.rewriteApiKey || settings.apiKey || "").trim();
  const systemPrompt = String(settings.rewriteSystemPrompt || DEFAULT_REWRITE_SYSTEM_PROMPT).trim() || DEFAULT_REWRITE_SYSTEM_PROMPT;
  const inputText = buildRewriteInput(prompt, instruction);

  if (!model) {
    throw new Error("请先在设置中填写提示词改写模型。");
  }
  if (!apiKey) {
    throw new Error("请先在设置中填写改写 API Key，或配置生图 API Key 供改写继承。");
  }
  if (!baseUrl) {
    throw new Error("请先在设置中填写 Base URL。");
  }
  if (!String(prompt || "").trim()) {
    throw new Error("请先填写需要改写的提示词。");
  }

  if (protocol === "chat") {
    const requestPayload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
          .filter((item) => ["user", "assistant"].includes(item?.role) && String(item?.content || "").trim())
          .slice(-8)
          .map((item) => ({ role: item.role, content: String(item.content).trim() })),
        { role: "user", content: inputText }
      ]
    };
    const responsePayload = await postJson(`${baseUrl}/chat/completions`, apiKey, requestPayload);
    const text = extractChatText(responsePayload);
    if (!text) {
      throw new Error("改写接口返回成功，但未找到文本内容。");
    }
    return { text, protocol, model, requestPayload, responsePayload };
  }

  const requestPayload = {
    model,
    instructions: systemPrompt,
    input: inputText
  };
  const responsePayload = await postJson(`${baseUrl}/responses`, apiKey, requestPayload);
  const text = extractResponsesText(responsePayload);
  if (!text) {
    throw new Error("改写接口返回成功，但未找到文本内容。");
  }
  return { text, protocol, model, requestPayload, responsePayload };
}
