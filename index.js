require("dotenv").config();

const fs        = require('fs');
const path      = require('path');
const axios     = require('axios');
const puppeteer = require('puppeteer');

// Configuration constants
const FILES_DIR = path.join(__dirname, 'files');

const CONFIG = {
    account: {
        email: process.env.ACCOUNT_EMAIL,
        password: process.env.ACCOUNT_PASSWORD
    },
    paths: {
        cookies: path.join(FILES_DIR, "cookies.json"),
        history: path.join(FILES_DIR, "coins_history_latest.json")
    },
    loop: {
        active: true,
        interval: 60 // seconds
    },
    webhook: process.env.WEBHOOK_URL
};

/**
 * Saves current browser session cookies to a file
 */
const saveCookies = async (page) => {
    const cookies = await page.cookies();
    fs.writeFileSync(CONFIG.paths.cookies, JSON.stringify(cookies, null, 2));
};

/**
 * Loads previous session cookies if they exist
 */
const loadCookies = async (page) => {

    if (!fs.existsSync(CONFIG.paths.cookies)) {
        console.log("[INFO] Cookie file not found. Fresh login required.");
        return;
    }

    try {
        const cookies = JSON.parse(fs.readFileSync(CONFIG.paths.cookies, 'utf8'));
        for (const cookie of cookies) {
            await page.setCookie(cookie);
        }
        console.log("[INFO] Session cookies loaded successfully.");
    } catch (err) {
        console.error("[ERROR] Failed to load cookies:", err.message);
    }
};

/**
 * Formats raw scraped data into structured JSON
 */
const formatHistoryData = (rawData) => {
    return rawData.map(item => {
        const description = item.description.trim();
        let event    = 'other';
        let sender   = null;
        let receiver = null;

        // Regex for Gift events
        const giftMatch = description.match(/(.+?)\s+gifted\s+to\s+(.+)/i);
        if (giftMatch) {
            event    = 'gift';
            sender   = giftMatch[1];
            receiver = giftMatch[2];
        } else if (/market/i.test(description)) {
            event = 'market';
        }

        const type = item.amount > 0 ? 'deposit' : 'withdrawal';

        return {
            id: item.id,
            datetime: item.date,
            event,
            type,
            amount: item.amount,
            description,
            sender,
            receiver
        };
    });
};

/**
 * Checks for new records and dispatches to webhook
 */
const syncHistoryUpdates = async (newFormattedHistory) => {
    let oldHistory = [];
    if (fs.existsSync(CONFIG.paths.history)) {
        oldHistory = JSON.parse(fs.readFileSync(CONFIG.paths.history));
    }

    const newItems = newFormattedHistory.filter(item => 
        !oldHistory.some(old => old.id === item.id)
    );

    if (newItems.length === 0) {
        console.log("[INFO] No new updates found.");
        return;
    }

    console.log(`[INFO] ${newItems.length} new records detected.`);
    
    // Update local storage
    fs.writeFileSync(CONFIG.paths.history, JSON.stringify(newFormattedHistory, null, 2));

    if (CONFIG.webhook) {
        try {
            await axios.post(CONFIG.webhook, newItems);
            console.log("[SUCCESS] Dispatched updates to webhook.");
        } catch (err) {
            console.error("[ERROR] Webhook dispatch failed:", err.message);
        }
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    console.log("[START] Initializing scraper...");

    // Ensure environment is ready
    if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
    if (!CONFIG.account.email || !CONFIG.account.password) {
        console.error("[CRITICAL] Missing credentials in .env file. Exiting.");
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        args: ["--disable-setuid-sandbox", "--no-sandbox"],
        headless: "new"
    });

    try {
        const page = await browser.newPage();
        await loadCookies(page);

        // Access Auction page to bypass simple Cloudflare checks
        await page.goto('https://www.tibia.com/charactertrade/?subtopic=ownbids', { waitUntil: 'networkidle2' });

        const isLoggedOut = await page.$('input[type="submit"][value="Login"]');

        if (isLoggedOut) {
            console.log("[INFO] User logged out. Starting authentication flow...");
            
            await page.waitForSelector('form[action*="redirectlogin"]', { visible: true });
            await page.evaluate(() => document.querySelector('form[action*="redirectlogin"]').submit());

            await page.waitForSelector('input[name="loginemail"]', { visible: true });
            await page.type('input[name="loginemail"]', CONFIG.account.email, { delay: 30 });
            await page.type('input[name="loginpassword"]', CONFIG.account.password, { delay: 30 });

            await page.evaluate(() => document.querySelector('form#LoginForm').submit());
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            await saveCookies(page);
            console.log("[SUCCESS] Login successful.");
        }

        // Execution Loop
        while (CONFIG.loop.active) {
            try {
                console.log(`[${new Date().toISOString()}] Checking Tibia Coins history...`);

                await page.goto('https://www.tibia.com/account/?subtopic=accountmanagement&page=tibiacoinshistory', { waitUntil: 'networkidle2' });
                await page.waitForSelector('td.LabelV150', { timeout: 30000 });

                const rawData = await page.evaluate(() => {
                    const rows = document.querySelectorAll("table.TableContent tr:not(.LabelH)");
                    const data = [];
                    rows.forEach(row => {
                        const cells = row.querySelectorAll("td");
                        if (cells.length < 5) return;

                        data.push({
                            id: parseInt(cells[0].innerText.trim()),
                            date: cells[1].innerText.trim().replace(/\u00a0/g, ' '),
                            description: cells[2].innerText.trim(),
                            character: cells[3].innerText.trim(),
                            amount: parseInt(cells[4].innerText.trim().replace(/[^\d+-]/g, ''), 10) || 0
                        });
                    });
                    return data;
                });

                const history = formatHistoryData(rawData);
                await syncHistoryUpdates(history);

            } catch (loopErr) {
                console.error("[ERROR] Loop cycle failed. Retrying next interval:", loopErr.message);
            }

            if (!CONFIG.loop.active) break;
            await sleep(CONFIG.loop.interval * 1000);
        }

    } catch (criticalErr) {
        console.error("[CRITICAL] Fatal error during execution:", criticalErr.message);
    } finally {
        await browser.close();
        console.log("[END] Scraper terminated.");
    }
})();