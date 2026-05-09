import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_IMAGE_MODEL } from "./constants.js";
import { ensureUserDataDir, getUserDataDir } from "./settings-store.js";

const MAX_HISTORY_ITEMS = 200;

function normalizeImageCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(4, Math.max(1, count));
}

function normalizePartialImageCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(3, Math.max(0, count));
}

export function getUserHistoryPath(userId) {
  return path.join(getUserDataDir(userId), "history.json");
}

function normalizeImage(image) {
  return {
    name: String(image?.name || "generated image"),
    url: String(image?.url || ""),
    path: String(image?.path || "")
  };
}

function normalizeReferenceImage(image) {
  return {
    name: String(image?.name || "reference image"),
    sizeLabel: String(image?.sizeLabel || ""),
    dataUrl: String(image?.dataUrl || ""),
    url: String(image?.url || ""),
    path: String(image?.path || "")
  };
}

function normalizeSettings(settings = {}) {
  return {
    model: String(settings.model || ""),
    imageModel: String(settings.imageModel || DEFAULT_IMAGE_MODEL),
    imageCallMode: String(settings.imageCallMode || settings.image_call_mode || "responses_tool"),
    size: String(settings.size || "1024x1024"),
    quality: String(settings.quality || "auto"),
    outputFormat: String(settings.outputFormat || "png"),
    outputCompression: Number(settings.outputCompression ?? 90),
    background: String(settings.background || "auto"),
    moderation: String(settings.moderation || "auto"),
    n: normalizeImageCount(settings.n),
    partialImages: normalizePartialImageCount(settings.partialImages ?? settings.partial_images),
    action: String(settings.action || "auto"),
    forceToolChoice: Boolean(settings.forceToolChoice),
    timeoutSeconds: Number(settings.timeoutSeconds ?? 600),
    maxRetries: Number(settings.maxRetries ?? 1)
  };
}

export function normalizeHistoryItem(item) {
  return {
    id: String(item?.id || crypto.randomUUID()),
    createdAt: String(item?.createdAt || new Date().toISOString()),
    status: String(item?.status || "success"),
    prompt: String(item?.prompt || ""),
    revisedPrompt: String(item?.revisedPrompt || ""),
    settings: normalizeSettings(item?.settings),
    referenceImages: Array.isArray(item?.referenceImages) ? item.referenceImages.map(normalizeReferenceImage) : [],
    images: Array.isArray(item?.images) ? item.images.map(normalizeImage).filter((image) => image.url) : [],
    partials: Array.isArray(item?.partials) ? item.partials.map(normalizeImage).filter((image) => image.url) : [],
    favorite: Boolean(item?.favorite),
    note: String(item?.note || "")
  };
}

export async function loadHistory(userId) {
  await ensureUserDataDir(userId);
  try {
    const raw = await fs.readFile(getUserHistoryPath(userId), "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeHistoryItem).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveHistory(userId, items) {
  await ensureUserDataDir(userId);
  const normalized = items.map(normalizeHistoryItem).slice(0, MAX_HISTORY_ITEMS);
  await fs.writeFile(getUserHistoryPath(userId), `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

export async function addHistoryItem(userId, payload) {
  const current = await loadHistory(userId);
  const item = normalizeHistoryItem({
    ...payload,
    id: payload?.id || crypto.randomUUID(),
    createdAt: payload?.createdAt || new Date().toISOString()
  });
  await saveHistory(userId, [item, ...current.filter((entry) => entry.id !== item.id)]);
  return item;
}

export async function updateHistoryItem(userId, id, patch = {}) {
  const current = await loadHistory(userId);
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) {
    return null;
  }

  const next = [...current];
  next[index] = normalizeHistoryItem({
    ...next[index],
    favorite: patch.favorite ?? next[index].favorite,
    note: patch.note ?? next[index].note
  });
  await saveHistory(userId, next);
  return next[index];
}

export async function deleteHistoryItem(userId, id) {
  const current = await loadHistory(userId);
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) {
    return false;
  }
  await saveHistory(userId, next);
  return true;
}
