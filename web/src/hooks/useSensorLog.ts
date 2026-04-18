import {useState, useCallback, useEffect} from 'react';
import {useSearchParams} from 'react-router-dom';
import {ColorProfile, SensorLogData, SensorType, TimeRange, TimeRangePresets} from '../types/sensorlog.ts';

// Shared source of truth for the map heatmap and the graph panel.
//
// Range state (sensor, timeRange, custom from/to, overlay visibility, color
// profile) is stored in URL search params — so every change is a browser
// history entry. Back/forward walk through past selections, and URLs are
// shareable for a given analysis. Only true UI preferences (point size, blur,
// opacity) and server-side data stay in React state.

const VALID_RANGES: TimeRange[] = ['last_hour', 'last_12h', 'last_24h', 'today', 'yesterday', 'last_7d', 'last_30d', 'all', 'graph'];
const VALID_PROFILES: ColorProfile[] = ['thermal', 'traffic', 'viridis', 'cool'];

export const useSensorLog = () => {
    const [searchParams, setSearchParams] = useSearchParams();

    // Derive state from URL
    const sensorType = (searchParams.get('sensor') ?? 'mow_rpm') as SensorType;
    const rangeParam = searchParams.get('range');
    const rawTimeRange = (VALID_RANGES.includes(rangeParam as TimeRange) ? rangeParam : 'last_24h') as TimeRange;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const fromNum = fromParam ? Number(fromParam) : NaN;
    const toNum = toParam ? Number(toParam) : NaN;
    const customRange = Number.isFinite(fromNum) && Number.isFinite(toNum)
        ? {from: fromNum, to: toNum}
        : null;
    // If range=graph but no custom window is in the URL, fall back to last_24h so
    // callers never resolve to the stale preset placeholder.
    const timeRange: TimeRange = rawTimeRange === 'graph' && !customRange ? 'last_24h' : rawTimeRange;
    const visible = searchParams.get('overlay') === '1';
    const rawProfile = searchParams.get('profile');
    const colorProfile: ColorProfile = VALID_PROFILES.includes(rawProfile as ColorProfile)
        ? (rawProfile as ColorProfile) : 'thermal';

    // Mutations: patch search params. Uses push semantics so each change is a
    // new browser history entry — back button walks them.
    const patch = useCallback((edits: Record<string, string | null>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            for (const [k, v] of Object.entries(edits)) {
                if (v === null) next.delete(k);
                else next.set(k, v);
            }
            return next;
        });
    }, [setSearchParams]);

    const setSensorType = useCallback((s: SensorType) => {
        patch({sensor: s});
    }, [patch]);

    const setTimeRange = useCallback((r: TimeRange) => {
        if (r === 'graph') {
            patch({range: 'graph'}); // keep existing from/to
        } else {
            patch({range: r, from: null, to: null});
        }
    }, [patch]);

    const setGraphRange = useCallback((from: number, to: number) => {
        patch({range: 'graph', from: String(from), to: String(to)});
    }, [patch]);

    const clearGraphRange = useCallback((fallback: TimeRange = 'last_24h') => {
        patch({range: fallback, from: null, to: null});
    }, [patch]);

    const setVisible = useCallback((v: boolean) => {
        patch({overlay: v ? '1' : null});
    }, [patch]);

    const setColorProfile = useCallback((p: ColorProfile) => {
        patch({profile: p});
    }, [patch]);

    // Visual-only params: not URL-synced.
    const [pointSize, setPointSize] = useState(4);
    const [pointBlur, setPointBlur] = useState(0);
    const [opacity, setOpacity] = useState(0.8);

    // Server-side state
    const [data, setData] = useState<SensorLogData | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);

    // Hovered timestamp on the graph (epoch seconds). The map uses this to
    // highlight the closest sample in time. Not URL-synced — purely ephemeral.
    const [hoveredTime, setHoveredTime] = useState<number | null>(null);

    const resolveRange = useCallback((): {from: number; to: number} => {
        if (timeRange === 'graph' && customRange) return customRange;
        return TimeRangePresets[timeRange].resolve();
    }, [timeRange, customRange]);

    // Auto-fetch when visible and the effective window or sensor changes.
    useEffect(() => {
        if (!visible) return;
        const {from, to} = timeRange === 'graph' && customRange
            ? customRange
            : TimeRangePresets[timeRange].resolve();
        const controller = new AbortController();
        setLoading(true);
        fetch(`/api/sensorlog?sensor=${encodeURIComponent(sensorType)}&from=${from}&to=${to}`,
            {signal: controller.signal})
            .then(r => (r.ok ? r.json() as Promise<SensorLogData> : null))
            .then(result => { if (result) setData(result); })
            .catch(err => { if (err?.name !== 'AbortError') console.warn('sensorlog fetch failed', err); })
            .finally(() => setLoading(false));
        return () => controller.abort();
        // Depend on primitive values so URL-derived state doesn't retrigger
        // spuriously when the URLSearchParams instance identity changes.
    }, [visible, sensorType, timeRange, customRange?.from, customRange?.to, refreshTick]);

    const refresh = useCallback(() => setRefreshTick(t => t + 1), []);

    const seedData = useCallback(async (count: number = 3600) => {
        const response = await fetch(`/api/sensorlog/seed?count=${count}`, {method: 'POST'});
        return response.ok;
    }, []);

    return {
        data, loading,
        visible, setVisible,
        sensorType, setSensorType,
        timeRange, setTimeRange,
        customRange, setGraphRange, clearGraphRange,
        resolveRange,
        colorProfile, setColorProfile,
        pointSize, setPointSize,
        pointBlur, setPointBlur,
        opacity, setOpacity,
        refresh, refreshTick,
        seedData,
        hoveredTime, setHoveredTime,
    };
};
