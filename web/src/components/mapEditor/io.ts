import type {Area, Dock, MapDoc, Point} from './types';

type RawArea = {id: string; properties: {type: string}; outline: Array<{x: number; y: number}>; [k: string]: unknown};
type RawDock = {id: string; properties: {name: string}; position: {x: number; y: number}; heading: number; [k: string]: unknown};
type RawMap = {areas: RawArea[]; docking_stations: RawDock[]; [k: string]: unknown};

export type ParsedMap = {map: MapDoc; raw: RawMap};

export function parseMapJson(text: string): ParsedMap {
    const raw = JSON.parse(text) as RawMap;
    if (!Array.isArray(raw.areas)) throw new Error('map.areas missing');
    if (!Array.isArray(raw.docking_stations)) throw new Error('map.docking_stations missing');
    const map: MapDoc = {
        areas: raw.areas.map(a => toArea(a)),
        docking_stations: raw.docking_stations.map(d => toDock(d)),
    };
    return {map, raw};
}

function toArea(a: RawArea): Area {
    const t = a.properties?.type as Area['properties']['type'];
    return {
        id: a.id,
        properties: {type: t},
        outline: a.outline.map(p => ({x: p.x, y: p.y})),
    };
}

function toDock(d: RawDock): Dock {
    return {
        id: d.id,
        properties: {name: d.properties?.name ?? ''},
        position: {x: d.position.x, y: d.position.y},
        heading: d.heading,
    };
}

export function serializeMap(state: ParsedMap): RawMap {
    const rawAreasById = new Map<string, RawArea>(state.raw.areas.map(a => [a.id, a]));
    const rawDocksById = new Map<string, RawDock>(state.raw.docking_stations.map(d => [d.id, d]));
    const out: RawMap = {
        ...state.raw,
        areas: state.map.areas.map(a => mergeArea(a, rawAreasById.get(a.id))),
        docking_stations: state.map.docking_stations.map(d => mergeDock(d, rawDocksById.get(d.id))),
    };
    return out;
}

function mergeArea(a: Area, original: RawArea | undefined): RawArea {
    return {
        ...(original ?? {}),
        id: a.id,
        properties: {
            ...(original?.properties ?? {}),
            type: a.properties.type,
        },
        outline: a.outline.map((p: Point) => ({x: p.x, y: p.y})),
    };
}

function mergeDock(d: Dock, original: RawDock | undefined): RawDock {
    return {
        ...(original ?? {}),
        id: d.id,
        properties: {
            ...(original?.properties ?? {}),
            name: d.properties.name,
        },
        position: {x: d.position.x, y: d.position.y},
        heading: d.heading,
    };
}

export function loadFromFile(file: File): Promise<ParsedMap> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const text = reader.result as string;
                resolve(parseMapJson(text));
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

export function mapToJsonBlob(state: ParsedMap): Blob {
    const obj = serializeMap(state);
    return new Blob([JSON.stringify(obj)], {type: 'application/json'});
}

export function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
