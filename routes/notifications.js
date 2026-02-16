const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/notifications/register
router.post('/register', (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    console.log('🔔 Registered push token:', token);
    db.updatePushToken(token);
    res.json({ success: true });
});

module.exports = router;
