# Use an official Node.js runtime as the base image
FROM node:20-slim

# Install system dependencies if required by Baileys/Canvas (optional, but good practice for Node bots)
RUN apt-get update && apt-get install -y \
    git \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port your Express server uses (change if your app uses a different port)
EXPOSE 3000

# Define the command to run your app
CMD ["npm", "start"]