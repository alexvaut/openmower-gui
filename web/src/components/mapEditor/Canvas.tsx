import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {DrawingLayer} from './CanvasLayers/DrawingLayer';
import {OverlayLayer} from './CanvasLayers/OverlayLayer';
import {StaticLayer} from './CanvasLayers/StaticLayer';
import {s2w, snapPoint, w2s} from './coords';
import {findNearestEdge, pointInPolygon, polygonArea} from './geometry';
import {DOCK_HANDLE_DISTANCE_M, EDGE_SNAP_PX, HANDLE_HIT_PX} from './style';
import type {Point} from './types';
import {useMapEditorStore} from './useMapEditorStore';

function eventPos(e: React.PointerEvent<SVGSVGElement> | PointerEvent, svg: SVGSVGElement): Point {
    const rect = svg.getBoundingClientRect();
    return {x: e.clientX - rect.left, y: e.clientY - rect.top};
}

export function Canvas() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState({width: 0, height: 0});
    const pointerIdRef = useRef<number | null>(null);

    const {
        mode, drawing, view, snap, selection, spaceHeld, map, drag,
        setHover, setDrag, select, beginMutation,
        updateDragPoint, updateDockPos, updateDockHeading,
        zoomBy, fit, setMode, cancelDraw,
        addDrawingPoint, finishDrawArea, placeDock,
        insertPointOnEdge, setSpaceHeld,
    } = useMapEditorStore(useShallow(s => ({
        mode: s.mode, drawing: s.drawing, view: s.view, snap: s.snap,
        selection: s.selection, spaceHeld: s.spaceHeld, map: s.map, drag: s.drag,
        setHover: s.setHover, setDrag: s.setDrag, select: s.select,
        beginMutation: s.beginMutation,
        updateDragPoint: s.updateDragPoint, updateDockPos: s.updateDockPos, updateDockHeading: s.updateDockHeading,
        zoomBy: s.zoomBy, fit: s.fit, setMode: s.setMode, cancelDraw: s.cancelDraw,
        addDrawingPoint: s.addDrawingPoint, finishDrawArea: s.finishDrawArea, placeDock: s.placeDock,
        insertPointOnEdge: s.insertPointOnEdge, setSpaceHeld: s.setSpaceHeld,
    })));

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const cr = entries[0].contentRect;
            setSize({width: cr.width, height: cr.height});
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === ' ' || e.code === 'Space') setSpaceHeld(true);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ' || e.code === 'Space') setSpaceHeld(false);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [setSpaceHeld]);

    const hitTest = useCallback((screen: Point) => {
        if (selection?.kind === 'area') {
            const area = map.areas.find(a => a.id === selection.id);
            if (area) {
                for (let i = 0; i < area.outline.length; i++) {
                    const s = w2s(area.outline[i], view, size.width, size.height);
                    if (Math.hypot(screen.x - s.x, screen.y - s.y) <= HANDLE_HIT_PX) {
                        return {kind: 'point' as const, areaId: area.id, pointIdx: i};
                    }
                }
            }
        }
        if (selection?.kind === 'dock') {
            const dock = map.docking_stations.find(d => d.id === selection.id);
            if (dock) {
                const hw = {
                    x: dock.position.x + Math.cos(dock.heading) * DOCK_HANDLE_DISTANCE_M,
                    y: dock.position.y + Math.sin(dock.heading) * DOCK_HANDLE_DISTANCE_M,
                };
                const hs = w2s(hw, view, size.width, size.height);
                if (Math.hypot(screen.x - hs.x, screen.y - hs.y) <= HANDLE_HIT_PX) {
                    return {kind: 'dock-heading' as const, dockId: dock.id};
                }
            }
        }
        for (const dock of map.docking_stations) {
            const s = w2s(dock.position, view, size.width, size.height);
            if (Math.hypot(screen.x - s.x, screen.y - s.y) <= HANDLE_HIT_PX) {
                return {kind: 'dock' as const, dockId: dock.id};
            }
        }
        if (selection?.kind === 'area') {
            const area = map.areas.find(a => a.id === selection.id);
            if (area) {
                const world = s2w(screen, view, size.width, size.height);
                const edge = findNearestEdge(area.outline, world);
                if (edge) {
                    const edgeS = w2s(edge.proj, view, size.width, size.height);
                    if (Math.hypot(screen.x - edgeS.x, screen.y - edgeS.y) <= EDGE_SNAP_PX) {
                        return {kind: 'edge' as const, areaId: area.id, edgeIdx: edge.i, proj: edge.proj};
                    }
                }
            }
        }
        const world = s2w(screen, view, size.width, size.height);
        let bestArea: {id: string; absArea: number} | null = null;
        for (const a of map.areas) {
            if (pointInPolygon(a.outline, world)) {
                const absArea = Math.abs(polygonArea(a.outline));
                if (!bestArea || absArea < bestArea.absArea) bestArea = {id: a.id, absArea};
            }
        }
        if (bestArea) return {kind: 'area' as const, areaId: bestArea.id};
        return {kind: 'empty' as const};
    }, [selection, map, view, size]);

    const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
        if (!svgRef.current) return;
        const screen = eventPos(e, svgRef.current);
        const world = snap ? snapPoint(s2w(screen, view, size.width, size.height), snap) : s2w(screen, view, size.width, size.height);
        const wantPan = e.button === 1 || (e.button === 0 && spaceHeld);
        if (wantPan) {
            svgRef.current.setPointerCapture(e.pointerId);
            pointerIdRef.current = e.pointerId;
            setDrag({kind: 'pan', startScreen: screen, startView: {cx: view.cx, cy: view.cy}});
            return;
        }
        if (e.button !== 0) return;

        if (mode === 'draw-area') {
            addDrawingPoint(world);
            return;
        }
        if (mode === 'draw-dock') {
            placeDock(world);
            setMode('edit');
            return;
        }

        const hit = hitTest(screen);

        if (e.altKey && hit.kind === 'point') {
            const area = map.areas.find(a => a.id === hit.areaId);
            if (area && area.outline.length > 3) {
                useMapEditorStore.getState().deletePoint(hit.areaId, hit.pointIdx);
            }
            return;
        }

        if (hit.kind === 'point') {
            svgRef.current.setPointerCapture(e.pointerId);
            pointerIdRef.current = e.pointerId;
            beginMutation();
            setDrag({kind: 'point', areaId: hit.areaId, pointIdx: hit.pointIdx});
            useMapEditorStore.getState().setLastPoint({areaId: hit.areaId, pointIdx: hit.pointIdx});
            return;
        }
        if (hit.kind === 'dock-heading') {
            svgRef.current.setPointerCapture(e.pointerId);
            pointerIdRef.current = e.pointerId;
            beginMutation();
            setDrag({kind: 'dock-heading', dockId: hit.dockId});
            return;
        }
        if (hit.kind === 'dock') {
            select({kind: 'dock', id: hit.dockId});
            svgRef.current.setPointerCapture(e.pointerId);
            pointerIdRef.current = e.pointerId;
            beginMutation();
            setDrag({kind: 'dock-move', dockId: hit.dockId});
            return;
        }
        if (hit.kind === 'edge') {
            const newIdx = insertPointOnEdge(hit.areaId, hit.edgeIdx, hit.proj);
            if (newIdx >= 0) {
                svgRef.current.setPointerCapture(e.pointerId);
                pointerIdRef.current = e.pointerId;
                beginMutation();
                setDrag({kind: 'point', areaId: hit.areaId, pointIdx: newIdx});
            }
            return;
        }
        if (hit.kind === 'area') {
            select({kind: 'area', id: hit.areaId});
            return;
        }
        select(null);
    }, [mode, view, size, snap, spaceHeld, map, hitTest, setDrag, setMode, addDrawingPoint, placeDock, beginMutation, select, insertPointOnEdge]);

    const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
        if (!svgRef.current) return;
        const screen = eventPos(e, svgRef.current);
        const world = snap ? snapPoint(s2w(screen, view, size.width, size.height), snap) : s2w(screen, view, size.width, size.height);

        if (drag?.kind === 'pan') {
            const dx = screen.x - drag.startScreen.x;
            const dy = screen.y - drag.startScreen.y;
            useMapEditorStore.getState().setView({
                cx: drag.startView.cx - dx / view.zoom,
                cy: drag.startView.cy + dy / view.zoom,
            });
            return;
        }
        if (drag?.kind === 'point') {
            updateDragPoint(drag.areaId, drag.pointIdx, world);
            setHover({cursor: world});
            return;
        }
        if (drag?.kind === 'dock-move') {
            updateDockPos(drag.dockId, world);
            setHover({cursor: world});
            return;
        }
        if (drag?.kind === 'dock-heading') {
            const dock = map.docking_stations.find(d => d.id === drag.dockId);
            if (dock) {
                const heading = Math.atan2(world.y - dock.position.y, world.x - dock.position.x);
                updateDockHeading(drag.dockId, heading);
            }
            setHover({cursor: world});
            return;
        }

        setHover({cursor: world});
        if (mode === 'edit' && selection?.kind === 'area') {
            const area = map.areas.find(a => a.id === selection.id);
            if (area) {
                const edge = findNearestEdge(area.outline, world);
                if (edge) {
                    const edgeS = w2s(edge.proj, view, size.width, size.height);
                    const distPx = Math.hypot(screen.x - edgeS.x, screen.y - edgeS.y);
                    let onHandle = false;
                    for (let i = 0; i < area.outline.length; i++) {
                        const ps = w2s(area.outline[i], view, size.width, size.height);
                        if (Math.hypot(screen.x - ps.x, screen.y - ps.y) <= HANDLE_HIT_PX) {
                            onHandle = true;
                            break;
                        }
                    }
                    if (distPx <= EDGE_SNAP_PX && !onHandle) {
                        setHover({edge, cursor: world});
                        return;
                    }
                }
            }
            setHover({edge: null, cursor: world});
        } else {
            setHover({edge: null, cursor: world});
        }
    }, [drag, view, size, snap, map, mode, selection, updateDragPoint, updateDockPos, updateDockHeading, setHover]);

    const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
        if (pointerIdRef.current != null && svgRef.current?.hasPointerCapture(pointerIdRef.current)) {
            svgRef.current.releasePointerCapture(pointerIdRef.current);
        }
        pointerIdRef.current = null;
        setDrag(null);
        e.preventDefault();
    }, [setDrag]);

    const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
        if (!svgRef.current) return;
        const screen = eventPos(e as unknown as PointerEvent, svgRef.current);
        const factor = Math.pow(1.0015, -e.deltaY);
        zoomBy(factor, screen, size);
    }, [zoomBy, size]);

    useEffect(() => {
        if (size.width > 0 && size.height > 0 && map.areas.length > 0 && view.zoom === 30 && view.cx === 0 && view.cy === 0) {
            fit(size.width, size.height);
        }
    }, [size, map.areas.length, fit, view.zoom, view.cx, view.cy]);

    const onDoubleClick = useCallback(() => {
        if (mode === 'draw-area' && drawing && drawing.points.length >= 3) {
            finishDrawArea();
        }
    }, [mode, drawing, finishDrawArea]);

    const onContextMenu = useCallback((e: React.MouseEvent) => {
        if (mode === 'draw-area') {
            e.preventDefault();
            if (drawing && drawing.points.length >= 3) finishDrawArea();
            else cancelDraw();
        }
    }, [mode, drawing, finishDrawArea, cancelDraw]);

    const cursor = drag?.kind === 'pan' || spaceHeld
        ? 'grabbing'
        : mode === 'draw-area' || mode === 'draw-dock'
            ? 'crosshair'
            : 'default';

    return (
        <div ref={containerRef} className="relative flex-1 bg-slate-950 overflow-hidden">
            <svg
                ref={svgRef}
                width={size.width}
                height={size.height}
                style={{touchAction: 'none', cursor, display: 'block'}}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
            >
                <StaticLayer width={size.width} height={size.height}/>
                <OverlayLayer width={size.width} height={size.height}/>
                <DrawingLayer width={size.width} height={size.height}/>
            </svg>
            {mode === 'draw-area' && drawing && (
                <div className="absolute bottom-2 left-2 px-3 py-1.5 rounded bg-slate-800/80 text-slate-100 text-xs pointer-events-none">
                    Drawing {drawing.type} • {drawing.points.length} points • Enter to finish • Esc to cancel
                </div>
            )}
            {mode === 'draw-dock' && (
                <div className="absolute bottom-2 left-2 px-3 py-1.5 rounded bg-slate-800/80 text-slate-100 text-xs pointer-events-none">
                    Click to place docking station • Esc to cancel
                </div>
            )}
            <CursorHUD size={size}/>
        </div>
    );
}

function CursorHUD({size}: {size: {width: number; height: number}}) {
    const cursor = useMapEditorStore(s => s.hover.cursor);
    const zoom = useMapEditorStore(s => s.view.zoom);
    if (!size.width) return null;
    return (
        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-slate-800/70 text-slate-300 text-[11px] font-mono pointer-events-none">
            {cursor ? `x ${cursor.x.toFixed(2)} m, y ${cursor.y.toFixed(2)} m` : '—'} • zoom {zoom.toFixed(0)} px/m
        </div>
    );
}
