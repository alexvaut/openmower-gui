async function readError(res: Response): Promise<string> {
    try {
        const data = await res.json();
        if (data && typeof data.error === 'string') return data.error;
    } catch {
        // not JSON, fall through to text
    }
    try {
        const text = await res.text();
        if (text) return text;
    } catch {
        // ignore
    }
    return `${res.status} ${res.statusText}`;
}

export async function loadMapFromMower(): Promise<string> {
    const res = await fetch('/api/openmower/map/json');
    if (res.status === 503) {
        throw new Error('No map available on the mower yet — wait a few seconds for mower_map_service to publish, then retry.');
    }
    if (!res.ok) {
        throw new Error(await readError(res));
    }
    return res.text();
}

export async function saveMapToMower(jsonString: string): Promise<void> {
    const res = await fetch('/api/openmower/map/json', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: jsonString,
    });
    if (!res.ok) {
        throw new Error(await readError(res));
    }
}
