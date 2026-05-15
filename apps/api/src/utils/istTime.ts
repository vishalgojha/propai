const IST_TIME_ZONE = 'Asia/Kolkata';

export type IstDateTimeContext = {
    timeZone: typeof IST_TIME_ZONE;
    abbreviation: 'IST';
    date: string;
    time: string;
    weekday: string;
    dayPart: 'morning' | 'afternoon' | 'evening' | 'night';
    greeting: string;
};

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
    return parts.find((part) => part.type === type)?.value || '';
}

function getIstHour(now: Date) {
    const hour = new Intl.DateTimeFormat('en-IN', {
        timeZone: IST_TIME_ZONE,
        hour: '2-digit',
        hour12: false,
    }).format(now);

    return Number(hour) % 24;
}

function getDayPart(hour: number): IstDateTimeContext['dayPart'] {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
}

function getGreeting(dayPart: IstDateTimeContext['dayPart']) {
    if (dayPart === 'morning') return 'Good morning';
    if (dayPart === 'afternoon') return 'Good afternoon';
    if (dayPart === 'evening') return 'Good evening';
    return 'Hi';
}

export function getIstDateTimeContext(now = new Date()): IstDateTimeContext {
    const dateParts = new Intl.DateTimeFormat('en-IN', {
        timeZone: IST_TIME_ZONE,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).formatToParts(now);

    const time = new Intl.DateTimeFormat('en-IN', {
        timeZone: IST_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    }).format(now);

    const dayPart = getDayPart(getIstHour(now));
    const weekday = getPart(dateParts, 'weekday');
    const day = getPart(dateParts, 'day');
    const month = getPart(dateParts, 'month');
    const year = getPart(dateParts, 'year');

    return {
        timeZone: IST_TIME_ZONE,
        abbreviation: 'IST',
        date: `${day} ${month} ${year}`,
        time: `${time} IST`,
        weekday,
        dayPart,
        greeting: getGreeting(dayPart),
    };
}

export function buildIstSystemContext(now = new Date()) {
    const context = getIstDateTimeContext(now);

    return [
        `Current date and time in IST: ${context.weekday}, ${context.date}, ${context.time}.`,
        'Use this for relative timing such as today, tomorrow, yesterday, this morning, this evening, EOD, and follow-up scheduling.',
        'Do not mention the timestamp unless it helps the broker or they ask for date/time.',
    ].join('\n');
}
