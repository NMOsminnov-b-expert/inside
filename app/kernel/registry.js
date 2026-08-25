// ЕДИНСТВЕННЫЙ общий файл, где перечислены типы ОЦ.
// Добавить тип = папка в modules/ плюс одна запись здесь.
//
// manifest и records импортируются статически: описание типа и его сиды
// нужны меню сразу. Код карточки грузится лениво — при клике по объекту.
import { manifest as residentialHouseManifest } from '../modules/residential-house/manifest.js';
import * as residentialHouseRecords from '../modules/residential-house/records.js';

import { manifest as apartmentManifest } from '../modules/apartment/manifest.js';
import * as apartmentRecords from '../modules/apartment/records.js';

import { manifest as civilManifest } from '../modules/civil/manifest.js';
import * as civilRecords from '../modules/civil/records.js';

import { manifest as productionManifest } from '../modules/production/manifest.js';
import * as productionRecords from '../modules/production/records.js';

import { manifest as landPlotManifest } from '../modules/land-plot/manifest.js';
import * as landPlotRecords from '../modules/land-plot/records.js';

export const OC_TYPES = [
  {
    manifest: residentialHouseManifest,
    records: residentialHouseRecords,
    styleHref: './app/modules/residential-house/module.css',
    load: () => import('../modules/residential-house/index.js'),
  },
  {
    manifest: apartmentManifest,
    records: apartmentRecords,
    styleHref: './app/modules/apartment/module.css',
    load: () => import('../modules/apartment/index.js'),
  },
  {
    manifest: civilManifest,
    records: civilRecords,
    styleHref: './app/modules/civil/module.css',
    load: () => import('../modules/civil/index.js'),
  },
  {
    manifest: productionManifest,
    records: productionRecords,
    styleHref: './app/modules/production/module.css',
    load: () => import('../modules/production/index.js'),
  },
  {
    manifest: landPlotManifest,
    records: landPlotRecords,
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
