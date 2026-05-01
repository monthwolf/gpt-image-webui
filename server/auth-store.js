import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  AUTH_COOKIE_NAME,
  AUTH_SECRET,
  AUTH_TOKEN_TTL_MS,
  DATA_DIR,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  HISTORY_PATH,
  INVITES_PATH,
  MIGRATION_STATE_PATH,
  OUTPUT_DIR,
  SETTINGS_PATH,
  USERS_PATH
} from "./constants.js";
import { normalizeHistoryItem, saveHistory } from "./history-store.js";
import { ensureUserDataDir, getUserDataDir, saveSettings } from "./settings-store.js";

const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64url(input) {
  return Buffer.from(input, "base64url").toString("utf-8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto
    .pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");
  return { salt, passwordHash: hash };
}

function verifyPassword(password, user) {
  const { passwordHash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(passwordHash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    canCreateInvites: user.role === "admin" || Boolean(user.canCreateInvites)
  };
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await ensureDataDir();
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export async function loadUsers() {
  await ensureDataDir();
  const users = await readJson(USERS_PATH, []);
  return Array.isArray(users) ? users : [];
}

async function saveUsers(users) {
  await writeJson(USERS_PATH, users);
  return users;
}

export async function loadInvites() {
  await ensureDataDir();
  const invites = await readJson(INVITES_PATH, []);
  return Array.isArray(invites) ? invites : [];
}

async function saveInvites(invites) {
  await writeJson(INVITES_PATH, invites);
  return invites;
}

export async function ensureAuthInitialized() {
  await ensureDataDir();
  let users = await loadUsers();
  let admin = users.find((user) => user.username === DEFAULT_ADMIN_USERNAME);

  if (!admin) {
    const password = hashPassword(DEFAULT_ADMIN_PASSWORD);
    admin = {
      id: crypto.randomUUID(),
      username: DEFAULT_ADMIN_USERNAME,
      role: "admin",
      canCreateInvites: true,
      createdAt: new Date().toISOString(),
      ...password
    };
    users = [admin, ...users];
  } else if (!admin.canCreateInvites) {
    admin.canCreateInvites = true;
  }
  await saveUsers(users);

  await ensureUserDataDir(admin.id);
  await migrateLegacyData(admin.id);
  return publicUser(admin);
}

export async function authenticateUser(username, password) {
  const users = await loadUsers();
  const user = users.find((entry) => entry.username.toLowerCase() === String(username || "").trim().toLowerCase());
  if (!user || !verifyPassword(password || "", user)) return null;
  return publicUser(user);
}

export async function findUserById(userId) {
  const users = await loadUsers();
  return publicUser(users.find((user) => user.id === userId));
}

export async function listUsers() {
  const users = await loadUsers();
  return users.map(publicUser);
}

export async function createUser(payload) {
  const username = String(payload?.username || "").trim();
  const password = String(payload?.password || "");
  if (!/^[a-zA-Z0-9_-]{2,32}$/.test(username)) {
    throw new Error("用户名只能包含字母、数字、下划线和短横线，长度 2-32。");
  }
  if (password.length < 6) {
    throw new Error("密码至少需要 6 位。");
  }

  const users = await loadUsers();
  if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    throw new Error("用户名已存在。");
  }

  const passwordFields = hashPassword(password);
  const role = payload?.role === "admin" ? "admin" : "user";
  const user = {
    id: crypto.randomUUID(),
    username,
    role,
    canCreateInvites: role === "admin" || Boolean(payload?.canCreateInvites),
    createdAt: new Date().toISOString(),
    ...passwordFields
  };
  await saveUsers([...users, user]);
  await ensureUserDataDir(user.id);
  return publicUser(user);
}

export async function updateUserInvitePermission(userId, canCreateInvites) {
  const users = await loadUsers();
  const user = users.find((entry) => entry.id === userId);
  if (!user) throw new Error("用户不存在。");
  user.canCreateInvites = user.role === "admin" ? true : Boolean(canCreateInvites);
  await saveUsers(users);
  return publicUser(user);
}

export async function changeOwnPassword(userId, currentPassword, nextPassword) {
  const users = await loadUsers();
  const user = users.find((entry) => entry.id === userId);
  if (!user) throw new Error("用户不存在。");
  if (!verifyPassword(currentPassword || "", user)) {
    throw new Error("当前密码不正确。");
  }
  if (String(nextPassword || "").length < 6) {
    throw new Error("新密码至少需要 6 位。");
  }
  const passwordFields = hashPassword(nextPassword);
  user.salt = passwordFields.salt;
  user.passwordHash = passwordFields.passwordHash;
  user.passwordUpdatedAt = new Date().toISOString();
  await saveUsers(users);
  return publicUser(user);
}

export async function registerUserWithInvite(payload) {
  const inviteCode = normalizeInviteCode(payload?.inviteCode);
  if (!inviteCode) throw new Error("请输入邀请码。");

  const invites = await loadInvites();
  const invite = invites.find((entry) => normalizeInviteCode(entry.code) === inviteCode);
  if (!invite) throw new Error("邀请码不存在。");
  if (invite.usedAt) throw new Error("邀请码已被使用。");
  if (invite.expiresAt && Date.now() > new Date(invite.expiresAt).getTime()) {
    throw new Error("邀请码已过期。");
  }

  const user = await createUser({ ...payload, role: "user", canCreateInvites: false });
  invite.usedAt = new Date().toISOString();
  invite.usedBy = user.id;
  await saveInvites(invites);
  return user;
}

export async function listInvites(requestUser) {
  const invites = await loadInvites();
  const users = await loadUsers();
  const userById = new Map(users.map((user) => [user.id, publicUser(user)]));
  const isAdmin = requestUser?.role === "admin";
  return invites
    .filter((invite) => isAdmin || invite.createdBy === requestUser?.id)
    .map((invite) => ({
      ...invite,
      createdByUser: userById.get(invite.createdBy) || null,
      usedByUser: userById.get(invite.usedBy) || null
    }))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function createInvite(requestUser) {
  if (!requestUser?.canCreateInvites && requestUser?.role !== "admin") {
    throw new Error("当前用户没有生成邀请码权限。");
  }
  const invites = await loadInvites();
  const invite = {
    id: crypto.randomUUID(),
    code: generateInviteCode(),
    createdBy: requestUser.id,
    createdAt: new Date().toISOString(),
    usedBy: null,
    usedAt: null
  };
  invites.unshift(invite);
  await saveInvites(invites);
  return invite;
}

function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 12; index += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

export function signSession(user) {
  const body = { userId: user.id, exp: Date.now() + AUTH_TOKEN_TTL_MS };
  const encoded = base64url(JSON.stringify(body));
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export async function verifySession(token) {
  const [encoded, signature] = String(token || "").split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(encoded).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const payload = JSON.parse(fromBase64url(encoded));
  if (!payload.userId || Date.now() > Number(payload.exp || 0)) return null;
  return findUserById(payload.userId);
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const pairs = raw.split(";").map((item) => item.trim()).filter(Boolean);
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (decodeURIComponent(pair.slice(0, index)) === name) {
      return decodeURIComponent(pair.slice(index + 1));
    }
  }
  return "";
}

export function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(AUTH_TOKEN_TTL_MS / 1000)}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

async function migrateLegacyData(adminUserId) {
  const state = await readJson(MIGRATION_STATE_PATH, {});
  if (state?.legacyToUsersMigrated) return;

  const userDir = getUserDataDir(adminUserId);
  await ensureUserDataDir(adminUserId);

  const legacySettings = await readJson(SETTINGS_PATH, null);
  if (legacySettings) await saveSettings(adminUserId, legacySettings);

  const legacyHistory = await readJson(HISTORY_PATH, null);
  if (Array.isArray(legacyHistory)) {
    const migratedHistory = [];
    for (const rawItem of legacyHistory) {
      const item = normalizeHistoryItem(rawItem);
      item.images = await migrateImages(adminUserId, item.images);
      item.partials = await migrateImages(adminUserId, item.partials);
      migratedHistory.push(item);
    }
    await saveHistory(adminUserId, migratedHistory);
  }

  await writeJson(MIGRATION_STATE_PATH, {
    legacyToUsersMigrated: true,
    migratedAt: new Date().toISOString(),
    adminUserId,
    userDir
  });
}

async function migrateImages(userId, images) {
  const userOutputDir = path.join(OUTPUT_DIR, userId);
  await fs.mkdir(userOutputDir, { recursive: true });

  const migrated = [];
  for (const image of images || []) {
    const filename = path.basename(image.name || image.url || image.path || "");
    if (!filename) {
      migrated.push(image);
      continue;
    }

    const sourcePath = image.path || path.join(OUTPUT_DIR, filename);
    const targetPath = path.join(userOutputDir, filename);
    try {
      await fs.access(sourcePath);
      try {
        await fs.rename(sourcePath, targetPath);
      } catch {
        await fs.copyFile(sourcePath, targetPath);
      }
    } catch {
      // Keep metadata even if the historical file no longer exists.
    }

    migrated.push({
      ...image,
      name: filename,
      path: targetPath,
      url: `/generated/${userId}/${filename}`
    });
  }
  return migrated;
}

export { AUTH_COOKIE_NAME };
