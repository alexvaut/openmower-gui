import {useEffect, useRef, useState, useCallback} from 'react';
import {DownOutlined, UpOutlined, ReloadOutlined, ArrowLeftOutlined, ArrowRightOutlined} from '@ant-design/icons';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {GraphChart} from '../common/GraphChart';
import {
    SensorLogData,
    SensorType,
    SensorTypeLabels,
    TimeRangePresets,
} from '../../types/sensorlog';
import {useSharedSensorLog} from './SensorLogContext';

// Historical sensor graph. Time range is driven by the shared sensorLog state,
// so the right-panel picker is the single source of truth. When the user drags
// to zoom the X-axis of a chart, that range is pushed back into the shared
// state as a `graph` custom range — which is picked up by both the map overlay
// and every other chart in this panel.

type SensorDef = {
    key: SensorType;
    unit: string;
    stroke: string;
};

const SENSOR_DEFS: SensorDef[] = [
    {key: 'speed', unit: 'm/s', stroke: '#38bdf8'},
    {key: 'mow_rpm', unit: 'RPM', stroke: '#a78bfa'},
    {key: 'mow_current', unit: 'A', stroke: '#f59e0b'},
    {key: 'mow_temp_motor', unit: '°C', stroke: '#ef4444'},
    {key: 'mow_temp_pcb', unit: '°C', stroke: '#fb7185'},
    {key: 'left_current', unit: 'A', stroke: '#22d3ee'},
    {key: 'left_rpm', unit: 'RPM', stroke: '#14b8a6'},
    {key: 'left_temp_motor', unit: '°C', stroke: '#f97316'},
    {key: 'right_current', unit: 'A', stroke: '#06b6d4'},
    {key: 'right_rpm', unit: 'RPM', stroke: '#10b981'},
    {key: 'right_temp_motor', unit: '°C', stroke: '#ea580c'},
    {key: 'v_battery', unit: 'V', stroke: '#84cc16'},
    {key: 'gps_accuracy', unit: 'cm', stroke: '#eab308'},
    {key: 'wifi_percent', unit: '%', stroke: '#60a5fa'},
    {key: 'wifi_dbm', unit: 'dBm', stroke: '#3b82f6'},
    {key: 'load_ratio', unit: '', stroke: '#f472b6'},
];
const DEF_BY_KEY = new Map(SENSOR_DEFS.map(s => [s.key, s]));

type SeriesState = {
    xs: number[]; // epoch seconds
    ys: number[];
    count: number;
};

const SYNC_KEY = 'parameters-panel-graphs';
const HEADER_H = 36;
const MIN_PANEL_H = 200;
const PER_CHART_MIN = 90;

export const ParametersPanel = ({initiallyOpen = true}: {initiallyOpen?: boolean}) => {
    const sensorLog = useSharedSensorLog();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    // `selected` is URL-synced (?series=speed,mow_rpm) so sharing a link
    // restores the exact multi-series view. Falls back to the overlay sensor.
    const seriesParam = searchParams.get('series');
    const selected: SensorType[] = seriesParam
        ? seriesParam.split(',').filter(Boolean) as SensorType[]
        : [sensorLog.sensorType];
    const setSelected = useCallback((updater: (prev: SensorType[]) => SensorType[]) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            const current: SensorType[] = (next.get('series')?.split(',').filter(Boolean) as SensorType[])
                ?? [sensorLog.sensorType];
            const updated = updater(current);
            if (updated.length === 0) next.delete('series');
            else next.set('series', updated.join(','));
            return next;
        });
    }, [setSearchParams, sensorLog.sensorType]);

    const [open, setOpen] = useState(initiallyOpen);
    const [seriesBySensor, setSeriesBySensor] = useState<Map<SensorType, SeriesState | 'loading' | 'error'>>(new Map());
    const [panelHeight, setPanelHeight] = useState(380);
    const [chartHeight, setChartHeight] = useState(160);

    // When the overlay sensor changes, swap the previously auto-pinned sensor
    // out of the graph and pin the new one; user-added pills are preserved.
    const autoPinRef = useRef<SensorType>(sensorLog.sensorType);
    useEffect(() => {
        const prevAuto = autoPinRef.current;
        const nextAuto = sensorLog.sensorType;
        if (prevAuto === nextAuto) return;
        setSelected(prev => {
            const withoutOld = prev.filter(s => s !== prevAuto);
            return withoutOld.includes(nextAuto) ? withoutOld : [nextAuto, ...withoutOld];
        });
        autoPinRef.current = nextAuto;
    }, [sensorLog.sensorType, setSelected]);

    // Fetch all selected series. The graph always fetches the preset range
    // (falling back to last_24h when the timeRange is 'graph'), so uPlot has
    // the full context. The zoom window from customRange is applied visually
    // via GraphChart's scaleRange prop — it doesn't drive the fetch.
    const fetchTimeRange = sensorLog.timeRange === 'graph' ? 'last_24h' : sensorLog.timeRange;
    useEffect(() => {
        const {from, to} = TimeRangePresets[fetchTimeRange].resolve();
        const controller = new AbortController();
        setSeriesBySensor(prev => {
            const next = new Map(prev);
            for (const k of selected) next.set(k, 'loading');
            return next;
        });
        Promise.all(selected.map(async k => {
            try {
                const res = await fetch(
                    `/api/sensorlog?sensor=${encodeURIComponent(k)}&from=${from}&to=${to}`,
                    {signal: controller.signal},
                );
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json() as SensorLogData;
                const rows = data.samples ?? [];
                const xs = new Array<number>(rows.length);
                const ys = new Array<number>(rows.length);
                for (let i = 0; i < rows.length; i++) { xs[i] = rows[i].t; ys[i] = rows[i].v; }
                setSeriesBySensor(prev => {
                    const next = new Map(prev);
                    next.set(k, {xs, ys, count: data.count});
                    return next;
                });
            } catch (err: any) {
                if (err?.name === 'AbortError') return;
                setSeriesBySensor(prev => {
                    const next = new Map(prev);
                    next.set(k, 'error');
                    return next;
                });
            }
        }));
        return () => controller.abort();
        // Graph fetch depends only on the preset — NOT on customRange, so the
        // visual zoom doesn't trigger a re-fetch (and the uPlot auto-rescale
        // that follows a setData doesn't fire my user-zoom detection).
    }, [selected.join(','), fetchTimeRange, sensorLog.refreshTick]);

    const toggleSelected = (k: SensorType) => {
        setSelected(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
    };

    const handleXRangeChange = useCallback((from: number, to: number, full: boolean) => {
        if (full) {
            // Double-click reset: if we're currently on a graph range, drop
            // back to 'last_24h'. Otherwise no-op (avoids pushing redundant
            // history entries on initial/data-driven setScale firings).
            if (sensorLog.timeRange === 'graph') {
                sensorLog.clearGraphRange('last_24h');
            }
            return;
        }
        sensorLog.setGraphRange(from, to);
    }, [sensorLog]);

    // Drag handle for panel height
    const dragRef = useRef<{startY: number; startH: number} | null>(null);
    const onDragStart = useCallback((e: React.PointerEvent) => {
        dragRef.current = {startY: e.clientY, startH: panelHeight};
        (e.target as Element).setPointerCapture(e.pointerId);
        e.preventDefault();
    }, [panelHeight]);
    const onDragMove = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startY - e.clientY;
        const max = window.innerHeight - 120;
        const h = Math.max(MIN_PANEL_H, Math.min(max, dragRef.current.startH + delta));
        setPanelHeight(h);
    }, []);
    const onDragEnd = useCallback((e: React.PointerEvent) => {
        dragRef.current = null;
        try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
    }, []);

    useEffect(() => {
        if (!open) return;
        const usable = panelHeight - HEADER_H - 52 /* pills row */ - 8;
        if (selected.length === 0) return;
        const ideal = Math.floor(usable / selected.length);
        setChartHeight(Math.max(PER_CHART_MIN, Math.min(340, ideal)));
    }, [panelHeight, selected.length, open]);

    const currentHeight = open ? panelHeight : HEADER_H;

    // Summary label for the header (shows the effective window).
    const {from: effFrom, to: effTo} = sensorLog.resolveRange();
    const windowSummary = (() => {
        const fmt = (ts: number) => {
            const d = new Date(ts * 1000);
            const pad = (n: number) => n.toString().padStart(2, '0');
            return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        const label = sensorLog.timeRange === 'graph'
            ? 'Graph'
            : TimeRangePresets[sensorLog.timeRange].label;
        return `${label} · ${fmt(effFrom)} → ${fmt(effTo)}`;
    })();

    return (
        <div
            style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 40,
                height: currentHeight,
                pointerEvents: 'auto',
                background: '#0f172a',
            }}
            className="border-t border-slate-800 text-slate-100 flex flex-col"
        >
            {open && (
                <div
                    onPointerDown={onDragStart}
                    onPointerMove={onDragMove}
                    onPointerUp={onDragEnd}
                    onPointerCancel={onDragEnd}
                    className="flex items-center justify-center cursor-ns-resize hover:bg-slate-800"
                    style={{height: 6, flexShrink: 0, borderBottom: '1px solid #1e293b', touchAction: 'none'}}
                    title="Drag to resize"
                >
                    <div style={{width: 40, height: 2, background: '#334155', borderRadius: 2}}/>
                </div>
            )}
            <div style={{background: '#0f172a', flexShrink: 0, height: HEADER_H}} className="flex items-center justify-between px-4 gap-3">
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(v => !v)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(v => !v); }}
                    className="flex items-center gap-2 text-sm font-semibold text-slate-200 hover:text-white cursor-pointer select-none"
                >
                    {open ? <DownOutlined style={{fontSize: 11}}/> : <UpOutlined style={{fontSize: 11}}/>}
                    Graph
                    <span className="text-xs font-normal text-slate-500">({selected.length} selected)</span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-slate-500">
                    <span className="params-window-summary">{windowSummary}</span>
                    <span className="params-drag-hint">drag to zoom · dbl-click to reset</span>
                    <div className="flex items-center gap-2">
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(-1)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(-1); }}
                            className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-100 select-none"
                            title="Back (also: browser back button)"
                        >
                            <ArrowLeftOutlined/> back
                        </div>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(1)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(1); }}
                            className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-100 select-none"
                            title="Forward"
                        >
                            <ArrowRightOutlined/> fwd
                        </div>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => sensorLog.refresh()}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') sensorLog.refresh(); }}
                            className="flex items-center gap-1 cursor-pointer text-slate-400 hover:text-slate-100 select-none"
                            title="Refresh"
                        >
                            <ReloadOutlined/> refresh
                        </div>
                    </div>
                </div>
            </div>
            {open && (
                <div className="flex-1 min-h-0 flex flex-col">
                    <div className="px-2 py-2 flex flex-wrap gap-1.5 border-t border-slate-800 border-b" style={{flexShrink: 0}}>
                        {SENSOR_DEFS.map(s => {
                            const on = selected.includes(s.key);
                            return (
                                <span
                                    key={s.key}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => toggleSelected(s.key)}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleSelected(s.key); }}
                                    className={`text-xs px-2 py-0.5 rounded-full border cursor-pointer select-none transition-colors ${
                                        on
                                            ? 'border-slate-600 text-slate-100'
                                            : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                                    }`}
                                    style={{
                                        background: on ? '#1e293b' : 'transparent',
                                        boxShadow: on ? `inset 3px 0 0 ${s.stroke}` : undefined,
                                    }}
                                >
                                    {SensorTypeLabels[s.key]}
                                </span>
                            );
                        })}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-2 py-1">
                        {selected.length === 0 && (
                            <div className="text-xs text-slate-500 italic py-6 text-center">Select one or more parameters above to chart.</div>
                        )}
                        {selected.map(k => {
                            const def = DEF_BY_KEY.get(k)!;
                            const state = seriesBySensor.get(k);
                            if (state === undefined || state === 'loading') {
                                return (
                                    <div key={k} className="h-[90px] flex items-center text-xs text-slate-500 border-b border-slate-800/60">
                                        <span className="ml-12">{SensorTypeLabels[k]} — loading…</span>
                                    </div>
                                );
                            }
                            if (state === 'error') {
                                return (
                                    <div key={k} className="h-[90px] flex items-center text-xs text-red-400 border-b border-slate-800/60">
                                        <span className="ml-12">{SensorTypeLabels[k]} — fetch error</span>
                                    </div>
                                );
                            }
                            if (state.count === 0) {
                                return (
                                    <div key={k} className="h-[90px] flex items-center text-xs text-slate-500 border-b border-slate-800/60">
                                        <span className="ml-12">{SensorTypeLabels[k]} — no samples in range</span>
                                    </div>
                                );
                            }
                            return (
                                <GraphChart
                                    key={k}
                                    label={`${SensorTypeLabels[k]} · ${state.count} pts`}
                                    unit={def.unit}
                                    stroke={def.stroke}
                                    xs={state.xs}
                                    ys={state.ys}
                                    height={chartHeight}
                                    syncKey={SYNC_KEY}
                                    scaleRange={sensorLog.timeRange === 'graph' ? sensorLog.customRange : null}
                                    onXRangeChange={handleXRangeChange}
                                    onHoverTime={sensorLog.setHoveredTime}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ParametersPanel;
