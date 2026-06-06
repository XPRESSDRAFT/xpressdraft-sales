# Xpress Draft — Sales Tool
## Setup & Deployment Guide

---

## Local Development

1. Install Node.js from https://nodejs.org (v18 or higher)
2. In the project folder, run:
   ```
   npm install
   cp .env.example .env
   ```
3. Edit `.env` with your real values
4. Run the app:
   ```
   npm start
   ```
5. Open http://localhost:3000

---

## FastComet VPS Deployment

### 1. Get a VPS
- Log in to FastComet
- Order **VPS 1** (or higher)
- Choose **Ubuntu 22.04**
- Note your server IP address

### 2. Connect to your server
On Windows, download **PuTTY** (putty.org) and connect to your server IP.
On Mac, open Terminal and run:
```
ssh root@YOUR_SERVER_IP
```

### 3. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # should show v20.x
```

### 4. Install PM2 (keeps app running)
```bash
npm install -g pm2
```

### 5. Upload the app
From your computer (not the server), run:
```bash
scp -r xpressdraft-app/ root@YOUR_SERVER_IP:/var/www/xpressdraft/
```

### 6. Install dependencies on server
```bash
cd /var/www/xpressdraft
npm install --production
cp .env.example .env
nano .env   # fill in your real values
```

### 7. Start the app with PM2
```bash
pm2 start server/index.js --name xpressdraft
pm2 save
pm2 startup  # follow the printed command to auto-start on reboot
```

### 8. Set up Nginx (web server / reverse proxy)
```bash
sudo apt-get install -y nginx
```

Create config:
```bash
sudo nano /etc/nginx/sites-available/xpressdraft
```

Paste this (replace YOUR_DOMAIN with your domain or server IP):
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and start:
```bash
sudo ln -s /etc/nginx/sites-available/xpressdraft /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 9. Add SSL (HTTPS) — free via Let's Encrypt
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

### 10. Access the app
Open http://YOUR_DOMAIN or https://YOUR_DOMAIN
Log in with the admin credentials from your .env file.

---

## Adding Users
1. Log in as admin
2. Go to /admin
3. Fill in name, email, temporary password → Add user
4. Share credentials with the team member
5. To remove access: click Deactivate or Remove

## Updating Pricing
1. Log in as admin
2. Go to /admin
3. Edit any price in the Pricing section → Save

---

## Maintenance

View logs:
```bash
pm2 logs xpressdraft
```

Restart app:
```bash
pm2 restart xpressdraft
```

Update app (after uploading new files):
```bash
pm2 restart xpressdraft
```
