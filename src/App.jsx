import { useEffect, useMemo, useRef, useState } from "react";

const EMPTY_GENERATION = {
  prompt: "",
  model: "",
  size: "1024x1024",
  quality: "auto",
  outputFormat: "png",
  outputCompression: 90,
  background: "auto",
  moderation: "auto",
  n: 1,
  action: "auto",
  forceToolChoice: true,
  timeoutSeconds: 600,
  maxRetries: 1
};

const ASPECT_PRESETS = [
  { id: "1:1", label: "1:1", sizes: { "1k": "1024x1024", "2k": "2048x2048", "4k": "2880x2880" } },
  { id: "4:3", label: "4:3", sizes: { "1k": "1280x960", "2k": "2048x1536", "4k": "3200x2400" } },
  { id: "3:4", label: "3:4", sizes: { "1k": "960x1280", "2k": "1536x2048", "4k": "2400x3200" } },
  { id: "16:9", label: "16:9", sizes: { "1k": "1536x864", "2k": "2560x1440", "4k": "3840x2160" } },
  { id: "9:16", label: "9:16", sizes: { "1k": "864x1536", "2k": "1440x2560", "4k": "2160x3840" } }
];

const RESOLUTION_PRESETS = [
  { id: "1k", label: "1k" },
  { id: "2k", label: "2k" },
  { id: "4k", label: "4k" }
];

const DEFAULT_REWRITE_INSTRUCTION = "请优化这个提示词，使画面主体更清晰、构图更稳定、风格更一致，并补充适合图像生成的细节。";

function toast(type, message) {
  return { type, message, id: `${Date.now()}-${Math.random()}` };
}

function formatDate(value) {
  if (!value) return "未知时间";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function titleFromPrompt(prompt) {
  const text = String(prompt || "未命名生成").trim();
  return text.length > 42 ? `${text.slice(0, 42)}...` : text;
}

function sourceLabel(source) {
  return {
    current: "当前结果",
    partial: "中途预览",
    history: "历史记录",
    reference: "参考图"
  }[source] || source || "未知";
}

function imageUrlOf(image) {
  return image?.url || image?.dataUrl || "";
}

function clampImageCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(4, Math.max(1, count));
}

function hasActiveTextSelection() {
  const selection = window.getSelection?.();
  if (selection?.toString()) return true;
  const activeElement = document.activeElement;
  if (!activeElement || !["INPUT", "TEXTAREA"].includes(activeElement.tagName)) return false;
  return typeof activeElement.selectionStart === "number"
    && typeof activeElement.selectionEnd === "number"
    && activeElement.selectionStart !== activeElement.selectionEnd;
}

function shouldCloseFromBackdropClick(event) {
  return event.target === event.currentTarget && !hasActiveTextSelection();
}

function getSizeSelection(size) {
  const value = String(size || "");
  for (const aspect of ASPECT_PRESETS) {
    for (const [resolution, presetSize] of Object.entries(aspect.sizes)) {
      if (presetSize === value) {
        return { aspectId: aspect.id, resolutionId: resolution, custom: false };
      }
    }
  }
  return { aspectId: "custom", resolutionId: "custom", custom: true };
}

function getPresetSize(aspectId, resolutionId) {
  return ASPECT_PRESETS.find((item) => item.id === aspectId)?.sizes?.[resolutionId] || "1024x1024";
}

const ICON_PATHS = {
  sparkles: ["M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3z", "M5 18l.7 2 .7-2 2-.7-2-.7-.7-2-.7 2-2 .7 2 .7z"],
  settings: ["M4 7h16", "M4 17h16", "M8 5v4", "M16 15v4"],
  refresh: ["M20 12a8 8 0 0 1-13.7 5.6", "M4 12A8 8 0 0 1 17.7 6.4", "M17 2v5h-5", "M7 22v-5h5"],
  bug: ["M8 8h8v9a4 4 0 0 1-8 0V8z", "M9 3l2 2h2l2-2", "M4 13h4", "M16 13h4", "M5 19l3-2", "M19 19l-3-2"],
  logout: ["M10 17l5-5-5-5", "M15 12H3", "M21 3v18h-8"],
  copy: ["M8 8h10v12H8z", "M6 16H4V4h12v2"],
  trash: ["M5 7h14", "M10 11v6", "M14 11v6", "M7 7l1 14h8l1-14", "M9 7V4h6v3"],
  star: ["M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3z"],
  reuse: ["M7 7h9a4 4 0 0 1 0 8H8", "M10 4L7 7l3 3", "M14 20l3-3-3-3"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M20 14v6H4V4h6"],
  upload: ["M12 16V4", "M7 9l5-5 5 5", "M5 20h14"],
  wand: ["M4 20l10-10", "M13 5l6 6", "M16 2l.7 2 .7-2 2-.7-2-.7-.7-2-.7 2-2 .7 2 .7z"],
  send: ["M4 12l16-8-6 16-3-7-7-1z", "M11 13l9-9"],
  chevronLeft: ["M15 18l-6-6 6-6"],
  chevronRight: ["M9 18l6-6-6-6"],
  key: ["M14 10a4 4 0 1 0-3.3 3.9L7 17.5V20h2.5L11 18.5H13V16.5h2L17.1 14.4A4 4 0 0 0 14 10z", "M14 10h.01"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  plus: ["M12 5v14", "M5 12h14"]
};

function SvgIcon({ name }) {
  const paths = ICON_PATHS[name] || ICON_PATHS.sparkles;
  return (
    <svg className="svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths.map((path, index) => <path key={index} d={path} />)}
    </svg>
  );
}

function collectDetailImages(image) {
  if (!image) return [];
  const historyItem = image.historyItem;
  const resultImages = historyItem?.images?.length
    ? historyItem.images.map((item, index) => ({ ...item, source: "history", title: `结果图 ${index + 1}`, createdAt: historyItem.createdAt }))
    : imageUrlOf(image) ? [{ ...image, title: image.title || image.name || "当前图片" }] : [];
  const referenceImages = (historyItem?.referenceImages || image.referenceImages || []).map((item, index) => ({
    ...item,
    source: "reference",
    title: item.name || `参考图 ${index + 1}`,
    createdAt: historyItem?.createdAt || image.createdAt
  }));
  return [...resultImages, ...referenceImages].filter((item) => imageUrlOf(item));
}

function buildActivity(kind, message, detail = "") {
  return {
    id: `${Date.now()}-${Math.random()}`,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    kind,
    message,
    detail
  };
}

async function parseJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

export default function App() {
  const [auth, setAuth] = useState({ checked: false, user: null });
  const [loginForm, setLoginForm] = useState({ username: "admin", password: "" });
  const [registerForm, setRegisterForm] = useState({ username: "", password: "", inviteCode: "" });
  const [loginError, setLoginError] = useState("");
  const [settings, setSettings] = useState({
    baseUrl: "",
    apiKey: "",
    defaultModel: "gpt-5.5",
    imageCallMode: "responses_tool",
    imageBaseUrl: "",
    imageApiKey: "",
    imageModel: "gpt-image-2",
    rewriteProtocol: "responses",
    rewriteModel: "",
    rewriteBaseUrl: "",
    rewriteApiKey: "",
    rewriteSystemPrompt: ""
  });
  const [generation, setGeneration] = useState(EMPTY_GENERATION);
  const [presets, setPresets] = useState([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [referenceImages, setReferenceImages] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [partials, setPartials] = useState([]);
  const [results, setResults] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [detailImage, setDetailImage] = useState(null);
  const [previewImages, setPreviewImages] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("api");
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewritePrompt, setRewritePrompt] = useState("");
  const [rewriteInstruction, setRewriteInstruction] = useState(DEFAULT_REWRITE_INSTRUCTION);
  const [rewriteMessages, setRewriteMessages] = useState([]);
  const [rewriteResult, setRewriteResult] = useState("");
  const [rewriteError, setRewriteError] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [revisedPrompt, setRevisedPrompt] = useState("");
  const [requestPayload, setRequestPayload] = useState("");
  const [responsePayload, setResponsePayload] = useState("");
  const [rewriteRequestPayload, setRewriteRequestPayload] = useState("");
  const [rewriteResponsePayload, setRewriteResponsePayload] = useState("");
  const [activityFeed, setActivityFeed] = useState([]);
  const [status, setStatus] = useState(toast("info", "正在检查登录状态。"));
  const [notifications, setNotifications] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: "", password: "" });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState("");
  const [userAdminError, setUserAdminError] = useState("");
  const [invites, setInvites] = useState([]);
  const [inviteError, setInviteError] = useState("");
  const generateAbortRef = useRef(null);

  function pushActivity(kind, message, detail = "") {
    setActivityFeed((current) => [buildActivity(kind, message, detail), ...current].slice(0, 80));
  }

  useEffect(() => {
    checkAuth();
    return () => {
      generateAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!status?.message || !auth.checked) return undefined;
    const item = { ...status, id: status.id || `${Date.now()}-${Math.random()}` };
    setNotifications((current) => [item, ...current].slice(0, 4));
    const timer = window.setTimeout(() => {
      setNotifications((current) => current.filter((entry) => entry.id !== item.id));
    }, status.type === "error" ? 4200 : 2600);
    return () => window.clearTimeout(timer);
  }, [auth.checked, status]);

  useEffect(() => {
    function closePreview(event) {
      if (event.key === "Escape") {
        if (previewImages.length) {
          setPreviewImages([]);
        } else if (rewriteOpen) {
          setRewriteOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (detailImage) {
          setDetailImage(null);
        }
      } else if (event.key === "ArrowLeft" && previewImages.length > 1) {
        setPreviewIndex((current) => (current - 1 + previewImages.length) % previewImages.length);
      } else if (event.key === "ArrowRight" && previewImages.length > 1) {
        setPreviewIndex((current) => (current + 1) % previewImages.length);
      }
    }
    window.addEventListener("keydown", closePreview);
    return () => window.removeEventListener("keydown", closePreview);
  }, [detailImage, previewImages.length, rewriteOpen, settingsOpen]);

  async function checkAuth() {
    try {
      const payload = await parseJson(await fetch("/api/auth/me"));
      setAuth({ checked: true, user: payload.user || null });
      if (payload.user) {
        await loadWorkspace();
      } else {
        setStatus(toast("info", "请登录后使用工作台。"));
      }
    } catch (error) {
      setAuth({ checked: true, user: null });
      setStatus(toast("error", error.message));
    }
  }

  async function loadWorkspace() {
    const [metaPayload, historyPayload] = await Promise.all([
      parseJson(await fetch("/api/meta")),
      parseJson(await fetch("/api/history"))
    ]);
    const presetList = metaPayload.presets || [];
    const defaultPreset = presetList[0] || null;
    const activeSettings = metaPayload.settings || settings;

    if (metaPayload.user) {
      setAuth((current) => ({ ...current, user: metaPayload.user }));
    }
    setPresets(presetList);
    setSelectedPreset(defaultPreset?.id || "");
    setSettings(activeSettings);
    setHistory(Array.isArray(historyPayload) ? historyPayload : []);
    setGeneration((current) => ({
      ...current,
      prompt: current.prompt || defaultPreset?.prompt || ""
    }));
    setStatus(toast("success", "工作台已加载。"));
    pushActivity("system", "工作台初始化完成。", `历史记录：${Array.isArray(historyPayload) ? historyPayload.length : 0} 条`);
    if (metaPayload.user?.role === "admin") {
      loadUsers();
    }
    if (metaPayload.user?.canCreateInvites) {
      loadInvites();
    }
  }

  async function loadUsers() {
    try {
      setUsers(await parseJson(await fetch("/api/users")));
    } catch {
      setUsers([]);
    }
  }

  async function loadInvites() {
    try {
      setInvites(await parseJson(await fetch("/api/invites")));
    } catch {
      setInvites([]);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const payload = await parseJson(
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(loginForm)
        })
      );
      setAuth({ checked: true, user: payload.user });
      await loadWorkspace();
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    setLoginError("");
    try {
      const payload = await parseJson(
        await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registerForm)
        })
      );
      setAuth({ checked: true, user: payload.user });
      await loadWorkspace();
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuth({ checked: true, user: null });
    setHistory([]);
    setResults([]);
    setPartials([]);
    setSelectedImage(null);
    setDetailImage(null);
    setPreviewImages([]);
    setStatus(toast("info", "已退出登录。"));
  }

  const filteredHistory = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    return history.filter((item) => {
      if (favoritesOnly && !item.favorite) return false;
      if (!query) return true;
      return [item.prompt, item.revisedPrompt, item.note, item.settings?.model, item.settings?.imageModel]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [favoritesOnly, history, historyQuery]);

  const galleryItems = useMemo(() => {
    const findHistoryForImage = (image) => {
      const imageUrl = imageUrlOf(image);
      if (!imageUrl) return null;
      return filteredHistory.find((item) =>
        [...(item.images || []), ...(item.partials || [])].some((savedImage) => imageUrlOf(savedImage) === imageUrl)
      ) || null;
    };
    const currentItems = [
      ...results.map((image, index) => {
        const historyItem = findHistoryForImage(image);
        return {
          ...image,
          id: `current-${image.url || image.name || index}`,
          source: "current",
          title: `当前结果 ${index + 1}`,
          prompt: historyItem?.prompt || generation.prompt,
          revisedPrompt: historyItem?.revisedPrompt || revisedPrompt,
          settings: historyItem?.settings || generation,
          referenceImages: historyItem?.referenceImages || referenceImages,
          historyItem,
          createdAt: historyItem?.createdAt || new Date().toISOString()
        };
      })
    ];
    const historyItems = filteredHistory.flatMap((item) =>
      (item.images || []).map((image, index) => ({
        ...image,
        id: `${item.id}-${image.url || image.name || index}`,
        source: "history",
        title: titleFromPrompt(item.prompt),
        prompt: item.prompt,
        revisedPrompt: item.revisedPrompt,
        settings: item.settings,
        referenceImages: item.referenceImages || [],
        createdAt: item.createdAt,
        favorite: item.favorite,
        historyItem: item
      }))
    );
    return [...currentItems, ...historyItems];
  }, [filteredHistory, generation, referenceImages, results, revisedPrompt]);

  function selectImage(item) {
    setSelectedImage(item);
    setDetailImage(item);
  }

  function openPreview(images, index = 0) {
    const nextImages = images.filter((item) => imageUrlOf(item));
    if (!nextImages.length) return;
    setPreviewImages(nextImages);
    setPreviewIndex(Math.min(Math.max(index, 0), nextImages.length - 1));
  }

  function openRewriteDialog() {
    setRewritePrompt(generation.prompt);
    setRewriteInstruction((current) => current || DEFAULT_REWRITE_INSTRUCTION);
    setRewriteError("");
    setRewriteOpen(true);
  }

  async function handlePromptRewrite(event) {
    event.preventDefault();
    setRewriteError("");
    setIsRewriting(true);
    const userMessage = [
      "修改要求：",
      rewriteInstruction.trim() || DEFAULT_REWRITE_INSTRUCTION,
      "",
      "待改写提示词：",
      rewritePrompt.trim()
    ].join("\n");
    try {
      const payload = await parseJson(
        await fetch("/api/prompt-rewrite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: rewritePrompt,
            instruction: rewriteInstruction,
            messages: rewriteMessages
          })
        })
      );
      setRewriteResult(payload.text || "");
      setRewriteMessages((current) => [
        ...current,
        { role: "user", content: userMessage },
        { role: "assistant", content: payload.text || "" }
      ]);
      setRewriteRequestPayload(JSON.stringify(payload.requestPayload || {}, null, 2));
      setRewriteResponsePayload(JSON.stringify(payload.responsePayload || {}, null, 2));
      setStatus(toast("success", "提示词改写完成。"));
      pushActivity("rewrite", "提示词改写完成。", `${payload.protocol || settings.rewriteProtocol} / ${payload.model || settings.rewriteModel}`);
    } catch (error) {
      setRewriteError(error.message);
      setStatus(toast("error", error.message));
      pushActivity("error", "提示词改写失败。", error.message);
    } finally {
      setIsRewriting(false);
    }
  }

  function applyRewriteResult() {
    if (!rewriteResult) return;
    handleFieldChange("prompt", rewriteResult);
    setRewriteOpen(false);
    setStatus(toast("success", "已将改写结果写入提示词。"));
  }

  function continueRewriteFromResult() {
    if (!rewriteResult) return;
    setRewritePrompt(rewriteResult);
    setRewriteInstruction("请继续优化这版提示词。");
  }

  function handleFieldChange(field, value) {
    setGeneration((current) => ({ ...current, [field]: value }));
  }

  function handlePresetChange(id) {
    setSelectedPreset(id);
    const preset = presets.find((item) => item.id === id);
    if (preset) handleFieldChange("prompt", preset.prompt);
  }

  async function handleReferenceUpload(event) {
    const files = Array.from(event.target.files || []);
    const nextImages = await Promise.all(
      files.map(async (file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        sizeLabel: `${Math.max(1, Math.round(file.size / 1024))} KB`,
        dataUrl: await fileToDataUrl(file)
      }))
    );
    setReferenceImages((current) => [...current, ...nextImages]);
    event.target.value = "";
  }

  async function handleSaveSettings() {
    try {
      const payload = await parseJson(
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings)
        })
      );
      setSettings(payload);
      setStatus(toast("success", "设置已保存。"));
    } catch (error) {
      setStatus(toast("error", error.message));
    }
  }

  async function refreshGallery() {
    try {
      const historyPayload = await parseJson(await fetch("/api/history"));
      setHistory(Array.isArray(historyPayload) ? historyPayload : []);
      setStatus(toast("success", "画廊已刷新。"));
      pushActivity("system", "画廊历史已手动刷新。", `历史记录：${Array.isArray(historyPayload) ? historyPayload.length : 0} 条`);
    } catch (error) {
      setStatus(toast("error", error.message));
      pushActivity("error", "画廊刷新失败。", error.message);
    }
  }

  async function handleGenerate() {
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    setIsGenerating(true);
    setPartials([]);
    setResults([]);
    setRevisedPrompt("");
    setRequestPayload("");
    setResponsePayload("");
    setStatus(toast("info", "生成任务已提交。"));
    setDockCollapsed(false);
    pushActivity("generate", "开始生成。", `${settings.defaultModel} / ${settings.imageModel} / ${generation.size}`);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...generation, referenceImages }),
        signal: controller.signal
      });
      if (response.status === 401) {
        setAuth({ checked: true, user: null });
        throw new Error("登录已过期，请重新登录。");
      }
      if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "request_ready") {
            const debugPayload = {
              endpoint: event.endpoint,
              imageCallMode: event.imageCallMode,
              body: event.requestPayload
            };
            setRequestPayload(JSON.stringify(debugPayload, null, 2));
            pushActivity("request", "request body ready", JSON.stringify(debugPayload, null, 2));
            continue;
            pushActivity("request", "请求体已准备完成。", JSON.stringify(event.requestPayload, null, 2));
          } else if (event.type === "status") {
            setStatus(toast("info", event.message));
            pushActivity("status", event.message);
          } else if (event.type === "partial") {
            setPartials(event.images || []);
            setStatus(toast("info", event.message || "已收到预览图。"));
          } else if (event.type === "final") {
            setPartials(event.partials || []);
            setResults(event.images || []);
            setRevisedPrompt(event.revisedPrompt || "");
            setResponsePayload(JSON.stringify(event.responsePayload || {}, null, 2));
            setStatus(toast("success", `生成完成，得到 ${event.images?.length || 0} 张结果图。`));
            if (event.historyItem) {
              setHistory((current) => [event.historyItem, ...current.filter((item) => item.id !== event.historyItem.id)]);
            }
            if (event.images?.[0]) {
              setSelectedImage({
                ...event.images[0],
                source: "current",
                prompt: generation.prompt,
                revisedPrompt: event.revisedPrompt,
                settings: generation,
                referenceImages: event.historyItem?.referenceImages || referenceImages,
                historyItem: event.historyItem
              });
            }
            pushActivity("result", "生成完成。", `结果图：${event.images?.length || 0} 张`);
          } else if (event.type === "error") {
            throw new Error(event.message || "生成失败。");
          }
        }
      }
    } catch (error) {
      setDebugOpen(true);
      if (controller.signal.aborted) {
        setStatus(toast("info", "生成任务已取消。"));
        pushActivity("status", "生成任务已取消。");
      } else {
      setStatus(toast("error", error.message));
      pushActivity("error", "生成失败。", error.message);
    }
  } finally {
      if (generateAbortRef.current === controller) {
        generateAbortRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  function cancelGenerate() {
    generateAbortRef.current?.abort();
    setStatus(toast("info", "正在取消生成任务。"));
  }

  function applyHistoryItem(item) {
    setGeneration((current) => ({
      ...current,
      ...EMPTY_GENERATION,
      ...(item.settings || {}),
      prompt: item.prompt || current.prompt
    }));
    setResults(item.images || []);
    setPartials(item.partials || []);
    setReferenceImages(item.referenceImages || []);
    setRevisedPrompt(item.revisedPrompt || "");
    setSelectedImage(item.images?.[0] ? { ...item.images[0], source: "history", historyItem: item, prompt: item.prompt, settings: item.settings, referenceImages: item.referenceImages || [] } : null);
    setDetailImage(null);
    setDockCollapsed(false);
  }

  async function toggleFavorite(item) {
    const payload = await parseJson(
      await fetch(`/api/history/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: !item.favorite })
      })
    );
    setHistory((current) => current.map((entry) => (entry.id === payload.id ? payload : entry)));
  }

  async function deleteHistory(item) {
    await parseJson(await fetch(`/api/history/${item.id}`, { method: "DELETE" }));
    setHistory((current) => current.filter((entry) => entry.id !== item.id));
  }

  async function copyText(text, message = "已复制。") {
    await navigator.clipboard.writeText(text || "");
    setStatus(toast("success", message));
  }

  function dismissNotification(id) {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }

  async function createNewUser(event) {
    event.preventDefault();
    setUserAdminError("");
    try {
      await parseJson(
        await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newUser)
        })
      );
      setNewUser({ username: "", password: "" });
      await loadUsers();
      setStatus(toast("success", "用户已创建。"));
    } catch (error) {
      setUserAdminError(error.message);
      setStatus(toast("error", error.message));
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordError("");
    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setPasswordError("两次输入的新密码不一致。");
      return;
    }
    try {
      await parseJson(
        await fetch("/api/users/me/password", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: passwordForm.currentPassword,
            nextPassword: passwordForm.nextPassword
          })
        })
      );
      setPasswordForm({ currentPassword: "", nextPassword: "", confirmPassword: "" });
      setStatus(toast("success", "密码已修改。"));
    } catch (error) {
      setPasswordError(error.message);
      setStatus(toast("error", error.message));
    }
  }

  async function toggleUserInvitePermission(userEntry) {
    setUserAdminError("");
    try {
      const payload = await parseJson(
        await fetch(`/api/users/${userEntry.id}/invite-permission`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ canCreateInvites: !userEntry.canCreateInvites })
        })
      );
      setUsers((current) => current.map((entry) => (entry.id === payload.id ? payload : entry)));
      setStatus(toast("success", "用户邀请码权限已更新。"));
    } catch (error) {
      setUserAdminError(error.message);
      setStatus(toast("error", error.message));
    }
  }

  async function generateInvite() {
    setInviteError("");
    try {
      const invite = await parseJson(await fetch("/api/invites", { method: "POST" }));
      setInvites((current) => [invite, ...current]);
      setStatus(toast("success", "邀请码已生成。"));
    } catch (error) {
      setInviteError(error.message);
      setStatus(toast("error", error.message));
    }
  }

  if (!auth.checked) return <div className="loading-screen">正在加载工作台...</div>;
  if (!auth.user) {
    return (
      <LoginScreen
        form={loginForm}
        setForm={setLoginForm}
        registerForm={registerForm}
        setRegisterForm={setRegisterForm}
        error={loginError}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div>
          <span className="eyebrow">Gallery First Workbench</span>
          <h1>图像生成工作台</h1>
        </div>
        <div className="topbar-actions">
          <span className={`status-pill ${status.type}`}>{status.message}</span>
          <span className="user-pill">{auth.user.username}</span>
          <button type="button" onClick={handleLogout}><SvgIcon name="logout" />退出</button>
        </div>
      </header>

      <main className={`gallery-workspace ${dockCollapsed ? "dock-collapsed" : ""}`}>
        <section className="gallery-stage">
          <div className="gallery-toolbar">
            <div className="gallery-toolbar-title">
              <span className="eyebrow">Gallery</span>
              <strong>结果与历史</strong>
              <small>{galleryItems.length} 张图片 / {history.length} 条历史</small>
            </div>
            <div className="search-box">
              <input value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="搜索提示词、模型、备注" />
              <button type="button" className={favoritesOnly ? "active" : ""} onClick={() => setFavoritesOnly((value) => !value)}>
                {favoritesOnly ? "全部历史" : "只看收藏"}
              </button>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="active" onClick={() => setDockCollapsed(false)}><SvgIcon name="sparkles" />生成</button>
              <button type="button" onClick={() => setSettingsOpen(true)}><SvgIcon name="settings" />设置</button>
              <button type="button" className="icon-button" aria-label="刷新画廊" title="刷新画廊" onClick={refreshGallery}><SvgIcon name="refresh" /></button>
              <button type="button" className={debugOpen ? "active" : ""} onClick={() => setDebugOpen((value) => !value)}><SvgIcon name="bug" />调试</button>
            </div>
          </div>
          <GalleryGrid
            items={galleryItems}
            selected={selectedImage}
            onSelect={selectImage}
            onApply={applyHistoryItem}
            onFavorite={toggleFavorite}
            onDelete={deleteHistory}
            onCopy={copyText}
          />
        </section>

        <div className={`side-dock-wrap ${dockCollapsed ? "collapsed" : ""}`}>
          <button
            type="button"
            className="dock-edge-toggle"
            aria-label={dockCollapsed ? "展开右侧栏" : "折叠右侧栏"}
            onClick={() => setDockCollapsed((value) => !value)}
          >
            <span aria-hidden="true"><SvgIcon name={dockCollapsed ? "chevronLeft" : "chevronRight"} /></span>
          </button>
          {!dockCollapsed ? (
            <aside className="side-dock" aria-label="工作台控制面板">
              <ControlDock
                status={status}
                isGenerating={isGenerating}
                resultCount={results.length}
                generation={{ ...generation, imageModel: settings.imageModel, imageCallMode: settings.imageCallMode }}
                debugOpen={debugOpen}
                setDebugOpen={setDebugOpen}
              >
                <ComposePanel
                  presets={presets}
                  selectedPreset={selectedPreset}
                  onPresetChange={handlePresetChange}
                  generation={generation}
                  onFieldChange={handleFieldChange}
                  referenceImages={referenceImages}
                  onReferenceUpload={handleReferenceUpload}
                  onRemoveReference={(id) => setReferenceImages((current) => current.filter((item) => item.id !== id))}
                  onClearReferences={() => setReferenceImages([])}
                  onGenerate={handleGenerate}
                  onCancelGenerate={cancelGenerate}
                  isGenerating={isGenerating}
                  onCopy={copyText}
                  rewriteEnabled={Boolean(settings.rewriteModel)}
                  onOpenRewrite={openRewriteDialog}
                  revisedPrompt={revisedPrompt}
                />
              </ControlDock>
            </aside>
          ) : null}
        </div>
      </main>

      {settingsOpen ? (
        <SettingsModal
          activeTab={settingsTab}
          setActiveTab={setSettingsTab}
          settings={settings}
          setSettings={setSettings}
          onSave={handleSaveSettings}
          user={auth.user}
          users={users}
          newUser={newUser}
          setNewUser={setNewUser}
          onCreateUser={createNewUser}
          passwordForm={passwordForm}
          setPasswordForm={setPasswordForm}
          passwordError={passwordError}
          onChangePassword={changePassword}
          userAdminError={userAdminError}
          onToggleInvitePermission={toggleUserInvitePermission}
          invites={invites}
          inviteError={inviteError}
          onGenerateInvite={generateInvite}
          onCopy={copyText}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {detailImage ? (
        <ImageDetailModal
          image={detailImage}
          onClose={() => setDetailImage(null)}
          onCopy={copyText}
          onApply={applyHistoryItem}
          onPreview={openPreview}
        />
      ) : null}
      {previewImages.length ? (
        <ImagePreviewOverlay
          images={previewImages}
          activeIndex={previewIndex}
          setActiveIndex={setPreviewIndex}
          onClose={() => setPreviewImages([])}
        />
      ) : null}
      {rewriteOpen ? (
        <PromptRewriteDialog
          settings={settings}
          prompt={rewritePrompt}
          setPrompt={setRewritePrompt}
          instruction={rewriteInstruction}
          setInstruction={setRewriteInstruction}
          messages={rewriteMessages}
          result={rewriteResult}
          error={rewriteError}
          isLoading={isRewriting}
          onSubmit={handlePromptRewrite}
          onApply={applyRewriteResult}
          onCopy={copyText}
          onContinue={continueRewriteFromResult}
          onClose={() => setRewriteOpen(false)}
        />
      ) : null}
      <NotificationStack items={notifications} onDismiss={dismissNotification} />

      <details className="debug-drawer" open={debugOpen} onToggle={(event) => setDebugOpen(event.currentTarget.open)}>
        <summary>调试输出、活动日志与模型改写提示词</summary>
        <div className="debug-grid">
          <DebugBlock title="模型改写提示词" content={revisedPrompt || "暂无改写提示词。"} />
          <DebugBlock title="请求体" content={requestPayload || "请求体会在发起生成后显示。"} />
          <DebugBlock title="响应体" content={responsePayload || "响应体会在接口返回后显示。"} />
          <DebugBlock title="改写请求体" content={rewriteRequestPayload || "改写请求体会在发起改写后显示。"} />
          <DebugBlock title="改写响应体" content={rewriteResponsePayload || "改写响应体会在接口返回后显示。"} />
          <div className="debug-card">
            <h3>活动日志</h3>
            <div className="activity-feed">
              {activityFeed.length ? activityFeed.map((item) => (
                <article key={item.id} className={`activity-item ${item.kind}`}>
                  <div><span>{item.kind}</span><time>{item.time}</time></div>
                  <strong>{item.message}</strong>
                  {item.detail ? <pre>{item.detail}</pre> : null}
                </article>
              )) : <p>暂无活动日志。</p>}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function LoginScreen({ form, setForm, registerForm, setRegisterForm, error, onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={mode === "login" ? onLogin : onRegister}>
        <span className="eyebrow">Multi-user Studio</span>
        <h1>{mode === "login" ? "登录图像生成工作台" : "使用邀请码注册"}</h1>
        <p>{mode === "login" ? "默认管理员账号为 admin，默认密码为 admin123456。首次部署后请尽快修改部署环境中的默认密码。" : "输入管理员或被授权用户提供的邀请码创建独立账号。"}</p>
        <div className="mode-switch">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>登录</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>邀请码注册</button>
        </div>
        <label className="field">
          <span>用户名</span>
          <input
            value={mode === "login" ? form.username : registerForm.username}
            onChange={(event) => {
              const setter = mode === "login" ? setForm : setRegisterForm;
              setter((current) => ({ ...current, username: event.target.value }));
            }}
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            value={mode === "login" ? form.password : registerForm.password}
            onChange={(event) => {
              const setter = mode === "login" ? setForm : setRegisterForm;
              setter((current) => ({ ...current, password: event.target.value }));
            }}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
        </label>
        {mode === "register" ? (
          <label className="field">
            <span>邀请码</span>
            <input value={registerForm.inviteCode} onChange={(event) => setRegisterForm((current) => ({ ...current, inviteCode: event.target.value }))} autoComplete="off" />
          </label>
        ) : null}
        {error ? <div className="form-error">{error}</div> : null}
        <button className="primary-button" type="submit">{mode === "login" ? "登录" : "注册并登录"}</button>
      </form>
    </main>
  );
}

function GalleryGrid({ items, selected, onSelect, onApply, onFavorite, onDelete, onCopy }) {
  if (!items.length) {
    return <div className="gallery-empty">还没有符合条件的图片。打开右侧“生成”面板开始创作，或调整画廊搜索与收藏筛选。</div>;
  }
  return (
    <div className="masonry-gallery">
      {items.map((item) => (
        <article key={item.id} className={`art-tile ${selected?.id === item.id ? "selected" : ""} ${item.favorite ? "favorite" : ""}`} onClick={() => onSelect(item)}>
          <button type="button" className="art-image-button" onClick={() => onSelect(item)} aria-label="查看图片详情">
            <img src={item.url || item.dataUrl} alt={item.title || item.name || "生成图片"} loading="lazy" decoding="async" />
          </button>
          <button type="button" className="art-meta-button" onClick={() => onSelect(item)} aria-label="查看图片详情">
            <strong>{item.title || item.name}</strong>
            <small>{formatDate(item.createdAt)}</small>
            <small>{sourceLabel(item.source)} / {item.settings?.imageModel || "gpt-image-2"}</small>
          </button>
          {item.historyItem ? (
            <div className="art-actions" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={(event) => { event.stopPropagation(); onApply(item.historyItem); }}><SvgIcon name="reuse" />复用</button>
              <button type="button" className={item.favorite ? "favorite-button active" : "favorite-button"} title={item.favorite ? "取消收藏" : "收藏这张图片"} onClick={(event) => { event.stopPropagation(); onFavorite(item.historyItem); }}><SvgIcon name="star" />{item.favorite ? "已收藏" : "收藏"}</button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onCopy(item.prompt, "已复制历史提示词。"); }}><SvgIcon name="copy" />复制</button>
              <button type="button" className="danger-button" onClick={(event) => { event.stopPropagation(); onDelete(item.historyItem); }}><SvgIcon name="trash" />删除</button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ControlDock({ children, status, isGenerating, resultCount, generation, debugOpen, setDebugOpen }) {
  return (
    <div className="control-dock">
      <div className="dock-top">
        <div>
          <h2>生成</h2>
          <p>{status.message}</p>
        </div>
        <div className="dock-top-actions">
          <button type="button" className={`debug-toggle ${debugOpen ? "active" : ""}`} onClick={() => setDebugOpen((value) => !value)}><SvgIcon name="bug" />调试</button>
        </div>
      </div>
      <GenerationStatusCard
        isGenerating={isGenerating}
        status={status}
        resultCount={resultCount}
        generation={generation}
      />
      <div className="dock-content">{children}</div>
    </div>
  );
}

function GenerationStatusCard({ isGenerating, status, resultCount, generation }) {
  return (
    <section className={`generation-status-card ${isGenerating ? "running" : status.type}`}>
      <div>
        <span>{isGenerating ? "Generating" : "Status"}</span>
        <strong>{isGenerating ? "生成任务进行中" : status.message}</strong>
      </div>
      <div className="generation-status-grid">
        <span><small>图像模型</small><b>{generation.imageModel || "gpt-image-2"}</b></span>
        <span><small>方式</small><b>{generation.imageCallMode === "images_api" ? "Images API" : "GPT Tool"}</b></span>
        <span><small>尺寸</small><b>{generation.size || "auto"}</b></span>
        <span><small>数量</small><b>{clampImageCount(generation.n)} 张</b></span>
      </div>
    </section>
  );
}

function ComposePanel(props) {
  const { generation, onFieldChange } = props;
  const sizeSelection = getSizeSelection(generation.size);
  const activeAspect = sizeSelection.custom ? "1:1" : sizeSelection.aspectId;
  const activeResolution = sizeSelection.custom ? "1k" : sizeSelection.resolutionId;
  function updateAspect(aspectId) {
    onFieldChange("size", getPresetSize(aspectId, activeResolution));
  }
  function updateResolution(resolutionId) {
    onFieldChange("size", getPresetSize(activeAspect, resolutionId));
  }
  return (
    <section className="dock-panel compose-panel">
      <PanelHeader kicker="Create" title="生成配置" description="先写提示词，再确认模型、尺寸和参考图。" />
      <PanelSection title="提示词">
        <label className="field">
          <span>模板</span>
          <select value={props.selectedPreset} onChange={(event) => props.onPresetChange(event.target.value)}>
            {props.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.title}</option>)}
          </select>
        </label>
        <label className="field">
          <span>提示词</span>
          <textarea rows={9} value={generation.prompt} onChange={(event) => onFieldChange("prompt", event.target.value)} placeholder="描述主体、风格、构图、镜头语言、文字要求和禁止项。" />
        </label>
        <div className="inline-actions">
          <small>{generation.prompt.length} 字符</small>
          <button type="button" onClick={() => props.onCopy(generation.prompt, "已复制提示词。")}><SvgIcon name="copy" />复制</button>
          <button
            type="button"
            disabled={!props.rewriteEnabled || !generation.prompt.trim()}
            onClick={props.onOpenRewrite}
            title={props.rewriteEnabled ? "打开提示词改写助手" : "请先在设置中填写提示词改写模型"}
          >
            <SvgIcon name="wand" />使用改写
          </button>
          {props.revisedPrompt ? <button type="button" onClick={() => onFieldChange("prompt", props.revisedPrompt)}>使用生图改写</button> : null}
        </div>
      </PanelSection>

      <PanelSection title="模型与尺寸">
        <div className="size-control-group">
          <span>图像比例</span>
          <div className="size-pills">
            {ASPECT_PRESETS.map((item) => <button key={item.id} type="button" className={!sizeSelection.custom && sizeSelection.aspectId === item.id ? "active" : ""} onClick={() => updateAspect(item.id)}>{item.label}</button>)}
          </div>
        </div>
        <div className="size-control-group">
          <span>分辨率</span>
          <div className="size-pills resolution-pills">
            {RESOLUTION_PRESETS.map((item) => <button key={item.id} type="button" className={!sizeSelection.custom && sizeSelection.resolutionId === item.id ? "active" : ""} onClick={() => updateResolution(item.id)}>{item.label}</button>)}
          </div>
        </div>
        <div className="field-grid">
          <label className="field"><span>自定义尺寸</span><input value={generation.size} onChange={(event) => onFieldChange("size", event.target.value)} placeholder="例如 1024x1024" /></label>
          <label className="field"><span>质量</span><select value={generation.quality} onChange={(event) => onFieldChange("quality", event.target.value)}><option value="auto">auto</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
        </div>
      </PanelSection>

      <PanelSection title="输出设置">
        <div className="field-grid">
          <label className="field"><span>格式</span><select value={generation.outputFormat} onChange={(event) => onFieldChange("outputFormat", event.target.value)}><option value="png">png</option><option value="jpeg">jpeg</option><option value="webp">webp</option></select></label>
          <label className="field"><span>背景</span><select value={generation.background} onChange={(event) => onFieldChange("background", event.target.value)}><option value="auto">auto</option><option value="opaque">opaque</option><option value="transparent">transparent</option></select></label>
          <label className="field"><span>动作</span><select value={generation.action} onChange={(event) => onFieldChange("action", event.target.value)}><option value="auto">auto</option><option value="generate">generate</option><option value="edit">edit</option></select></label>
          <label className="field"><span>审核</span><select value={generation.moderation} onChange={(event) => onFieldChange("moderation", event.target.value)}><option value="auto">auto</option><option value="low">low</option></select></label>
        </div>
        <label className="field"><span>结果图数量：{clampImageCount(generation.n)} 张</span><input type="range" min="1" max="4" step="1" value={clampImageCount(generation.n)} onChange={(event) => onFieldChange("n", clampImageCount(event.target.value))} /></label>
        <label className="field"><span>压缩率：{generation.outputCompression}</span><input type="range" min="0" max="100" value={generation.outputCompression} onChange={(event) => onFieldChange("outputCompression", Number(event.target.value))} /></label>
      </PanelSection>

      <details className="soft-details">
        <summary>参考图与高级参数</summary>
        <div className="details-body">
          <div className="reference-actions">
            <label className="upload-button"><input type="file" accept="image/*" multiple onChange={props.onReferenceUpload} /><SvgIcon name="upload" />添加参考图</label>
            <button type="button" onClick={props.onClearReferences} disabled={!props.referenceImages.length}><SvgIcon name="trash" />清空</button>
          </div>
          <div className="reference-list">
            {props.referenceImages.map((image) => (
              <figure key={image.id}>
                <div className="reference-thumb">
                  <img src={imageUrlOf(image)} alt={image.name} loading="lazy" decoding="async" />
                </div>
                <figcaption><span>{image.name}</span><button type="button" onClick={() => props.onRemoveReference(image.id)}>移除</button></figcaption>
              </figure>
            ))}
          </div>
          <div className="field-grid">
            <label className="field"><span>超时（秒）</span><input type="number" min="60" max="900" value={generation.timeoutSeconds} onChange={(event) => onFieldChange("timeoutSeconds", Number(event.target.value))} /></label>
            <label className="field"><span>重试次数</span><input type="number" min="0" max="5" value={generation.maxRetries} onChange={(event) => onFieldChange("maxRetries", Number(event.target.value))} /></label>
          </div>
          <button type="button" className={`toggle ${generation.forceToolChoice ? "active" : ""}`} onClick={() => onFieldChange("forceToolChoice", !generation.forceToolChoice)}>{generation.forceToolChoice ? "强制工具调用已开" : "强制工具调用已关"}</button>
        </div>
      </details>

      <div className="dock-action-bar">
        <button className="primary-button" type="button" disabled={props.isGenerating} onClick={props.onGenerate}><SvgIcon name="sparkles" />{props.isGenerating ? "生成中..." : "开始生成"}</button>
        {props.isGenerating ? <button type="button" className="danger-button" onClick={props.onCancelGenerate}><SvgIcon name="close" />取消</button> : null}
      </div>
    </section>
  );
}

const SETTINGS_TABS = [
  { id: "api", label: "API 配置", icon: "settings" },
  { id: "rewrite", label: "提示词改写", icon: "wand" },
  { id: "account", label: "账号安全", icon: "key" },
  { id: "users", label: "用户管理", icon: "users" },
  { id: "invites", label: "邀请码", icon: "key" }
];

function SettingsModal({
  activeTab,
  setActiveTab,
  settings,
  setSettings,
  onSave,
  user,
  users,
  newUser,
  setNewUser,
  onCreateUser,
  passwordForm,
  setPasswordForm,
  passwordError,
  onChangePassword,
  userAdminError,
  onToggleInvitePermission,
  invites,
  inviteError,
  onGenerateInvite,
  onCopy,
  onClose
}) {
  return (
    <div className="settings-modal-shell" role="dialog" aria-modal="true" aria-label="设置" onClick={(event) => { if (shouldCloseFromBackdropClick(event)) onClose(); }}>
      <section className="settings-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="settings-modal-toolbar">
          <PanelHeader kicker="Settings" title="用户与接口配置" description="配置当前用户独立的 API 信息和默认模型。" />
          <button type="button" onClick={onClose}><SvgIcon name="close" />关闭</button>
        </div>
        <nav className="settings-tabs" aria-label="设置分类">
          {SETTINGS_TABS.filter((tab) => {
            if (tab.id === "users") return user.role === "admin";
            if (tab.id === "invites") return user.canCreateInvites;
            return true;
          }).map((tab) => (
            <button key={tab.id} type="button" className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)}><SvgIcon name={tab.icon} />{tab.label}</button>
          ))}
        </nav>
        <div className="settings-tab-content">
      {activeTab === "api" ? <PanelSection title="API 配置">
        <label className="field">
          <span>生图调用方式</span>
          <select value={settings.imageCallMode || "responses_tool"} onChange={(event) => setSettings((current) => ({ ...current, imageCallMode: event.target.value }))}>
            <option value="responses_tool">GPT-5.5 Tool</option>
            <option value="images_api">Images API</option>
          </select>
        </label>
        <div className="field-grid">
          <label className="field"><span>GPT Tool Base URL</span><input value={settings.baseUrl} onChange={(event) => setSettings((current) => ({ ...current, baseUrl: event.target.value }))} /></label>
          <label className="field"><span>GPT Tool API Key</span><input type="password" value={settings.apiKey} onChange={(event) => setSettings((current) => ({ ...current, apiKey: event.target.value }))} /></label>
          <label className="field"><span>对话模型</span><input value={settings.defaultModel} onChange={(event) => setSettings((current) => ({ ...current, defaultModel: event.target.value }))} /></label>
        </div>
        <div className="field-grid">
          <label className="field"><span>Images API Base URL</span><input value={settings.imageBaseUrl || ""} onChange={(event) => setSettings((current) => ({ ...current, imageBaseUrl: event.target.value }))} placeholder="默认 https://api.openai.com/v1" /></label>
          <label className="field"><span>Images API Key</span><input type="password" value={settings.imageApiKey || ""} onChange={(event) => setSettings((current) => ({ ...current, imageApiKey: event.target.value }))} /></label>
          <label className="field"><span>图像模型</span><input value={settings.imageModel || "gpt-image-2"} onChange={(event) => setSettings((current) => ({ ...current, imageModel: event.target.value }))} /></label>
        </div>
      </PanelSection> : null}
      {activeTab === "rewrite" ? <PanelSection title="提示词改写配置">
        <div className="field-grid">
          <label className="field">
            <span>协议</span>
            <select value={settings.rewriteProtocol || "responses"} onChange={(event) => setSettings((current) => ({ ...current, rewriteProtocol: event.target.value }))}>
              <option value="responses">Responses</option>
              <option value="chat">Chat Completions</option>
            </select>
          </label>
          <label className="field"><span>改写模型</span><input value={settings.rewriteModel || ""} onChange={(event) => setSettings((current) => ({ ...current, rewriteModel: event.target.value }))} placeholder="留空则关闭改写按钮" /></label>
        </div>
        <label className="field"><span>改写 Base URL</span><input value={settings.rewriteBaseUrl || ""} onChange={(event) => setSettings((current) => ({ ...current, rewriteBaseUrl: event.target.value }))} placeholder="留空则继承生图 Base URL" /></label>
        <label className="field"><span>改写 API Key</span><input type="password" value={settings.rewriteApiKey || ""} onChange={(event) => setSettings((current) => ({ ...current, rewriteApiKey: event.target.value }))} placeholder="留空则继承生图 API Key" /></label>
        <label className="field"><span>系统提示词</span><textarea rows={5} value={settings.rewriteSystemPrompt || ""} onChange={(event) => setSettings((current) => ({ ...current, rewriteSystemPrompt: event.target.value }))} /></label>
      </PanelSection> : null}
      {activeTab === "account" ? <PanelSection title="修改密码">
        <form className="password-form" onSubmit={onChangePassword}>
          <label className="field"><span>当前密码</span><input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" /></label>
          <label className="field"><span>新密码</span><input type="password" value={passwordForm.nextPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, nextPassword: event.target.value }))} autoComplete="new-password" /></label>
          <label className="field"><span>确认新密码</span><input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" /></label>
          {passwordError ? <div className="form-error">{passwordError}</div> : null}
          <button type="submit"><SvgIcon name="key" />修改密码</button>
        </form>
      </PanelSection> : null}
      {activeTab === "users" && user.role === "admin" ? (
        <PanelSection title="用户管理">
          <form className="create-user-form" onSubmit={onCreateUser}>
            <input placeholder="新用户名" value={newUser.username} onChange={(event) => setNewUser((current) => ({ ...current, username: event.target.value }))} />
            <input placeholder="初始密码" type="password" value={newUser.password} onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))} />
            <button type="submit"><SvgIcon name="plus" />创建</button>
          </form>
          {userAdminError ? <div className="form-error">{userAdminError}</div> : null}
          <div className="user-list">
            {users.map((entry) => (
              <span key={entry.id}>
                <strong>{entry.username}</strong>
                <small>{entry.role}</small>
                <button type="button" disabled={entry.role === "admin"} onClick={() => onToggleInvitePermission(entry)}>
                  <SvgIcon name="users" />
                  {entry.canCreateInvites ? "关闭邀请码权限" : "开启邀请码权限"}
                </button>
              </span>
            ))}
          </div>
        </PanelSection>
      ) : null}
      {activeTab === "invites" && user.canCreateInvites ? (
        <PanelSection title="邀请码">
          <div className="inline-actions">
            <button type="button" onClick={onGenerateInvite}><SvgIcon name="key" />生成邀请码</button>
          </div>
          {inviteError ? <div className="form-error">{inviteError}</div> : null}
          <div className="invite-list">
            {invites.length ? invites.map((invite) => (
              <article key={invite.id} className={`invite-row ${invite.usedAt ? "used" : ""}`}>
                <strong>{invite.code}</strong>
                <small>{invite.usedAt ? `已被 ${invite.usedByUser?.username || "用户"} 使用` : "未使用"}</small>
                <button type="button" disabled={Boolean(invite.usedAt)} onClick={() => onCopy(invite.code, "已复制邀请码。")}><SvgIcon name="copy" />复制</button>
              </article>
            )) : <p className="muted">暂无邀请码。</p>}
          </div>
        </PanelSection>
      ) : null}
      <div className="dock-action-bar">
        <button className="primary-button" type="button" onClick={onSave}><SvgIcon name="settings" />保存当前用户配置</button>
      </div>
        </div>
      </section>
    </div>
  );
}

function ImageDetailModal({ image, onClose, onCopy, onApply, onPreview }) {
  if (!image) {
    return null;
  }
  const mainUrl = imageUrlOf(image);
  const historyItem = image.historyItem;
  const resultImages = historyItem?.images?.length
    ? historyItem.images.map((item, index) => ({ ...item, source: "history", title: `结果图 ${index + 1}`, createdAt: historyItem.createdAt }))
    : mainUrl ? [{ ...image, title: image.title || image.name || "当前图片" }] : [];
  const referenceImages = (historyItem?.referenceImages || image.referenceImages || []).map((item, index) => ({
    ...item,
    source: "reference",
    title: item.name || `参考图 ${index + 1}`,
    createdAt: historyItem?.createdAt || image.createdAt
  }));
  const detailImages = collectDetailImages(image);
  const mainIndex = Math.max(0, detailImages.findIndex((item) => imageUrlOf(item) === mainUrl));

  return (
    <div className="detail-modal-shell" role="dialog" aria-modal="true" aria-label="图像详情" onClick={(event) => { if (shouldCloseFromBackdropClick(event)) onClose(); }}>
      <section className="detail-modal-panel" onClick={(event) => event.stopPropagation()}>
        <div className="detail-modal-toolbar">
          <PanelHeader kicker="Inspector" title="图像详情" description={sourceLabel(image.source)} />
          <button type="button" onClick={onClose}><SvgIcon name="close" />关闭</button>
        </div>
      {mainUrl ? (
        <button type="button" className="detail-image-button" onClick={() => onPreview(detailImages, mainIndex)}>
          <img className="detail-image" src={mainUrl} alt={image.title || image.name} decoding="async" />
        </button>
      ) : null}
      <dl className="detail-meta">
        <div><dt>文件</dt><dd>{image.name || "未命名"}</dd></div>
        <div><dt>来源</dt><dd>{sourceLabel(image.source)}</dd></div>
        <div><dt>尺寸</dt><dd>{image.settings?.size || "auto"}</dd></div>
        <div><dt>图像模型</dt><dd>{image.settings?.imageModel || "gpt-image-2"}</dd></div>
      </dl>
      <div className="inline-actions">
        {image.url ? <a href={image.url} target="_blank" rel="noreferrer"><SvgIcon name="external" />打开原图</a> : null}
        <button type="button" onClick={() => onCopy(image.prompt, "已复制提示词。")}><SvgIcon name="copy" />复制提示词</button>
        {image.historyItem ? <button type="button" onClick={() => onApply(image.historyItem)}><SvgIcon name="reuse" />复用参数</button> : null}
      </div>
      <label className="field"><span>提示词</span><textarea readOnly rows={7} value={image.prompt || ""} /></label>
      <DetailImageStrip title="本次结果" images={resultImages} allImages={detailImages} onPreview={onPreview} />
      <DetailImageStrip title="参考图" images={referenceImages} allImages={detailImages} onPreview={onPreview} emptyText="这条历史没有可预览的参考图，可能创建于旧版本或未上传参考图。" />
      </section>
    </div>
  );
}

function DetailImageStrip({ title, images, allImages, onPreview, emptyText = "暂无图片。" }) {
  return (
    <PanelSection title={title}>
      {images.length ? (
        <div className="detail-image-grid">
          {images.map((item, index) => {
            const imageUrl = imageUrlOf(item);
            const key = `${title}-${item.url || item.dataUrl || item.name || index}`;
            return (
              <figure key={key} className={!imageUrl ? "missing" : ""}>
                {imageUrl ? (
                  <button type="button" onClick={() => onPreview(allImages, Math.max(0, allImages.findIndex((entry) => imageUrlOf(entry) === imageUrl)))}>
                    <img src={imageUrl} alt={item.title || item.name || title} loading="lazy" decoding="async" />
                  </button>
                ) : (
                  <div className="missing-preview">无预览</div>
                )}
                <figcaption>
                  <strong>{item.title || item.name || `${title} ${index + 1}`}</strong>
                  {item.sizeLabel ? <small>{item.sizeLabel}</small> : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : <p className="muted">{emptyText}</p>}
    </PanelSection>
  );
}

function PromptRewriteDialog({
  settings,
  prompt,
  setPrompt,
  instruction,
  setInstruction,
  messages,
  result,
  error,
  isLoading,
  onSubmit,
  onApply,
  onCopy,
  onContinue,
  onClose
}) {
  return (
    <div
      className="rewrite-dialog-shell"
      role="dialog"
      aria-modal="true"
      aria-label="提示词改写助手"
      onClick={(event) => {
        if (shouldCloseFromBackdropClick(event)) {
          onClose();
        }
      }}
    >
      <div className="rewrite-dialog-panel" onClick={(event) => event.stopPropagation()}>
        <div className="rewrite-dialog-toolbar">
          <div>
            <span className="eyebrow">Prompt Rewrite</span>
            <strong>提示词改写助手</strong>
            <small>{settings.rewriteProtocol || "responses"} / {settings.rewriteModel || "未配置模型"}</small>
          </div>
          <div className="image-preview-actions">
            <button type="button" onClick={onClose}><SvgIcon name="close" />关闭</button>
          </div>
        </div>
        <div className="rewrite-chat-log">
          {messages.length ? messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`rewrite-message ${message.role}`}>
              <span>{message.role === "assistant" ? "AI" : "你"}</span>
              <p>{message.content}</p>
            </article>
          )) : (
            <div className="rewrite-empty">
              <strong>写清楚你想怎么改。</strong>
              <p>例如：增强镜头语言、减少文字、改成学术论文风格、保留主体但调整构图。</p>
            </div>
          )}
          {error ? <div className="form-error">{error}</div> : null}
        </div>
        <form className="rewrite-compose" onSubmit={onSubmit}>
          <label className="field">
            <span>修改要求</span>
            <textarea rows={4} value={instruction} onChange={(event) => setInstruction(event.target.value)} />
          </label>
          <label className="field">
            <span>待改写提示词</span>
            <textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>
          {result ? (
            <label className="field">
              <span>最新改写结果</span>
              <textarea readOnly rows={6} value={result} />
            </label>
          ) : null}
          <div className="rewrite-actions">
            <button className="primary-button" type="submit" disabled={isLoading || !prompt.trim()}><SvgIcon name="send" />{isLoading ? "改写中..." : "发送改写"}</button>
            <button type="button" disabled={!result} onClick={onApply}><SvgIcon name="wand" />写入提示词</button>
            <button type="button" disabled={!result} onClick={() => onCopy(result, "已复制改写结果。")}><SvgIcon name="copy" />复制结果</button>
            <button type="button" disabled={!result} onClick={onContinue}><SvgIcon name="refresh" />继续修改</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImagePreviewOverlay({ images, activeIndex, setActiveIndex, onClose }) {
  const image = images[activeIndex] || images[0] || {};
  const imageUrl = imageUrlOf(image);
  const canSwitch = images.length > 1;
  function showPrevious(event) {
    event.stopPropagation();
    setActiveIndex((current) => (current - 1 + images.length) % images.length);
  }
  function showNext(event) {
    event.stopPropagation();
    setActiveIndex((current) => (current + 1) % images.length);
  }
  return (
    <div className="image-preview-shell" role="dialog" aria-modal="true" aria-label="大图预览" onClick={(event) => { if (shouldCloseFromBackdropClick(event)) onClose(); }}>
      <div className="image-preview-panel" onClick={(event) => event.stopPropagation()}>
        <div className="image-preview-toolbar">
          <div>
            <strong>{image.title || image.name || "图片预览"}</strong>
            <small>{sourceLabel(image.source)} / {formatDate(image.createdAt)} / {activeIndex + 1} of {images.length}</small>
          </div>
          <div className="image-preview-actions">
            {imageUrl ? <a href={imageUrl} target="_blank" rel="noreferrer"><SvgIcon name="external" />查看原图</a> : null}
            <button type="button" onClick={onClose}><SvgIcon name="close" />关闭</button>
          </div>
        </div>
        <div className="image-preview-canvas">
          {canSwitch ? <button type="button" className="preview-nav previous" aria-label="上一张" onClick={showPrevious}><SvgIcon name="chevronLeft" /></button> : null}
          <img src={imageUrl} alt={image.title || image.name || "大图预览"} decoding="async" />
          {canSwitch ? <button type="button" className="preview-nav next" aria-label="下一张" onClick={showNext}><SvgIcon name="chevronRight" /></button> : null}
        </div>
      </div>
    </div>
  );
}

function NotificationStack({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="notification-stack" aria-live="polite" aria-label="操作通知">
      {items.map((item) => (
        <article key={item.id} className={`notification-item ${item.type}`}>
          <div>
            <strong>{item.type === "error" ? "操作失败" : item.type === "success" ? "已完成" : "提示"}</strong>
            <p>{item.message}</p>
          </div>
          <button type="button" className="icon-button" aria-label="关闭通知" onClick={() => onDismiss(item.id)}><SvgIcon name="close" /></button>
        </article>
      ))}
    </div>
  );
}

function PanelSection({ title, children }) {
  return (
    <div className="panel-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function DebugBlock({ title, content }) {
  return <div className="debug-card"><h3>{title}</h3><pre>{content}</pre></div>;
}

function PanelHeader({ kicker, title, description }) {
  return (
    <div className="panel-header">
      <span className="eyebrow">{kicker}</span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}
