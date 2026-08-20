// Сводки для меню ОЦ. Меню не знает предметной области — только эти поля.
import { fmt, num } from '../../kernel/fmt.js';
import { manifest } from './manifest.js';
import { records, addRecord, nextId } from './data/store.js';
import { totalPendingNotes } from './parts/notes/model.js';

function metrics(rec) {
  // Для участков считаем площадь земли, а не строений.
  const area = rec.oi
    .filter((o) => o.card === 'land')
    .reduce((s, o) => s + num(o.area), 0);
  const photos = rec.oi.reduce(
    (s, o) => s + Object.values(o.photos || {}).reduce((a, b) => a + b, 0), 0
  );
  const docs = (rec.docs || []).length + rec.oi.reduce((s, o) => s + (o.docs || []).length, 0);

  return {
    oiCount: rec.oi.length,
    area,
    photos,
    docs,
    pendingNotes: totalPendingNotes(rec),
  };
}

export function summarize(rec) {
  const m = metrics(rec);

  return {
    id: rec.id,
    typeId: manifest.id,
    typeLabel: manifest.label,
    title: rec.address,
    subtitle: rec.institution,
    badges: [
      { label: rec.status, tone: 'status' },
      ...(rec.oi.some((o) => (o.origin || 'manual') === 'ml') ? [{ label: 'ML-импорт', tone: 'info' }] : []),
    ],
    facts: [
      { label: 'Код ЕНИ', value: rec.eni, mono: true },
      { label: 'Площадь участков', value: m.area ? fmt(m.area) + ' м²' : '—' },
      { label: 'Участков и строений', value: String(m.oiCount) },
      { label: 'Фото', value: String(m.photos) },
    ],
    metrics: m,
    filters: {
      status: rec.status,
      city: rec.city || '',
      institution: rec.institution,
      hasPendingNotes: m.pendingNotes > 0,
    },
    search: [
      rec.address, rec.eni, rec.institution, rec.podved, rec.status,
      ...(rec.owners || []), ...(rec.users || []),
      ...rec.oi.map((o) => `${o.letter || ''} ${o.name}`),
    ].join(' ').toLowerCase(),
    updatedAt: rec.updatedAt || '',
  };
}

export function listRecords() {
  return records.map(summarize);
}

// Создание нового ОЦ этого типа: черновик описывает МОДУЛЬ, а не меню.
export const createForm = {
  title: 'Новый земельный участок (ОЦ)',
  fields: [
    { key: 'address', label: 'Адрес / местоположение', placeholder: 'область, район, село…', required: true },
    { key: 'eni', label: 'Код ЕНИ', placeholder: '1475…', required: true },
    { key: 'institution', label: 'Учреждение', placeholder: 'Наименование учреждения' },
    { key: 'podved', label: 'Подвед', placeholder: 'Подведомственная организация' },
  ],
};

export function createRecord(values) {
  const rec = {
    id: nextId('oc-lp'),
    typeId: manifest.id,
    residential: false,
    category: 'Недвижимое',
    type: 'Земельный участок',
    purposeTP: '',
    eni: values.eni || '',
    address: values.address || '',
    city: (values.address || '').includes('Ош') ? 'Ош' : 'Бишкек',
    gps: '',
    status: 'В заполнении',
    institution: values.institution || '',
    podved: values.podved || '',
    complex: false,
    updatedAt: new Date().toISOString().slice(0, 10),
    owners: values.institution ? [values.institution] : [],
    users: [],
    resp: { gov: '', cod: '', appr: '', insp: '' },
    notes: [],
    docs: [],
    oi: [],
  };

  return addRecord(rec);
}
