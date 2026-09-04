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

import { manifest as productionManifest } from '../modules/production/manifest.js';
import * as productionRecords from '../modules/production/records.js';
import * as productionDicts from '../modules/production/data/dictExport.js';

import { manifest as landPlotManifest } from '../modules/land-plot/manifest.js';
import * as landPlotRecords from '../modules/land-plot/records.js';
import * as landPlotDicts from '../modules/land-plot/data/dictExport.js';

// audit — лениво (как load, код карточки): audit/model.js тянет
// data/store.js за nextEniScoped, а там — seed.js с синтетикой записей. Если
// импортировать его статически здесь, все пять модулей грузили бы свою
// синтетику при каждом старте приложения, а не только при открытии карточки —
// ровно то, ради чего load уже сделан ленивым (см. комментарий вверху файла).
export const OC_TYPES = [
  {
    manifest: residentialHouseManifest,
    records: residentialHouseRecords,
    dictExport: residentialHouseDicts,
    loadAudit: () => import('../modules/residential-house/audit/model.js'),
    styleHref: './app/modules/residential-house/module.css',
    load: () => import('../modules/residential-house/index.js'),
  },
  {
    manifest: apartmentManifest,
    records: apartmentRecords,
    dictExport: apartmentDicts,
    loadAudit: () => import('../modules/apartment/audit/model.js'),
    styleHref: './app/modules/apartment/module.css',
    load: () => import('../modules/apartment/index.js'),
  },
  {
    manifest: civilManifest,
    records: civilRecords,
    dictExport: civilDicts,
    loadAudit: () => import('../modules/civil/audit/model.js'),
    styleHref: './app/modules/civil/module.css',
    load: () => import('../modules/civil/index.js'),
  },
  {
    manifest: productionManifest,
    records: productionRecords,
    dictExport: productionDicts,
    loadAudit: () => import('../modules/production/audit/model.js'),
    styleHref: './app/modules/production/module.css',
    load: () => import('../modules/production/index.js'),
  },
  {
    manifest: landPlotManifest,
    records: landPlotRecords,
    dictExport: landPlotDicts,
    loadAudit: () => import('../modules/land-plot/audit/model.js'),
    styleHref: './app/modules/land-plot/module.css',
    load: () => import('../modules/land-plot/index.js'),
  },
];

export function getType(id) {
  return OC_TYPES.find((t) => t.manifest.id === id) || null;
}

export function sortedTypes() {
  return [...OC_TYPES].sort((a, b) => (a.manifest.order || 0) - (b.manifest.order || 0));
}
