# 改写规则（可溯源）

`dsh-prompt-craft` 的每次增强都会把下面 14 条规则注入系统提示，并要求模型在 `rationale` 字段里**引用它实际使用的规则 id**。因此每条规则、每处改动都能追到来源。

规则 id 是稳定契约：模型输出、面板展示、测试都按 id 引用；新增规则只追加 id，不改旧 id。

## 规则清单

| id | 规则 | 在改写里怎么落地 | 来源（一手） |
| --- | --- | --- | --- |
| R1 | 先写结果，再写步骤 | 开头写「要产出什么、给谁用」，只在顺序真正重要时保留步骤 | [Claude Code prompt library](https://code.claude.com/docs/en/prompt-library) · [GitHub Copilot prompt engineering](https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering) |
| R2 | 点名具体文件 / 组件 / 接口 | 把“this / 这个页面 / 那个组件”换成具体文件、路由、函数或命令 | [GitHub Copilot](https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering) · [Claude Code prompt library](https://code.claude.com/docs/en/prompt-library) |
| R3 | 只写代码里看不到的上下文 | 只补决定、约束、版本、必跑命令等仓库里读不到的事实，删掉读代码就知道的内容 | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) · [Anthropic: effective context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) |
| R4 | 把「做好」写成可验证的标准 | 把“做完”改写成要通过的测试、要跑的命令、要达成的阈值或验收清单 | [Claude Code prompt library](https://code.claude.com/docs/en/prompt-library) · [GitHub Spec Kit](https://github.com/github/spec-kit) |
| R5 | 要求跑检查并给出证据 | 明确要求跑测试 / 构建 / lint / 类型检查，并贴命令与结果，不接受“应该可以” | [Claude Code prompt library](https://code.claude.com/docs/en/prompt-library) · [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| R6 | 复用现有组件与设计 token | 指明沿用现有组件、token 与约定；除非需求要求，否则禁止硬编码颜色或另起一套组件 | [OpenAI GPT-5.1 prompting guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide) · [Claude Code prompt library](https://code.claude.com/docs/en/prompt-library) |
| R7 | 计划随任务规模伸缩 | 多文件改动给短计划，小修小改不搞流程仪式 | [GitHub Spec Kit](https://github.com/github/spec-kit) · [OpenAI GPT-5.1 guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide) |
| R8 | 写清输出形式、长度与受众 | 说明交付形态（diff / 改动文件 / 摘要）、语言、长度与读者 | [Claude Code prompt library](https://code.claude.com/docs/en/prompt-library) · [OpenAI GPT-5.1 guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide) |
| R9 | 用祈使句写规则，关键的放前面 | 直接写“Return X as JSON”，不写“记得要…”；不可妥协的要求放最前 | [GitHub Copilot](https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering) |
| R10 | 不靠 IMPORTANT / 大写 / “一步步想”加码 | 不加 IMPORTANT、全大写、\"think step by step\" 之类的话；推理深度由 effort 档位控制 | [Claude Code best practices](https://code.claude.com/docs/en/best-practices) |
| R11 | 用小节组织，示例少而典型 | 用短小节分组（背景 / 任务 / 约束 / 输出），示例 1–2 个即可，不堆边界清单 | [Anthropic: effective context engineering](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) |
| R12 | 缺信息才问，否则写明假设继续 | 只有缺失信息会改变方案时才追问；否则用一行写明假设后继续 | [OpenAI GPT-5.1 guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide) · [GitHub Copilot](https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering) |
| R13 | 未知信息用占位符，不臆造 | 不编造文件名、API、版本、负责人或需求；未知处留 `<占位符>` 或提问 | [OpenAI GPT-5.1 guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-1_prompting_guide) |
| R14 | 多步任务拆成有序可验收的小步 | 多部分工作拆成有序步骤，每步能单独验证再进下一步 | [GitHub Copilot](https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-engineering) · [GitHub Spec Kit](https://github.com/github/spec-kit) |

> 来源均为 2026-11 抓取的一手公开文档；各站点可能更新措辞，规则内容是本文转述与落地方式，链接用于溯源。

## 规则如何进入一次增强

1. 宿主把上表以 `R1 … R14`（id + 英文规则 + 落地指引）注入 system prompt（`src/host/rules.cjs` 的 `rulesBlock`）。
2. 模型的输出协议包含 `rationale: [{ change, rules: [\"R1\",\"R5\"] }]`（最多 6 条，每条最多 3 个 id）。
3. 解析层（`src/host/rules.cjs` 的 `clampRationale`）只保留真实存在的 id；面板在结果里展示「改动依据」，每个 id 悬停显示对应规则的中英文标题。
4. 规则的单一事实源是 `src/protocol.cjs` 的 `RULES`（id / 标题 / 来源链接），宿主与客户端共用，避免两边漂移。

## 判定与验证

- 规则 id 与标题在 `test/protocol.test.cjs` 里锁定，`rulesBlock` 必须包含全部 id 与指引（`test/rules.test.cjs`）。
- `rationale` 的形状、上限、非法 id 过滤由 `test/parse-output.test.cjs` 覆盖；面板展示由 `test/client-bundle.test.cjs` 覆盖。
- 端到端验收：真实模型返回的 `rationale` 中每个 id 都能在本表找到同行来源；改写后的 prompt 与实际 diff 一致（不是事后解释）。
