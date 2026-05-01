# GPT Image WebUI

基于 `Node.js + React + Express + Vite` 的本地图像生成工作台。服务端负责设置存储、Responses 请求、流式解析、生成历史和图片落盘；前端生产构建后由同一个 Express 服务提供。

## 目录

- `src/`: React 前端界面与交互逻辑
- `server/`: Express 服务端
- `data/`: 本地设置与生成历史，建议持久化挂载
- `outputs/`: 生成结果与中途预览图，建议持久化挂载
- `dist/`: 前端生产构建产物
- `Dockerfile`: 生产镜像构建文件
- `docker-compose.yml`: Docker Compose 部署示例

## 本地开发

```powershell
npm install
npm run dev:server
npm run dev:client
```

## 多用户

工作台现在默认启用账号密码登录。首次启动会自动创建管理员：

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

管理员登录后可以在“设置 -> 用户管理”中创建其他用户。

用户数据按用户隔离：

- `data/users/<userId>/settings.json`: 当前用户接口设置
- `data/users/<userId>/history.json`: 当前用户生成历史
- `outputs/<userId>/`: 当前用户生成图片和中途预览图

接口设置中除生图 `Base URL`、`API Key`、默认对话模型外，还可以配置提示词改写模型。改写支持 `Responses` 和 `Chat Completions` 两种 OpenAI 兼容协议；改写 `Base URL` 和 `API Key` 留空时会继承生图配置，只填写“改写模型”即可启用提示词框中的“使用改写”按钮。

旧版单用户数据会在首次启动时迁移到默认管理员用户，并写入 `data/migration-state.json`，避免重复迁移。

生产构建与启动：

```powershell
npm run build
npm start
```

默认服务端口是 `3001`。如果本机 `127.0.0.1:3001` 被其他程序占用，可以改用：

```powershell
$env:PORT="3101"
npm start
```

## Docker 镜像构建

在项目根目录执行：

```powershell
docker build -t gpt-image-webui:latest .
```

如果 Docker Hub 拉取基础镜像失败，先确认 Docker Desktop 已启动，并检查网络或镜像源。构建需要拉取：

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

容器内服务端口固定为 `3001`。建议把宿主机端口映射到 `3101`，避免与本机其他开发工具占用 `3001` 冲突。

首次启动会自动创建管理员用户。默认账号为 `admin`，默认密码为 `admin123456`。生产部署建议通过环境变量覆盖：

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
AUTH_SECRET=<long-random-secret>
```

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

### 使用已有设置文件

如果已经有本地 `data/settings.json`，直接挂载 `data/` 即可。容器会继续读取同一份设置和历史：

```powershell
docker run -d `
  --name gpt-image-webui `
  -p 3101:3001 `
  -v ${PWD}/data:/app/data `
  -v ${PWD}/outputs:/app/outputs `
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

保留 `data/` 和 `outputs/` 时，只执行 `docker compose down`。如果手动删除这两个目录，设置、历史和生成图会一起丢失。

## 端口与访问说明

- 容器内端口：`3001`
- 推荐宿主机端口：`3101`
- 访问地址：`http://localhost:3101`
- API 健康检查：`http://localhost:3101/api/history`

如果必须使用宿主机 `3001`：

```powershell
docker run -d `
  --name gpt-image-webui `
  -p 3001:3001 `
  -v ${PWD}/data:/app/data `
  -v ${PWD}/outputs:/app/outputs `
  gpt-image-webui:latest
```

如果访问 `http://127.0.0.1:3001` 返回 `426 Upgrade Required`，通常说明本机另一个程序精确绑定了 `127.0.0.1:3001`。可用以下命令排查：

```powershell
netstat -ano | Select-String ':3001'
Get-Process -Id <PID>
```

此时建议继续使用 `3101:3001`，或关闭占用 `127.0.0.1:3001` 的程序。

## 容器管理

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

## 数据持久化

建议始终挂载：

```text
./data:/app/data
./outputs:/app/outputs
```

其中：

- `data/users/<userId>/settings.json`: Base URL、API Key、默认模型、提示词改写模型等当前用户设置
- `data/users/<userId>/history.json`: 生成历史、提示词、参数、结果图元数据
- `outputs/`: 生成图片和中途预览图

不挂载时，容器删除后这些数据会丢失。

### 挂载目录权限

镜像启动时会自动创建 `/app/data` 和 `/app/outputs`，并把这两个目录授权给容器内 `node` 用户，避免保存设置时报：

```text
EACCES: permission denied, open '/app/data/settings.json'
```

Windows Docker Desktop 使用 bind mount 时通常无需额外处理。Linux 服务器如果仍遇到权限问题，可以先在宿主机执行：

```bash
mkdir -p data outputs
sudo chown -R 1000:1000 data outputs
```

或者临时使用具名卷部署：

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

## 网络环境建议

如果 Docker Hub 访问不稳定，可以先手动拉取基础镜像：

```powershell
docker pull node:24-bookworm-slim
docker build -t gpt-image-webui:latest .
```

如果公司或校园网络需要代理，可在 Docker Desktop 中配置代理，或构建时传入代理变量：

```powershell
docker build `
  --build-arg HTTP_PROXY=http://127.0.0.1:7890 `
  --build-arg HTTPS_PROXY=http://127.0.0.1:7890 `
  -t gpt-image-webui:latest .
```

代理地址需要替换为你的实际代理地址。
