# dsh-prompt-craft

> 在 DSH 输入框里给草稿按一下 ✨，把它改写成更清晰、更可执行的提示词 —— **先看 diff，再逐段接受**。

`dsh-prompt-craft` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的提示词增强插件：在输入框工具行加一个 ✨ 按钮（模型选择器左侧），点一下就把当前草稿交给模型改写，结果以内嵌面板的形式展示，带人类可读的差异对比、逐段勾选、继续追问。

[English](./README.en.md)

## 为什么是「diff 优先」

大多数一键优化工具会把整段文本直接替换掉，你没法知道它改了什么、也没法只保留其中一半。本插件反过来：

- **先给你看 diff**：新增 / 删除 / 修改按行分组，每一组（hunk）都能单独勾选；
- **只应用你选择的**：合并结果写回输入框，随时「撤销」回到原文；
- **不满意就继续改**：不用重新开始，输入一句「再短一点」即可迭代；
- **信息不够先问你**：当草稿缺少关键约束（语言、格式、长度、受众……）时，模型会先返回 1–2 个问题，而不是替你瞎猜。

## 功能

- ✨ **一键增强**：输入框工具行按钮，快捷键可达，运行中可取消。
- 🎚 **三档力度**：轻量（只疏通表达）/ 标准（补结构、补约束）/ 专家（重写成完整规格）。
- 🧭 **自动场景识别**：自动判断代码 / 写作 / 调研 / Agent / 通用，也可手动指定。
- 🧩 **diff 预览 + 分段接受**：逐 hunk 勾选、对比视图、全部应用、撤销。
- ❓ **追问补全**：缺信息时先问 1–2 个问题，回答后带着答案重写。
- 🔁 **迭代改稿**：在上一版基础上继续给修改意见。
- ⚙️ **设置页**：界面语言、默认力度、默认场景、是否跟随会话模型。
- 🌏 **中英双语**：跟随浏览器语言，可在设置里覆盖。

## 安装

需要 DSH `>= 0.2.2-rc.1`。

```bash
# 从 npm（发布后）
dsh plugin --profile desktop add dsh-prompt-craft

# 或直接从 GitHub 安装
dsh plugin --profile desktop add github:you/dsh-prompt-craft#v0.1.0

# 本地开发：直接装本地目录（pnpm link 语义）
dsh plugin --profile desktop add file:C:\path\to\dsh-prompt-craft
```

安装后**重启 DSH 应用**（插件 bundle 在启动时加载）。重启后输入框工具行会出现 ✨ 按钮。

卸载：

```bash
dsh plugin --profile desktop remove dsh-prompt-craft
```

## 使用

1. 在输入框里写下草稿（一句话、一段需求、半成品提示词都行）。
2. 点 ✨。
3. 面板出现在输入框上方：
   - **分段 / 对比** 两个视图切换；
   - 勾选你想要的改动，点「应用选中 n/m」或「全部应用」；
   - 想改得更狠或更轻，点「继续改…」输入一句意见。
4. 应用后可直接编辑或发送；「撤销」回到增强前的原文。

## 设置

设置页位于 DSH 设置的插件页（「提示词增强」一节）：

| 项 | 说明 |
| --- | --- |
| 界面语言 | 跟随浏览器 / 中文 / English |
| 默认力度 | 轻量 / 标准 / 专家（面板里可临时切换） |
| 默认场景 | 自动识别 / 代码 / 写作 / 调研 / Agent / 通用 |
| 增强使用的模型 | 默认跟随当前会话模型；也可指定 provider / model / reasoning effort |

模型策略：默认完全跟随当前会话（含会话里临时切换的模型），只有你在设置里显式指定时才会覆盖。设置保存在本机浏览器 `localStorage`，不上传。

## 兼容性与实现

- 宿主半（`lib/host/index.cjs`）注册一个 `POST /dsh-prompt-craft/rpc` 路由，用 `ctx.llm.stream()` 调模型；带来源校验（拒绝跨站请求）、1 MiB 请求体上限、120s 超时、JSON 输出解析与一次修复重试。
- 浏览器半（`lib/client.js`）通过 DSH 的 `slots` 服务注册三个插槽：`conversation.input.right`（按钮）、`conversation.input.dock`（面板）、`settings.section`（设置页）。不修改 DOM、不 patch 宿主代码。
- 只依赖 DSH 已提供的共享模块（`react` 等），不额外安装运行时依赖。

## 开发

```bash
npm install
npm run build      # 生成 lib/（host 半逐文件复制 + esbuild 打包客户端）
npm test           # node --test，92 个用例
npm run check      # 校验 lib/ 与源码一致（无构建漂移）
```

源码结构：

```
src/protocol.cjs        # host/client 共享的常量、校验、错误码
src/host/index.cjs      # 插件入口（注册路由）
src/host/rpc.cjs        # HTTP 路由、流式收集、超时、修复重试
src/host/templates.cjs  # 提示词模板（力度 / 场景 / 输出约定）
src/host/parse-output.cjs
src/host/resolve-model.cjs
src/client/index.js     # 插槽注册
src/client/{button,panel,actions,store,rpc,i18n,styles,settings,diff}.js
```

## 隐私

- 插件不发送任何遥测，不访问网络（除 DSH 宿主自身的本机路由）。
- 草稿只在你点击 ✨ 时经本机 DSH 宿主转发给你在 DSH 里配置的模型服务。
- 设置存在浏览器 `localStorage`，不写入磁盘其他位置。

## License

[MIT](./LICENSE)
