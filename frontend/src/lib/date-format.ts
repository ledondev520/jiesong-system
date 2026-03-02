import { format } from 'date-fns';

const toDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

export const formatDate = (value: unknown, fallback = '-') => {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }

  return format(date, 'yyyy-MM-dd');
};

export const formatDateTime = (value: unknown, fallback = '-') => {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }

  return format(date, 'yyyy-MM-dd HH:mm:ss');
};

