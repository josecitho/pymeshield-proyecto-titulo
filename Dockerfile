# Image Base using lightweight Alpine Node.js
FROM node:20-alpine

# Install nmap tool for native network scanning support in Linux container
RUN apk add --no-cache nmap

# Set work directory
WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy prisma directory
COPY prisma ./prisma/

# Generate Prisma Client
RUN npx prisma generate

# Copy all application files
COPY . .

# Expose backend port
EXPOSE 3000

# Execute prisma push to setup database, then start the server
CMD ["sh", "-c", "npx prisma db push && node server.js"]
