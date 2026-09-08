// Полная запись синтетического ОЦ собирается лениво — при открытии карточки.
// Параметры те же, что использовались для сводки, поэтому список и карточка
// не расходятся.
import { addressOf } from './bulk.js';

export function buildBulkRecord(id, i, p) {
  return {
    id,
    typeId: 'mechanisms',
    category: 'Движимое',
    type: 'Механизмы и оборудование',
    address: addressOf(p, i),
    city: p.city,
    status: p.status,
    institution: p.institution,
    podved: p.podved,
    updatedAt: p.updatedAt,
    owners: p.owners,
    users: p.users,
    resp: p.resp,
    notes: [],
    docs: p.docs
      ? Array.from({ length: p.docs }, (_, k) => ({
        id: `${id}-d${k}`,
        type: ['Техпаспорт', 'Паспорт изделия', 'Акт осмотра', 'Прочее'][k % 4],
        name: `Документ №${100 + i % 900 + k}`,
        date: '12.05.2024',
        pages: null,
      }))
      : [],
    mechanisms: [{
      id: `${id}-m1`,
      name: p.mechName,
      qty: 1,
      cost: (i * 3491) % 500000,
      fields: [
        { id: `${id}-f1`, label: 'Год выпуска', value: String(1970 + (i % 50)) },
        { id: `${id}-f2`, label: 'Заводской номер', value: `SN-${(i * 7919) % 100000}` },
      ],
    }],
  };
}
