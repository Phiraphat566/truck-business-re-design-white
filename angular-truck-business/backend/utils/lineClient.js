import axios from 'axios';

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN; // ใส่ใน .env
export const lineClient = {
  replyMessage(body) {
    return axios.post('https://api.line.me/v2/bot/message/reply', body, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    });
  },
};
