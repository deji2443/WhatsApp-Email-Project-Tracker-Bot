# Ezone WhatsApp & Email Project Tracker Bot

An automated notification system that bridges Google Sheets with WhatsApp groups and email alerts. When a task status or row is updated in your project tracker, the system automatically dispatches a formatted project card to a WhatsApp group via Webhook and sends a direct notification email to the assigned engineer based on Column D.

## Features

- **Real-Time Sync:** Automatically triggers updates when spreadsheet rows or status dropdowns are modified via Google Apps Script.
- **WhatsApp Integration:** Sends structured task summary cards straight to designated WhatsApp groups.
- **Dynamic Email Alerts:** Automatically reads engineer email addresses from Column D of the active ticket row and notifies them of any changes.
- **Secure Tunneling:** Uses tunneling tools (like Ngrok or Localtunnel) to safely expose local webhook endpoints to Google Apps Script.

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Node.js** (v16+ recommended)
- **npm** (Node Package Manager)
- A tunneling tool (e.g., **Ngrok** or **Localtunnel**)

### Installation

Clone the repository and install the required dependencies:

```bash
npm install
 
Start the Bot Server
node bot.js

Expose Localhost via Tunneling
ngrok http 3000 --url <ngrok-url>

Example:
ngrok http 3000 --url https://mud-component-scenic.ngrok-free.dev


Configure Google Apps Script
1. Open your Google Sheet, navigate to Extensions > Apps Script, and paste your automation script (Code.gs).

2. Update the webhookUrl variable in your Apps Script code with your active public tunnel URL (appending /send-alert).

3. Save and test your script. Any edits or status changes in your project tracker will now instantly sync with WhatsApp and send targeted email alerts to the engineers!# Ezone-WhatsApp-Email-Project-Tracker-Bot
