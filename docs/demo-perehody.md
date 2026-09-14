# Демо-переходы ОЦ → ОИ

В каждом типе объекта оценки заведена запись-витрина со всеми видами объектов
имущества, какие в нём можно создать. Нужна, чтобы экраны можно было сравнивать
между собой, не заводя объекты руками: раньше в квартире и на участке не было
ни одного строения, а поле «Назначение по тех паспорту» не показывал ни один
заполненный пример.

Идентификаторы предсказуемые: запись — `oc-<тип>-all`, объект имущества —
`oi-<тип>-all-<вид>`. Ссылки ведут на Live Server (порт 5500).

## Витрины

| Тип ОЦ | Запись | Ссылка |
|---|---|---|
| Жилое здание (квартира) | `oc-ap-all` | http://127.0.0.1:5500/app.html#/oc/apartment/oc-ap-all |
| Жилое здание (дом) | `oc-rh-all` | http://127.0.0.1:5500/app.html#/oc/residential-house/oc-rh-all |
| Гражданское здание | `oc-cv-all` | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all |
| Производственное строение | `oc-pr-all` | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all |
| Земельный участок | `oc-lp-all` | http://127.0.0.1:5500/app.html#/oc/land-plot/oc-lp-all |

## Все переходы поимённо

Карточка, которая открывается, названа в заголовке столбца. Одна и та же
карточка строения открывается для четырёх видов ОИ — жилого дома, гражданского,
производственного и прочего строения.

### Земельный участок (карточка участка, код в модуле участка)

| Из какого ОЦ | Ссылка |
|---|---|
| Квартира | http://127.0.0.1:5500/app.html#/oc/apartment/oc-ap-all/oi/oi-ap-all-land |
| Жилой дом | http://127.0.0.1:5500/app.html#/oc/residential-house/oc-rh-all/oi/oi-rh-all-land |
| Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-land |
| Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-land |
| Участок | http://127.0.0.1:5500/app.html#/oc/land-plot/oc-lp-all/oi/oi-lp-all-land |

### Квартира (карточка квартиры; у жилого дома своя копия)

| Из какого ОЦ | Ссылка |
|---|---|
| Квартира | http://127.0.0.1:5500/app.html#/oc/apartment/oc-ap-all/oi/oi-ap-all-flat |
| Жилой дом | http://127.0.0.1:5500/app.html#/oc/residential-house/oc-rh-all/oi/oi-rh-all-flat |
| Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-flat |
| Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-flat |
| Участок | http://127.0.0.1:5500/app.html#/oc/land-plot/oc-lp-all/oi/oi-lp-all-flat |

### Жилой дом (карточка строения, признак «жилое»)

| Из какого ОЦ | Ссылка |
|---|---|
| Квартира | http://127.0.0.1:5500/app.html#/oc/apartment/oc-ap-all/oi/oi-ap-all-house |
| Жилой дом | http://127.0.0.1:5500/app.html#/oc/residential-house/oc-rh-all/oi/oi-rh-all-house |
| Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-house |
| Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-house |
| Участок | http://127.0.0.1:5500/app.html#/oc/land-plot/oc-lp-all/oi/oi-lp-all-house |

### Гражданское здание (карточка строения)

| Из какого ОЦ | Ссылка |
|---|---|
| Квартира | http://127.0.0.1:5500/app.html#/oc/apartment/oc-ap-all/oi/oi-ap-all-civil |
| Жилой дом | http://127.0.0.1:5500/app.html#/oc/residential-house/oc-rh-all/oi/oi-rh-all-civil |
| Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-civil |
| Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-civil |
| Участок | http://127.0.0.1:5500/app.html#/oc/land-plot/oc-lp-all/oi/oi-lp-all-civil |

### Производственное строение (карточка строения, класс «Производственно-складское»)

Здесь показывается дополнительный блок «Доп параметры (производственное
строение)», а высота и наружные стены становятся обязательными.

| Из какого ОЦ | Ссылка |
|---|---|
| Квартира | http://127.0.0.1:5500/app.html#/oc/apartment/oc-ap-all/oi/oi-ap-all-prod |
| Жилой дом | http://127.0.0.1:5500/app.html#/oc/residential-house/oc-rh-all/oi/oi-rh-all-prod |
| Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-prod |
| Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-prod |
| Участок | http://127.0.0.1:5500/app.html#/oc/land-plot/oc-lp-all/oi/oi-lp-all-prod |

### Прочее строение (карточка строения)

| Из какого ОЦ | Ссылка |
|---|---|
| Квартира | http://127.0.0.1:5500/app.html#/oc/apartment/oc-ap-all/oi/oi-ap-all-other |
| Жилой дом | http://127.0.0.1:5500/app.html#/oc/residential-house/oc-rh-all/oi/oi-rh-all-other |
| Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-other |
| Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-other |
| Участок | http://127.0.0.1:5500/app.html#/oc/land-plot/oc-lp-all/oi/oi-lp-all-other |

### Движимое имущество (только гражданское и производственное)

| Что | Из какого ОЦ | Ссылка |
|---|---|---|
| Механизмы и оборудование | Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-mech |
| Механизмы и оборудование | Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-mech |
| Офисная техника и мебель | Гражданское | http://127.0.0.1:5500/app.html#/oc/civil/oc-cv-all/oi/oi-cv-all-office |
| Офисная техника и мебель | Производственное | http://127.0.0.1:5500/app.html#/oc/production/oc-pr-all/oi/oi-pr-all-office |

## Что в витрине заполнено

Записи одинаковы по составу, чтобы различия экранов были видны сразу, а не
тонули в разных данных:

* адрес — «г. Бишкек, Первомайский р-н, Демонстрационная, 1», у всех пяти;
* участок — 1 200 м² по документам и по факту, застроено 320 м², отопление
  автономное, электричество и вода подведены;
* квартира — 64,20 м², серия 105/106, 3 комнаты, пятый этаж девятиэтажного;
* строения — жилой дом 160,60 м², гражданское 420 м², производственное
  1 200 м², прочее 48 м²; у каждого заполнены конструктив и высоты;
* движимое — котёл и комплекс офисной техники.

Итого 34 экрана объектов имущества плюс 5 карточек объекта оценки.
