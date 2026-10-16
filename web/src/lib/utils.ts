import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const dtf = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const tf = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (iso: string) => dtf.format(new Date(iso));
export const fmtTime = (iso: string) => tf.format(new Date(iso));
export const fmtNumber = (n: number | null | undefined) => (n == null ? '–' : new Intl.NumberFormat('de-DE').format(n));

export function fmtDuration(minutes: number | null) {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1).replace('.', ',')} h`;
  return `${(minutes / 1440).toFixed(1).replace('.', ',')} d`;
}

export function relTime(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} d`;
}

export const incidentKey = (id: number) => `INC-${String(id).padStart(4, '0')}`;
