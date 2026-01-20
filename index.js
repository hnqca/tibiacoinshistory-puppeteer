require("dotenv").config();

const fs        = require('fs');
const axios     = require('axios');
const puppeteer = require('puppeteer');

const CONFIG = {
    account: {
        email: process.env.ACCOUNT_EMAIL,
        password: process.env.ACCOUNT_PASSWORD
    },
    file: {
        cookies: "files/cookies.json",
        coins_history_latest: "files/coins_history_latest.json"
    },
    check_loop: {
        active: true, // true = executa em loop | false = executa uma única vez
        seconds: 60
    },
    webhook_url: process.env.WEBHOOK_URL
}

let lastHistoryData = [];

// Salva os cookies de sessão:
const saveCookies = async (page) => {
    const cookies = await page.cookies();
    fs.writeFileSync(CONFIG.file.cookies, JSON.stringify(cookies, null, 2));
}

// Carrega os cookies da sessão de login anterior:
const loadCookies = async (page) => {

    if (!fs.existsSync(CONFIG.file.cookies)) {
        console.log("arquivo de cookie não encontrado, realizando o login pela primeira vez...");
        return;
    }

    const cookies = JSON.parse(fs.readFileSync(CONFIG.file.cookies, 'utf8'));

    for (const cookie of cookies) {
        await page.setCookie(cookie);
    }

    console.log('cookies carregados com sucesso!');
}


const getCoinsHistoryFormatted = async (rawData) => {
    return rawData.map(item => {
        const description = item.description.trim();

        let event    = 'other';
        let sender   = null;
        let receiver = null;

        // Gift
        const giftMatch = description.match(/(.+?)\s+gifted\s+to\s+(.+)/i);
        if (giftMatch) {
            event    = 'gift';
            sender   = giftMatch[1];
            receiver = giftMatch[2];
        }

        // Market
        else if (/market/i.test(description)) {
            event = 'market';
        }

        // Type
        const type = item.amount > 0 ? 'deposit' : 'withdrawal';

        return {
            id:       item.id,
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

const checkForUpdatesCoinsHistory = async (newHistoryFormatted) => {

    const oldHistory = JSON.parse(fs.readFileSync(CONFIG.file.coins_history_latest));

    const newItems = newHistoryFormatted.filter(item => !oldHistory.some(old => old.id === item.id));

    if (newItems.length < 1) {
        console.log('sem novidades');
        return;
    }

    console.log(`${newItems.length} novo(s) registro(s) encontrado(s):`);
    console.log(newItems);

    fs.writeFileSync(CONFIG.file.coins_history_latest, JSON.stringify(newHistoryFormatted, null, 2));
    lastHistoryData = newHistoryFormatted;

    if (!CONFIG.webhook_url) {
        return;
    }

    try {
        await axios.post(CONFIG.webhook_url, newItems, { headers: { "Content-Type": "application/json" } });
    } catch (err) {
        console.error('erro ao enviar: ', err.message);
    }
}


const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {

    console.log("iniciando...");

    if (!fs.existsSync('./files')) {
        fs.mkdirSync('./files', { recursive: true });
        console.log("diretório 'files' criado.");
    }

    if (!fs.existsSync(`./files/cookies.json`)) {
        fs.writeFileSync(`./files/cookies.json`, "[]");
        console.log("arquivo 'cookies.json' criado.");
    }

    if (!fs.existsSync(`./files/coins_history_latest.json`)) {
        fs.writeFileSync(`./files/coins_history_latest.json`, "[]");
        console.log("arquivo 'coins_history_latest.json' criado.");
    }

    if (!CONFIG.account.email || !CONFIG.account.password) {
        console.error("❌ Variáveis de ambiente ausentes. Verifique seu arquivo .env e informe todos os dados necessários.");
        process.exit(1);
    }

    const browser = await puppeteer.launch({
        args: [
            "--disable-setuid-sandbox",
            "--no-sandbox"
        ],
        slowMo: 50,
        headless: true,
        executablePath: puppeteer.executablePath(),
    });

    const page = await browser.newPage();

    await loadCookies(page);

    // 1. Acessa a página "ownbids" para evitar o cloudflare:
    await page.goto('https://www.tibia.com/charactertrade/?subtopic=ownbids', { waitUntil: 'networkidle2' });

    // 2. Verifica se já está logado no site:
    const isLoggedOut = await page.$('input[type="submit"][value="Login"]');

    if (isLoggedOut) {
        console.log("Usuário está deslogado. Clicando no botão de login...");

        await page.waitForSelector('form[action="https://www.tibia.com/account/?subtopic=redirectlogin"]', { visible: true, timeout: 90000 });
        await page.evaluate(() => {
            document.querySelector('form[action="https://www.tibia.com/account/?subtopic=redirectlogin"]').submit();
        });

        await page.waitForSelector('input[name="loginemail"]', { visible: true });

        console.log("formulário de login carregado, efetuando o login...");

        await page.type('input[name="loginemail"]', CONFIG.account.email, { delay: 50 });
        await page.type('input[name="loginpassword"]', CONFIG.account.password, { delay: 50 });

        await page.evaluate(() => {
            document.querySelector('form#LoginForm').submit();
        });

        await page.waitForXPath('//div[@class="Text" and normalize-space()="My Bids"]', { visible: true });

        await saveCookies(page);

        console.log("Login efetuado com sucesso!");
    }

    // Se já houver dados salvos, carrega:
    if (fs.existsSync(CONFIG.file.coins_history_latest)) {
        lastHistoryData = JSON.parse(fs.readFileSync(CONFIG.file.coins_history_latest));
    }

    if (!CONFIG.check_loop.active) {
        console.log("fim da tarefa");
        await browser.close();
        return;
    }

    while (true) {
        console.log(`[${new Date().toISOString()}] procurando novos dados…`);

        await page.goto('https://www.tibia.com/account/?subtopic=accountmanagement&page=tibiacoinshistory', { waitUntil: 'networkidle2' });
        await page.waitForSelector('td.LabelV150');

        const result = await page.evaluate(() => {
            const rows = document.querySelectorAll("table.TableContent tr:not(.LabelH)");
            const data = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length < 5) return;

                const id          = parseInt(cells[0].innerText.trim());
                const date        = cells[1].innerText.trim().replace(/\u00a0/g, ' ');
                const description = cells[2].innerText.trim();
                const character   = cells[3].innerText.trim();
                const amount      = parseInt(cells[4].innerText.trim().replace(/[^\d+-]/g, ''), 10) || 0;

                data.push({ id, date, description, character, amount });
            });

            return data;
        });

        const history = await getCoinsHistoryFormatted(result);

        await checkForUpdatesCoinsHistory(history);
        await sleep(CONFIG.check_loop.seconds * 1000);
    }
})();
