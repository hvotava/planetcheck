# planetcheck — Railway image. Full install (not standalone) so that
# `pnpm db:migrate` can run as the pre-deploy command from the same image.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
# pnpm-workspace.yaml carries `allowBuilds`; without it pnpm 11 refuses the install
# because the native packages' build scripts are unapproved.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV PLANETCHECK_DATA=pg
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV PLANETCHECK_DATA=pg
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
