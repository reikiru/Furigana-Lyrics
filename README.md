# Furigana Lyrics

面向 macOS 浏览器的极简日语歌词注音工具，纯原生 HTML / CSS / ES Modules 构建，零第三方依赖。

## 目录结构

- `index.html`：主页面入口
- `start.command`：macOS 双击启动脚本（启动本地静态服务并打开浏览器）
- `src/styles/tokens.css`：主题色与排版设计令牌（和纸 / 素白 / 墨夜）
- `src/styles/main.css`：双栏编辑与阅读预览布局样式
- `src/js/config.js`：API 与排版偏好配置管理（localStorage）
- `src/js/ruby.js`：HTML 安全清洗、Ruby 解析与括号纯文本转换
- `src/js/api.js`：DeepSeek / OpenAI 兼容流式接口调用（支持中断）
- `src/js/exporter.js`：高清 Retina Canvas PNG 导出（支持自动换行、宽假名居中与主题底色）
- `src/js/app.js`：页面状态与交互控制
- `tests/ruby.test.mjs`：核心纯函数单元测试
- `scripts/build-single.mjs`：可选，构建单文件离线版 `dist/furigana.html`

## 使用方式

1. 双击 `start.command` 在浏览器中打开应用。
2. 点击右上角「API 设置」填入 API Key（默认兼容 DeepSeek，也支持自定义 Base URL 与模型名）。
3. 粘贴日语歌词，按 `⌘ + Enter` 或点击「标注假名」开始流式标注。

## 运行测试与构建

```bash
node --test tests/ruby.test.mjs
node scripts/build-single.mjs
```
