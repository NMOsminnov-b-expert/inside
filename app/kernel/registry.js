// ЕДИНСТВЕННЫЙ общий файл, где перечислены типы ОЦ.
// Добавить тип = папка в modules/ плюс одна запись здесь.
//
// manifest, records и описание справочников импортируются статически:
// описание типа, его сиды и перечни нужны меню и разделу «Справочники» сразу. Код карточки грузится лениво — при клике по объекту.
import { manifest as residentialHouseManifest } from '../modules/residential-house/manifest.js';
import * as residentialHouseRecords from '../modules/residential-house/records.js';
import * as residentialHouseDicts from '../modules/residential-house/data/dictExport.js';

import { manifest as apartmentManifest } from '../modules/apartment/manifest.js';
import * as apartmentRecords from '../modules/apartment/records.js';
import * as apartmentDicts from '../modules/apartment/data/dictExport.js';

import { manifest as civilManifest } from '../modules/civil/manifest.js';
import * as civilRecords from '../modules/civil/records.js';
import * as civilDicts from '../modules/civil/data/dictExport.js';

import { manifest as landPlotManifest } from '../modules/land-plot/manifest.js';
import * as landPlotRecords from '../modules/land-plot/records.js';
import * as landPlotDicts from '../modules/land-plot/data/dictExport.js';
import { manifest as vehicleManifest } from '../modules/vehicle/manifest.js';
import * as vehicleRecords from '../modules/vehicle/records.js';
import * as vehicleDicts from '../modules/vehicle/data/dictExport.js';
import { manifest as mechanismsManifest } from '../modules/mechanisms/manifest.js';
import * as mechanismsRecords from '../modules/mechanisms/records.js';
import * as mechanismsDicts from '../modules/mechanisms/data/dictExport.js';

export const OC_TYPES = [
  {
    manifest: residentialHouseManifest,
    records: residentialHouseRecords,
    dictExport: residentialHouseDicts,
    // Стили карточек ТС и механизмов — объектов имущества в любом ОЦ
    // (vehicle/card.js, mechanisms/card.js, решение пользователя 28.09.2026).
    styleHref: ['./app/modules/vehicle/module.css', './app/modules/mechanisms/module.css'],
    load: () => import('../modules/residential-house/index.js'),
  },
  {
    manifest: apartmentManifest,
    records: apartmentRecords,
    dictExport: apartmentDicts,
    // Стили карточек ТС и механизмов — объектов имущества в любом ОЦ
    // (vehicle/card.js, mechanisms/card.js, решение пользователя 28.09.2026).
    styleHref: ['./app/modules/vehicle/module.css', './app/modules/mechanisms/module.css'],
    load: () => import('../modules/apartment/index.js'),
  },
  {
    manifest: civilManifest,
    records: civilRecords,
    dictExport: civilDicts,
    // Стили карточек ТС и механизмов: у гражданского здания они объекты
    // имущества (vehicle/card.js, mechanisms/card.js).
    styleHref: ['./app/modules/civil/module.css', './app/modules/vehicle/module.css',
      './app/modules/mechanisms/module.css'],
    load: () => import('../modules/civil/index.js'),
  },
  {
    manifest: landPlotManifest,
    records: landPlotRecords,
    dictExport: landPlotDicts,
    // Стили карточек ТС и механизмов — объектов имущества в любом ОЦ
    // (vehicle/card.js, mechanisms/card.js, решение пользователя 28.09.2026).
    styleHref: ['./app/modules/vehicle/module.css', './app/modules/mechanisms/module.css'],
    load: () => import('../modules/land-plot/index.js'),
  },
  {
    manifest: vehicleManifest,
    records: vehicleRecords,
    dictExport: vehicleDicts,
    styleHref: './app/modules/vehicle/module.css',
    load: () => import('../modules/vehicle/index.js'),
  },
  // Механизмы и оборудование как самостоятельный ОЦ (решение пользователя
  // 28.09.2026); та же форма — объект имущества в любом ОЦ.
  {
    manifest: mechanismsManifest,
    records: mechanismsRecords,
    dictExport: mechanismsDicts,
    styleHref: './app/modules/mechanisms/module.css',
    load: () => import('../modules/mechanisms/index.js'),
  },
];

// Тип находится и по прежнему имени (manifest.aliases): когда типы ОЦ
// сливаются, старые ссылки должны вести на новый тип, а не в «не
// зарегистрирован» (boot.js переписывает такой адрес на нынешнее имя).
export function getType(id) {
  return OC_TYPES.find((t) => t.manifest.id === id)
    || OC_TYPES.find((t) => (t.manifest.aliases || []).includes(id)) || null;
}

export function sortedTypes() {
  return [...OC_TYPES].sort((a, b) => (a.manifest.order || 0) - (b.manifest.order || 0));
}
