const express = require('express');
const router = express.Router();

// POST /api/slack/send - 透過 Slack Bot 發送訊息
router.post('/send', async (req, res) => {
  const { channel, message } = req.body;

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || token === 'your-slack-bot-token-here') {
    return res.status(400).json({ error: 'SLACK_BOT_TOKEN 尚未設定，請在 .env 中填入 Slack Bot Token' });
  }

  const targetChannel = channel || process.env.SLACK_DEFAULT_CHANNEL;
  if (!targetChannel) {
    return res.status(400).json({ error: '請指定 channel 參數或在 .env 設定 SLACK_DEFAULT_CHANNEL' });
  }

  if (!message) {
    return res.status(400).json({ error: '缺少 message 參數' });
  }

  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: targetChannel,
        text: message,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await response.json();

    if (!data.ok) {
      const errMsg = data.error === 'not_in_channel'
        ? '機器人尚未加入該頻道，請先邀請 Bot 進入頻道'
        : data.error === 'invalid_auth'
        ? 'Slack Bot Token 無效'
        : data.error || 'Slack API 回傳錯誤';
      return res.status(400).json({ error: errMsg });
    }

    res.json({
      success: true,
      channel: data.channel,
      ts: data.ts,
      message: `訊息已發送至 ${targetChannel}`,
    });
  } catch (err) {
    console.error('Slack error:', err.message);
    res.status(500).json({ error: `Slack 發送失敗: ${err.message}` });
  }
});

module.exports = router;
