import {useEffect, useLayoutEffect, useRef} from 'react';
import uPlot, {AlignedData, Options} from 'uplot';
import 'uplot/dist/uPlot.min.css';

// uPlot-based time-series chart. Drag-to-zoom on X and Y axes, double-click
// to reset, shared cursor via `syncKey` across sibling charts.

type Props = {
    label: string;
    unit: string;
    stroke: string;
    xs: number[]; // epoch seconds
    ys: number[];
    height: number;
    syncKey: string;
    // When set, forces uPlot's x-axis scale to this window (visual zoom without
    // refetching). Null = let uPlot auto-scale to the data.
    scaleRange?: {from: number; to: number} | null;
    // Fires for USER-INITIATED scale changes only (drag-zoom or dbl-click reset).
    // `full` is true when the reset brings us back to the full data range.
    onXRangeChange?: (from: number, to: number, full: boolean) => void;
    // Fires on cursor move with the hovered x-value (epoch seconds), or null
    // when the cursor leaves the plot. Used by the map to highlight the
    // closest sensor sample in time.
    onHoverTime?: (t: number | null) => void;
};

const pad2 = (n: number) => n.toString().padStart(2, '0');

export function GraphChart({label, unit, stroke, xs, ys, height, syncKey, scaleRange, onXRangeChange, onHoverTime}: Props) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const plotRef = useRef<uPlot | null>(null);
    const roRef = useRef<ResizeObserver | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    // Guards the setScale hook against our own programmatic scale changes
    // (applying scaleRange, or auto-scaling after setData). Only user drag-zoom
    // and dbl-click reset should fire onXRangeChange.
    const programmaticScaleRef = useRef(false);
    // Keep latest props in a ref so hook closures see fresh values without
    // recreating the plot.
    const metaRef = useRef({label, unit, stroke, onXRangeChange, onHoverTime});
    metaRef.current = {label, unit, stroke, onXRangeChange, onHoverTime};

    useLayoutEffect(() => {
        const host = wrapRef.current;
        if (!host) return;
        host.style.position = 'relative';

        const tooltip = document.createElement('div');
        Object.assign(tooltip.style, {
            position: 'absolute',
            pointerEvents: 'none',
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid #334155',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '11px',
            fontFamily: 'ui-monospace, monospace',
            color: '#e2e8f0',
            whiteSpace: 'nowrap',
            zIndex: '5',
            display: 'none',
        } as CSSStyleDeclaration);
        host.appendChild(tooltip);
        tooltipRef.current = tooltip;

        const rect = host.getBoundingClientRect();
        const w = rect.width || 600;

        const opts: Options = {
            width: w,
            height,
            cursor: {
                sync: {key: syncKey},
                drag: {x: true, y: true, uni: 50},
                points: {size: 6},
            },
            legend: {show: false},
            scales: {
                x: {time: true},
                y: {auto: true},
            },
            axes: [
                {
                    stroke: '#94a3b8',
                    grid: {stroke: '#1e293b', width: 1},
                    ticks: {stroke: '#334155', width: 1},
                    font: '10px ui-monospace, monospace',
                },
                {
                    stroke: '#94a3b8',
                    grid: {stroke: '#1e293b', width: 1},
                    ticks: {stroke: '#334155', width: 1},
                    size: 56,
                    font: '10px ui-monospace, monospace',
                },
            ],
            series: [
                {},
                {
                    label: metaRef.current.label,
                    stroke: metaRef.current.stroke,
                    width: 1.25,
                    points: {show: false, size: 4},
                },
            ],
            hooks: {
                setCursor: [
                    (u) => {
                        const tt = tooltipRef.current;
                        if (!tt) return;
                        const idx = u.cursor.idx;
                        const hoverCb = metaRef.current.onHoverTime;
                        if (idx == null) {
                            tt.style.display = 'none';
                            hoverCb?.(null);
                            return;
                        }
                        const t = u.data[0][idx] as number;
                        const v = u.data[1][idx] as number | null;
                        if (t == null || v == null) {
                            tt.style.display = 'none';
                            hoverCb?.(null);
                            return;
                        }
                        hoverCb?.(t);
                        const d = new Date(t * 1000);
                        const when = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
                        const m = metaRef.current;
                        tt.innerHTML = `<div style="color:#64748b">${when}</div><div style="color:${m.stroke}">${v.toFixed(3)} ${m.unit}</div>`;
                        tt.style.display = 'block';
                        const cx = u.cursor.left ?? 0;
                        const cy = u.cursor.top ?? 0;
                        tt.style.left = `${cx + 14}px`;
                        tt.style.top = `${cy + 14}px`;
                    },
                ],
                setScale: [
                    (u, key) => {
                        if (key !== 'x') return;
                        if (programmaticScaleRef.current) {
                            programmaticScaleRef.current = false;
                            return;
                        }
                        const cb = metaRef.current.onXRangeChange;
                        if (!cb) return;
                        const xMin = u.scales.x.min;
                        const xMax = u.scales.x.max;
                        if (xMin == null || xMax == null) return;
                        const xs = u.data[0];
                        if (!xs.length) return;
                        const dataMin = xs[0] as number;
                        const dataMax = xs[xs.length - 1] as number;
                        // "Full" = within 1s of the data's native span.
                        const full = Math.abs(xMin - dataMin) < 1 && Math.abs(xMax - dataMax) < 1;
                        cb(Math.round(xMin), Math.round(xMax), full);
                    },
                ],
            },
        };

        const plot = new uPlot(opts, [xs, ys] as AlignedData, host);
        plotRef.current = plot;

        roRef.current = new ResizeObserver(() => {
            const r = host.getBoundingClientRect();
            if (r.width > 0) plot.setSize({width: r.width, height});
        });
        roRef.current.observe(host);

        return () => {
            roRef.current?.disconnect();
            tooltip.remove();
            plot.destroy();
            plotRef.current = null;
        };
        // Recreate only when syncKey changes (rare).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncKey]);

    // Update data when it changes. setData triggers an auto-rescale — that's a
    // programmatic scale change, not a user zoom, so raise the guard.
    useEffect(() => {
        if (!plotRef.current) return;
        programmaticScaleRef.current = true;
        plotRef.current.setData([xs, ys] as AlignedData);
        // If a scaleRange is pinned, restore it after setData's auto-scale.
        if (scaleRange) {
            programmaticScaleRef.current = true;
            plotRef.current.setScale('x', {min: scaleRange.from, max: scaleRange.to});
        }
    }, [xs, ys, scaleRange?.from, scaleRange?.to]);

    // scaleRange changes independently (e.g. user picks back/forward without
    // the underlying data changing) — apply the new scale programmatically.
    useEffect(() => {
        const plot = plotRef.current;
        if (!plot) return;
        if (scaleRange) {
            programmaticScaleRef.current = true;
            plot.setScale('x', {min: scaleRange.from, max: scaleRange.to});
        } else {
            // Reset to full data range.
            const xsArr = plot.data[0];
            if (xsArr && xsArr.length) {
                programmaticScaleRef.current = true;
                plot.setScale('x', {min: xsArr[0] as number, max: xsArr[xsArr.length - 1] as number});
            }
        }
    }, [scaleRange?.from, scaleRange?.to]);

    // Apply height changes.
    useEffect(() => {
        const plot = plotRef.current;
        const host = wrapRef.current;
        if (!plot || !host) return;
        const r = host.getBoundingClientRect();
        plot.setSize({width: r.width || 600, height});
    }, [height]);

    return (
        <div className="border-b border-slate-800/60 last:border-b-0 pt-1 pb-2">
            <div className="flex items-center justify-between px-1 mb-1 text-[11px]">
                <span className="font-medium text-slate-200">{label}</span>
                <span className="text-slate-500 font-mono">{unit}</span>
            </div>
            <div ref={wrapRef} style={{width: '100%', height}}/>
        </div>
    );
}

export default GraphChart;
