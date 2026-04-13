import type {Point, View} from './types';

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 400;

export function w2s(p: Point, view: View, width: number, height: number): Point {
    return {
        x: width / 2 + (p.x - view.cx) * view.zoom,
        y: height / 2 - (p.y - view.cy) * view.zoom,
    };
}

export function s2w(p: Point, view: View, width: number, height: number): Point {
    return {
        x: view.cx + (p.x - width / 2) / view.zoom,
        y: view.cy - (p.y - height / 2) / view.zoom,
    };
}

export function clampZoom(z: number): number {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export function fitToBounds(
    bounds: {minX: number; maxX: number; minY: number; maxY: number},
    width: number,
    height: number,
    padding = 40,
): View {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    if (w <= 0 || h <= 0 || width <= 0 || height <= 0) {
        return {cx: 0, cy: 0, zoom: 30};
    }
    const zx = (width - padding * 2) / w;
    const zy = (height - padding * 2) / h;
    return {
        cx: (bounds.minX + bounds.maxX) / 2,
        cy: (bounds.minY + bounds.maxY) / 2,
        zoom: clampZoom(Math.min(zx, zy)),
    };
}

export function snapPoint(p: Point, snap: number): Point {
    if (!snap) return p;
    return {x: Math.round(p.x / snap) * snap, y: Math.round(p.y / snap) * snap};
}
