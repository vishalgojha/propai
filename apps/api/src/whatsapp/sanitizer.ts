export function sanitizeForWhatsApp(text: string) {
    // Remove code blocks and Markdown formatting without regex
    let result = text;
    // Remove ```code blocks```
    while (result.includes('```')) {
        const start = result.indexOf('```');
        const end = result.indexOf('```', start + 3);
        if (end === -1) break;
        result = result.substring(0, start) + result.substring(start + 3, end) + result.substring(end + 3);
    }
    // Remove **bold**, __italic__, ~~strikethrough~~
    result = result.split('**').map((part, i) => i % 2 === 1 ? part : part).join('');
    result = result.split('__').map((part, i) => i % 2 === 1 ? part : part).join('');
    result = result.split('~~').map((part, i) => i % 2 === 1 ? part : part).join('');
    // Remove headings (# ## ###)
    result = result.split('\n').map(line => line.replace(/^#+\s/, '')).join('\n');
    // Remove blockquotes
    result = result.split('\n').map(line => line.replace(/^>\s?/, '')).join('\n');
    // Replace list markers
    result = result.split('\n').map(line => line.replace(/^[-*]\s+/, '• ')).join('\n');
    // Remove markdown links [text](url) - simplified
    result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$2');
    // Clean up whitespace
    result = result.split('\n').map(line => line.trim()).filter((line, i, arr) => !(line === '' && i > 0 && arr[i-1] === '')).join('\n').trim();
    return result;
}
