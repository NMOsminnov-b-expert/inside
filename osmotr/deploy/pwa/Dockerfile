# «Осмотр» PWA — образ со сборкой внутри. Контекст — корень репозитория:
#   docker build -f deploy/pwa/Dockerfile -t osmotr-pwa .
#   docker run --rm -p 8080:8080 osmotr-pwa        → http://localhost:8080/
# Сборке нужен интернет (Gradle, Node.js, Yarn, Binaryen, npm) и ~6 ГБ памяти — docs/devops-pwa.md.

# --- сборка: JDK 21 (Gradle, Kotlin/Wasm) + Node.js (служебный работник) ---
FROM eclipse-temurin:21-jdk-noble AS build
COPY --from=node:24-bookworm-slim /usr/local/bin/node /usr/local/bin/node
# Node.js, которого качает Kotlin для webpack, требует libatomic (в образе temurin её нет — сборка падала с кодом 127).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends libatomic1 >/dev/null && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY . .
# Без RUN --mount (кэша BuildKit): собирается и классическим docker build, и buildah/kaniko.
RUN tools/web/build.sh && ./gradlew --stop -q
# Карты исходников — не раздаются; остальное сжать заранее (gzip_static): .wasm, .js, .css, манифест, шрифты.
RUN cd shared/build/dist/wasmJs/productionExecutable && find . -name '*.map' -delete \
 && find . -type f \( -name '*.wasm' -o -name '*.js' -o -name '*.css' -o -name '*.webmanifest' -o -name '*.ttf' \) -exec gzip -9 -k -n {} \;

# --- раздача: nginx без root ---
FROM nginxinc/nginx-unprivileged:1.28-alpine AS runtime
COPY deploy/pwa/osmotr-pwa.conf /etc/nginx/osmotr-pwa.conf
COPY deploy/pwa/container.conf /etc/nginx/conf.d/default.conf
# Владелец — сразу при копировании: отдельный chown удвоил бы слой с файлами.
COPY --from=build --chown=101:101 /src/shared/build/dist/wasmJs/productionExecutable/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
