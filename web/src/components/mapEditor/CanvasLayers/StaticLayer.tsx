import {memo, useMemo} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {w2s} from '../coords';
import {AREA_STYLE, DOCK_COLOR, DOCK_HANDLE_DISTANCE_M} from '../style';
import type {MapDoc, View} from '../types';
import {useMapEditorStore} from '../useMapEditorStore';

function polygonToPath(outline: Array<{x: number; y: number}>, view: View, w: number, h: number): string {
    if (outline.length === 0) return '';
    let d = '';
    for (let i = 0; i < outline.length; i++) {
        const s = w2s(outline[i], view, w, h);
        d += (i === 0 ? 'M' : 'L') + s.x.toFixed(1) + ',' + s.y.toFixed(1);
    }
    return d + 'Z';
}

function Grid({view, width, height}: {view: View; width: number; height: number}) {
    const lines = useMemo(() => {
        const halfW = width / 2 / view.zoom;
        const halfH = height / 2 / view.zoom;
        const minX = view.cx - halfW, maxX = view.cx + halfW;
        const minY = view.cy - halfH, maxY = view.cy + halfH;
        const major = view.zoom > 20 ? 1 : view.zoom > 8 ? 5 : 10;
        const result: Array<{x1: number; y1: number; x2: number; y2: number; color: string}> = [];
        const x0 = Math.floor(minX / major) * major;
        for (let x = x0; x <= maxX; x += major) {
            const s1 = w2s({x, y: minY}, view, width, height);
            const s2 = w2s({x, y: maxY}, view, width, height);
            const color = Math.abs(x) < 1e-9 ? '#64748b' : '#1e293b';
            result.push({x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, color});
        }
        const y0 = Math.floor(minY / major) * major;
        for (let y = y0; y <= maxY; y += major) {
            const s1 = w2s({x: minX, y}, view, width, height);
            const s2 = w2s({x: maxX, y}, view, width, height);
            const color = Math.abs(y) < 1e-9 ? '#64748b' : '#1e293b';
            result.push({x1: s1.x, y1: s1.y, x2: s2.x, y2: s2.y, color});
        }
        return result;
    }, [view, width, height]);
    return (
        <g>
            {lines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color} strokeWidth={0.5}/>
            ))}
        </g>
    );
}

function Polygons({
    map,
    view,
    width,
    height,
    selectedId,
}: {
    map: MapDoc;
    view: View;
    width: number;
    height: number;
    selectedId: string | null;
}) {
    return (
        <g>
            {map.areas.map(a => {
                const d = polygonToPath(a.outline, view, width, height);
                const style = AREA_STYLE[a.properties.type];
                const selected = a.id === selectedId;
                return (
                    <path
                        key={a.id}
                        d={d}
                        data-area-id={a.id}
                        fill={selected ? style.fillSel : style.fill}
                        stroke={style.stroke}
                        strokeWidth={selected ? 2 : 1.4}
                    />
                );
            })}
        </g>
    );
}

function Docks({
    map,
    view,
    width,
    height,
    selectedId,
}: {
    map: MapDoc;
    view: View;
    width: number;
    height: number;
    selectedId: string | null;
}) {
    return (
        <g>
            {map.docking_stations.map(d => {
                const s = w2s(d.position, view, width, height);
                const handleWorld = {
                    x: d.position.x + Math.cos(d.heading) * DOCK_HANDLE_DISTANCE_M,
                    y: d.position.y + Math.sin(d.heading) * DOCK_HANDLE_DISTANCE_M,
                };
                const hs = w2s(handleWorld, view, width, height);
                const selected = d.id === selectedId;
                return (
                    <g key={d.id} data-dock-id={d.id}>
                        <line x1={s.x} y1={s.y} x2={hs.x} y2={hs.y} stroke={DOCK_COLOR} strokeWidth={2}/>
                        <circle
                            cx={s.x}
                            cy={s.y}
                            r={selected ? 9 : 7}
                            fill={DOCK_COLOR}
                            fillOpacity={0.35}
                            stroke={DOCK_COLOR}
                            strokeWidth={selected ? 2.5 : 1.5}
                        />
                    </g>
                );
            })}
        </g>
    );
}

export const StaticLayer = memo(function StaticLayer({width, height}: {width: number; height: number}) {
    const {map, view, selectedId} = useMapEditorStore(
        useShallow(s => ({
            map: s.map,
            view: s.view,
            selectedId: s.selection?.id ?? null,
        })),
    );
    return (
        <g>
            <rect x={0} y={0} width={width} height={height} fill="#0f172a"/>
            <Grid view={view} width={width} height={height}/>
            <Polygons map={map} view={view} width={width} height={height} selectedId={selectedId}/>
            <Docks map={map} view={view} width={width} height={height} selectedId={selectedId}/>
        </g>
    );
});
