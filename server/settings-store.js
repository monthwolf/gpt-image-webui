import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_REWRITE_SYSTEM_PROMPT, DEFAULT_SETTINGS, USERS_DATA_DIR } from "./constants.js";

export function getUserDataDir(userId) {
  return path.join(USERS_DATA_DIR, String(userId));
}

export function getUserSettingsPath(userId) {
  return path.join(getUserDataDir(userId), "settings.json");
}

export async function ensureUserDataDir(userId) {
  await fs.mkdir(getUserDataDir(userId), { recursive: true });
}

function normalizeSettings(payload = {}) {
  const rewriteProtocol = String(payload.rewriteProtocol || payload.rewrite_protocol || DEFAULT_SETTINGS.rewriteProtocol).trim().toLowerCase();
  const imageCallMode = String(payload.imageCallMode || payload.image_call_mode || DEFAULT_SETTINGS.imageCallMode).trim();
  return {
    baseUrl: String(payload.baseUrl || payload.base_url || DEFAULT_SETTINGS.baseUrl).trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.baseUrl,
    apiKey: String(payload.apiKey || payload.api_key || "").trim(),
    defaultModel:
      String(payload.defaultModel || payload.default_model || DEFAULT_SETTINGS.defaultModel).trim() ||
      DEFAULT_SETTINGS.defaultModel,
    imageCallMode: imageCallMode === "images_api" ? "images_api" : DEFAULT_SETTINGS.imageCallMode,
    imageBaseUrl: String(payload.imageBaseUrl || payload.image_base_url || DEFAULT_SETTINGS.imageBaseUrl).trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.imageBaseUrl,
    imageApiKey: String(payload.imageApiKey || payload.image_api_key || "").trim(),
    imageModel: String(payload.imageModel || payload.image_model || DEFAULT_SETTINGS.imageModel).trim() || DEFAULT_SETTINGS.imageModel,
    rewriteProtocol: ["responses", "chat"].includes(rewriteProtocol) ? rewriteProtocol : DEFAULT_SETTINGS.rewriteProtocol,
    rewriteModel: String(payload.rewriteModel || payload.rewrite_model || "").trim(),
    rewriteBaseUrl: String(payload.rewriteBaseUrl || payload.rewrite_base_url || "").trim().replace(/\/+$/, ""),
    rewriteApiKey: String(payload.rewriteApiKey || payload.rewrite_api_key || "").trim(),
    rewriteSystemPrompt:
      String(payload.rewriteSystemPrompt || payload.rewrite_system_prompt || DEFAULT_REWRITE_SYSTEM_PROMPT).trim() ||
      DEFAULT_REWRITE_SYSTEM_PROMPT
  };
}

export async function loadSettings(userId) {
  await ensureUserDataDir(userId);
  try {
    const raw = await fs.readFile(getUserSettingsPath(userId), "utf-8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(userId, payload) {
  await ensureUserDataDir(userId);
  const settings = normalizeSettings(payload);
  await fs.writeFile(getUserSettingsPath(userId), `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
  return settings;
}
