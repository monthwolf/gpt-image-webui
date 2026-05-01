# GPT Image WebUI

一个基于 `Node.js + React + Express + Vite` 的图像生成工作台。项目面向多人使用场景，提供画廊式结果管理、提示词改写、历史复用、收藏、账号隔离、Docker 部署和 GitHub Actions 自动构建镜像等能力。

它不是单一的生图表单，而是围绕“生成、查看、沉淀、复用”设计的多人工作台。主界面以图片画廊为中心，右侧保留折叠式生成面板，设置和详情通过弹窗打开，适合长期保存结果和多人共享部署。
<img width="2549" height="2279" alt="image" src="https://github.com/user-attachments/assets/3b691b49-781c-407e-91fa-7bd1b9d4de28" />


## 主要能力

**图像生成**  
支持两种调用方式：通过 `GPT-5.5 Tool` 调用图像生成工具，或直接请求 OpenAI 兼容的 `Images API`。两种方式可以分别配置 Base URL 和 API Key。生成参数支持 `gpt-image-2`、参考图、比例预设、自定义尺寸、`1k-4k` 分辨率、结果数量 `n=1-4`、质量、输出格式、背景、压缩率、超时和重试次数。

**画廊与历史**  
生成结果会进入主画廊和历史记录。画廊支持搜索、刷新、收藏、删除和复用参数。点击卡片可打开详情弹窗，查看原始提示词、修订提示词、请求参数、参考图和结果图；在详情中点击图片可进入大图预览并左右切换。

**提示词改写**  
可以配置独立的 OpenAI 兼容改写模型，支持 `Responses` 和 `Chat Completions` 协议。改写弹窗会带入当前提示词，用户可以补充修改要求，模型返回后可一键复制或应用到生成框。

**多用户协作**  
工作台默认启用账号登录。管理员可以创建用户、生成邀请码，并为普通用户开启生成邀请码权限。不同用户的设置、历史、参考图和生成结果互相隔离；用户也可以在账号安全中修改自己的密码。

**调试与部署**  
界面提供可折叠的请求体、响应体和活动日志。服务端会打印发送到配置 `baseUrl` 的响应内容，便于排查网关兼容问题。项目内置 Docker、Docker Compose、数据持久化和 GitHub Actions 镜像发布流程。

## 项目结构

```text
src/                         React 前端界面与交互逻辑
server/                      Express 服务端、认证、历史、设置、图像生成和提示词改写逻辑
data/                        本地用户、设置、历史、邀请码等数据，建议持久化挂载
outputs/                     生成结果和参考图落盘目录，建议持久化挂载
dist/                        前端生产构建产物
docs/github-actions-docker.md GitHub Actions Docker 发布说明
Dockerfile                   生产镜像构建文件
docker-compose.yml           Docker Compose 部署示例
docker-entrypoint.sh          容器启动和目录权限处理脚本
```

`data/`、`outputs/`、`dist/`、`node_modules/` 默认不会提交到 Git。

## 本地开发

安装依赖：

```powershell
npm install
```

启动服务端：

```powershell
npm run dev:server
```

启动前端开发服务：

```powershell
npm run dev:client
```

生产构建与启动：

```powershell
npm run build
npm start
```

默认后端端口是 `3001`。如果本机端口冲突，可以修改：

```powershell
$env:PORT="3101"
npm start
```

## 首次登录

首次启动会自动创建管理员账号：

```text
用户名：admin
密码：admin123456
```

生产环境建议通过环境变量覆盖默认值：

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="<strong-password>"
$env:AUTH_SECRET="<long-random-secret>"
```

登录后建议立即进入 `设置 -> 账号安全` 修改密码。

## 多用户与数据隔离

工作台按用户隔离配置、历史和输出文件：

```text
data/users/<userId>/settings.json   当前用户 API、模型、改写等设置
data/users/<userId>/history.json    当前用户生成历史、提示词、参数、图片元数据
outputs/<userId>/                   当前用户生成图片和参考图
```

管理员可在 `设置 -> 用户管理` 中创建用户，并为用户开启“生成邀请码”权限。拥有权限的用户可在 `设置 -> 邀请码` 中生成邀请码，其他用户可在登录页使用邀请码注册。

旧版单用户数据会在首次启动时迁移到默认管理员用户，并写入：

```text
data/migration-state.json
```

## 图像生成配置

在 `设置 -> API 配置` 中选择生图调用方式。`GPT-5.5 Tool` 适合走 `Responses API` 的工具调用链路；`Images API` 适合直接请求 `/v1/images/generations`。

### GPT-5.5 Tool

需要配置：

- `GPT Tool Base URL`
- `GPT Tool API Key`
- `对话模型`，默认 `gpt-5.5`
- `图像模型`，默认 `gpt-image-2`

服务端会把图像工具参数传入 `tools`，其中包含：

```json
{
  "type": "image_generation",
  "model": "gpt-image-2",
  "n": 1
}
```

### Images API

需要配置：

- `Images API Base URL`，默认 `https://api.openai.com/v1`
- `Images API Key`
- `图像模型`，默认 `gpt-image-2`

兼容返回 `url` 或 `b64_json` 的网关：如果响应中有 `url`，优先下载并落盘；没有 `url` 时再读取 base64 图片内容。

## 生成参数

右侧生成面板负责所有生图操作，包括提示词、参考图、尺寸、分辨率、生成数量、质量和输出格式。结果数量通过 `n` 传给图像生成接口，范围是 `1-4`。

如果请求因超时自动终止，系统不会继续重试，并会提示调高超时时间。生成中可点击取消按钮主动终止当前任务。页面刷新时，前端也会取消未完成的生成请求，避免堆积阻塞。

## 历史、收藏与预览

主画廊会展示当前生成结果和历史结果，并提供搜索、刷新、收藏筛选、删除和复用参数。已收藏图片会在卡片和按钮上突出显示。

点击画廊卡片会打开详情弹窗。详情中保留原始提示词、修订提示词、请求参数、参考图和结果图列表；点击任意图片可打开大图预览，并通过左右按钮切换当前详情中的图片。

## 提示词改写

在 `设置 -> 提示词改写` 中填写改写模型后，生成面板会启用“使用改写”按钮。

支持两种 OpenAI 兼容协议：

- `Responses`
- `Chat Completions`

配置项包括：

- 改写模型。
- 改写 Base URL，留空时继承生图 Base URL。
- 改写 API Key，留空时继承生图 API Key。
- 系统提示词。

改写弹窗会自动带入当前提示词。用户可以输入修改要求，模型返回结果后可一键复制或应用到提示词框。

## 调试与日志

工作台会在界面中显示请求体、响应体和生成活动日志，长内容默认折叠。服务端也会打印发送到配置 `baseUrl` 的请求返回内容，便于排查第三方网关兼容问题。

常见需要关注的日志：

- 请求体是否包含正确的 `model`、`tools`、`n`、`size` 等字段。
- 网关返回的是 `url` 还是 `b64_json`。
- 是否发生 Cloudflare 524、接口超时、HTML 错误页、JSON 解析失败等问题。
- 是否因为超时被本地请求主动终止。

## Docker 镜像构建

在项目根目录执行：

```powershell
docker build -t gpt-image-webui:latest .
```

基础镜像：

```text
node:24-bookworm-slim
```

常见诊断命令：

```powershell
docker version
docker context ls
docker pull node:24-bookworm-slim
```

## Docker Run 部署

容器内服务端口固定为 `3001`。建议把宿主机端口映射为 `3101`，避免与本机开发服务冲突。

### Windows PowerShell

```powershell
New-Item -ItemType Directory -Force data, outputs

docker run -d `
  --name gpt-image-webui `
  -p 3101:3001 `
  -e NODE_ENV=production `
  -e PORT=3001 `
  -e ADMIN_USERNAME=admin `
  -e ADMIN_PASSWORD=admin123456 `
  -e AUTH_SECRET=change-this-secret-in-production `
  -v ${PWD}/data:/app/data `
  -v ${PWD}/outputs:/app/outputs `
  gpt-image-webui:latest
```

访问：

```text
http://localhost:3101
```

### Windows CMD

```cmd
if not exist data mkdir data
if not exist outputs mkdir outputs

docker run -d ^
  --name gpt-image-webui ^
  -p 3101:3001 ^
  -e NODE_ENV=production ^
  -e PORT=3001 ^
  -e ADMIN_USERNAME=admin ^
  -e ADMIN_PASSWORD=admin123456 ^
  -e AUTH_SECRET=change-this-secret-in-production ^
  -v %cd%\data:/app/data ^
  -v %cd%\outputs:/app/outputs ^
  gpt-image-webui:latest
```

### Linux / macOS / Git Bash

```bash
mkdir -p data outputs

docker run -d \
  --name gpt-image-webui \
  -p 3101:3001 \
  -e NODE_ENV=production \
  -e PORT=3001 \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123456 \
  -e AUTH_SECRET=change-this-secret-in-production \
  -v "$PWD/data:/app/data" \
  -v "$PWD/outputs:/app/outputs" \
  gpt-image-webui:latest
```

## Docker Compose 部署

启动：

```powershell
docker compose up -d --build
```

查看日志：

```powershell
docker compose logs -f
```

停止：

```powershell
docker compose down
```

只执行 `docker compose down` 会保留 `data/` 和 `outputs/`。如果手动删除这两个目录，设置、用户、历史和生成图会一起丢失。

## 数据持久化

建议始终挂载：

```text
./data:/app/data
./outputs:/app/outputs
```

镜像启动时会自动创建 `/app/data` 和 `/app/outputs`，并尽量授权给容器内 `node` 用户，避免保存配置时报：

```text
EACCES: permission denied, open '/app/data/settings.json'
```

Linux 服务器如果仍遇到权限问题，可在宿主机执行：

```bash
mkdir -p data outputs
sudo chown -R 1000:1000 data outputs
```

也可以使用 Docker 具名卷：

```bash
docker volume create gpt-image-webui-data
docker volume create gpt-image-webui-outputs

docker run -d \
  --name gpt-image-webui \
  -p 3101:3001 \
  -v gpt-image-webui-data:/app/data \
  -v gpt-image-webui-outputs:/app/outputs \
  gpt-image-webui:latest
```

## GitHub Actions 自动发布镜像

项目包含：

```text
.github/workflows/docker-publish.yml
```

推送新的 Git tag 时会构建并推送 Docker Hub 镜像。需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中配置：

- Variable `DOCKERHUB_USERNAME`：Docker Hub 用户名。
- Variable `DOCKERHUB_PROJECT`：Docker Hub 项目名。
- Secret `DOCKERHUB_TOKEN`：有 push 权限的 Docker Hub Access Token。

镜像地址格式：

```text
docker.io/<DOCKERHUB_USERNAME>/<DOCKERHUB_PROJECT>
```

发布示例：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

生成镜像标签：

```text
docker.io/<DOCKERHUB_USERNAME>/<DOCKERHUB_PROJECT>:v1.0.0
docker.io/<DOCKERHUB_USERNAME>/<DOCKERHUB_PROJECT>:latest
```

更多说明见 [docs/github-actions-docker.md](docs/github-actions-docker.md)。

## 常见问题

### 访问 3001 出现 426 Upgrade Required

通常说明本机另一个程序绑定了 `127.0.0.1:3001`。建议使用 `3101:3001` 映射，或排查占用：

```powershell
netstat -ano | Select-String ':3001'
Get-Process -Id <PID>
```

### Docker 访问静态资源 MIME 类型错误

如果浏览器报：

```text
Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html"
```

通常是容器中前端构建产物与服务端路由不匹配。请重新构建镜像并启动：

```powershell
docker compose down
docker compose up -d --build
```

### 网关返回 Cloudflare 524

`524: A timeout occurred` 表示网关或上游服务处理时间过长。可以：

- 调高工作台中的超时时间。
- 减少生成数量 `n`。
- 使用更稳定的 baseUrl。
- 查看服务端日志中的完整响应体，确认是否是 HTML 错误页。

### Images API 返回 url 但页面没有图片

服务端会优先处理 `url` 结果，再处理 `b64_json`。如果仍无法显示，请检查：

- 图片 URL 是否需要鉴权。
- 服务端是否可以访问该 URL。
- 日志中是否有下载失败或超时信息。

### 保存设置出现 EACCES

这是挂载目录权限问题。Linux 上可执行：

```bash
sudo chown -R 1000:1000 data outputs
```

或改用 Docker 具名卷。

## 容器管理命令

查看容器：

```powershell
docker ps --filter name=gpt-image-webui
```

查看日志：

```powershell
docker logs -f gpt-image-webui
```

重启：

```powershell
docker restart gpt-image-webui
```

停止并删除容器：

```powershell
docker stop gpt-image-webui
docker rm gpt-image-webui
```

删除镜像：

```powershell
docker rmi gpt-image-webui:latest
```
