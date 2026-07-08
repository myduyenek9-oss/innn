# 八字运势推送

一个基于农历八字的每日运势提醒工具，支持网页配置、钉钉推送、Railway Cron 定时任务，以及网页运势问答 Agent。

## Railway 变量

基础推送：

- `DINGTALK_WEBHOOK`：钉钉机器人 Webhook
- `BIRTH_DATE`：`2004-01-23`
- `BIRTH_TIME`：`06:30`
- `GENDER`：`male`
- `BIRTH_LOCATION`：`福建泉州`
- `PUSH_TIME`：`06:30`

Agent：

- `DATABASE_URL`：Railway PostgreSQL 自动提供
- `AI_API_KEY`：OpenAI 兼容接口 Key
- `AI_BASE_URL`：默认可用 `https://api.openai.com/v1`
- `AI_MODEL`：模型名称
- `AI_TEMPERATURE`：默认 `0.3`
- `AI_MAX_TOKENS`：默认 `900`

## Railway 服务

Web 服务启动命令：

```bash
node src/index.js
```

Cron 服务执行命令：

```bash
npm run cron
```

北京时间每天 06:30 对应 UTC Cron：

```text
30 22 * * *
```

部署在 Railway 时，网页内置定时默认关闭，自动推送以 Railway Cron 为准，避免重复推送。
