// Доступ к логу действий: администратор видит любой ОЦ; сотрудник — только
// по своим учреждениям (session.institutions, см. kernel/session.js).
import { isAdmin, session } from '../../../kernel/session.js';

export function canViewAuditLog(rec) {
  if (!rec) return false;
  if (isAdmin()) return true;
  const mine = session.state.institutions || [];
  return mine.length > 0 && mine.includes(rec.institution);
}
