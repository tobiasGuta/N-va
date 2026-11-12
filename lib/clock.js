// Pure local-time utilities. No network or external calendar service needed.
export function activeMode(player) {
    return player?.status === 'Playing' ? 'music' : 'clock';
}

export function compactClock(date) {
    const weekday = new Intl.DateTimeFormat(undefined, {weekday: 'short'}).format(date);
    const time = new Intl.DateTimeFormat(undefined, {
        hour: 'numeric', minute: '2-digit',
    }).format(date);
    return weekday + '  ' + time;
}

export function fullClock(date) {
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric', minute: '2-digit',
    }).format(date);
}

export function longDate(date) {
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'long', month: 'short', day: 'numeric',
    }).format(date);
}

export function monthLabel(date) {
    return new Intl.DateTimeFormat(undefined, {
        month: 'long', year: 'numeric',
    }).format(date);
}

// Week starts on Sunday for this first version.
export function weekdayLabels() {
    return Array.from({length: 7}, (_, n) =>
        new Intl.DateTimeFormat(undefined, {weekday: 'short'})
            .format(new Date(2023, 0, 1 + n)).slice(0, 2)
    );
}

export function monthCells(monthDate, today) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const offset = new Date(year, month, 1).getDay();
    return Array.from({length: 42}, (_, index) => {
        const date = new Date(year, month, 1 + index - offset);
        return {
            day: date.getDate(),
            inMonth: date.getMonth() === month && date.getFullYear() === year,
            isToday: date.getFullYear() === today.getFullYear() &&
                date.getMonth() === today.getMonth() &&
                date.getDate() === today.getDate(),
        };
    });
}
