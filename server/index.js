import crypto from "node:crypto";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTH_COOKIE_NAME, DEFAULT_IMAGE_MODEL, DEFAULT_SETTINGS, DIST_DIR, OUTPUT_DIR, PROMPT_PRESETS } from "./constants.js";
import {
  authenticateUser,
  changeOwnPassword,
  clearSessionCookie,
  createInvite,
  createUser,
  ensureAuthInitialized,
  listInvites,
  listUsers,
  readCookie,
  registerUserWithInvite,
  setSessionCookie,
  signSession,
  updateUserInvitePermission,
  verifySession
} from "./auth-store.js";
import { addHistoryItem, deleteHistoryItem, loadHistory, updateHistoryItem } from "./history-store.js";
import { ensureRuntimeDirs, generateImages, normalizeImageCount } from "./image-service.js";
import { rewritePromptWithModel } from "./prompt-rewrite-service.js";
import { loadSettings, saveSettings } from "./settings-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);

await ensureRuntimeDirs();
const defaultAdmin = await ensureAuthInitialized();

function logInfo(scope, message, meta = {}) {
  console.log(JSON.stringify({ level: "info", time: new Date().toISOString(), scope, message, ...meta }));
}

function logError(scope, message, meta = {}) {
  console.error(JSON.stringify({ level: "error", time: new Date().toISOString(), scope, message, ...meta }));
}

function getSafeUser(user) {
  return user
    ? {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        canCreateInvites: user.role === "admin" || Boolean(user.canCreateInvites)
      }
    : null;
}

async function requireAuth(req, res, next) {
  const token = readCookie(req, AUTH_COOKIE_NAME);
  const user = await verifySession(token).catch(() => null);
  if (!user) {
    res.status(401).json({ message: "请先登录。", authenticated: false });
    return;
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ message: "只有管理员可以执行该操作。" });
    return;
  }
  next();
}

app.use(express.json({ limit: "50mb" }));
app.use("/generated", express.static(OUTPUT_DIR, { extensions: ["png", "jpg", "jpeg", "webp"] }));
app.use(
  express.static(DIST_DIR, {
    index: false,
    maxAge: "1y",
    immutable: true
  })
);

app.use((req, res, next) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();
  req.requestId = requestId;

  logInfo("http", "request:start", { requestId, method: req.method, path: req.path });
  res.on("finish", () => {
    logInfo("http", "request:finish", {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
});

app.get("/api/auth/me", async (req, res) => {
  const token = readCookie(req, AUTH_COOKIE_NAME);
  const user = await verifySession(token).catch(() => null);
  res.json({
    authenticated: Boolean(user),
    user: getSafeUser(user),
    defaultAdmin
  });
});

app.post("/api/auth/login", async (req, res) => {
  const user = await authenticateUser(req.body?.username, req.body?.password);
  if (!user) {
    res.status(401).json({ message: "用户名或密码不正确。" });
    return;
  }
  setSessionCookie(res, signSession(user));
  res.json({ authenticated: true, user });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const user = await registerUserWithInvite(req.body || {});
    setSessionCookie(res, signSession(user));
    res.status(201).json({ authenticated: true, user });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "注册失败。" });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ authenticated: false });
});

app.use("/api", requireAuth);

app.get("/api/meta", async (req, res) => {
  const settings = await loadSettings(req.user.id);
  res.json({
    appName: "GPT 图像生成工作台",
    presets: Object.values(PROMPT_PRESETS),
    settings: settings || DEFAULT_SETTINGS,
    user: req.user
  });
});

app.get("/api/users", requireAdmin, async (_req, res) => {
  res.json(await listUsers());
});

app.post("/api/users", requireAdmin, async (req, res) => {
  try {
    res.status(201).json(await createUser(req.body || {}));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "创建用户失败。" });
  }
});

app.patch("/api/users/me/password", async (req, res) => {
  try {
    res.json(await changeOwnPassword(req.user.id, req.body?.currentPassword, req.body?.nextPassword));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "修改密码失败。" });
  }
});

app.patch("/api/users/:id/invite-permission", requireAdmin, async (req, res) => {
  try {
    res.json(await updateUserInvitePermission(req.params.id, req.body?.canCreateInvites));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "更新用户权限失败。" });
  }
});

function requireInviteCreator(req, res, next) {
  if (req.user?.role !== "admin" && !req.user?.canCreateInvites) {
    res.status(403).json({ message: "当前用户没有生成邀请码权限。" });
    return;
  }
  next();
}

app.get("/api/invites", requireInviteCreator, async (req, res) => {
  res.json(await listInvites(req.user));
});

app.post("/api/invites", requireInviteCreator, async (req, res) => {
  try {
    res.status(201).json(await createInvite(req.user));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "生成邀请码失败。" });
  }
});

app.get("/api/settings", async (req, res) => {
  res.json(await loadSettings(req.user.id));
});

app.put("/api/settings", async (req, res) => {
  try {
    const settings = await saveSettings(req.user.id, req.body || {});
    logInfo("settings", "settings:saved", {
      requestId: req.requestId,
      userId: req.user.id,
      baseUrl: settings.baseUrl,
      defaultModel: settings.defaultModel,
      imageCallMode: settings.imageCallMode,
      imageBaseUrl: settings.imageBaseUrl,
      imageModel: settings.imageModel,
      hasApiKey: Boolean(settings.apiKey),
      hasImageApiKey: Boolean(settings.imageApiKey)
    });
    res.json(settings);
  } catch (error) {
    logError("settings", "settings:save_failed", {
      requestId: req.requestId,
      userId: req.user.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(400).json({ message: error instanceof Error ? error.message : "设置保存失败。" });
  }
});

app.post("/api/prompt-rewrite", async (req, res) => {
  try {
    const settings = await loadSettings(req.user.id);
    const result = await rewritePromptWithModel({
      settings,
      prompt: req.body?.prompt || "",
      instruction: req.body?.instruction || "",
      messages: Array.isArray(req.body?.messages) ? req.body.messages : []
    });
    logInfo("rewrite", "rewrite:completed", {
      requestId: req.requestId,
      userId: req.user.id,
      protocol: result.protocol,
      model: result.model
    });
    res.json(result);
  } catch (error) {
    logError("rewrite", "rewrite:failed", {
      requestId: req.requestId,
      userId: req.user.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(400).json({ message: error instanceof Error ? error.message : "提示词改写失败。" });
  }
});

app.get("/api/history", async (req, res) => {
  res.json(await loadHistory(req.user.id));
});

app.patch("/api/history/:id", async (req, res) => {
  const item = await updateHistoryItem(req.user.id, req.params.id, req.body || {});
  if (!item) {
    res.status(404).json({ message: "历史记录不存在。" });
    return;
  }
  res.json(item);
});

app.delete("/api/history/:id", async (req, res) => {
  const deleted = await deleteHistoryItem(req.user.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ message: "历史记录不存在。" });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/generate", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  const body = req.body || {};
  const settings = await loadSettings(req.user.id);
  const requestId = req.requestId || crypto.randomUUID().slice(0, 8);
  const userOutputDir = path.join(OUTPUT_DIR, req.user.id);
  const imageCallMode = settings.imageCallMode === "images_api" ? "images_api" : "responses_tool";
  const abortController = new AbortController();
  req.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });
  const referenceImages = Array.isArray(body.referenceImages)
    ? body.referenceImages.filter((image) => /^data:image\/[^;]+;base64,/.test(String(image?.dataUrl || "")))
    : [];

  const options = {
    baseUrl: imageCallMode === "images_api" ? settings.imageBaseUrl : settings.baseUrl,
    apiKey: imageCallMode === "images_api" ? settings.imageApiKey : settings.apiKey,
    model: body.model || settings.defaultModel,
    imageModel: settings.imageModel || DEFAULT_IMAGE_MODEL,
    imageCallMode,
    prompt: body.prompt || "",
    size: body.size || "auto",
    quality: body.quality || "auto",
    outputFormat: body.outputFormat || "png",
    outputCompression: Number(body.outputCompression ?? 90),
    background: body.background || "auto",
    moderation: body.moderation || "auto",
    n: normalizeImageCount(body.n),
    action: body.action || "auto",
    forceToolChoice: Boolean(body.forceToolChoice),
    referenceImages,
    timeoutSeconds: Number(body.timeoutSeconds ?? 600),
    maxRetries: Number(body.maxRetries ?? 1),
    abortSignal: abortController.signal,
    outputDir: userOutputDir,
    publicPathPrefix: `/generated/${req.user.id}`
  };

  logInfo("generate", "generate:received", {
    requestId,
    userId: req.user.id,
    model: options.model,
    imageModel: options.imageModel,
    imageCallMode: options.imageCallMode,
    size: options.size,
    quality: options.quality,
    outputFormat: options.outputFormat,
    n: options.n,
    referenceImages: options.referenceImages.length,
    forceToolChoice: options.forceToolChoice
  });

  try {
    for await (const event of generateImages(options)) {
      let outgoingEvent = event;
      if (event.type === "final") {
        const historyItem = await addHistoryItem(req.user.id, {
          status: "success",
          prompt: options.prompt,
          revisedPrompt: event.revisedPrompt || "",
          settings: options,
          referenceImages: options.referenceImages,
          images: event.images || [],
          partials: event.partials || []
        });
        outgoingEvent = { ...event, historyItem };
      }
      if (event.type === "response_log") {
        logInfo("generate", "generate:openai_response_body", {
          requestId,
          userId: req.user.id,
          endpoint: event.endpoint,
          imageCallMode: event.imageCallMode,
          attempt: event.attempt,
          statusCode: event.statusCode,
          statusText: event.statusText,
          requestPayload: event.requestPayload,
          responseBody: event.responseBody
        });
        continue;
      }
      if (event.type === "attempt_error_log") {
        logError("generate", "generate:attempt_failed", {
          requestId,
          userId: req.user.id,
          endpoint: event.endpoint,
          imageCallMode: event.imageCallMode,
          attempt: event.attempt,
          requestPayload: event.requestPayload,
          error: event.error
        });
        continue;
      }
      logInfo("generate", `generate:event:${event.type}`, {
        requestId,
        userId: req.user.id,
        ...(event.message ? { message: event.message } : {}),
        ...(event.endpoint ? { endpoint: event.endpoint } : {}),
        ...(event.imageCallMode ? { imageCallMode: event.imageCallMode } : {}),
        ...(event.requestPayload ? { requestPayload: event.requestPayload } : {}),
        ...(event.images ? { imageCount: event.images.length } : {}),
        ...(event.detail ? { detail: event.detail } : {})
      });
      res.write(`${JSON.stringify(outgoingEvent)}\n`);
    }

    logInfo("generate", "generate:completed", { requestId, userId: req.user.id });
    res.end();
  } catch (error) {
    logError("generate", "generate:failed", {
      requestId,
      userId: req.user.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.write(
      `${JSON.stringify({
        type: "error",
        message: error instanceof Error ? error.message : "生成失败。"
      })}\n`
    );
    res.end();
  }
});

app.get("*", async (req, res, next) => {
  try {
    if (path.extname(req.path)) {
      res.status(404).type("text/plain").send("Asset not found");
      return;
    }
    const indexPath = path.join(DIST_DIR, "index.html");
    await fs.access(indexPath);
    res.sendFile(indexPath);
  } catch {
    next();
  }
});

app.listen(port, () => {
  logInfo("server", "server:started", {
    port,
    root: path.relative(process.cwd(), path.resolve(__dirname, "..")),
    outputs: OUTPUT_DIR,
    defaultAdmin: defaultAdmin.username
  });
});
