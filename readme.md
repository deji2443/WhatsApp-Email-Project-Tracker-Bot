# WhatsApp & Email Project Tracker Bot

An automated notification system that bridges Google Sheets with WhatsApp groups and email alerts. When a task status or row is updated in your project tracker, the system automatically dispatches a formatted project card to a WhatsApp group via Webhook and sends a direct notification email to the assigned engineer based on Column D.

---

## Features

- **Real-Time Sync:** Automatically triggers updates when spreadsheet rows or status dropdowns are modified via Google Apps Script.
- **WhatsApp Integration:** Sends structured task summary cards straight to designated WhatsApp groups.
- **Dynamic Email Alerts:** Automatically reads engineer email addresses from Column D of the active ticket row and notifies them of any changes.
- **Dockerized Deployment:** Containerized for smooth, reliable hosting and easy session management.
- **Secure Tunneling:** Uses tunneling tools (like Ngrok) to safely expose local webhook endpoints to Google Apps Script.

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Docker** and **Docker Desktop** (Recommended for hosting)
- **Node.js** (v18+ recommended, if running locally without Docker)
- A tunneling tool (e.g., **Ngrok**)

---

### Installation & Deployment

#### Option 1: Running with Docker (Recommended)

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/optisoftprime/Ezone-project-tracker.git](https://github.com/optisoftprime/Ezone-project-tracker.git)

   cd Ezone-project-tracker


Build the Docker image:

Bash
docker build -t ezone-whatsapp-bot .
Run the container (with WhatsApp session persistence):
This mounts your local auth_info_baileys folder to the container so you don't lose your WhatsApp login when restarting.

Bash

docker run -d \
  --name whatsapp-bot \
  -p 3000:3000 \
  -v $(pwd)/auth_info_baileys:/app/auth_info_baileys \
  ezone-whatsapp-bot

View logs / Scan the WhatsApp QR code:

Bash
docker logs -f whatsapp-bot
Open WhatsApp on the target phone, go to Linked Devices, and scan the QR code that appears in your terminal.

Option 2: Running Locally (Without Docker)
Clone the repository and install dependencies:

Bash
git clone [https://github.com/optisoftprime/Ezone-project-tracker.git](https://github.com/optisoftprime/Ezone-project-tracker.git)
cd Ezone-project-tracker
npm install
Start the Bot Server:

Bash
node bot.js
Expose Localhost via Tunneling
To allow Google Sheets to communicate with your bot, expose your local port via Ngrok:

Bash
ngrok http 3000
(Example public URL: https://your-ngrok-url.ngrok-free.dev)

Configure Google Apps Script
Open your Google Sheet, navigate to Extensions > Apps Script, and paste your automation script (Code.gs).

Update the webhookUrl variable in your Apps Script code with your active public tunnel URL (appending /send-alert, e.g., https://your-ngrok-url.ngrok-free.dev/send-alert).

Save and test your script. Any edits or status changes in your project tracker will now instantly sync with WhatsApp and send targeted email alerts to the engineers!