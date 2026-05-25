export const cleanNumber = (val: unknown): number => {
    if (typeof val === 'number') return val;
    const str = String(val || '').toLowerCase().replace(/,/g, '').trim();
    const cleanStr = str.replace(/[^\d.]/g, '');
    const num = Number(cleanStr);
    return Number.isFinite(num) ? num : 0;
};
