import moment from 'moment-timezone';

export const TIMEZONE = 'America/Argentina/Cordoba';

// Convención: las fechas "de calendario" (inicio de plan, vencimiento, cumpleaños)
// se guardan como medianoche UTC de ese día. Así nunca se corren un día por la zona horaria.

// Hoy (según el calendario de Argentina) como medianoche UTC.
export const todayAR = () =>
  new Date(`${moment().tz(TIMEZONE).format('YYYY-MM-DD')}T00:00:00.000Z`);

// Convierte 'YYYY-MM-DD', un ISO completo o un Date en medianoche UTC de ese día.
export const toDateOnly = (value) => {
  if (!value) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return isNaN(date) ? null : date;
};

// Suma meses respetando fin de mes (31/01 + 1 mes = 28/02).
export const addMonths = (date, months) =>
  moment.utc(date).add(months, 'months').toDate();

export const addDays = (date, days) =>
  moment.utc(date).add(days, 'days').toDate();

// Rango [inicio, fin) de un mes del calendario argentino, en instantes reales.
export const monthRangeAR = (year, month) => {
  const start = moment.tz({ year, month: month - 1, day: 1 }, TIMEZONE);
  return { start: start.toDate(), end: start.clone().add(1, 'month').toDate() };
};

export const PLAN_MONTHS = { Mensual: 1, Semestral: 6 };

// Días de tolerancia: si el plan venció hace esta cantidad de días o menos, el pago
// continúa desde el vencimiento anterior (el socio siguió viniendo "de favor").
export const GRACE_DAYS = 30;

// Desde qué fecha corren los meses de un pago:
// - Primer pago (sin lastRenewalDate): desde la fecha de inicio del plan.
// - Plan vigente: desde el vencimiento actual (pagar antes no hace perder días).
// - Plan vencido: desde el vencimiento anterior (venció el 3/11, paga el 15/11 -> vence el 3/12).
//   Si venció hace más de GRACE_DAYS (dejó de venir y vuelve), desde hoy.
//   startFrom ('expiration' | 'today') permite elegirlo a mano al cobrar.
export const nextExpiration = (plan, months, today = todayAR(), startFrom) => {
  const currentExpiration = toDateOnly(plan.expirationDate);
  let base;
  if (!plan.lastRenewalDate) base = toDateOnly(plan.initDate);
  else if (currentExpiration && currentExpiration >= today) base = currentExpiration;
  else if (!currentExpiration) base = today;
  else {
    const daysExpired = Math.round((today - currentExpiration) / (24 * 60 * 60 * 1000));
    const mode = startFrom || (daysExpired <= GRACE_DAYS ? 'expiration' : 'today');
    base = mode === 'expiration' ? currentExpiration : today;
  }
  return addMonths(base, months);
};

// Día de hoy en Argentina como 'YYYY-MM-DD'.
export const todayStringAR = () => moment().tz(TIMEZONE).format('YYYY-MM-DD');

// Rango [inicio, fin) de un día del calendario argentino ('YYYY-MM-DD').
export const dayRangeAR = (day) => {
  const start = moment.tz(day, 'YYYY-MM-DD', true, TIMEZONE);
  if (!start.isValid()) return null;
  return { start: start.toDate(), end: start.clone().add(1, 'day').toDate() };
};

// Estado del plan: 'sin-pago' | 'vencido' | 'por-vencer' | 'activo'
export const planStatus = (plan, today = todayAR()) => {
  const exp = toDateOnly(plan?.expirationDate);
  if (!plan?.lastRenewalDate || !exp) return 'sin-pago';
  if (exp < today) return 'vencido';
  if (exp <= addDays(today, 7)) return 'por-vencer';
  return 'activo';
};
