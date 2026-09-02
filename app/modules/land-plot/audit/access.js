// Доступ к логу действий: администратор видит любой ОЦ; сотрудник — только
// по своим учреждениям (session.institutions, см. kernel/session.js).
import { canSeeInstitution } from '../../../kernel/session.js';

export function canViewAuditLog(rec) {
  if (!rec) return false;
  // Правило одно на всю систему (kernel/session.js): администратор и «любая
  // роль» видят любой объект, остальные — только свои учреждения.
  return canSeeInstitution(rec.institution);
}
