// «Осмотр» в браузере (PWA): хранилище файлов в IndexedDB, «Поделиться», выбор файлов, камера.
// Kotlin зовёт globalThis.osmotrWeb.*; всё асинхронное — через обратные вызовы.
(() => {
  'use strict'

  // Ввод текста: Compose 1.13 собирает события ввода за кадр и для каждой вставки ставит курсор по
  // «целевому диапазону» события. Пришло за кадр две буквы и больше (быстрый набор, телефон занят —
  // поиск по большой описи) — диапазоны уже не совпадают с тем, что Compose вставил, и буквы
  // перемешиваются: «Корпус А» → «Кору Асп» (матрица PWA, 23.10.2026). Обычной вставке диапазон не
  // нужен — буква встаёт туда, где курсор у самого Compose, по порядку. Удаление и замена словом из
  // подсказок клавиатуры (insertReplacementText) диапазон получают как прежде.
  {
    const ranges = InputEvent.prototype.getTargetRanges
    if (ranges) InputEvent.prototype.getTargetRanges = function () { return this.inputType === 'insertText' ? [] : ranges.call(this) }
  }
  // Каретка при наборе. Браузер вписывает букву в скрытое поле сам и шлёт «выделение изменилось»
  // асинхронно; Compose переносит такое движение в свой курсор. Под нагрузкой (телефон занят) сообщение
  // опаздывает и ставит курсор по устаревшему содержимому поля: буква встаёт не туда или пропадает —
  // «Насос 1» → «Насос1», «До ремонта» → «До ремонат» (матрица WebKit, 25.10.2026). Пока человек печатает
  // (и 300 мс после клавиши) — эти сообщения до Compose не доходят: курсор при наборе Compose ведёт сам.
  // Касание в поле, чтобы перенести каретку, — не во время набора: проходит как прежде.
  {
    let typing = -1e9
    for (const t of ['keydown', 'beforeinput', 'input', 'compositionend']) addEventListener(t, () => { typing = performance.now() }, true)
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener
    const wrapped = new WeakMap()
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if (type !== 'selectionchange' || typeof fn !== 'function') return add.call(this, type, fn, opts)
      let w = wrapped.get(fn)
      if (!w) { w = function (e) { if (performance.now() - typing < 300) return; return fn.call(this, e) }; wrapped.set(fn, w) }
      return add.call(this, type, w, opts)
    }
    EventTarget.prototype.removeEventListener = function (type, fn, opts) {
      return remove.call(this, type, (type === 'selectionchange' && wrapped.get(fn)) || fn, opts)
    }
  }
  // Тот же сбор событий за кадр Compose сортирует по timeStamp. У Safari (WebKit) метка нажатия клавиши —
  // время самого нажатия, а метка вставки текста — время обработки: когда страница не успевает (телефон
  // занят, события приходят пачкой), нажатие следующей клавиши оказывается «раньше» вставки предыдущей
  // буквы, и буква уезжает: «Насос 2» → «Насос2», «До ремонта» → «До рмонтае» (матрица WebKit, 25.10.2026).
  // Метка этих событий — время обработки, проставленное раньше всех обработчиков: порядок = порядок событий.
  {
    const ts = Object.getOwnPropertyDescriptor(Event.prototype, 'timeStamp')
    const order = new WeakMap()
    for (const t of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend'])
      addEventListener(t, e => { if (!order.has(e)) order.set(e, performance.now()) }, true)
    if (ts?.get) Object.defineProperty(Event.prototype, 'timeStamp', { configurable: true, get() { return order.get(this) ?? ts.get.call(this) } })
  }
  const DB = 'osmotr-fs'
  let dbp = null
  const db = () => (dbp ??= new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('nodes', { keyPath: 'p' })
      r.result.createObjectStore('blobs')
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  }))
  // Транзакции с пересекающимися хранилищами IndexedDB выполняет в порядке создания —
  // запись, перенос и удаление ложатся в том же порядке, в каком их сделал Kotlin.
  const tx = async (stores, body) => {
    const d = await db()
    return new Promise((ok, fail) => {
      const t = d.transaction(stores, 'readwrite')
      let out
      t.oncomplete = () => ok(out)
      t.onerror = t.onabort = () => fail(t.error)
      out = body(t)
    })
  }
  const loans = new Map()
  const writes = new Map()
  const write = (k, job) => {
    const p = (writes.get(k) ?? Promise.resolve()).catch(() => {}).then(job)
    writes.set(k, p)
    p.finally(() => { if (writes.get(k) === p) writes.delete(k) }).catch(() => {})
    return p
  }
  const partKey = (k, i) => k + '#' + String(i).padStart(6, '0')
  const asBlob = v => v instanceof Blob ? v : new Blob([v])
  let blobsOk = null
  const probeBlobs = () => blobsOk ??= new Promise(ok => {
    const timer = setTimeout(() => ok(false), 2000)
    const r = indexedDB.open('osmotr-probe', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('p')
    r.onerror = () => { clearTimeout(timer); ok(false) }
    r.onsuccess = () => { try { const t = r.result.transaction('p', 'readwrite'); t.objectStore('p').put(new Blob([new Uint8Array([1])]), 1); t.oncomplete = () => { clearTimeout(timer); ok(true) }; t.onerror = t.onabort = () => { clearTimeout(timer); ok(false) } } catch { clearTimeout(timer); ok(false) } }
  })
  const keep = data => probeBlobs().then(blobs => blobs ? asBlob(data) : (data instanceof Blob ? data.arrayBuffer().then(b => new Uint8Array(b)) : data))
  const failed = (what) => (e) => { console.error('osmotr: ' + what, e); osmotrWeb.onError?.(what + ': ' + (e?.message ?? e)) }

  const osmotrWeb = globalThis.osmotrWeb = {
    onError: null,

    // ---------- Файлы ----------

    /** Всё дерево разом: при запуске (опись файлов маленькая; снимки — отдельно, по ключам). */
    loadAll(onRecord, onDone) {
      db().then(d => {
        const r = d.transaction('nodes').objectStore('nodes').getAll()
        r.onsuccess = () => {
          for (const n of r.result) onRecord(n.p, !!n.d, n.m, n.s, n.k ?? null, n.h ?? null, n.hd ?? null, n.tl ?? null, n.x ?? null)
          onDone(null)
        }
        r.onerror = () => onDone(String(r.error))
      }).catch(e => onDone(String(e)))
    },
    put(p, d, m, s, k, h, hd, tl, x) {
      tx(['nodes'], t => t.objectStore('nodes').put({ p, d, m, s, k, h, hd, tl, x })).catch(failed('запись ' + p))
    },
    del(p) { tx(['nodes'], t => t.objectStore('nodes').delete(p)).catch(failed('удаление ' + p)) },
    /**
     * Содержимое большого файла (снимок, архив) — отдельно от описи, целиком (ключ) или частями
     * («ключ#000001», архив пишется по 4 МБ). Где IndexedDB принимает Blob — Blob: лежит на диске, в
     * «Поделиться» склеивается без чтения в память. WebKit в приватном режиме (Safari «Частный доступ»,
     * окна автотестов) Blob не принимает — запись висела — там байтами (проба при запуске, в своей базе:
     * зависшая запись в основной заперла бы все следующие).
     */
    // Записи одного ключа — цепочкой: чтение ждёт, пока допишутся все части (последняя часть архива
    // ещё писалась, когда «Поделиться» уже склеивало файл, — уходил архив без оглавления).
    putBlob(k, data, stored) { write(k, () => keep(data).then(v => tx(['blobs'], t => t.objectStore('blobs').put(v, k)))).then(() => stored(k)).catch(failed('снимок ' + k)) },
    putPart(k, i, data, stored) { write(k, () => keep(data).then(v => tx(['blobs'], t => t.objectStore('blobs').put(v, partKey(k, i))))).then(() => stored(k)).catch(failed('часть ' + k)) },
    getBlob(k, got) {
      (writes.get(k) ?? Promise.resolve()).catch(() => {}).then(() => db()).then(d => {
        const st = d.transaction('blobs').objectStore('blobs')
        const r = st.get(k)
        r.onsuccess = () => {
          if (r.result != null) return got(asBlob(r.result))
          const parts = st.getAll(IDBKeyRange.bound(k + '#', k + '#\uffff'))
          parts.onsuccess = () => got(parts.result.length ? new Blob(parts.result.map(asBlob)) : null)
          parts.onerror = () => got(null)
        }
        r.onerror = () => got(null)
      }).catch(() => got(null))
    },
    bytesOf(blob, got) { blob.arrayBuffer().then(b => got(new Uint8Array(b))).catch(() => got(null)) },
    getBytes(k, got) { osmotrWeb.getBlob(k, b => b ? osmotrWeb.bytesOf(b, got) : got(null)) },
    delBlob(k) { tx(['blobs'], t => { const st = t.objectStore('blobs'); st.delete(k); st.delete(IDBKeyRange.bound(k + '#', k + '#\uffff')) }).catch(failed('удаление ' + k)) },
    copyBlob(from, to, stored) { osmotrWeb.getBlob(from, b => b ? osmotrWeb.putBlob(to, b, stored) : stored(to)) },

    /**
     * Одолжить содержимое на время синхронного чтения кусками (деление архива на части, архив из снимков):
     * в памяти браузера, частями, без склейки; Kotlin берёт только нужный кусок (readRange).
     */
    loan(k, done) {
      osmotrWeb.getBlob(k, async blob => {
        if (!blob) return done(-1)
        const parts = [], step = 8 << 20
        for (let o = 0; o < blob.size; o += step) parts.push(new Uint8Array(await blob.slice(o, o + step).arrayBuffer()))
        loans.set(k, { parts, step, size: blob.size, n: (loans.get(k)?.n ?? 0) + 1 })
        done(blob.size)
      })
    },
    unloan(k) { const l = loans.get(k); if (l && --l.n <= 0) loans.delete(k) },
    readRange(k, off, len) {
      const l = loans.get(k); if (!l) return null
      const out = new Uint8Array(Math.max(0, Math.min(len, l.size - off)))
      let o = 0
      while (o < out.length) { const p = Math.floor((off + o) / l.step), at = (off + o) % l.step, n = Math.min(out.length - o, l.step - at); out.set(l.parts[p].subarray(at, at + n), o); o += n }
      return out
    },
    newKey: () => crypto.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2)),
    /** Попросить браузер не стирать хранилище: iOS чистит данные сайтов, которыми давно не пользовались. */
    persist() {
      navigator.storage?.persist?.().then(ok => osmotrWeb.persisted = ok, () => {})
      // iPhone, открыт во вкладке Safari: постоянное хранилище Safari даёт приложению с экрана «Домой» (WebKit,
      // «Updates to Storage Policy»), а данные вкладки может стереть, если сайтом давно не пользовались.
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches
      if (!ios || standalone) return
      const bar = document.createElement('div')
      bar.className = 'osmotr-install'
      bar.innerHTML = '<span>Добавьте «Осмотр» на экран «Домой»: «Поделиться» → «На экран „Домой“». Во вкладке Safari снимки могут стереться.</span><button>Понятно</button>'
      bar.querySelector('button').onclick = () => bar.remove()
      document.body.append(bar)
    },

    // ---------- Миниатюры ----------

    /** Уменьшить снимок до [px] по меньшей стороне (поворот по EXIF браузер делает сам), JPEG. */
    thumb(k, px, got) {
      osmotrWeb.getBlob(k, async blob => {
        if (!blob) return got(null)
        try {
          const bmp = await createImageBitmap(blob)
          const s = Math.min(1, px / Math.min(bmp.width, bmp.height))
          const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s))
          const c = document.createElement('canvas')
          c.width = w; c.height = h
          c.getContext('2d').drawImage(bmp, 0, 0, w, h)
          bmp.close?.()
          c.toBlob(b => got(b ?? null), 'image/jpeg', 0.8)
        } catch (e) { got(null) }
      })
    },
    size: (blob) => blob.size,
    /** Отпечаток SHA-256, начало и конец — для описи файла (журнал, проверка JPEG). */
    describe(blob, got) {
      blob.arrayBuffer().then(async buf => {
        const u = new Uint8Array(buf)
        const sha = crypto.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', buf)) : null
        got(sha, u.slice(0, 64), u.slice(Math.max(0, u.length - 2)))
      }).catch(() => got(null, null, null))
    },

    // ---------- Выбор файлов, «Поделиться» ----------

    /** Выбрать файлы: [accept] — какие, [multiple] — несколько; [got] — по одному (имя, байты, время), затем null. */
    pick(accept, multiple, got, raw) {
      osmotrWeb.picks = (osmotrWeb.picks ?? 0) + 1 // для проверки: приложение просило выбор файла
      osmotrWeb.pickActive = navigator.userActivation?.isActive ?? null
      // Автотесты: отдать файл, если перехват окна выбора не сработал (по одному, затем null).
      const collected = []
      osmotrWeb.lastPick = raw ? (name, bytes, mod) => name == null ? raw(collected) : collected.push(new File([bytes], name, { lastModified: mod })) : got
      const i = document.createElement('input')
      i.type = 'file'; i.accept = accept; i.multiple = multiple
      i.style.display = 'none'
      document.body.append(i)
      i.onchange = async () => {
        const files = [...(i.files ?? [])]
        i.remove()
        if (raw) return raw(files)
        for (const f of files) got(f.name, new Uint8Array(await f.arrayBuffer()), f.lastModified || 0)
        got(null, null, 0)
      }
      i.oncancel = () => { i.remove(); raw ? raw([]) : got(null, null, 0) }
      i.click()
    },
    /**
     * Выбрать снимки сразу в хранилище, минуя память приложения (сотня снимков по 3 МБ в памяти Kotlin —
     * гигабайт и больше у процессов браузера): [got] по одному — имя, ключ, размер, время файла, отпечаток,
     * начало, конец, первые 128 КБ (дата съёмки из EXIF); затем null.
     */
    pickStored(accept, got) {
      osmotrWeb.pick(accept, true, () => {}, async files => {
        for (const f of files) {
          const k = osmotrWeb.newKey()
          await new Promise(ok => osmotrWeb.putBlob(k, f, ok))
          const [sha, head, tail] = await new Promise(ok => osmotrWeb.describe(f, (...a) => ok(a)))
          const exif = new Uint8Array(await f.slice(0, 131072).arrayBuffer())
          got(f.name, k, f.size, f.lastModified || 0, sha, head, tail, exif)
        }
        got(null, null, 0, 0, null, null, null, null)
      })
    },
    /**
     * «Поделиться» файлами. Safari разрешает его только сразу после касания: архив собирался
     * дольше — кнопка «Отправить», по касанию — системное окно; нет «Поделиться» — скачать.
     */
    share(files, title, done) {
      const list = files.map(f => new File([f.blob], f.name, { type: f.type }))
      const fallback = () => {
        for (const f of list) {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(f); a.download = f.name
          document.body.append(a); a.click(); a.remove()
          setTimeout(() => URL.revokeObjectURL(a.href), 60000)
        }
        done('скачано')
      }
      if (!navigator.canShare?.({ files: list })) return fallback()
      // Только файлы: заголовок iOS отдаёт вторым элементом — лишний файл, и пункт «Сохранить в Файлы» пропадает.
      const go = () => navigator.share({ files: list }).then(() => done('отправлено'), e => {
        if (e?.name === 'NotAllowedError') ask()
        else done(e?.name === 'AbortError' ? 'отменено' : 'ошибка: ' + (e?.message ?? e))
      })
      const ask = () => {
        const b = document.createElement('button')
        b.className = 'osmotr-share'
        b.textContent = title + ' — нажмите'
        b.onclick = () => { b.remove(); go() }
        document.body.append(b)
        setTimeout(() => { if (b.isConnected) { b.remove(); done('отменено') } }, 30000)
      }
      go()
    },

    /**
     * Сохранить файлом туда, куда укажет человек (автор, 23.10.2026: «возможность сохранения туда,
     * куда укажет пользователь, в виде файла архива»): Chrome — окно «Сохранить как»; Safari
     * (iPhone) такого окна не даёт — «Поделиться», где есть «Сохранить в Файлы» с выбором папки;
     * нет и его — скачать.
     */
    saveAs(blob, name, type, done) {
      if (window.showSaveFilePicker) {
        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
        window.showSaveFilePicker({ suggestedName: name, types: ext ? [{ description: name, accept: { [type]: [ext] } }] : undefined })
          .then(async h => { const w = await h.createWritable(); await w.write(blob); await w.close(); done('сохранено') })
          .catch(e => done(e?.name === 'AbortError' ? 'отменено' : 'ошибка: ' + (e?.message ?? e)))
        return
      }
      osmotrWeb.share([{ blob, name, type }], 'Сохранить «' + name + '»', done)
    },
  }

  // Щипок Safari приближал бы страницу мимо touch-action.
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false })
  // Двойное касание: iOS приближает страницу и при touch-action (автор, 02.11.2026: «и в камере работает»).
  // Второе быстрое касание гасится; кнопка нажимается сама, иначе пропал бы быстрый снимок. Поля ввода не трогаем.
  let lastTouch = 0
  document.addEventListener('touchend', e => {
    const now = performance.now(), quick = now - lastTouch < 400
    lastTouch = now
    if (!quick || e.touches.length || e.target.closest?.('input, textarea, select, video[controls]')) return
    e.preventDefault()
    e.target.closest?.('button')?.click()
  }, { passive: false })

  // ---------- Геометка ----------
  // «широта, долгота», как на Android; нет разрешения или ответа за 15 с — null.
  osmotrWeb.locate = done => navigator.geolocation.getCurrentPosition(
    p => done(`${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`), () => done(null),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })

  // ---------- PDF — pdf.js ----------
  // Загружается при первом PDF: разбирать его при старте незачем; без сети — из кэша приложения.
  // Открыт один документ, как на Android, и всё идёт по очереди: плитки папки просят разные PDF разом.
  const PDF_SIDE = 4096, PDF_PIXELS = 16e6   // те же пределы, что на Android (PdfDocs)
  let pdfjs = null, pdfDoc = null, pdfPath = null, pdfSizes = '', pdfTail = Promise.resolve()
  const pdfTurn = f => (pdfTail = pdfTail.then(f, f))
  const pdfDrop = async () => { const d = pdfDoc; pdfDoc = pdfPath = null; if (d) await d.destroy().catch(() => {}) }
  const pdfLoad = async (path, blob) => {
    if (pdfDoc && pdfPath === path) return pdfDoc
    await pdfDrop()
    if (!pdfjs) {
      pdfjs = await import('./pdf.min.js')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', location.href).href
    }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise
    const sizes = []
    for (let i = 1; i <= doc.numPages; i++) { const v = (await doc.getPage(i)).getViewport({ scale: 1 }); sizes.push(v.width + ',' + v.height) }
    pdfDoc = doc; pdfPath = path; pdfSizes = sizes.join(';')
    return doc
  }
  osmotrWeb.pdf = {
    open: (path, blob, done) => pdfTurn(async () => {
      try { await pdfLoad(path, blob); done(pdfSizes || 'broken') } catch (e) {
        done(e?.name === 'PasswordException' ? 'locked' : !pdfjs ? 'unsupported' : 'broken')
      }
    }),
    render: (path, blob, n, scale, x, y, w, h, quarters, done) => pdfTurn(async () => {
      const canvas = document.createElement('canvas')
      try {
        const doc = await pdfLoad(path, blob)
        if (n < 0 || n >= doc.numPages || w <= 0 || h <= 0) return done(null)
        // Слишком большой кусок — уменьшить целиком, сохранив пропорции.
        const k = Math.min(1, PDF_SIDE / w, PDF_SIDE / h, Math.sqrt(PDF_PIXELS / (w * h)))
        canvas.width = Math.max(1, Math.floor(w * k)); canvas.height = Math.max(1, Math.floor(h * k))
        const ctx = canvas.getContext('2d', { alpha: false })
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)   // у PDF фон прозрачный
        const page = await doc.getPage(n + 1)
        const viewport = page.getViewport({ scale: scale * k, rotation: (page.rotate + (quarters % 4) * 90) % 360, offsetX: -x * k, offsetY: -y * k })
        await page.render({ canvasContext: ctx, viewport }).promise
        page.cleanup()
        const png = await new Promise(ok => canvas.toBlob(ok, 'image/png'))
        done(png ? new Uint8Array(await png.arrayBuffer()) : null)
      } catch { done(null) } finally { canvas.width = canvas.height = 0 }   // Safari иначе держит память холста
    }),
    close: path => pdfTurn(async () => { if (pdfPath === path) await pdfDrop() }),
  }

  // ---------- «Назад» браузера — шаг назад в приложении ----------
  // Кнопка и жест «назад» браузера иначе уводили бы со страницы: держим в истории запись-ловушку и
  // отдаём шаг приложению (Main.kt: в диспетчер «назад» Compose, как «назад» телефона).
  osmotrWeb.trapBack = () => {
    history.replaceState({ osmotr: 'base' }, '')
    history.pushState({ osmotr: 'app' }, '')
    addEventListener('popstate', () => {
      history.pushState({ osmotr: 'app' }, '')
      const camera = document.querySelector('.osmotr-camera .done')
      if (camera) { camera.click(); return } // на экране камеры «назад» = «Готово»
      const player = document.querySelector('.osmotr-player .close')
      if (player) { player.click(); return } // видео — закрыть проигрыватель
      osmotrWeb.onBack?.()
    })
  }

  // ---------- Диктофон: голосовые заметки к папке и описи ----------
  // Safari пишет AAC в MP4 (.m4a — как телефоны); Chrome — то, что умеет (Opus), под тем же именем.

  let micOk = false, rec = null, recStream = null, analyser = null, audio = null
  osmotrWeb.rec = {
    /** Начать запись; false — доступа к микрофону ещё нет (спросили — нажать ещё раз). */
    start(done) {
      const go = async () => {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: true })
        micOk = true
        const type = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) ?? ''
        rec = new MediaRecorder(recStream, type ? { mimeType: type } : undefined)
        const chunks = [], t0 = Date.now()
        rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
        rec.onstop = () => {
          recStream?.getTracks().forEach(t => t.stop()); recStream = null; analyser = null
          done(chunks.length ? new Blob(chunks, { type: rec?.mimeType || type }) : null, Date.now() - t0)
          rec = null
        }
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          analyser = ctx.createAnalyser(); analyser.fftSize = 512
          ctx.createMediaStreamSource(recStream).connect(analyser)
        } catch {}
        rec.start(1000)
      }
      if (!micOk) { go().then(() => osmotrWeb.rec.stop(true)).catch(() => {}); return false }
      go().catch(() => { micOk = false; done(null, 0) })
      return true
    },
    /** [discard] — пробная запись ради разрешения: не сохранять. */
    stop(discard) {
      if (!rec) return
      if (discard) rec.onstop = () => { recStream?.getTracks().forEach(t => t.stop()); recStream = null; analyser = null; rec = null }
      rec.state !== 'inactive' && rec.stop()
    },
    level() {
      if (!analyser) return 0
      const a = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(a)
      let sum = 0; for (const v of a) sum += (v - 128) * (v - 128)
      return Math.min(1, Math.sqrt(sum / a.length) / 40)
    },
    play(blob, done) {
      osmotrWeb.rec.stopPlaying()
      audio = new Audio(URL.createObjectURL(blob))
      const end = () => { if (audio) { URL.revokeObjectURL(audio.src); audio = null } done() }
      audio.onended = end; audio.onerror = end
      audio.play().catch(end)
    },
    stopPlaying() { if (audio) { audio.pause(); audio.onended?.() } },
  }

  // ---------- Сжатие кадров камеры — в отдельном потоке ----------

  let enc = undefined
  /**
   * Сжать пиксели кадра (ImageData) в JPEG в Worker (OffscreenCanvas); null — так браузер не умеет.
   * Пиксели, а не ImageBitmap: createImageBitmap из кадра видео в WebKit для Linux зависает.
   */
  const encoder = () => {
    if (enc !== undefined) return enc
    enc = null
    if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') return enc
    try {
      const src = `onmessage = async e => {
        const { id, w, h, px, q } = e.data
        try {
          const c = new OffscreenCanvas(w, h)
          c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), w, h), 0, 0)
          postMessage({ id, blob: await c.convertToBlob({ type: 'image/jpeg', quality: q }) })
        } catch (err) { postMessage({ id, error: String(err) }) }
      }`
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
      // По одному кадру: несколько холстов 4K в потоке разом — сотни мегабайт.
      const queue = []; let busy = null, next = 0
      const pump = () => { if (busy || !queue.length) return; busy = queue.shift(); w.postMessage({ id: busy.id, w: busy.img.width, h: busy.img.height, px: busy.img.data.buffer, q: busy.q }, [busy.img.data.buffer]); busy.img = null }
      w.onmessage = e => { const k = busy; busy = null; e.data.blob ? k.ok(e.data.blob) : k.no(e.data.error); pump() }
      enc = (img, q) => new Promise((ok, no) => { queue.push({ id: next++, img, q, ok, no }); pump() })
    } catch { enc = null }
    return enc
  }

  // ---------- Камера: серия снимков и видео, не выходя из приложения ----------
  // Тот же экран, что на iPhone (CameraViewController.swift): спуск, «Готово», «Снято: N»,
  // «Дописывается: N», миниатюра последнего кадра, зум щипком; от камеры Android (CameraActivity.kt) —
  // ФОТО/ВИДЕО, 4:3/16:9, сетка, кнопки зума (где браузер даёт зум), фокус касанием (где даёт фокус);
  // выбор запоминается. Кадр — из видеопотока (ImageCapture.takePhoto в Safari нет), берётся в момент
  // нажатия, сжимается после.

  const pref = (k, d) => { try { return localStorage.getItem('osmotr.camera.' + k) ?? d } catch { return d } }
  const setPref = (k, v) => { try { localStorage.setItem('osmotr.camera.' + k, v) } catch {} }
  /**
   * Во что браузер пишет видео: Safari — MP4 (H.264, AAC), Chrome — MP4, если умеет, иначе WebM. Кодеки не
   * называем: в iOS 18.4 beta запись с названными вариантами MP4 не игралась (WebKit 290002 → 288459).
   */
  const videoType = () => typeof MediaRecorder === 'undefined' ? null :
    ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .find(t => MediaRecorder.isTypeSupported?.(t)) ?? ''
  const ASPECT = { '4:3': [4, 3, 4032, 3024], '16:9': [16, 9, 3840, 2160] }

  /**
   * Открыть камеру. [frame](blob, ширина, высота, готово) — кадр снят: Kotlin кладёт его в папку и
   * зовёт готово(ошибка|null). [clip](blob, расширение, мс, готово) — видео записано. [closed]() — «Готово».
   */
  osmotrWeb.camera = (frame, closed, clip) => {
    const root = document.createElement('div')
    root.className = 'osmotr-camera'
    root.innerHTML = `
      <div class="frame"><video playsinline muted autoplay></video><div class="grid" hidden></div><div class="focus" hidden></div><div class="blink"></div></div>
      <div class="chips">
        <button class="torch" hidden aria-pressed="false">Фонарик</button>
        <button class="aspect" aria-label="Формат кадра"></button>
        <button class="grid-toggle" aria-pressed="false">Сетка</button>
        <button class="lens" hidden>Камера</button>
      </div>
      <span class="counter" hidden></span>
      <span class="writing" hidden></span>
      <span class="timer" hidden></span>
      <div class="zooms" hidden></div>
      <div class="modes" hidden><button data-mode="photo">ФОТО</button><button data-mode="video">ВИДЕО</button></div>
      <img class="thumb" alt="">
      <button class="shutter" aria-label="Снять" disabled></button>
      <button class="done">Готово</button>
      <div class="message" hidden></div>`
    document.body.append(root)
    const $ = s => root.querySelector(s)
    const video = $('video'), shutter = $('.shutter'), counter = $('.counter'), writing = $('.writing'), timer = $('.timer')
    const thumb = $('.thumb'), message = $('.message'), blink = $('.blink'), torchBtn = $('.torch'), lensBtn = $('.lens')
    const frameBox = $('.frame'), gridBox = $('.grid'), gridBtn = $('.grid-toggle'), aspectBtn = $('.aspect'), zooms = $('.zooms')
    const modes = $('.modes'), focusMark = $('.focus')
    let stream = null, track = null, taken = 0, inFlight = 0, torch = false, closedOnce = false, lens = null
    let mode = pref('mode', 'photo'), grid = pref('grid', '0') === '1', aspect = ASPECT[pref('aspect', '4:3')] ? pref('aspect', '4:3') : '4:3'
    const recType = videoType()
    if (recType === null) mode = 'photo'
    const show = t => { message.textContent = t; message.hidden = false }
    message.onclick = () => { message.hidden = true }
    const updateWriting = () => { writing.textContent = 'Дописывается: ' + inFlight; writing.hidden = inFlight === 0 }

    // Рамка кадра — в выбранном формате (стоя — 3:4 / 9:16), посередине; снимок обрезается по ней же.
    const ratio = (w, h) => { const [a, b] = ASPECT[aspect]; return w < h ? b / a : a / b }
    const layout = () => {
      const vw = root.clientWidth, vh = root.clientHeight, r = ratio(vw, vh)
      const w = Math.min(vw, vh * r)
      frameBox.style.width = w + 'px'; frameBox.style.height = w / r + 'px'
    }
    addEventListener('resize', layout)
    const paint = () => {
      gridBox.hidden = !grid; gridBtn.setAttribute('aria-pressed', String(grid))
      aspectBtn.textContent = aspect
      for (const b of modes.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode))
      shutter.classList.toggle('video', mode === 'video')
      shutter.setAttribute('aria-label', mode === 'video' ? (rec ? 'Остановить' : 'Записать') : 'Снять')
      layout()
    }

    const why = e => {
      const n = e?.name
      if (n === 'NotAllowedError') return 'Нужен доступ к камере: «Аа» в адресной строке → Настройки веб-сайта → Камера (или Настройки → Safari → Камера)'
      if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Камера не найдена'
      if (n === 'NotReadableError') return 'Камера занята другим приложением'
      if (!isSecureContext) return 'Камера работает только по https'
      return 'Камера не открылась: ' + (e?.message ?? e)
    }
    // Запуск — по поколениям: формат или камеру переключили, пока прежний запуск ждал браузер, — прежний
    // отпускает свой поток и молчит (иначе дорабатывал бы с чужим, уже остановленным).
    let epoch = 0
    const start = async () => {
      const my = ++epoch
      const [, , W, H] = ASPECT[aspect]
      let s
      try {
        s = await navigator.mediaDevices.getUserMedia({ audio: false,
          video: { ...(lens ? { deviceId: { exact: lens } } : { facingMode: { ideal: 'environment' } }), width: { ideal: W }, height: { ideal: H } } })
      } catch (e) { if (my === epoch) { show(why(e)); osmotrWeb.onCamera?.('нет доступа: ' + (e?.name ?? e)) } return }
      if (closedOnce || my !== epoch) { s.getTracks().forEach(t => t.stop()); return }
      stream = s
      const t = track = s.getVideoTracks()[0]
      video.srcObject = s
      try { await video.play() } catch {}
      if (my !== epoch || track !== t) return
      // Поток есть, а кадров нет — так бывало у приложения с экрана «Домой» на iOS 17 (WebKit 273938): сказать, что делать.
      setTimeout(() => { if (my === epoch && track === t && !video.videoWidth) show('Камера не показывает картинку. Закройте «Осмотр» (смахните) и откройте снова; не поможет — перезагрузите iPhone') }, 6000)
      const caps = t.getCapabilities?.() ?? {}
      // Зум — кнопками, как на Android (0.6 / 1 / 2 — что даёт браузер); широкий угол — сразу: в осмотре нужен общий вид.
      zooms.replaceChildren()
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        const steps = [caps.zoom.min < 1 ? caps.zoom.min : null, 1, 2, 5].filter(z => z !== null && z >= caps.zoom.min && z <= caps.zoom.max)
        for (const z of [...new Set(steps)]) {
          const b = document.createElement('button')
          b.textContent = (Math.round(z * 10) / 10).toString().replace('.', ',') + '×'
          b.onclick = () => setZoom(z)
          b.dataset.zoom = z
          zooms.append(b)
        }
        zooms.hidden = zooms.children.length < 2
        setZoom(caps.zoom.min < 1 ? caps.zoom.min : (t.getSettings().zoom ?? 1))
      } else zooms.hidden = true
      if (caps.torch) { torchBtn.hidden = false; if (torch) t.applyConstraints({ advanced: [{ torch }] }).catch(() => {}) }
      // Камер несколько (компьютер с виртуальной камерой, планшет) — переключатель по кругу.
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
      if (my !== epoch) return
      lensBtn.hidden = cams.length < 2
      lensBtn.onclick = () => {
        if (rec) return
        const i = cams.findIndex(c => c.deviceId === track?.getSettings().deviceId)
        const next = cams[(i + 1) % cams.length]
        lens = next.deviceId
        stop(); shutter.disabled = true; start()
        lensBtn.textContent = next.label ? next.label.slice(0, 24) : 'Камера ' + ((i + 1) % cams.length + 1)
      }
      shutter.disabled = false
      osmotrWeb.onCamera?.('открыта ' + (t.getSettings().width ?? '?') + '×' + (t.getSettings().height ?? '?'))
    }
    const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; track = null }
    const setZoom = z => {
      track?.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {})
      for (const b of zooms.children) b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.zoom) - z) < 0.05))
    }

    // Снимок — в момент касания, сжатие — после и не в главном потоке (правило Android-версии,
    // camera-capture-responsiveness): сжатие кадра 4K на месте держало спуск ~1 с в WebKit — следующее
    // касание ждало. Кадр — на холст сразу, JPEG — в Worker (OffscreenCanvas).
    const landed = (blob, err, isVideo) => {
      inFlight--; updateWriting()
      if (err) { show(err); return }
      taken++
      counter.textContent = 'Снято: ' + taken; counter.hidden = false
      if (isVideo) return
      const old = thumb.src
      thumb.src = URL.createObjectURL(blob)
      if (old) URL.revokeObjectURL(old)
    }
    const deliver = (blob, w, h) => {
      if (!blob) return landed(null, 'Кадр не сжался')
      frame(blob, w, h, err => landed(blob, err ? 'Снимок не сохранился: ' + err : null))
    }
    // Несжатых кадров — не больше трёх (кадр 4K в работе — ~100 МБ; десять касаний подряд — гигабайт, и
    // Safari закрыл бы вкладку). Очередь полна — спуск приглушён, касание отклоняется, а не копится
    // (как своя камера iPhone: «нажатие не копится»).
    const MAX_RAW = 3
    let raw = 0
    const ready = () => { shutter.style.opacity = raw >= MAX_RAW ? '0.55' : '' }
    const photo = () => {
      const vw = video.videoWidth, vh = video.videoHeight
      const stats = osmotrWeb.cameraStats ??= { accepted: 0, rejected: 0 }
      if (!vw || !vh || raw >= MAX_RAW) { stats.rejected++; navigator.vibrate?.(50); return }
      stats.accepted++
      raw++; ready()
      const rawDone = () => { raw--; ready() }
      blink.style.transition = 'none'; blink.style.opacity = '0.7'
      requestAnimationFrame(() => { blink.style.transition = 'opacity .18s'; blink.style.opacity = '0' })
      inFlight++; updateWriting()
      // Кадр по рамке (середина, как видно на экране) — сразу на холст (4K — ~30 мс; взять кадр прямо из
      // видео WebKit для Linux не умеет — висит).
      const r = ratio(vw, vh)
      const w = Math.round(vw / vh > r ? vh * r : vw), h = Math.round(vw / vh > r ? vh : vw / r)
      stats.last = [w, h]
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, w, h)
      // Холст 4K — ~33 МБ: освобождать сразу, как кадр сжат (серия из 20 касаний — иначе 660 МБ на iPhone).
      let freed = false
      const free = () => { if (freed) return; freed = true; c.width = 0; c.height = 0; rawDone() }
      const onSpot = () => c.toBlob(blob => { free(); deliver(blob, w, h) }, 'image/jpeg', 0.92)
      const enc = encoder()
      if (!enc) return onSpot() // Safari старше 16.4 — сжатие на месте
      // Пиксели — в Worker (передаются без копии), холст — свободен сразу; не ответил за 5 с — на месте
      // из сохранённых пикселей: снимок не теряется.
      let img
      try { img = c.getContext('2d').getImageData(0, 0, w, h) } catch { return onSpot() }
      c.width = 0; c.height = 0
      let done = false
      const finish = blob => { if (done) return; done = true; clearTimeout(fallback); free(); deliver(blob, w, h) }
      const fallback = setTimeout(() => finish(null), 15000)
      enc(img, 0.92).then(finish, () => finish(null))
    }

    // Видео — в папку предмета, как на Android («видео — как фото, счёт отдельно»): спуск — начать и
    // остановить; «Готово» и сворачивание запись останавливают, она дописывается в фоне, как кадры.
    // Звук — если дали микрофон; не дали — видео без звука, а не отказ.
    let rec = null, recT0 = 0, tick = 0, mic = null
    const askMic = async () => {
      if (mic !== null) return
      try { mic = (await navigator.mediaDevices.getUserMedia({ audio: true })).getAudioTracks()[0] ?? false }
      catch { mic = false; show('Видео — без звука: нет доступа к микрофону') }
      if (closedOnce && mic) { mic.stop(); mic = false }
    }
    const recStart = async () => {
      if (!track || rec) return
      shutter.disabled = true
      await askMic()
      shutter.disabled = false
      if (!track || closedOnce) return
      let mr
      try { mr = new MediaRecorder(new MediaStream([track, ...(mic ? [mic] : [])]), recType ? { mimeType: recType } : undefined) }
      catch (e) { show('Видео не записывается: ' + (e?.message ?? e)); return }
      const parts = [], t0 = Date.now()
      mr.ondataavailable = e => { if (e.data?.size) parts.push(e.data) }
      mr.onstop = () => {
        const ms = Date.now() - t0, type = (mr.mimeType || recType || 'video/mp4').split(';')[0]
        const blob = new Blob(parts, { type })
        if (closedOnce) { stop(); if (mic) { mic.stop(); mic = false } }
        if (!blob.size) return landed(null, 'Видео не записалось')
        clip(blob, type.includes('webm') ? 'webm' : 'mp4', ms, err => landed(blob, err ? 'Видео не сохранилось: ' + err : null, true))
      }
      // Одним куском до остановки: частые запросы данных при записи MP4 гонялись в iOS 18.4 beta (WebKit 288459).
      mr.start()
      rec = mr; recT0 = t0
      inFlight++; updateWriting()
      root.classList.add('recording')
      const clock = () => { const s = Math.floor((Date.now() - recT0) / 1000); timer.textContent = '● ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') }
      clock(); timer.hidden = false
      tick = setInterval(clock, 500)
      paint()
    }
    const recStop = () => {
      if (!rec) return
      const mr = rec
      rec = null
      clearInterval(tick); timer.hidden = true
      root.classList.remove('recording')
      try { mr.stop() } catch {}
      paint()
    }

    shutter.onclick = () => {
      if (mode !== 'video') return photo()
      rec ? recStop() : recStart()
    }
    for (const b of modes.querySelectorAll('button')) b.onclick = () => {
      if (rec || mode === b.dataset.mode) return
      mode = b.dataset.mode; setPref('mode', mode); paint()
    }
    modes.hidden = recType === null
    gridBtn.onclick = () => { grid = !grid; setPref('grid', grid ? '1' : '0'); paint() }
    aspectBtn.onclick = () => {
      if (rec) return
      aspect = aspect === '4:3' ? '16:9' : '4:3'; setPref('aspect', aspect); paint()
      if (track) { stop(); shutter.disabled = true; start() }
    }
    torchBtn.onclick = () => {
      torch = !torch
      track?.applyConstraints({ advanced: [{ torch }] }).catch(() => {})
      torchBtn.setAttribute('aria-pressed', String(torch))
    }
    // Фокус касанием — где браузер даёт точку фокуса (Chrome на Android); в Safari — сам.
    video.addEventListener('click', e => {
      const caps = track?.getCapabilities?.() ?? {}
      const box = video.getBoundingClientRect()
      focusMark.style.left = (e.clientX - box.left) + 'px'; focusMark.style.top = (e.clientY - box.top) + 'px'
      focusMark.hidden = false; setTimeout(() => { focusMark.hidden = true }, 700)
      if (!track || (!('pointsOfInterest' in caps) && !caps.focusMode)) return
      const x = (e.clientX - box.left) / box.width, y = (e.clientY - box.top) / box.height
      track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot', exposureMode: 'single-shot' }] }).catch(() => {})
    })
    // Зум щипком — где браузер даёт управлять зумом.
    let pinch0 = 0, zoom0 = 1
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    video.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { pinch0 = dist(e.touches); zoom0 = track?.getSettings().zoom ?? 1 }
    }, { passive: true })
    video.addEventListener('touchmove', e => {
      const z = track?.getCapabilities?.().zoom
      if (e.touches.length !== 2 || !z || !pinch0) return
      const v = Math.max(z.min, Math.min(z.max, zoom0 * dist(e.touches) / pinch0))
      track.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => {})
    }, { passive: true })

    // Свернули — запись остановить, камеру отпустить (iOS её всё равно заберёт), вернулись — открыть снова.
    const vis = () => { if (document.hidden) { recStop(); stop(); shutter.disabled = true } else if (!closedOnce) start() }
    document.addEventListener('visibilitychange', vis)
    $('.done').onclick = () => {
      closedOnce = true
      document.removeEventListener('visibilitychange', vis)
      removeEventListener('resize', layout)
      const recording = !!rec
      recStop()
      if (!recording) { stop(); if (mic) { mic.stop(); mic = false } } // иначе — когда запись допишется (onstop)
      root.remove()
      if (thumb.src) URL.revokeObjectURL(thumb.src)
      closed()
    }
    paint()
    start()
  }

  // ---------- Обложка видео — первый кадр, JPEG до 512 точек ----------
  osmotrWeb.videoFrame = (blob, got) => {
    const v = document.createElement('video'), url = URL.createObjectURL(blob)
    let done = false
    const finish = bytes => { if (done) return; done = true; clearTimeout(timer); v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); got(bytes) }
    const timer = setTimeout(() => finish(null), 10000)
    v.muted = true; v.playsInline = true; v.preload = 'auto'
    v.onerror = () => finish(null)
    v.onloadeddata = () => { v.currentTime = Number.isFinite(v.duration) ? Math.min(0.1, v.duration / 2) : 0.1 }
    v.onseeked = () => {
      const k = Math.min(1, 512 / Math.max(v.videoWidth, v.videoHeight) || 1)
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k))
      try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height) } catch { return finish(null) }
      c.toBlob(b => b ? b.arrayBuffer().then(a => finish(new Uint8Array(a)), () => finish(null)) : finish(null), 'image/jpeg', 0.8)
    }
    v.src = url
  }

  // ---------- Видео из папки — проигрыватель поверх приложения ----------
  // Файл — в новой вкладке, просмотром браузера. Всплывающее окно запрещено (Safari после ожидания) —
  // ссылкой с target=_blank, это касание человек уже сделал.
  osmotrWeb.openFile = (blob, name, mime) => {
    const url = URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob)
    const w = window.open(url, '_blank')
    if (!w) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click() }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  osmotrWeb.playVideo = (blob, name) => {
    const root = document.createElement('div')
    root.className = 'osmotr-player'
    root.innerHTML = '<video controls playsinline autoplay></video><button class="close">Закрыть</button><span class="name"></span>'
    const url = URL.createObjectURL(blob)
    root.querySelector('video').src = url
    root.querySelector('.name').textContent = name
    root.querySelector('.close').onclick = () => { root.querySelector('video').pause(); URL.revokeObjectURL(url); root.remove() }
    document.body.append(root)
  }
})()

// ---------- E•state: приложение в рамке страницы осмотрщиков системы ----------
// Ветка estate-integration (решения автора 03.11.2026: учётная запись E•state, только назначенные
// объекты, отправка по мере съёмки, без связи — копится). Обмен — сообщениями с родительским окном
// своего же источника (postMessage): { osmotr: 1, id, t, body, blob } туда, { osmotr: 1, re, ok, body,
// blob, error } обратно; { osmotr: 1, t: 'changed' } — назначения поменялись. Вне рамки — приложение
// работает как прежде, без системы.
;(() => {
  'use strict'
  const web = globalThis.osmotrWeb
  const parentWin = window.parent !== window ? window.parent : null
  const waiting = new Map()
  let changed = null
  let seq = 0
  addEventListener('message', e => {
    if (!parentWin || e.source !== parentWin || e.origin !== location.origin) return
    const m = e.data
    if (!m || m.osmotr !== 1) return
    if (m.t === 'changed') { if (changed) changed(); return }
    const w = waiting.get(m.re)
    if (!w) return
    waiting.delete(m.re); clearTimeout(w.timer)
    w.done(!!m.ok, m.ok ? JSON.stringify(m.body ?? {}) : null, m.blob ?? null, m.ok ? null : String(m.error || 'отказ системы'))
  })
  web.estate = {
    embedded: () => !!parentWin,
    online: () => navigator.onLine !== false,
    onChanged(f) { changed = f },
    /** Запрос системе; done(ok, json, blob, error). Ответа нет [ms] — «нет связи с системой». */
    ask(t, json, blob, ms, done) {
      if (!parentWin) return done(false, null, null, 'не в системе')
      const id = 'o' + (++seq) + '-' + Date.now().toString(36)
      const timer = setTimeout(() => { waiting.delete(id); done(false, null, null, 'нет ответа системы') }, ms)
      waiting.set(id, { done, timer })
      let body = {}
      try { body = JSON.parse(json || '{}') } catch {}
      parentWin.postMessage({ osmotr: 1, id, t, body, blob: blob || null }, location.origin)
    },
  }

  // ---------- Карта: клетки OpenStreetMap (подложка; © участники OpenStreetMap) ----------
  web.tile = (z, x, y, done) => {
    fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, { mode: 'cors' })
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(a => done(new Uint8Array(a)), () => done(null))
  }
  /** Внешняя ссылка (маршрут в навигаторе) — новой вкладкой. */
  web.openUrl = url => {
    const w = window.open(url, '_blank', 'noopener')
    if (!w) { const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click() }
  }
})()
