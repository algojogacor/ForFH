# Deploy Koyeb / container apa pun — Next.js standalone multi-stage.
# Base Debian slim (bukan alpine): kompatibel dengan prebuild native
# (libsql) tanpa trik musl; image tetap kecil karena runner hanya berisi
# .next/standalone.
#
# Build args (NEXT_PUBLIC_* dibundle saat build, wajib diisi):
#   NEXT_PUBLIC_APP_URL      — URL publik app (https://<app>.koyeb.app atau domain)
#   NEXT_PUBLIC_VAPID_PUBLIC_KEY — kunci publik web push
# Env runtime lain (rahasia) diisi lewat env service Koyeb — lihat .env.example.

# ---------- deps: install semua dependency (dev dibutuhkan untuk build) ----------
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder: build Next.js (menghasilkan .next/standalone) ----------
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
RUN npm run build

# ---------- runner: sesedikit mungkin — hanya standalone + static ----------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # Zona WIB untuk render tanggal server-side (due dates, kalender)
    TZ=Asia/Jakarta
# tzdata diperlukan agar ENV TZ benar-benar berlaku di Debian slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
RUN mkdir .next && chown nextjs:nodejs .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
