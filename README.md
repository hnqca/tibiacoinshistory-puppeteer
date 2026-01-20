# Tibia Coins History Scraper

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-%2340B5A4.svg?style=for-the-badge&logo=Puppeteer&logoColor=black)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)

Projeto simples para estudar **Puppeteer**, com foco em **automação web** e **web scraping**.

## Objetivo:

Automatizar o processo de autenticação no site do Tibia (tibia.com), extrair o histórico de transações de Tibia Coins a partir da tabela dinâmica e enviar os dados formatados em JSON por meio de uma requisição HTTP POST para uma webhook configurável.

## 📦 Instalação e Execução

### ⚙️ Pré-requisitos

Antes de começar, certifique-se de que você tem os seguintes softwares instalados em seu ambiente:

- Git
- Docker

### 🚀 Instalação

Siga os passos abaixo para baixar e configurar o projeto em sua máquina.

### 1. Clonar o repositório

```bash
git clone https://github.com/hnqca/tibiacoinshistory-puppeteer
cd tibiacoinshistory-puppeteer
```

### 2. Configurar variáveis de ambiente

Renomeie **`.env.example`** para **`.env`** e configure as seguintes variáveis:

```bash
ACCOUNT_EMAIL="<ACCOUNT_EMAIL>"       # Email da conta do Tibia (obrigatório)
ACCOUNT_PASSWORD="<ACCOUNT_PASSWORD>" # Senha da conta do Tibia (obrigatório)
WEBHOOK_URL="<YOUR_WEBHOOK_URL>"      # URL da webhook de destino (opcional)
```

### 3. Build da imagem Docker

```bash
docker build -t tibiacoinshistory-puppeteer .
```

### 4. Executar o container

```bash
docker run -it tibiacoinshistory-puppeteer
```


## Exemplo de Resposta:

![](https://i.ibb.co/nM2kK4zz/Captura-de-tela-19-1-2026-17372-www-tibia-com.jpg)

```json
[
  {
    "id": 14,
    "datetime": "Apr 17 2025, 21:17:04 CEST",
    "event": "gift",
    "type": "withdrawal",
    "amount": -25,
    "description": "Brewie gifted to Valanan Dulf",
    "sender": "Brewie",
    "receiver": "Valanan Dulf"
  },
  {
    "id": 13,
    "datetime": "Apr 17 2025, 18:26:30 CEST",
    "event": "gift",
    "type": "deposit",
    "amount": 25,
    "description": "Alim gifted to Brewie",
    "sender": "Alim",
    "receiver": "Brewie"
  },
  // ...
]
```

## 🔁 Modo de Execução Contínua (Loop)
O script possui um modo opcional de execução contínua, que permite que o script reexecute automaticamente a verificação e a coleta de novos dados na tabela em intervalos definidos.

Essa funcionalidade é configurada no arquivo **``index.js``** através do objeto:

```js
check_loop: {
    active: true,
    seconds: 60
},
```

## Fluxo de Execução

![](https://i.ibb.co/CKZs8FCJ/fluxo.jpg)

- Carrega variáveis de ambiente e configurações iniciais
- Cria diretórios e arquivos necessários (cookies.json, coins_history_latest.json)
- Inicia o navegador com Puppeteer
- Carrega cookies de sessão salvos (se existirem)
- Acessa o site do Tibia para validação de sessão
- Realiza login automático caso não esteja autenticado
- Acessa a página de histórico de Tibia Coins
- Coleta e normaliza os dados da tabela dinâmica
- Compara com o último histórico salvo
- Envia apenas novos registros para a webhook (se configurada)
- Aguarda o intervalo definido e repete o processo