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

多人和安全：

- `JWT_SECRET`：登录 Cookie 签名密钥
- `ENCRYPTION_KEY`：钉钉 Webhook 加密密钥
- `ADMIN_EMAIL`：管理员邮箱
- `ADMIN_PASSWORD`：管理员初始密码
- `APP_BASE_URL`：网站地址，本地为 `http://localhost:3000`

QQ 邮箱验证：

- `SMTP_HOST=smtp.qq.com`
- `SMTP_PORT=465`
- `SMTP_SECURE=true`
- `SMTP_USER`：QQ 邮箱地址
- `SMTP_PASS`：QQ 邮箱 SMTP 授权码，不是 QQ 登录密码
- `SMTP_FROM`：发件邮箱地址

QQ 授权码获取方式：

1. 打开 QQ 邮箱网页版并登录。
2. 进入“设置”里的“账号与安全”或“账号”。
3. 开启 POP3/SMTP 或 IMAP/SMTP 服务。
4. 按提示完成安全验证，复制生成的 SMTP 授权码。
5. 把授权码填到 `SMTP_PASS`，然后重启服务。

未配置完整 SMTP 时，本地会显示测试验证码；生产环境应配置完整 SMTP，避免绕过邮箱验证。

## 账号功能

- 注册：邮箱 + 密码，使用 6 位邮箱验证码验证后才能登录。
- 找回密码：邮箱发送 6 位验证码，验证后设置新密码。
- 管理员后台：`ADMIN_EMAIL` 对应账号登录后可见，可管理用户资料、推送配置、Agent 记录和推送日志。

## Agent 隔离

- Agent 只按当前登录 Cookie 对应的 `user_id` 读取聊天记录。
- 每次回答只注入当前用户的八字、排盘规则、运势和最近 10 条聊天记录。
- `agent_messages.user_id` 为必填，数据库不允许无归属聊天记录。
- 普通用户每天 10 次，管理员不限制次数。
- 默认 `AI_TEMPERATURE=0.2`，减少随机发挥；回答必须说明依据，不能编造系统未提供的数据。

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
如果 Railway Cron 每天只执行一次，实际推送时间以 Cron 时间为准；网页里的个人推送时间会保存，但不会精确控制线上发送时刻。若后续需要每个人按自己设置时间发送，需要把 Cron 改成每 5-10 分钟轮询。

## 八字地点修正

用户输入的出生时间按北京时间理解。系统会根据所选县区经度换算真太阳时：

```text
真太阳时 = 北京时间 + (经度 - 120) * 4分钟 + 均时差
```

页面会同时显示输入北京时间、县区经纬度、真太阳时、是否跨时辰，以及最终四柱。
