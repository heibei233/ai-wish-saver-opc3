# AI愿望储蓄罐 Render 部署站点

这是 OPC3 赛题A项目的在线部署仓库目录。根路径打开后就是可运行 App 原型，`/downloads.html` 提供 APK、iOS 包和最终提交包下载。

## GitHub 上传

```bash
git init
git add .
git commit -m "Deploy AI Wish Saver app"
git branch -M main
git remote add origin https://github.com/<你的用户名>/ai-wish-saver-opc3.git
git push -u origin main
```

## Render 部署

1. 登录 Render。
2. New → Blueprint，选择 GitHub 仓库。
3. Render 会读取 `render.yaml` 创建静态站点。
4. 部署成功后，访问 Render 分配的 `https://xxx.onrender.com`。

## 15分钟保活

本仓库包含 GitHub Actions 工作流：

```text
.github/workflows/keepalive.yml
```

部署成功后，在 GitHub 仓库设置里添加变量或密钥：

```text
RENDER_URL=https://你的站点.onrender.com
```

工作流会每 15 分钟访问一次该 URL。静态站点通常不需要保活，但如果你后续改成 Web Service，这个工作流可以减少冷启动。
