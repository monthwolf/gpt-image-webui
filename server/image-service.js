import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_IMAGE_MODEL, OUTPUT_DIR } from "./constants.js";

export async function ensureRuntimeDirs() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

export function validateSize(size) {
  const candidate = String(size || "auto").trim().toLowerCase();
  if (!candidate || candidate === "auto") {
    return null;
  }

  const match = candidate.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) {
    return "尺寸格式应为 auto 或 宽x高，例如 1024x1024。";
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const pixels = width * height;

  if (longEdge > 3840) {
    return "尺寸过大：最长边不能超过 3840 像素。";
  }
  if (width % 16 !== 0 || height % 16 !== 0) {
    return "尺寸不符合要求：宽和高都需要是 16 的倍数。";
  }
  if (!shortEdge || longEdge / shortEdge > 3) {
    return "尺寸比例不符合要求：长边与短边比例不能超过 3:1。";
  }
  if (pixels < 655360 || pixels > 8294400) {
    return "像素总量不符合要求：需介于 655360 到 8294400 之间。";
  }

  return null;
}

export function normalizeImageCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(4, Math.max(1, count));
}

function isAbortError(error) {
  return error?.name === "AbortError" || /aborted|abort/i.test(String(error?.message || error));
}

function isTimeoutError(error) {
  return error?.name === "TimeoutError" || /timeout|timed out/i.test(String(error?.message || error));
}

function normalizeCallMode(value) {
  return value === "images_api" ? "images_api" : "responses_tool";
}

export function buildResponsesToolRequestPayload(options) {
  const tool = {
    type: "image_generation",
    model: String(options.imageModel || DEFAULT_IMAGE_MODEL).trim() || DEFAULT_IMAGE_MODEL,
    n: normalizeImageCount(options.n),
    size: options.size,
    quality: options.quality,
    background: options.background,
    output_format: options.outputFormat,
    moderation: options.moderation
  };

  if (options.action !== "auto") {
    tool.action = options.action;
  }
  if (["jpeg", "webp"].includes(options.outputFormat)) {
    tool.output_compression = Number(options.outputCompression);
  }

  const payload = {
    model: options.model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: options.prompt.trim() },
          ...((options.referenceImages || []).map((image) => ({
            type: "input_image",
            image_url: image.dataUrl
          })))
        ]
      }
    ],
    tools: [tool]
  };

  if (options.forceToolChoice) {
    payload.tool_choice = { type: "image_generation" };
  }

  return payload;
}

export function buildImagesApiRequestPayload(options) {
  const payload = {
    model: String(options.imageModel || DEFAULT_IMAGE_MODEL).trim() || DEFAULT_IMAGE_MODEL,
    prompt: options.prompt.trim(),
    n: normalizeImageCount(options.n),
    output_format: options.outputFormat || "png"
  };

  if (options.size && options.size !== "auto") {
    payload.size = options.size;
  }
  if (options.quality && options.quality !== "auto") {
    payload.quality = options.quality;
  }
  if (options.background && options.background !== "auto") {
    payload.background = options.background;
  }
  if (options.moderation && options.moderation !== "auto") {
    payload.moderation = options.moderation;
  }
  if (["jpeg", "webp"].includes(options.outputFormat)) {
    payload.output_compression = Number(options.outputCompression);
  }

  return payload;
}

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("参考图格式无效，请重新上传图片。");
  }
  const mimeType = match[1] || "image/png";
  const bytes = Buffer.from(match[2], "base64");
  return new Blob([bytes], { type: mimeType });
}

function buildImagesApiMultipartRequest(options) {
  const payload = buildImagesApiRequestPayload(options);
  const form = new FormData();
  const referenceImages = getValidReferenceImages(options.referenceImages);

  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }

  referenceImages.forEach((image, index) => {
    const filename = image.name || `reference-${index + 1}.png`;
    form.append("image", dataUrlToBlob(image.dataUrl), filename);
  });

  return form;
}

function summarizeMultipartRequest(options) {
  const referenceImages = getValidReferenceImages(options.referenceImages);
  return {
    ...buildImagesApiRequestPayload(options),
    image: referenceImages.map((image, index) => ({
      name: image.name || `reference-${index + 1}.png`,
      sizeLabel: image.sizeLabel || "",
      content: "[multipart file]"
    }))
  };
}

function getValidReferenceImages(referenceImages) {
  return Array.isArray(referenceImages)
    ? referenceImages.filter((image) => /^data:image\/[^;]+;base64,/.test(String(image?.dataUrl || "")))
    : [];
}

export function buildRequestPayload(options) {
  return normalizeCallMode(options.imageCallMode) === "images_api"
    ? buildImagesApiRequestPayload(options)
    : buildResponsesToolRequestPayload(options);
}

export async function* generateImages(options) {
  const imageCallMode = normalizeCallMode(options.imageCallMode);
  if (!String(options.prompt || "").trim()) {
    throw new Error("请输入提示词后再生成。");
  }
  if (!String(options.apiKey || "").trim() && imageCallMode === "images_api") {
    throw new Error("请先在设置中填写 Images API Key。");
  }
  if (!String(options.apiKey || "").trim()) {
    throw new Error("请先在设置中填写 API Key。");
  }

  const normalizedBaseUrl = String(options.baseUrl || "").trim().replace(/\/+$/, "");
  const sizeError = validateSize(options.size);
  if (sizeError) {
    throw new Error(sizeError);
  }

  const outputDir = options.outputDir || OUTPUT_DIR;
  const publicPathPrefix = String(options.publicPathPrefix || "/generated").replace(/\/+$/, "");
  await fs.mkdir(outputDir, { recursive: true });

  const validReferenceImages = getValidReferenceImages(options.referenceImages);
  const hasReferenceImages = validReferenceImages.length > 0;
  const endpoint = imageCallMode === "images_api"
    ? `${normalizedBaseUrl}${hasReferenceImages ? "/images/edits" : "/images/generations"}`
    : `${normalizedBaseUrl}/responses`;
  const maxRetries = Number(options.maxRetries ?? 2);
  const requestOptions = { ...options, baseUrl: normalizedBaseUrl, imageCallMode, referenceImages: validReferenceImages };
  const requestPayload = buildRequestPayload(requestOptions);
  const requestLogPayload = imageCallMode === "images_api" && hasReferenceImages
    ? summarizeMultipartRequest(requestOptions)
    : requestPayload;
  let lastError = null;

  yield {
    type: "request_ready",
    requestPayload: requestLogPayload,
    endpoint,
    imageCallMode
  };

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      yield { type: "status", message: `正在提交第 ${attempt} 次请求...` };

      const timeoutSignal = AbortSignal.timeout(Number(options.timeoutSeconds || 600) * 1000);
      const signal = options.abortSignal ? AbortSignal.any([options.abortSignal, timeoutSignal]) : timeoutSignal;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${String(options.apiKey).trim()}`,
          ...(imageCallMode === "images_api" && hasReferenceImages ? {} : { "Content-Type": "application/json; charset=utf-8" })
        },
        body: imageCallMode === "images_api" && hasReferenceImages
          ? buildImagesApiMultipartRequest(requestOptions)
          : JSON.stringify(requestPayload),
        signal
      });

      const responseText = await response.text();
      yield {
        type: "response_log",
        endpoint,
        imageCallMode,
        attempt,
        statusCode: response.status,
        statusText: response.statusText,
        responseBody: responseText,
        requestPayload: requestLogPayload
      };

      if (!response.ok) {
        throw new Error(buildHttpErrorMessage(response.status, response.statusText, responseText, endpoint));
      }

      yield* consumeStandardResponse(responseText, options.outputFormat, outputDir, publicPathPrefix);
      return;
    } catch (error) {
      lastError = error;
      const timedOut = isTimeoutError(error);
      const aborted = isAbortError(error);
      const errorMessage = timedOut
        ? `生成请求已达到 ${Number(options.timeoutSeconds || 600)} 秒超时限制，已停止重试。请在高级参数中调高超时时间后再试。`
        : aborted
          ? "生成请求已取消。"
          : error instanceof Error ? error.message : String(error);
      yield {
        type: "attempt_error_log",
        endpoint,
        imageCallMode,
        attempt,
        error: errorMessage,
        requestPayload: requestLogPayload
      };

      if (timedOut || aborted) {
        throw new Error(errorMessage);
      }
      if (attempt > maxRetries) {
        break;
      }
      yield { type: "status", message: `第 ${attempt} 次失败，准备重试...` };
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || "生成失败"));
}

async function* consumeStandardResponse(responseText, outputFormat, outputDir, publicPathPrefix) {
  const payload = JSON.parse(responseText || "{}");
  const finalImages = await extractImagesFromResponse(payload, outputFormat, outputDir, publicPathPrefix);
  if (!finalImages.length) {
    throw new Error(buildNoImageError(payload));
  }

  yield {
    type: "final",
    images: finalImages,
    revisedPrompt: extractRevisedPrompt(payload),
    responsePayload: payload
  };
}

async function* consumeStreamingResponse(response, outputFormat, outputDir, publicPathPrefix) {
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  const partials = [];
  const collectedEvents = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") {
        continue;
      }

      let event;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }

      collectedEvents.push(event);
      const eventType = String(event.type || "");

      if (eventType === "response.image_generation_call.partial_image" && event.partial_image_b64) {
        const partialImage = await saveBase64Image(event.partial_image_b64, outputFormat, "partial", outputDir, publicPathPrefix);
        partials.push(partialImage);
        yield {
          type: "partial",
          images: [...partials],
          message: `已收到第 ${partials.length} 张预览图。`
        };
        continue;
      }

      if (eventType === "response.completed") {
        const responsePayload = event.response || {};
        let finalImages = await extractImagesFromResponse(responsePayload, outputFormat, outputDir, publicPathPrefix);
        if (!finalImages.length) {
          finalImages = await extractImagesFromResponse(collectedEvents, outputFormat, outputDir, publicPathPrefix);
        }
        if (!finalImages.length) {
          throw new Error(buildNoImageError(responsePayload || collectedEvents));
        }
        yield {
          type: "final",
          images: finalImages,
          partials,
          revisedPrompt: extractRevisedPrompt(responsePayload || collectedEvents),
          responsePayload
        };
        return;
      }
    }
  }

  const finalImages = await extractImagesFromResponse(collectedEvents, outputFormat, outputDir, publicPathPrefix);
  if (!finalImages.length) {
    throw new Error(buildNoImageError(collectedEvents));
  }

  yield {
    type: "final",
    images: finalImages,
    partials,
    revisedPrompt: extractRevisedPrompt(collectedEvents),
    responsePayload: collectedEvents
  };
}

async function extractImagesFromResponse(node, outputFormat, outputDir, publicPathPrefix) {
  const seen = new Set();
  const images = [];
  const imagesApiPayloads = findImagesApiPayloads(node);
  const payloads = imagesApiPayloads.length
    ? imagesApiPayloads
    : [
        ...findOfficialImageCallPayloads(node),
        ...findImagePayloads(node)
      ];

  for (const payload of payloads) {
    const key = `${payload.kind}:${payload.value.slice(0, 120)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    if (payload.kind === "base64") {
      images.push(await saveBase64Image(payload.value, outputFormat, "generated", outputDir, publicPathPrefix));
    } else if (payload.kind === "url") {
      images.push(await saveUrlImage(payload.value, outputFormat, outputDir, publicPathPrefix));
    }
  }

  return images;
}

function normalizeImagePayload(kind, value) {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  if (/^data:image\/[^;]+;base64,/i.test(candidate)) {
    return { kind: "base64", value: candidate };
  }
  if (/^https?:\/\//i.test(candidate)) {
    return { kind: "url", value: candidate };
  }
  if (kind === "base64" && candidate.length > 1000) {
    return { kind: "base64", value: candidate };
  }
  return null;
}

function findImagesApiPayloads(node) {
  const results = [];
  const queue = [node];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== "object") continue;

    if (Array.isArray(current.data)) {
      for (const item of current.data) {
        if (!item || typeof item !== "object") continue;

        const urlPayload = normalizeImagePayload("url", item.url || item.image_url);
        if (urlPayload) {
          results.push(urlPayload);
          continue;
        }

        if (item.image && typeof item.image === "object") {
          const nestedUrl = normalizeImagePayload("url", item.image.url || item.image.image_url);
          if (nestedUrl) {
            results.push(nestedUrl);
            continue;
          }
        }

        for (const value of [item.b64_json, item.base64, item.image_base64]) {
          if (typeof value === "string" && value.trim()) {
            results.push({ kind: "base64", value });
            break;
          }
        }

        if (item.image && typeof item.image === "object") {
          for (const value of [item.image.b64_json, item.image.base64, item.image.image_base64]) {
            if (typeof value === "string" && value.trim()) {
              results.push({ kind: "base64", value });
              break;
            }
          }
        }
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return results;
}

function findOfficialImageCallPayloads(node) {
  const results = [];
  const queue = [node];

  while (queue.length) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== "object") {
      continue;
    }

    if (Array.isArray(current.output)) {
      for (const item of current.output) {
        if (!item || typeof item !== "object") {
          continue;
        }

        if (item.type === "image_generation_call") {
          if (typeof item.result === "string" && item.result.length > 1000) {
            results.push({ kind: "base64", value: item.result });
          } else if (Array.isArray(item.result)) {
            for (const subItem of item.result) {
              if (typeof subItem === "string" && subItem.length > 1000) {
                results.push({ kind: "base64", value: subItem });
              } else if (subItem && typeof subItem === "object") {
                if (typeof subItem.b64_json === "string") {
                  results.push({ kind: "base64", value: subItem.b64_json });
                }
                if (typeof subItem.url === "string") {
                  results.push({ kind: "url", value: subItem.url });
                }
              }
            }
          }
        }
        queue.push(item);
      }
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return results;
}

function findImagePayloads(node) {
  const results = [];
  if (node == null) {
    return results;
  }

  if (typeof node === "string") {
    const candidate = node.trim();
    if (/^data:image\/[^;]+;base64,/i.test(candidate)) {
      return [{ kind: "base64", value: candidate }];
    }
    if (/^https?:\/\//.test(candidate)) {
      return [{ kind: "url", value: candidate }];
    }
    if (candidate.length > 1000 && /^[A-Za-z0-9+/=\s]+$/.test(candidate)) {
      return [{ kind: "base64", value: candidate }];
    }
    return results;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => {
      results.push(...findImagePayloads(item));
    });
    return results;
  }

  if (typeof node === "object") {
    Object.entries(node).forEach(([key, value]) => {
      if (["b64_json", "image_base64", "base64"].includes(key) && typeof value === "string" && value.trim()) {
        results.push({ kind: "base64", value });
      } else if (key === "result" && typeof value === "string") {
        const payload = normalizeImagePayload("base64", value);
        if (payload) results.push(payload);
      } else if (["url", "image_url"].includes(key) && typeof value === "string") {
        const payload = normalizeImagePayload("url", value);
        if (payload) results.push(payload);
      }
      results.push(...findImagePayloads(value));
    });
  }

  return results;
}

function extractRevisedPrompt(node) {
  if (!node) {
    return "";
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const nested = extractRevisedPrompt(item);
      if (nested) {
        return nested;
      }
    }
    return "";
  }
  if (typeof node === "object") {
    if (typeof node.revised_prompt === "string") {
      return node.revised_prompt;
    }
    for (const value of Object.values(node)) {
      const nested = extractRevisedPrompt(value);
      if (nested) {
        return nested;
      }
    }
  }
  return "";
}

function buildNoImageError(node) {
  const summary = summarizeResponseShape(node);
  return `接口返回成功，但未找到生成图片。响应摘要：${summary}`;
}

function buildHttpErrorMessage(status, statusText, responseText, endpoint) {
  const text = String(responseText || "");
  if (status === 524 || /Error code 524|A timeout occurred|Cloudflare/i.test(text)) {
    return `${status} ${statusText} | 网关 ${endpoint} 返回 Cloudflare 524 超时。请求已到达网关，但上游服务未在 Cloudflare 限时内完成处理。建议降低结果图数量或分辨率后重试；如果仍失败，请更换 Images API Base URL 或联系网关确认 gpt-image 任务超时限制。完整 HTML 已写入服务端日志 generate:openai_response_body。`;
  }
  if (/^\s*</.test(text)) {
    return `${status} ${statusText} | 网关返回了 HTML 错误页，完整响应已写入服务端日志 generate:openai_response_body。`;
  }
  return text ? `${status} ${statusText} | ${text}` : `${status} ${statusText}`;
}

function summarizeResponseShape(node) {
  try {
    const outputTypes = new Set();
    let hasOutputArray = false;
    let imageCallCount = 0;
    let imageCallWithResultCount = 0;

    const queue = [node];
    while (queue.length) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }

      if (typeof current !== "object") {
        continue;
      }

      if (Array.isArray(current.output)) {
        hasOutputArray = true;
        for (const item of current.output) {
          if (item && typeof item === "object") {
            if (item.type) {
              outputTypes.add(String(item.type));
            }
            if (item.type === "image_generation_call") {
              imageCallCount += 1;
              if (
                (typeof item.result === "string" && item.result.length > 1000) ||
                (Array.isArray(item.result) && item.result.length > 0)
              ) {
                imageCallWithResultCount += 1;
              }
            }
            queue.push(item);
          }
        }
      }

      for (const value of Object.values(current)) {
        if (value && typeof value === "object") {
          queue.push(value);
        }
      }
    }

    return JSON.stringify({
      hasOutputArray,
      outputTypes: [...outputTypes],
      imageCallCount,
      imageCallWithResultCount
    });
  } catch (error) {
    return `无法解析响应摘要：${error instanceof Error ? error.message : String(error)}`;
  }
}

async function saveBase64Image(imageBase64, outputFormat, prefix, outputDir, publicPathPrefix) {
  const cleaned = String(imageBase64).replace(/^data:image\/[^;]+;base64,/, "").replace(/\s+/g, "");
  const buffer = Buffer.from(cleaned, "base64");
  return writeImageBytes(buffer, outputFormat, prefix, outputDir, publicPathPrefix);
}

async function saveUrlImage(url, outputFormat, outputDir, publicPathPrefix) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`下载图片失败：${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return writeImageBytes(Buffer.from(arrayBuffer), outputFormat, "generated", outputDir, publicPathPrefix);
}

async function writeImageBytes(bytes, outputFormat, prefix, outputDir, publicPathPrefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const ext = outputFormat === "jpeg" ? "jpg" : outputFormat;
  const filename = `${stamp}-${prefix}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const filePath = path.join(outputDir || OUTPUT_DIR, filename);
  await fs.writeFile(filePath, bytes);
  return {
    name: filename,
    path: filePath,
    url: `${publicPathPrefix || "/generated"}/${filename}`
  };
}
