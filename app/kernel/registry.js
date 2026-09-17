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
import { manifest as vehicleManifest } from '../modules/vehicle/manifest.js';
import * as vehicleRecords from '../modules/vehicle/records.js';
import * as vehicleDicts from '../modules/vehicle/data/dictExport.js';

export const OC_TYPES = [
  {
    manifest: residentialHouseManifest,
    records: residentialHouseRecords,
    dictExport: residentialHouseDicts,
    styleHref: './app/modules/residential-house/module.css',
    load: () => import('../modules/residential-house/index.js'),
  },
  {
    manifest: apartmentManifest,
    records: apartmentRecords,
    dictExport: apartmentDicts,
    styleHref: './app/modules/apartment/module.css',
    load: () => import('../modules/apartment/index.js'),
  },
  {
    manifest: civilManifest,
    records: civilRecords,
    dictExport: civilDicts,
    styleHref: './app/modules/civil/module.css',
    load: () => import('../modules/civil/index.js'),
  },
  {
    manifest: productionManifest,
    records: productionRecords,
    dictExport: productionDicts,
    styleHref: './app/modules/production/module.css',
    load: () => import('../modules/production/index.js'),
  },
  {
    manifest: landPlotManifest,
    records: landPlotRecords,
    dictExport: landPlotDicts,
    styleHref: './app/modules/land-plot/module.css',
    load: () => import('../modules/land-plot/index.js'),
  },
  {
    manifest: vehicleManifest,
    records: vehicleRecords,
    dictExport: vehicleDicts,
    styleHref: './app/modules/vehicle/module.css',
    load: () => import('../modules/vehicle/index.js'),
  },
];

export function getType(id) {
  return OC_TYPES.find((t) => t.manifest.id === id) || null;
}

export function sortedTypes() {
  return [...OC_TYPES].sort((a, b) => (a.manifest.order || 0) - (b.manifest.order || 0));
}
