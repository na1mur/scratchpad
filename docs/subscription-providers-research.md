# Using LLM subscriptions instead of API keys

Research notes, 2026-10-08. Undecided; revisit before building anything.

**Goal:** bring-your-own-API-key is expensive for learners. Can they use an existing LLM subscription (ChatGPT Plus, Claude Pro, and so on) for problem analysis instead?

**Short answer:** only OpenAI officially supports this, and a hosted app like Scratchpad has to get through a waitlist first.

## OpenAI: "Sign in with ChatGPT" (the only official option)

OpenAI announced this at DevDay on 2026-09-29. Users sign in to a third-party app with their ChatGPT account, and the app's AI requests count against their ChatGPT plan limits instead of an API key.

- **Flow:** OAuth / OpenID Connect with PKCE. Identity-only sign-in uses `openid profile email`; plan usage needs an extra scope (`chatgpt.tokens.use.direct`) that the user explicitly grants.
- **Inference:** the server calls the public **Responses API** with the user's OAuth token. That fits our server-side pipeline, and the AI SDK's OpenAI provider already supports the Responses API. Models are discovered per user (`listModels`).
- **Server side:** the code exchange and ID token verification happen on the backend.
- **User controls:** users can see and limit how much of their plan each app uses, and revoke access, in ChatGPT settings. Apps only get name, email and profile picture, not chat history or billing data.
- **Eligible end users:** ChatGPT Plus and Pro subscribers.
- **Eligible apps:**
  - Open-source projects and personal apps that run locally: available now with no approval. Clients register themselves dynamically on first sign-in (`client_id=dynamic_agent_client`, no client secret).
  - **Paid or remotely hosted apps (that's us): waitlist.** The cookbook says: *"If you're building a paid or remotely hosted app, join the waitlist to request access before offering it to users."* Commercial partners apply through the interest form.
- **Launch partners:** mostly coding tools (OpenCode, OpenClaw, Pi, T3, Hyperagent, Hermes Agent, Vorflux, Amp, Dactyl, Kilo Code, Warp, Conductor, Devin), plus Notion and Vercel. Lovable is listed as coming soon.
- **Open questions:** concrete per-app usage caps, which models count as "eligible" requests, and whether structured output and long pipeline runs behave the same as with API keys.

## Providers that don't work for us

### Anthropic (Claude Pro/Max): no official program, terms keep changing

- 2026-01-09: Anthropic started blocking subscription OAuth in third-party clients.
- 2026-02-19: the docs were updated to say subscription OAuth tokens are only for Claude Code and Claude.ai, and using them elsewhere (including the Agent SDK) is unauthorized.
- 2026-04-04: OAuth was revoked for all third-party tools.
- 2026-05-13: the ban was reversed and a separate "Agent SDK credit" plan was announced.
- 2026-06-15: that credit plan was paused. Anthropic says it is reworking it and will give notice before changes take effect.
- Anthropic's advice to people building products is to use API keys.

**Verdict:** there is no partner program, and the rules have changed three times this year. Too risky to build on.

### Google (Gemini / Google AI Pro / Ultra): prohibited

- March 2026: Google started detecting Gemini CLI OAuth used from third-party software. Its terms say this can get the account suspended or terminated.
- 2026-06-18: Google ended consumer "Login with Google" in Gemini CLI. Requests for AI Pro, Ultra and Code Assist for individuals are no longer served that way. The Antigravity terms also forbid third-party OAuth use.

**Verdict:** not possible, and trying it could get our users' Google accounts suspended.

### GitHub Copilot: one local tool only

- 2026-01-16: GitHub officially allowed Copilot subscriptions (Pro, Pro+, Business, Enterprise; not Free) in OpenCode, through a device-flow login and the Copilot API. Before that, this kind of use got accounts flagged.

**Verdict:** that's a deal for one local coding agent. Nothing suggests a hosted web app may route users' Copilot quota.

## Coding plans from OpenCode and open-model providers

These sell a monthly "coding plan" with an API key the user pastes into a tool. There is no OAuth, so technically it would work with our bring-your-own-key field. But every plan is meant for coding agents, and a website calling them on a user's behalf is either forbidden or a grey area.

### OpenCode Go (and Zen)

- Go costs $10/month ($5 the first month); Go Plus costs $40/month. One key covers about 30 open models (GLM, Kimi, Qwen, MiniMax, DeepSeek, MiMo) through OpenAI- and Anthropic-compatible endpoints (`https://opencode.ai/zen/go/v1/...`).
- Go's limits are $12 of usage per 5 hours, $30 per week and $60 per month. Requests stop when a limit runs out, with no overage charges.
- The terms say Go is *"designed for OpenCode and other coding agents that produce similar types of requests."* Other clients must send typical coding-agent traffic, identify themselves with their own user agent, and send a stable `x-opencode-session` ID per conversation. Traffic is monitored for abuse.
- Zen (OpenCode's pay-as-you-go gateway) is just another per-token API, so it's no cheaper in principle than OpenRouter.

**Verdict:** grey area. Our pipeline isn't coding-agent traffic. We could probably meet the header rules, but we'd be stretching "similar types of requests", and they could block it. We'd want to ask OpenCode first.

### Z.ai (GLM Coding Plan)

- Lite costs about $18, Pro about $72–80 and Max about $160–168.
- **Explicitly forbidden for us.** The usage policy limits the quota to officially supported tools (Claude Code, Cursor, Cline, Roo, Kilo, OpenCode, and others) and bans *"directly invoking model APIs from your own applications, bots, websites, SaaS products or other systems"* without a separate written agreement. SDK-based access gets detected. Violations lead to rate limits or freezes, and more than three get the account banned.
- Z.ai's metered GLM API has no tool restriction. That's just another bring-your-own-key provider.

**Verdict:** the coding plan can't be used. Users' accounts could be banned.

### Kimi / Moonshot (Kimi Code membership)

- The tiers are Moderato $19, Allegretto $39, Allegro $99 and Vivace $199 a month. Membership includes a 5-hour rolling quota (roughly 300–1,200 calls) with up to 30 concurrent requests. Keys are separate per product and region.
- The Kimi chat subscription, Kimi Code membership and the API platform are all billed separately, so a chat subscription doesn't fund API calls.
- The membership supports OpenAI- and Anthropic-compatible coding clients. **I couldn't find official terms that say whether it may be used from a website.** It's clearly sold for individual developer sessions.
- Kimi K2.5 and the `moonshot-v1` models were retired on 2026-08-31.

**Verdict:** unclear. Read Moonshot's official terms before relying on it.

### DeepSeek

- **No subscription at all.** It's pay-as-you-go only, with free trial credits. V4-Flash costs $0.14 per 1M input tokens and $0.28 per 1M output; V4-Pro costs about $0.435 / $0.87. Cache hits cost far less than misses, which suits our repeated system prompts.

**Verdict:** no subscription route, but it's cheap enough that the cost problem mostly goes away. It's a strong candidate for a hosted free tier or a recommended low-cost model for bring-your-own-key users.

### Others briefly

- **MiniMax:** after M2.7, MiniMax changed its license to require written authorization for commercial use. Its coding plan has the same coding-tool framing as the others.
- **Alibaba Qwen:** Qwen Code's free tier was cut to 100 requests a day. The Alibaba Cloud Coding Plan Pro costs $50/month and is aimed at coding tools. Qwen3.8-Max weights need a commercial license if served to third parties.

## Options that lower the cost without a subscription

- **OpenRouter OAuth (PKCE):** "Sign in with OpenRouter" gives the app an API key the user controls. There's no client registration, secret or backend requirement. It's still pay-per-token, but users can choose cheap or free models and don't have to paste a key. This is the easiest improvement to today's flow.
- **Hosted free tier:** run a cheap model on our own key, with per-user quotas. DeepSeek V4-Flash makes this affordable: a whole analysis run would likely cost a fraction of a cent. That's an estimate we haven't measured.

## Possible plan (not decided)

1. Apply for the Sign in with ChatGPT waitlist; nothing to build until we're approved.
2. Meanwhile, add OpenRouter OAuth as a "connect account" option next to the API key field.
3. Consider a small hosted free tier on DeepSeek (or a similar cheap model) so learners can start without a key.
4. Don't build on the Claude or Gemini subscription workarounds, and don't accept Z.ai Coding Plan keys. Ask OpenCode and Moonshot about website use before supporting Go or Kimi Code keys.

If we build either option, it would plug into the provider layer in `src/lib/ai/`. Keep the existing sandbox and `revealsSolution()` guardrail the same for every provider.

## Sources

- [OpenAI: Sign in with ChatGPT quickstart](https://developers.openai.com/siwc/quickstart)
- [OpenAI Cookbook: Integrating Sign in with ChatGPT](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt)
- [OpenAI Help: Using your ChatGPT plan in other apps](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- [OpenAI: Sign in with ChatGPT interest form](https://openai.com/form/sign-in-with-chatgpt-interest/)
- [SecurityBrief: OpenAI launches ChatGPT sign-in for 16 partner tools](https://securitybrief.asia/story/openai-launches-chatgpt-sign-in-for-16-partner-tools)
- [The Register: Anthropic clarifies ban on third-party tool access](https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546)
- [Winbuzzer: Anthropic bans subscription OAuth in third-party apps](https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/)
- [BetterClaw: Claude subscription ban, reversal and current state](https://www.betterclaw.io/blog/openclaw-anthropic-subscription-ban)
- [Gemini CLI: service update on third-party OAuth](https://github.com/google-gemini/gemini-cli/discussions/22970)
- [Gemini CLI terms and privacy](https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md)
- [Syntackle: Gemini OAuth after the June 2026 deprecation](https://syntackle.com/blog/google-gemini-ai-subscription-with-opencode/)
- [DevGenius: GitHub makes OpenCode official](https://blog.devgenius.io/github-just-made-opencode-official-heres-why-that-s-a-bigger-deal-than-you-think-ed1610660c40)
- [OpenRouter: OAuth PKCE](https://openrouter.ai/docs/use-cases/oauth-pkce)
- [OpenCode Go docs](https://opencode.ai/docs/go/)
- [OpenCode Go](https://opencode.ai/go)
- [Bitdoze: OpenCode Go review](https://www.bitdoze.com/opencode-go-plan/)
- [Z.ai: GLM Coding Plan usage policy](https://docs.z.ai/devpack/usage-policy)
- [Z.ai: subscription terms](https://docs.z.ai/legal-agreement/subscription-terms)
- [Z.ai: Coding Plan FAQ](https://docs.z.ai/devpack/faq)
- [pi issue: Z.ai SDK-based access risking bans](https://github.com/earendil-works/pi/issues/4187)
- [NxCode: Kimi Code plans and pricing](https://www.nxcode.io/resources/news/kimi-code-2026-plans-pricing-developer-guide)
- [MorphLLM: Kimi API](https://www.morphllm.com/kimi-api)
- [MorphLLM: DeepSeek API](https://www.morphllm.com/deepseek-api)
- [CostBench: DeepSeek API pricing](https://costbench.com/software/code-gen-apis/deepseek-coder-api/)
- [Decrypt: Alibaba shuts down Qwen Code free tier](https://decrypt.co/364501/alibaba-shuts-down-free-tier-qwen-code)
- [SCMP: Qwen3.8-Max commercial restrictions](https://scmp.com/tech/tech-trends/article/3363927/alibaba-adds-commercial-restrictions-open-weight-qwen38-max-ai-model)
