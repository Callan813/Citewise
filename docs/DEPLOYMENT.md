# Deploying to a server

This puts the whole app on one Linux server with Docker. Caddy handles HTTPS by itself, and only ports 80 and 443 are reachable from outside.

You need:

- A small Ubuntu server with at least 2 GB of RAM and some swap
- A domain or subdomain pointing at the server's IP address, using an `A` record
- A Gemini API key

## 1. Prepare the server

```bash
ssh root@YOUR_SERVER_IP

adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh

curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

Docker can bypass `ufw` for published ports. That's why the production compose file only publishes Caddy, and Grafana only on the server's localhost.

## 2. Get the code

Log back in as `deploy`. While the repository is private, the server needs a deploy key: run `ssh-keygen -t ed25519`, then add the public key under the repository's Settings, Deploy keys.

```bash
sudo mkdir -p /opt/citewise && sudo chown deploy:deploy /opt/citewise
git clone git@github.com:Callan813/Citewise.git /opt/citewise
cd /opt/citewise
cp .env.production.example .env.production
nano .env.production
```

Generate each password and secret with `openssl rand -base64 48`. Then lock the file down:

```bash
chmod 600 .env.production
```

## 3. Start it

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm api node dist/scripts/seed.js
```

The first build takes a few minutes. Open `https://your-domain`, where the seeded notes should turn ready within a minute. If you set `DEMO_EMAIL` and `DEMO_PASSWORD`, that account now exists for interviewers to try.

## 4. Check it

```bash
curl https://your-domain/api/health
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f api worker
```

If you use Google sign-in, add `https://your-domain` to the client's Authorized JavaScript origins.

## 5. Back up

Add this to `crontab -e`:

```text
0 3 * * * cd /opt/citewise && ./deploy/backup.sh >> backup.log 2>&1
```

Copy backups off the server too, since a backup on the same disk doesn't survive losing that disk. To restore the database into an empty one:

```bash
gunzip -c backups/db-DATE.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Be careful with `docker compose down -v`, which deletes the database and uploads.

## 6. Deploy automatically (optional)

`.github/workflows/deploy.yml` runs `deploy/update.sh` over SSH after CI passes on `main`. To turn it on:

1. Create an SSH key pair just for deploys, and add the public key to `/home/deploy/.ssh/authorized_keys`.
2. In the repository's Settings, Secrets and variables, Actions, add the secrets `DEPLOY_HOST`, `DEPLOY_USER` and `DEPLOY_SSH_KEY`.
3. Add the repository variable `DEPLOY_ENABLED` with the value `true`.

## 7. Monitoring (optional)

Set `METRICS_TOKEN` and `GRAFANA_PASSWORD`, then:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile monitoring up -d
```

Grafana isn't public. From your own computer, open a tunnel and visit http://localhost:3000:

```bash
ssh -L 3000:localhost:3000 deploy@YOUR_SERVER_IP
```

## Before sharing the link

- Set your Gemini budget and limits for the worst case, because every account shares one key.
- Make the repository public when you want interviewers to see the code. Run `git log -p | grep -i "AIza"` first, as a last check for leaked keys.
- Try signing up, uploading, asking and deleting on the live site.
- Restore a backup at least once, since an untested backup is only a hope.
