import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const APP_ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(APP_ROOT, "data");
export const USERS_DATA_DIR = path.join(DATA_DIR, "users");
export const OUTPUT_DIR = path.join(APP_ROOT, "outputs");
export const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");
export const HISTORY_PATH = path.join(DATA_DIR, "history.json");
export const USERS_PATH = path.join(DATA_DIR, "users.json");
export const INVITES_PATH = path.join(DATA_DIR, "invites.json");
export const MIGRATION_STATE_PATH = path.join(DATA_DIR, "migration-state.json");
export const DIST_DIR = path.join(APP_ROOT, "dist");

export const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL = "gpt-5.5";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2";
export const DEFAULT_REWRITE_SYSTEM_PROMPT =
  "你是一个图像生成提示词改写助手。请根据用户给出的原始提示词和修改要求，输出一版可直接用于图像生成的完整提示词。只输出最终提示词正文，不要解释，不要使用 Markdown，不要添加无关前后缀。同时对于其中提到的一些需要文字介绍的部分，给出详细的文字内容，以确保生成图片时能正常生成对应的描述文字。除描述文字使用引号包裹中文描述外，其他内容使用英文书写。";

export const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
export const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
export const AUTH_COOKIE_NAME = "gpt_image_session";
export const AUTH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
export const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  "change-this-local-development-secret";

export const DEFAULT_SETTINGS = {
  baseUrl: DEFAULT_BASE_URL,
  apiKey: "",
  defaultModel: DEFAULT_MODEL,
  imageCallMode: "responses_tool",
  imageBaseUrl: DEFAULT_BASE_URL,
  imageApiKey: "",
  imageModel: DEFAULT_IMAGE_MODEL,
  rewriteProtocol: "responses",
  rewriteModel: "",
  rewriteBaseUrl: "",
  rewriteApiKey: "",
  rewriteSystemPrompt: DEFAULT_REWRITE_SYSTEM_PROMPT
};

export const PROMPT_PRESETS = {
  academic: {
    id: "academic",
    title: "学术论文配图",
    prompt:
      "请生成一张适合计算机专业论文的学术配图。整体风格克制、专业、信息层级清晰，白色或浅灰背景，图中文字全部使用中文。画面中要体现模块关系、数据流向或方法流程，箭头和标注准确，避免海报化、夸张特效和卡通感。"
  },
  product: {
    id: "product",
    title: "产品海报",
    prompt:
      "请生成一张高质感产品海报，主体清晰，材质真实，构图平衡，背景简洁，留有适度留白区域，适合品牌宣传与展示。"
  },
  interface: {
    id: "interface",
    title: "界面概念图",
    prompt:
      "请生成一张 AI 工具或创作平台的界面概念图，信息结构清晰，视觉现代，布局专业，适合用于产品概念展示。"
  },
  portrait: {
    id: "portrait",
    title: "人物编辑示例",
    prompt:
      "输入是一张年轻人物照片，请输出同一人物年龄增长后的效果图。人物身份保持一致，五官结构连续，年龄痕迹自然真实，光照与姿态协调。"
  }
};
