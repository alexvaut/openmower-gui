import {useLayoutEffect, useRef, useState} from 'react';

// Shared SVG sparkline. Pure visual primitive — caller owns samples, window, scale.
// Renders in actual pixel coordinates (viewBox matches rendered size) so strokes
// never get stretched/blurred by preserveAspectRatio.

export type SparkSample = {t: number; v: number};
export type SparkMarker = {t: number; kind?: 'on' | 'off'};

type Props = {
    samples: SparkSample[];
    markers?: SparkMarker[];
    now: number;
    windowMs: number;
    yMin: number;
    yMax: number;
    unit: string;
    label: string;
    stroke: string;
    height?: number;
    showAxis?: boolean;
    showLiveValue?: boolean;
    // When true, x-axis ticks show wall-clock time (HH:MM / HH:MM:SS / MM/DD HH:MM
    // depending on the range). When false (default), "now" + relative seconds.
    absoluteTime?: boolean;
};

const pad2 = (n: number) => n.toString().padStart(2, '0');

const formatTick = (tMs: number, windowMs: number): string => {
    const d = new Date(tMs);
    if (windowMs <= 2 * 3600_000) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    if (windowMs <= 48 * 3600_000) return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const Sparkline = ({
    samples,
    markers = [],
    now,
    windowMs,
    yMin,
    yMax,
    unit,
    label,
    stroke,
    height = 80,
    showAxis = true,
    showLiveValue = true,
    absoluteTime = false,
}: Props) => {
    const ref = useRef<HTMLDivElement>(null);
    const [W, setW] = useState(0);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        setW(el.getBoundingClientRect().width);
        const ro = new ResizeObserver(entries => {
            const w = entries[0].contentRect.width;
            if (w > 0) setW(w);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const H = height;
    const padL = showAxis ? 44 : 4;
    const padR = 8;
    const padT = 10;
    const padB = showAxis ? 16 : 4;
    const plotW = Math.max(0, W - padL - padR);
    const plotH = H - padT - padB;
    const tMin = now - windowMs;
    const xAt = (t: number) => padL + ((t - tMin) / windowMs) * plotW;
    const yAt = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
    const points = samples.map(s => `${xAt(s.t).toFixed(1)},${yAt(s.v).toFixed(1)}`).join(' ');
    const yTicks = [yMin, (yMin + yMax) / 2, yMax];
    const xTicks = [tMin, tMin + windowMs * 0.25, tMin + windowMs * 0.5, tMin + windowMs * 0.75, now];
    const last = samples[samples.length - 1];
    const fmtY = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
    const fmtX = (t: number) => absoluteTime
        ? formatTick(t, windowMs)
        : (t === now ? 'now' : `${((t - now) / 1000).toFixed(0)}s`);

    return (
        <div ref={ref} style={{width: '100%', height: H}}>
            {W > 0 && (
                <svg width={W} height={H} style={{display: 'block'}}>
                    {yTicks.map((v, i) => (
                        <g key={`y${i}`}>
                            <line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)}
                                  stroke="#1e293b" strokeWidth={1}
                                  strokeDasharray={i === 1 ? '2 3' : undefined}
                                  shapeRendering="crispEdges"/>
                            {showAxis && (
                                <text x={padL - 6} y={yAt(v) + 3} textAnchor="end" fontSize={10}
                                      fill="#64748b" fontFamily="ui-monospace, monospace">
                                    {fmtY(v)}
                                </text>
                            )}
                        </g>
                    ))}
                    {showAxis && xTicks.map((t, i) => (
                        <g key={`x${i}`}>
                            <line x1={xAt(t)} x2={xAt(t)}
                                  y1={padT + plotH} y2={padT + plotH + 3}
                                  stroke="#334155" strokeWidth={1}
                                  shapeRendering="crispEdges"/>
                            <text x={xAt(t)} y={H - 3}
                                  textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                                  fontSize={10} fill="#64748b" fontFamily="ui-monospace, monospace">
                                {fmtX(t)}
                            </text>
                        </g>
                    ))}
                    {showAxis && (
                        <text x={4} y={padT} fontSize={10} fill="#64748b" fontFamily="ui-monospace, monospace">{unit}</text>
                    )}
                    {markers.filter(m => m.t >= tMin).map((m, i) => (
                        <line key={`m${i}`}
                              x1={xAt(m.t)} x2={xAt(m.t)}
                              y1={padT} y2={padT + plotH}
                              stroke={m.kind === 'off' ? '#64748b' : '#0ea5e9'}
                              strokeWidth={1} strokeDasharray="3 3" opacity={0.8}/>
                    ))}
                    {samples.length > 1 && (
                        <polyline points={points} fill="none" stroke={stroke}
                                  strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round"/>
                    )}
                    {last && (
                        <circle cx={xAt(last.t)} cy={yAt(last.v)} r={2.5} fill={stroke}/>
                    )}
                    <text x={padL + 4} y={padT + 3} fontSize={11} fill="#cbd5e1"
                          fontFamily="ui-sans-serif, system-ui" style={{fontWeight: 500}}>
                        {label}
                    </text>
                    {showLiveValue && last && (
                        <text x={W - padR - 2} y={padT + 3} textAnchor="end" fontSize={11}
                              fill={stroke} fontFamily="ui-monospace, monospace">
                            {fmtY(last.v)} {unit}
                        </text>
                    )}
                </svg>
            )}
        </div>
    );
};

export default Sparkline;
