// ============================================================
// Moomina AI Companion – Proactive Scheduler
// ============================================================
const cron = require('node-cron');
const { Expo } = require('expo-server-sdk');
const db = require('./db');

const expo = new Expo();

function initScheduler() {
    console.log('⏰ Scheduler initialized');
    console.log('   📅 Morning greeting: 8:00 AM');
    console.log('   📅 Evening check-in: 10:00 PM');
    console.log('   📅 Random check-in: every 4 hours');

    // ── MORNING GREETING (8:00 AM) ──────────────────────────────
    cron.schedule('0 8 * * *', async () => {
        console.log('⏰ Running Morning Job...');
        await attemptProactiveMessage('morning', 'Good morning! ☀️ How did you sleep, jaan?');
    });

    // ── EVENING CHECK-IN (10:00 PM) ─────────────────────────────
    cron.schedule('0 22 * * *', async () => {
        console.log('⏰ Running Evening Job...');
        await attemptProactiveMessage('evening', 'Good night, sleep well! 🌙✨');
    });

    // ── RANDOM CHECK-IN (Every 4 hours) ─────────────────────────
    cron.schedule('0 */4 * * *', async () => {
        console.log('⏰ Running Random Check-in Job...');

        // Check sleep window (11 PM - 7 AM)
        const hour = new Date().getHours();
        if (hour >= 23 || hour < 7) {
            console.log('💤 Shh... Moomina is sleeping.');
            return;
        }

        // Check interaction gap (don't annoy if we just talked)
        const state = await db.getMoominaState();
        const lastInteraction = new Date(state.last_interaction_time).getTime();
        const now = Date.now();
        const hoursSinceLast = (now - lastInteraction) / (1000 * 60 * 60);

        if (hoursSinceLast > 6) {
            // It's been quiet properly context aware message
            await attemptProactiveMessage('random', "Thinking of you... what are you up to? ❤️");
        } else {
            console.log(`⏳ Only ${hoursSinceLast.toFixed(1)}h since last chat, skipping.`);
        }
    });
}

/**
 * Sends a push notification + saves message to DB
 */
async function attemptProactiveMessage(type, defaultText) {
    const token = await db.getPushToken();
    if (!token) {
        console.log('⚠️ No push token found, skipping proactive message.');
        return;
    }

    if (!Expo.isExpoPushToken(token)) {
        console.error(`⚠️ Invalid push token: ${token}`);
        return;
    }

    // 1. Save message to chat history so it appears in the app
    await db.saveMessage('assistant', defaultText, 'Affectionate');

    // 2. Send Push Notification
    const messages = [{
        to: token,
        sound: 'default',
        title: 'Moomina',
        body: defaultText,
        data: { type: 'chat', message: defaultText },
    }];

    try {
        const chunks = expo.chunkPushNotifications(messages);
        for (const chunk of chunks) {
            const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            console.log('🚀 Notification sent:', ticketChunk);
        }
    } catch (error) {
        console.error('❌ Error sending notification:', error);
    }
}

module.exports = { initScheduler };
