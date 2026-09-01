FROM node:20-slim

# Install OpenSSL and CA certificates needed for Baileys WebSocket connection
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

# Create session directory to prevent crashes
RUN mkdir -p auth_info_baileys

EXPOSE 3000

CMD ["npm", "start"]