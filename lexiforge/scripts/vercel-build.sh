#!/usr/bin/env sh
# Vercel production build: sync the schema to the cloud database, seed RSS feeds, then build.
# `prisma db push` here is additive-only: it refuses any change that would drop data.
set -eu
# Neon's Vercel integration names the direct URL DATABASE_URL_UNPOOLED.
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-${DATABASE_URL}}}"
npx prisma generate
npx prisma db push --skip-generate
npx tsx prisma/seed.ts
npx next build
