# «Осмотр» PWA — развёртывание (для DevOps)

## 1. Что разворачиваем

«Осмотр» — приложение для фотофиксации при осмотрах оборудования по описям. Для iPhone оно
работает как **PWA**: веб-приложение, которое ставится на экран «Домой» из Safari.

С точки зрения инфраструктуры это **статический сайт**:

- нет сервера приложений, базы данных и API — приложение никуда не ходит в сеть;
- все данные (описи, снимки, видео) хранятся **в браузере телефона** (IndexedDB);
- на сервере ничего не пишется и не хранится, резервные копии сервера не нужны;
- секретов нет — ни при сборке, ни при работе;
- после первого открытия приложение работает **без сети**: всё кэширует служебный работник (`sw.js`).

Нужен только **https**. Без него Safari не даст камеру, микрофон и работу без сети.

Поставляем контейнер: nginx без root, слушает порт **8080** по http. https снимает то, что стоит
перед ним: ingress, балансировщик или nginx сервера.

## 2. Файлы в репозитории

| Путь | Что это |
|---|---|
| `.gitlab-ci.yml` | конвейер GitLab: сборка → образ в реестр GitLab → выкладка по кнопке |
| `deploy/pwa/Dockerfile` | образ со сборкой внутри (для ручной сборки без GitLab) |
| `deploy/pwa/Dockerfile.prebuilt` | образ из уже собранной папки (использует GitLab) |
| `deploy/pwa/container.conf` | сайт nginx в контейнере: порт 8080, `/healthz`, `gzip_static` |
| `deploy/pwa/osmotr-pwa.conf` | общая часть nginx: типы файлов, сжатие, кэш, заголовки безопасности |
| `deploy/pwa/docker-compose.yml` | запуск на одном сервере (вариант A) |
| `deploy/pwa/k8s.yaml` | Deployment, Service и Ingress для Kubernetes (вариант B) |
| `deploy/pwa/site.conf` | nginx без контейнера (вариант C) |
| `tools/web/build.sh` | сборка PWA → `shared/build/dist/wasmJs/productionExecutable` |
| `tools/web/sw.mjs` | генератор служебного работника; его вызывает `build.sh` |
| `tools/web/https-check.sh` | проверка настройки nginx по https с прогоном автотестов |
| `.dockerignore` | контекст сборки образа: без `build/`, `.git`, ключей подписи Android |
| `docs/pwa.md` | для пользователей и разработчиков: установка на iPhone, отличия от Android, поддержка Safari |

## 3. Сборка

### Чем собирается

- **JDK 21** и Gradle 9.6 (Gradle скачивает обёртка `./gradlew`), Kotlin 2.4, Compose Multiplatform
  1.13 (alpha) для веба;
- **Node.js** — Kotlin-плагин качает его сам для webpack; отдельно `node` нужен в `PATH` для
  `tools/web/sw.mjs`, подойдёт любая версия от 18;
- Android SDK, Xcode и macOS **не нужны**.

Ресурсы раннера:

| | Значение |
|---|---|
| Память | **6 ГБ** свободно, лучше 8: Gradle 2 ГБ + демон Kotlin 1,5 ГБ + webpack и Binaryen |
| Диск | ~5 ГБ: кэш Gradle и Node, сборка |
| Время | без кэша — около 10 минут (замер: 9–10 мин в чистом контейнере вместе со скачиванием); с кэшем Gradle — несколько минут |

### Какие адреса нужны раннеру

Сборке нужен исходящий https до следующих адресов (если раннер ходит через прокси или зеркала — см. § 9):

| Адрес | Что качается |
|---|---|
| `services.gradle.org`, `downloads.gradle.org` | Gradle |
| `plugins.gradle.org` | плагины Gradle |
| `repo.maven.apache.org`, `repo1.maven.org` | Kotlin, Compose, библиотеки (Maven Central) |
| `dl.google.com`, `maven.google.com` | библиотеки Google (AndroidX, Compose) |
| `nodejs.org` | Node.js для webpack |
| `github.com`, `objects.githubusercontent.com` | Yarn и Binaryen (оптимизатор WebAssembly) |
| `registry.yarnpkg.com` | пакеты npm: webpack, fflate, @noble/curves |
| `registry-1.docker.io` (Docker Hub) | базовые образы: `eclipse-temurin`, `node`, `nginxinc/nginx-unprivileged`, `docker`, `alpine` |
| `archive.ubuntu.com` | `nodejs` в задаче `build:pwa` |

### Как собрать

```bash
# В контейнере, без GitLab (на выходе — готовый образ):
docker build -f deploy/pwa/Dockerfile -t osmotr-pwa .

# Без контейнера (на выходе — папка shared/build/dist/wasmJs/productionExecutable):
JAVA_HOME=/путь/к/jdk-21 tools/web/build.sh
```

Что получается — около 15 файлов, ~14 МБ, со сжатием ~4 МБ:

| Файл | Кэш | Зачем |
|---|---|---|
| `index.html` | no-cache | страница; проверяет браузер (iOS 18.2+), грузит приложение |
| `sw.js` | no-cache | служебный работник; его версия — хэш всех файлов сборки |
| `manifest.webmanifest` | no-cache | имя, значки, режим «как приложение» |
| `glue.js`, `osmotr.js`, `osmotr.css` | no-cache | связка с браузером, загрузчик |
| `<хэш>.wasm` (2 шт.) | год, immutable | само приложение; имя меняется с каждой сборкой |
| `icon-*.png`, `favicon.png`, `composeResources/**` | сутки | значки и шрифты |

## 4. GitLab CI

### Как устроен конвейер

| Задача | Когда | Что делает |
|---|---|---|
| `build:pwa` | MR, основная ветка, метки | собирает в `eclipse-temurin:21-jdk-noble`; кэш Gradle — `.gradle-home/`, ключ — версии зависимостей; артефакт — папка сборки на 2 недели |
| `image:pwa` | основная ветка, метки | собирает `Dockerfile.prebuilt`; проверяет, что образ отвечает: `/healthz`, `no-cache`, `application/wasm`; кладёт в реестр GitLab |
| `deploy:pwa` | по кнопке; только если задана `DEPLOY_HOST` | ssh на сервер, пишет `.env` с новым образом, `docker compose pull && up -d` |

Теги образа `$CI_REGISTRY_IMAGE/pwa`:

- `:<короткий хэш коммита>` — всегда;
- `:latest` — с основной ветки;
- `:<метка>` — с меток (например, `v1.0`).

### Что нужно в GitLab

1. **Раннер** с executor `docker`:
   - для `image:pwa` нужен **privileged** (`docker:29-dind`); если privileged запрещён — см. § 9;
   - метки (`tags:`) в задачах не заданы — допишите свои, если раннеры выбираются по меткам.
2. **Container Registry** включён (Settings → General → Visibility → Container registry).
3. **Переменные** (Settings → CI/CD → Variables) нужны только для `deploy:pwa`:

| Переменная | Пример | Тип | Обязательна |
|---|---|---|---|
| `DEPLOY_HOST` | `pwa.example.local` | Variable | да — без неё задачи выкладки нет |
| `DEPLOY_USER` | `deploy` | Variable | нет (`deploy`) |
| `DEPLOY_SSH_KEY` | закрытый ключ | **File**, Protected, Masked | да |
| `DEPLOY_DIR` | `/opt/osmotr-pwa` | Variable | нет (`/opt/osmotr-pwa`) |
| `GRADLE_OPTS_EXTRA` | `-Dhttps.proxyHost=proxy -Dhttps.proxyPort=3128` | Variable | нет; только при прокси |

## 5. Контейнер

| | |
|---|---|
| Базовый образ | `nginxinc/nginx-unprivileged:1.28-alpine` |
| Пользователь | `101:101` (nginx), не root |
| Порт | `8080/tcp`, http |
| Файлы сайта | `/usr/share/nginx/html` — сборка; рядом лежат `.gz`, сжатые при сборке |
| Настройка nginx | `/etc/nginx/conf.d/default.conf` ← `container.conf`; `/etc/nginx/osmotr-pwa.conf` ← `osmotr-pwa.conf` |
| Запись на диск | только `/tmp` (pid, временные файлы nginx); корень можно сделать только для чтения |
| Проверка живости | `GET /healthz` → `200 ok` |
| Журналы | stdout/stderr (`docker logs`) — доступ и ошибки nginx |
| Переменные окружения | нет |
| Тома | не нужны — данных нет |
| Ресурсы | ~7 МБ памяти (замер); ограничение 64 МБ — с запасом |
| Размер образа | ~105–115 МБ, из них базовый nginx — 81 МБ, сайт со сжатыми копиями — 22 МБ |

### Заголовки, которые ставит контейнер

| Заголовок | Значение | Зачем |
|---|---|---|
| `Content-Type` для `.wasm` | `application/wasm` | иначе браузер не запустит WebAssembly быстрым путём |
| `Content-Type` для `.webmanifest` | `application/manifest+json` | установка на экран «Домой» |
| `Cache-Control` для `index.html`, `sw.js`, манифеста, загрузчиков | `no-cache` | телефоны должны узнавать о новой сборке |
| `Cache-Control` для `.wasm` | `public, max-age=31536000, immutable` | имя по содержимому |
| `Permissions-Policy` | `camera=(self), microphone=(self), geolocation=()` | камера и микрофон — только самому приложению |
| `Strict-Transport-Security` | `max-age=31536000` | только https (браузер учитывает его лишь по https) |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `no-referrer` | |

**То, что стоит перед контейнером, не должно менять эти заголовки и кэшировать `index.html` и
`sw.js` дольше, чем говорит `no-cache`.** Иначе телефоны застрянут на старой версии.

## 6. Вариант A — один сервер (Docker + nginx сервера с https)

На сервере:

| Где | Что |
|---|---|
| `/opt/osmotr-pwa/docker-compose.yml` | копия `deploy/pwa/docker-compose.yml` |
| `/opt/osmotr-pwa/.env` | `OSMOTR_PWA_IMAGE=<реестр>/pwa:<тег>` — пишет `deploy:pwa` |
| `/opt/osmotr-pwa/.env.previous` | прежнее значение — для отката |
| `/etc/nginx/sites-available/osmotr-pwa` + ссылка в `sites-enabled/` | https-прокси на `127.0.0.1:8080` (ниже) |
| `/etc/letsencrypt/live/<домен>/` | сертификат (certbot) |

Подготовка — один раз, от root:

```bash
useradd -m -s /bin/bash -G docker deploy                 # пользователь для GitLab
install -d -o deploy -g deploy /opt/osmotr-pwa
cp deploy/pwa/docker-compose.yml /opt/osmotr-pwa/        # из репозитория
# открытый ключ пары DEPLOY_SSH_KEY — в /home/deploy/.ssh/authorized_keys
apt install nginx certbot python3-certbot-nginx
```

nginx сервера — `/etc/nginx/sites-available/osmotr-pwa`:

```nginx
server {
    listen 80;
    server_name osmotr.example.com;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    http2 on;
    server_name osmotr.example.com;
    ssl_certificate     /etc/letsencrypt/live/osmotr.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/osmotr.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header Accept-Encoding $http_accept_encoding;
        proxy_http_version 1.1;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/osmotr-pwa /etc/nginx/sites-enabled/
certbot --nginx -d osmotr.example.com
nginx -t && systemctl reload nginx
```

Дальше выкладывает GitLab (кнопка `deploy:pwa`). Вручную:

```bash
cd /opt/osmotr-pwa
docker login <реестр GitLab>                              # deploy token с read_registry
echo 'OSMOTR_PWA_IMAGE=<реестр>/pwa:<тег>' > .env
docker compose pull && docker compose up -d
```

## 7. Вариант B — Kubernetes

`deploy/pwa/k8s.yaml`: Deployment (2 реплики, не root, корень только для чтения, `/tmp` в памяти,
пробы на `/healthz`), Service и Ingress с TLS. Подставьте образ, домен, секрет TLS, класс ingress и
секрет для реестра:

```bash
kubectl create namespace osmotr
kubectl -n osmotr create secret docker-registry gitlab-registry \
  --docker-server=<реестр GitLab> --docker-username=<deploy token> --docker-password=<пароль токена>
kubectl -n osmotr apply -f deploy/pwa/k8s.yaml
```

Сертификат — cert-manager или свой секрет `osmotr-pwa-tls`. Ingress не должен перезаписывать
`Cache-Control` (§ 5).

## 8. Вариант C — без контейнера

Сборку (`tools/web/build.sh`) скопировать в `/srv/osmotr`, `deploy/pwa/osmotr-pwa.conf` — в
`/etc/nginx/`, `deploy/pwa/site.conf` — в `sites-available` (подставить домен и сертификат). Шаги —
`docs/pwa.md`, раздел «Сервер».

## 9. Ограничения окружения

- **Нет privileged-раннера (dind запрещён).** Задачу `image:pwa` можно собирать через buildah
  (`quay.io/buildah/stable`, `buildah bud -f deploy/pwa/Dockerfile.prebuilt`) или kaniko. Dockerfile
  совместим с обоими: в нём нет `RUN --mount` и других возможностей BuildKit.
- **Раннер без прямого интернета.** Нужно прописать прокси или зеркала:
  - **Gradle:** `GRADLE_OPTS_EXTRA="-Dhttps.proxyHost=… -Dhttps.proxyPort=… -Dhttp.nonProxyHosts=…"`.
    Зеркала Maven (Nexus, Artifactory) — в `settings.gradle.kts`, блоки `repositories`: `google()`,
    `mavenCentral()` и три `ivy(...)` для Node.js, Yarn и Binaryen.
  - **npm:** переменная `YARN_REGISTRY` или `npm_config_registry` — адрес зеркала npm.
  - **Docker Hub:** зеркало в `daemon.json` раннера или полные имена образов из своего реестра
    (`FROM` в Dockerfile, `image:` в `.gitlab-ci.yml`).
- **Свой образ для сборки.** `build:pwa` нужны JDK 21, любой `node` от 18 в `PATH` и пакет `libatomic1`
  (без него не запускается Node.js, которого качает Kotlin).

## 10. Обновление и откат

- **Выкладка.** Каждая выкладка — новый образ целиком. Старые и новые файлы на сервере не
  смешиваются: контейнер меняется атомарно.
- **Как обновление доходит до телефона.** При следующем открытии с сетью телефон видит новый
  `sw.js`, скачивает всю сборку в фоне и показывает её **со следующего открытия**. Данные
  пользователя при этом не трогаются.
- **Откат:**
  - вариант A — `cp .env.previous .env && docker compose up -d` или кнопка `deploy:pwa` на прежнем
    коммите;
  - Kubernetes — `kubectl rollout undo deployment/osmotr-pwa`.

  Откат — такое же обновление: телефоны перейдут на прежнюю сборку со второго открытия.
- **Чего не делать:**
  - не кэшировать `index.html` и `sw.js` на CDN или прокси;
  - не удалять `sw.js` — без него телефоны не узнают об обновлении;
  - не менять адрес (домен или путь) после того, как люди установили приложение: данные хранятся
    **по адресу**, на новом адресе приложение откроется пустым.

## 11. Проверка после выкладки

```bash
H=https://osmotr.example.com
curl -sI $H/ | grep -iE 'HTTP/|content-type|cache-control|strict-transport|permissions-policy'
curl -sI $H/sw.js | grep -i cache-control                      # no-cache
W=$(curl -s $H/sw.js | grep -o '[0-9a-f]*\.wasm' | head -n 1)
curl -sI -H 'Accept-Encoding: gzip' $H/$W | grep -iE 'content-type|content-encoding|cache-control'
                                                               # application/wasm, gzip, immutable
curl -s $H/healthz                                             # ok — только если /healthz проброшен наружу
```

Затем в браузере на компьютере открыть адрес. Через несколько секунд должна появиться главная
«Осмотра» с кнопкой «Новая опись». В DevTools → Application → Service Workers — `sw.js` в статусе
activated.

Полная проверка той же настройки nginx с автотестами, на машине разработчика:
`tools/web/https-check.sh` (подробно в `docs/pwa.md`).

## 12. Частые проблемы

| Признак | Причина |
|---|---|
| Камера не открывается: «Камера работает только по https» | сайт открыт по http или сертификат недействителен |
| Белый экран или «Этот браузер не подходит» | iOS ниже 18.2 — нужно обновить iPhone |
| Обновление не доходит до телефонов | кто-то перед контейнером кэширует `index.html` или `sw.js`, или заменил `Cache-Control` |
| Долгая первая загрузка | нет сжатия: прокси сбрасывает `Accept-Encoding` или распаковывает ответ |
| `.wasm` отдаётся как `application/octet-stream` | запрос идёт мимо контейнера (другой сервер или CDN без нужного типа) |
| Данные пропали после смены адреса | данные хранятся по адресу (§ 10): старый адрес нужно вернуть |
| Сборка падает с `OutOfMemoryError` | раннеру меньше 6 ГБ памяти |
| Сборка падает: `node: error while loading shared libraries: libatomic.so.1`, код 127 | в образе сборки нет пакета `libatomic1` (в `.gitlab-ci.yml` и Dockerfile он ставится — нужен, если меняете образ) |
