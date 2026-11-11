import moment from 'moment-timezone';
import Member from '../models/Members.js';
import { todayAR, addDays } from './dates.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const formatDate = (date) => moment.utc(date).format('DD/MM/YYYY');

// Días que faltan para el próximo cumpleaños (0 = hoy).
export const daysUntilBirthday = (birthday, today = todayAR()) => {
  if (!birthday) return null;
  const b = moment.utc(birthday);
  const t = moment.utc(today);
  // 29/02 en años no bisiestos se festeja el 28/02.
  const birthdayIn = (year) => {
    const daysInMonth = moment.utc({ year, month: b.month(), day: 1 }).daysInMonth();
    return moment.utc({ year, month: b.month(), day: Math.min(b.date(), daysInMonth) });
  };
  let next = birthdayIn(t.year());
  if (next.isBefore(t)) next = birthdayIn(t.year() + 1);
  return Math.round((next.valueOf() - t.valueOf()) / DAY_MS);
};

// Las notificaciones se calculan en el momento a partir de los socios:
// siempre están al día y no dependen de que un proceso nocturno haya corrido.
export const buildNotifications = async () => {
  const today = todayAR();
  const members = await Member.find(
    {
      $or: [
        { 'plan.expirationDate': { $gte: addDays(today, -15), $lte: addDays(today, 3) } },
        { birthday: { $ne: null } },
      ],
    },
    'name cellphone birthday plan.expirationDate plan.lastRenewalDate lastReminderAt'
  ).lean();

  const notifications = [];
  for (const member of members) {
    const base = {
      member: {
        _id: member._id,
        name: member.name,
        cellphone: member.cellphone,
        expirationDate: member.plan?.expirationDate,
        lastReminderAt: member.lastReminderAt,
      },
    };
    const exp = member.plan?.expirationDate;
    if (exp) {
      const days = Math.round((moment.utc(exp).startOf('day').valueOf() - today.valueOf()) / DAY_MS);
      if (days >= 0 && days <= 3) {
        const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`;
        notifications.push({
          ...base,
          _id: `vencimiento-${member._id}`,
          type: 'vencimiento',
          title: `El plan de ${member.name} vence ${when} (${formatDate(exp)}).`,
          date: exp,
          order: days,
        });
      } else if (days < 0 && days >= -15) {
        notifications.push({
          ...base,
          _id: `vencido-${member._id}`,
          type: 'vencido',
          title: `El plan de ${member.name} venció el ${formatDate(exp)} (hace ${-days} ${days === -1 ? 'día' : 'días'}).`,
          date: exp,
          order: 10 - days,
        });
      }
    }
    if (daysUntilBirthday(member.birthday, today) === 0) {
      notifications.push({
        ...base,
        _id: `cumpleaños-${member._id}`,
        type: 'cumpleaños',
        title: `Hoy es el cumpleaños de ${member.name}. 🎂`,
        date: today,
        order: -1,
      });
    }
  }

  return notifications.sort((a, b) => a.order - b.order);
};
