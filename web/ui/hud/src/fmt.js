// Formato de cifras de la API: solo redondeo de presentación, nunca valores nuevos.
export const min = (v) => (v == null ? '—' : `${Number(v).toFixed(1)} min`);
