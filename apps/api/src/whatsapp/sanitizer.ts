export function sanitizeForWhatsApp(text: string) {
    let result = text;

    while (result.includes('```')) {
        const start = result.indexOf('```');
        const end = result.indexOf('```', start + 3);
        if (end === -1) break;
        result = result.substring(0, start) + result.substring(start + 3, end) + result.substring(end + 3);
    }

    result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*');
    result = result.replace(/__([^_]+)__/g, '_$1_');
    result = result.replace(/~~([^~]+)~~/g, '~$1~');

    result = result.split('\n').map(line => line.replace(/^#+\s/, '')).join('\n');
    result = result.split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
    result = result.split('\n').map(line => line.replace(/^[-*]\s+/, '• ')).join('\n');
    result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$2');
    result = result.split('\n').map(line => line.trim()).filter((line, i, arr) => !(line === '' && i > 0 && arr[i-1] === '')).join('\n').trim();
    return result;
}
