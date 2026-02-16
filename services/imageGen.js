const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function generateImage(prompt) {
    try {
        console.log('[ImageGen] Generating:', prompt);

        // Enhance prompt for better results
        const enhancedPrompt = `photorealistic, 8k, selfie of 24yo indian girl, ${prompt}, detailed face, natural lighting, shot on iphone, high quality`;
        const encodedPrompt = encodeURIComponent(enhancedPrompt);

        // Pollinations.ai is blocked on user network (530 Error), as are proxies.
        // Fallback to LoremFlickr for reliable "girl" photos.

        const keywords = 'girl,selfie,fashion,model'; //,portrait
        const randomSeed = Date.now();
        const url = `https://loremflickr.com/800/1000/girl,selfie,fashion,model?random=${randomSeed}`;

        console.log('[ImageGen] Returning LoremFlickr URL (Fallback):', url);
        return url;

        /* Original Pollinations Code (Blocked)
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}.jpg?nologo=true`;
        return url;
        */

        /* Server-side fetch disabled due to Cloudflare 530 blocks
        const response = await fetch(url, { ... });
        if (!response.ok) { ... }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const filename = `gen_${Date.now()}_${uuidv4()}.jpg`;
        const filepath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        return `/uploads/${filename}`;
        */
    } catch (error) {
        console.error('[ImageGen] Error:', error);
        return null;
    }
}

module.exports = { generateImage };
