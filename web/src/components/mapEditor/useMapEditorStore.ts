import {create} from 'zustand';
import {clampZoom, fitToBounds} from './coords';
import {polygonBounds, rdp} from './geometry';
import {generateId} from './ids';
import {type ParsedMap, serializeMap} from './io';
import type {AreaType, Drag, DrawingState, EdgeHover, MapDoc, Point, Selection, Snap, View} from './types';

const HISTORY_CAP = 50;

type Mode = 'edit' | 'draw-area' | 'draw-dock';

export interface MapEditorState {
    map: MapDoc;
    raw: ParsedMap['raw'] | null;
    loaded: boolean;
    filename: string;
    selection: Selection | null;
    mode: Mode;
    drawing: DrawingState | null;
    view: View;
    hover: {edge: EdgeHover | null; cursor: Point | null};
    drag: Drag | null;
    spaceHeld: boolean;
    snap: Snap;
    lastPoint: {areaId: string; pointIdx: number} | null;
    history: {past: MapDoc[]; future: MapDoc[]};
    dirty: boolean;

    loadParsed(parsed: ParsedMap, filename: string): void;
    getSerialized(): ReturnType<typeof serializeMap> | null;
    markSaved(): void;

    setMode(mode: Mode): void;
    select(sel: Selection | null): void;

    setView(view: Partial<View>): void;
    panBy(dxScreen: number, dyScreen: number): void;
    zoomBy(factor: number, anchorScreen?: Point, size?: {width: number; height: number}): void;
    fit(width: number, height: number): void;

    beginMutation(): void;
    mutate(producer: (m: MapDoc) => void): void;
    commit(producer: (m: MapDoc) => void): void;
    undo(): void;
    redo(): void;

    addArea(type: AreaType, outline: Point[]): string;
    setAreaType(id: string, type: AreaType): void;
    deletePoint(areaId: string, pointIdx: number): void;
    insertPointOnEdge(areaId: string, edgeIdx: number, pos: Point): number;
    reverseWinding(id: string): void;
    simplifyArea(id: string, eps: number): void;
    duplicateArea(id: string): void;
    deleteArea(id: string): void;

    placeDock(pos: Point, heading?: number): string;
    setDockName(id: string, name: string): void;
    setDockPosition(id: string, pos: Point): void;
    setDockHeading(id: string, heading: number): void;
    deleteDock(id: string): void;

    setDrag(drag: Drag | null): void;
    updateDragPoint(areaId: string, pointIdx: number, worldPos: Point): void;
    updateDockPos(id: string, worldPos: Point): void;
    updateDockHeading(id: string, heading: number): void;

    startDrawArea(type: AreaType): void;
    addDrawingPoint(p: Point): void;
    finishDrawArea(): string | null;
    startDrawDock(): void;
    cancelDraw(): void;

    setSnap(snap: Snap): void;
    setHover(hover: Partial<{edge: EdgeHover | null; cursor: Point | null}>): void;
    setSpaceHeld(held: boolean): void;
    setLastPoint(p: {areaId: string; pointIdx: number} | null): void;
    nudgeLastPoint(dx: number, dy: number): void;
}

const EMPTY_MAP: MapDoc = {areas: [], docking_stations: []};

function clone<T>(v: T): T {
    return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
}

function pushPast(past: MapDoc[], snapshot: MapDoc): MapDoc[] {
    const next = past.concat(clone(snapshot));
    if (next.length > HISTORY_CAP) next.shift();
    return next;
}

export const useMapEditorStore = create<MapEditorState>((set, get) => ({
    map: EMPTY_MAP,
    raw: null,
    loaded: false,
    filename: 'map.json',
    selection: null,
    mode: 'edit',
    drawing: null,
    view: {cx: 0, cy: 0, zoom: 30},
    hover: {edge: null, cursor: null},
    drag: null,
    spaceHeld: false,
    snap: 0,
    lastPoint: null,
    history: {past: [], future: []},
    dirty: false,

    loadParsed: (parsed, filename) => set({
        map: parsed.map,
        raw: parsed.raw,
        filename,
        loaded: true,
        selection: null,
        mode: 'edit',
        drawing: null,
        drag: null,
        hover: {edge: null, cursor: null},
        history: {past: [], future: []},
        dirty: false,
    }),

    getSerialized: () => {
        const {raw, map} = get();
        if (!raw) return null;
        return serializeMap({raw, map});
    },

    markSaved: () => set({dirty: false}),

    setMode: (mode) => set({mode}),
    select: (selection) => set({selection}),

    setView: (partial) => set(s => ({view: {...s.view, ...partial}})),
    panBy: (dxScreen, dyScreen) => set(s => ({
        view: {...s.view, cx: s.view.cx - dxScreen / s.view.zoom, cy: s.view.cy + dyScreen / s.view.zoom},
    })),
    zoomBy: (factor, anchorScreen, size) => set(s => {
        const newZoom = clampZoom(s.view.zoom * factor);
        if (!anchorScreen || !size) return {view: {...s.view, zoom: newZoom}};
        const wx = s.view.cx + (anchorScreen.x - size.width / 2) / s.view.zoom;
        const wy = s.view.cy - (anchorScreen.y - size.height / 2) / s.view.zoom;
        const cx = wx - (anchorScreen.x - size.width / 2) / newZoom;
        const cy = wy + (anchorScreen.y - size.height / 2) / newZoom;
        return {view: {cx, cy, zoom: newZoom}};
    }),
    fit: (width, height) => set(s => {
        if (s.map.areas.length === 0 && s.map.docking_stations.length === 0) return {};
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const a of s.map.areas) {
            const b = polygonBounds(a.outline);
            if (b.minX < minX) minX = b.minX;
            if (b.maxX > maxX) maxX = b.maxX;
            if (b.minY < minY) minY = b.minY;
            if (b.maxY > maxY) maxY = b.maxY;
        }
        for (const d of s.map.docking_stations) {
            if (d.position.x < minX) minX = d.position.x;
            if (d.position.x > maxX) maxX = d.position.x;
            if (d.position.y < minY) minY = d.position.y;
            if (d.position.y > maxY) maxY = d.position.y;
        }
        if (!Number.isFinite(minX)) return {};
        return {view: fitToBounds({minX, maxX, minY, maxY}, width, height)};
    }),

    beginMutation: () => set(s => ({
        history: {past: pushPast(s.history.past, s.map), future: []},
        dirty: true,
    })),

    mutate: (producer) => set(s => {
        const next = clone(s.map);
        producer(next);
        return {map: next, dirty: true};
    }),

    commit: (producer) => set(s => {
        const next = clone(s.map);
        producer(next);
        return {
            map: next,
            history: {past: pushPast(s.history.past, s.map), future: []},
            dirty: true,
        };
    }),

    undo: () => set(s => {
        const past = s.history.past;
        if (past.length === 0) return {};
        const previous = past[past.length - 1];
        const newPast = past.slice(0, -1);
        const newFuture = [clone(s.map), ...s.history.future].slice(0, HISTORY_CAP);
        return {map: previous, history: {past: newPast, future: newFuture}, dirty: true};
    }),
    redo: () => set(s => {
        const future = s.history.future;
        if (future.length === 0) return {};
        const next = future[0];
        const newFuture = future.slice(1);
        const newPast = pushPast(s.history.past, s.map);
        return {map: next, history: {past: newPast, future: newFuture}, dirty: true};
    }),

    addArea: (type, outline) => {
        const id = generateId();
        get().commit(m => {
            m.areas.push({id, properties: {type}, outline: outline.map(p => ({x: p.x, y: p.y}))});
        });
        return id;
    },
    setAreaType: (id, type) => get().commit(m => {
        const a = m.areas.find(x => x.id === id);
        if (a) a.properties.type = type;
    }),
    deletePoint: (areaId, pointIdx) => get().commit(m => {
        const a = m.areas.find(x => x.id === areaId);
        if (!a) return;
        if (a.outline.length <= 3) return;
        a.outline.splice(pointIdx, 1);
    }),
    insertPointOnEdge: (areaId, edgeIdx, pos) => {
        let newIdx = -1;
        get().commit(m => {
            const a = m.areas.find(x => x.id === areaId);
            if (!a) return;
            a.outline.splice(edgeIdx + 1, 0, {x: pos.x, y: pos.y});
            newIdx = edgeIdx + 1;
        });
        return newIdx;
    },
    reverseWinding: (id) => get().commit(m => {
        const a = m.areas.find(x => x.id === id);
        if (a) a.outline.reverse();
    }),
    simplifyArea: (id, eps) => get().commit(m => {
        const a = m.areas.find(x => x.id === id);
        if (!a) return;
        const simplified = rdp(a.outline, eps);
        if (simplified.length >= 3) a.outline = simplified;
    }),
    duplicateArea: (id) => {
        const newId = generateId();
        get().commit(m => {
            const a = m.areas.find(x => x.id === id);
            if (!a) return;
            m.areas.push({
                id: newId,
                properties: {type: a.properties.type},
                outline: a.outline.map(p => ({x: p.x + 1, y: p.y + 1})),
            });
        });
        set({selection: {kind: 'area', id: newId}});
    },
    deleteArea: (id) => {
        get().commit(m => {
            m.areas = m.areas.filter(a => a.id !== id);
        });
        const s = get();
        if (s.selection?.kind === 'area' && s.selection.id === id) set({selection: null});
    },

    placeDock: (pos, heading = 0) => {
        const id = generateId();
        get().commit(m => {
            m.docking_stations.push({
                id,
                properties: {name: `Dock ${m.docking_stations.length + 1}`},
                position: {x: pos.x, y: pos.y},
                heading,
            });
        });
        return id;
    },
    setDockName: (id, name) => get().commit(m => {
        const d = m.docking_stations.find(x => x.id === id);
        if (d) d.properties.name = name;
    }),
    setDockPosition: (id, pos) => get().commit(m => {
        const d = m.docking_stations.find(x => x.id === id);
        if (d) d.position = {x: pos.x, y: pos.y};
    }),
    setDockHeading: (id, heading) => get().commit(m => {
        const d = m.docking_stations.find(x => x.id === id);
        if (d) d.heading = heading;
    }),
    deleteDock: (id) => {
        get().commit(m => {
            m.docking_stations = m.docking_stations.filter(d => d.id !== id);
        });
        const s = get();
        if (s.selection?.kind === 'dock' && s.selection.id === id) set({selection: null});
    },

    setDrag: (drag) => set({drag}),
    updateDragPoint: (areaId, pointIdx, worldPos) => get().mutate(m => {
        const a = m.areas.find(x => x.id === areaId);
        if (!a) return;
        const pt = a.outline[pointIdx];
        if (pt) {
            pt.x = worldPos.x;
            pt.y = worldPos.y;
        }
    }),
    updateDockPos: (id, worldPos) => get().mutate(m => {
        const d = m.docking_stations.find(x => x.id === id);
        if (d) d.position = {x: worldPos.x, y: worldPos.y};
    }),
    updateDockHeading: (id, heading) => get().mutate(m => {
        const d = m.docking_stations.find(x => x.id === id);
        if (d) d.heading = heading;
    }),

    startDrawArea: (type) => set({mode: 'draw-area', drawing: {type, points: []}, selection: null}),
    addDrawingPoint: (p) => set(s => {
        if (!s.drawing) return {};
        return {drawing: {...s.drawing, points: [...s.drawing.points, {x: p.x, y: p.y}]}};
    }),
    finishDrawArea: () => {
        const s = get();
        if (!s.drawing || s.drawing.points.length < 3) return null;
        const id = s.addArea(s.drawing.type, s.drawing.points);
        set({drawing: null, mode: 'edit', selection: {kind: 'area', id}});
        return id;
    },
    startDrawDock: () => set({mode: 'draw-dock', drawing: null, selection: null}),
    cancelDraw: () => set({mode: 'edit', drawing: null}),

    setSnap: (snap) => set({snap}),
    setHover: (partial) => set(s => ({hover: {...s.hover, ...partial}})),
    setSpaceHeld: (held) => set({spaceHeld: held}),
    setLastPoint: (p) => set({lastPoint: p}),
    nudgeLastPoint: (dx, dy) => {
        const s = get();
        const lp = s.lastPoint;
        if (!lp) return;
        s.commit(m => {
            const a = m.areas.find(x => x.id === lp.areaId);
            if (!a) return;
            const pt = a.outline[lp.pointIdx];
            if (!pt) return;
            pt.x += dx;
            pt.y += dy;
        });
    },
}));
