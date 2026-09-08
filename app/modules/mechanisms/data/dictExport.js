// Что этот модуль отдаёт в раздел «Справочники».
//
// У этого типа ОЦ нет объектов имущества, поэтому справочников уровня ОИ
// (конструктивный состав, отопление и т.п.) нет вовсе — только статус ОЦ.
// Подписи и значения конструктора полей (rec.mechanisms) сюда намеренно не входят:
// это отдельный, не kernel-овый механизм (см. data/fieldTemplates.js) — он не
// виден и не редактируется на странице «Справочники».
import * as D from './dictionaries.js';

export const DICT_SOURCES = [
  {
    key: 'STATUS_OC',
    title: 'Статусы объекта оценки',
    kind: 'list',
    system: true,
    values: D.STATUS_OC,
    slots: [
      { card: 'oc', field: 'status', label: 'Статус ОЦ' },
    ],
  },
  {
    key: 'DOC_TYPES',
    title: 'Типы документов',
    kind: 'list',
    system: false,
    values: D.DOC_TYPES,
    slots: [
      { card: 'oc', field: 'docType', label: 'Тип документа' },
    ],
  },
];
