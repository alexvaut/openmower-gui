import {memo, useMemo} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {w2s} from '../coords';
import {findSelfIntersections} from '../geometry';
import {AREA_STYLE, DOCK_COLOR, DOCK_HANDLE_DISTANCE_M} from '../style';
import type {MapDoc, View} from '../types';
import {useMapEditorStore} from '../useMapEditorStore';

function PointHandles({
    map,
    view,
    width,
    height,
    selectedAreaId,
}: {
    map: MapDoc;
    view: View;
    width: number;
    height: number;
    selectedAreaId: string | null;
}) {
    if (!selectedAreaId) return null;
    const area = map.areas.find(a => a.id === selectedAreaId);
    if (!area) return null;
    const stroke = AREA_STYLE[area.properties.type].stroke;
    return (
        <g>
            {area.outline.map((p, i) => {
                const s = w2s(p, view, width, height);
                return (
                    <circle
                        key={i}
                        data-point-idx={i}
                        cx={s.x}
                        cy={s.y}
                        r={5}
                        fill="#fff"
                        stroke={stroke}
                        strokeWidth={1.5}
                        style={{cursor: 'grab'}}
                    />
                );
            })}
        </g>
    );
}

function EdgeGhost({
    map,
    view,
    width,
    height,
    selectedAreaId,
}: {
    map: MapDoc;
    view: View;
    width: number;
    height: number;
    selectedAreaId: string | null;
}) {
    const hoverEdge = useMapEditorStore(s => s.hover.edge);
    const dragging = useMapEditorStore(s => s.drag);
    if (dragging || !hoverEdge || !selectedAreaId) return null;
    const area = map.areas.find(a => a.id === selectedAreaId);
    if (!area) return null;
    const s = w2s(hoverEdge.proj, view, width, height);
    const stroke = AREA_STYLE[area.properties.type].stroke;
    return (
        <circle
            data-edge-ghost={hoverEdge.i}
            cx={s.x}
            cy={s.y}
            r={6}
            fill="rgba(255,255,255,0.7)"
            stroke={stroke}
            strokeWidth={1.5}
            style={{cursor: 'copy'}}
        />
    );
}

function DockHandle({
    map,
    view,
    width,
    height,
    selectedDockId,
}: {
    map: MapDoc;
    view: View;
    width: number;
    height: number;
    selectedDockId: string | null;
}) {
    if (!selectedDockId) return null;
    const dock = map.docking_stations.find(d => d.id === selectedDockId);
    if (!dock) return null;
    const handleWorld = {
        x: dock.position.x + Math.cos(dock.heading) * DOCK_HANDLE_DISTANCE_M,
        y: dock.position.y + Math.sin(dock.heading) * DOCK_HANDLE_DISTANCE_M,
    };
    const s = w2s(handleWorld, view, width, height);
    return (
        <circle
            data-dock-heading={selectedDockId}
            cx={s.x}
            cy={s.y}
            r={6}
            fill="#fff"
            stroke={DOCK_COLOR}
            strokeWidth={2}
            style={{cursor: 'grab'}}
        />
    );
}

function IntersectionMarkers({
    map,
    view,
    width,
    height,
    selectedAreaId,
}: {
    map: MapDoc;
    view: View;
    width: number;
    height: number;
    selectedAreaId: string | null;
}) {
    const crossings = useMemo(() => {
        if (!selectedAreaId) return [] as Array<{x: number; y: number}>;
        const area = map.areas.find(a => a.id === selectedAreaId);
        if (!area) return [];
        return findSelfIntersections(area.outline);
    }, [map, selectedAreaId]);
    if (crossings.length === 0) return null;
    return (
        <g pointerEvents="none">
            {crossings.map((p, i) => {
                const s = w2s(p, view, width, height);
                const r = 8;
                return (
                    <g key={i}>
                        <circle cx={s.x} cy={s.y} r={r + 2} fill="none" stroke="#fca5a5" strokeWidth={1}/>
                        <line x1={s.x - r} y1={s.y - r} x2={s.x + r} y2={s.y + r} stroke="#ef4444" strokeWidth={2}/>
                        <line x1={s.x - r} y1={s.y + r} x2={s.x + r} y2={s.y - r} stroke="#ef4444" strokeWidth={2}/>
                    </g>
                );
            })}
        </g>
    );
}

function CursorReadout({view, width, height}: {view: View; width: number; height: number}) {
    const cursor = useMapEditorStore(s => s.hover.cursor);
    if (!cursor) return null;
    const s = w2s(cursor, view, width, height);
    return (
        <g pointerEvents="none">
            <line x1={s.x - 6} y1={s.y} x2={s.x + 6} y2={s.y} stroke="#64748b" strokeWidth={0.8}/>
            <line x1={s.x} y1={s.y - 6} x2={s.x} y2={s.y + 6} stroke="#64748b" strokeWidth={0.8}/>
        </g>
    );
}

export const OverlayLayer = memo(function OverlayLayer({width, height}: {width: number; height: number}) {
    const {map, view, selection} = useMapEditorStore(
        useShallow(s => ({map: s.map, view: s.view, selection: s.selection})),
    );
    const selectedAreaId = selection?.kind === 'area' ? selection.id : null;
    const selectedDockId = selection?.kind === 'dock' ? selection.id : null;
    return (
        <g>
            <CursorReadout view={view} width={width} height={height}/>
            <EdgeGhost map={map} view={view} width={width} height={height} selectedAreaId={selectedAreaId}/>
            <IntersectionMarkers map={map} view={view} width={width} height={height} selectedAreaId={selectedAreaId}/>
            <PointHandles map={map} view={view} width={width} height={height} selectedAreaId={selectedAreaId}/>
            <DockHandle map={map} view={view} width={width} height={height} selectedDockId={selectedDockId}/>
        </g>
    );
});
