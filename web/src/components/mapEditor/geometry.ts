import type {Point} from './types';

export type NearestOnSeg = {x: number; y: number; t: number};

export function nearestOnSeg(a: Point, b: Point, p: Point): NearestOnSeg {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return {x: a.x, y: a.y, t: 0};
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return {x: a.x + dx * t, y: a.y + dy * t, t};
}

export type NearestEdge = {i: number; proj: Point; dist: number};

export function findNearestEdge(outline: Point[], p: Point): NearestEdge | null {
    if (outline.length < 2) return null;
    let best: NearestEdge | null = null;
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const n = nearestOnSeg(a, b, p);
        const dx = p.x - n.x;
        const dy = p.y - n.y;
        const dist = Math.hypot(dx, dy);
        if (!best || dist < best.dist) best = {i, proj: {x: n.x, y: n.y}, dist};
    }
    return best;
}

export function pointInPolygon(poly: Point[], p: Point): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect =
            yi > p.y !== yj > p.y &&
            p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

export function polygonArea(poly: Point[]): number {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        a += p1.x * p2.y - p2.x * p1.y;
    }
    return a / 2;
}

export function polygonBounds(poly: Point[]): {minX: number; maxX: number; minY: number; maxY: number} {
    if (poly.length === 0) return {minX: 0, maxX: 0, minY: 0, maxY: 0};
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return {minX, maxX, minY, maxY};
}

function perpDistance(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const num = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
    return num / Math.hypot(dx, dy);
}

export function rdp(points: Point[], eps: number): Point[] {
    if (points.length < 3) return points.slice();
    let maxDist = 0;
    let maxIdx = 0;
    const a = points[0];
    const b = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
        const d = perpDistance(points[i], a, b);
        if (d > maxDist) {
            maxDist = d;
            maxIdx = i;
        }
    }
    if (maxDist > eps) {
        const left = rdp(points.slice(0, maxIdx + 1), eps);
        const right = rdp(points.slice(maxIdx), eps);
        return left.slice(0, -1).concat(right);
    }
    return [a, b];
}

function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
    const d1 = cross(sub(p2, p1), sub(p3, p1));
    const d2 = cross(sub(p2, p1), sub(p4, p1));
    const d3 = cross(sub(p4, p3), sub(p1, p3));
    const d4 = cross(sub(p4, p3), sub(p2, p3));
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
}

function sub(a: Point, b: Point): Point {
    return {x: a.x - b.x, y: a.y - b.y};
}

function cross(a: Point, b: Point): number {
    return a.x * b.y - a.y * b.x;
}

export function hasSelfIntersection(outline: Point[]): boolean {
    const n = outline.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % n];
        for (let j = i + 1; j < n; j++) {
            if ((j + 1) % n === i) continue;
            if (j === (i + 1) % n) continue;
            const c = outline[j];
            const d = outline[(j + 1) % n];
            if (segmentsIntersect(a, b, c, d)) return true;
        }
    }
    return false;
}

function segmentIntersectionPoint(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const denom = d1x * d2y - d1y * d2x;
    if (denom === 0) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    return {x: p1.x + t * d1x, y: p1.y + t * d1y};
}

export function findSelfIntersections(outline: Point[]): Point[] {
    const out: Point[] = [];
    const n = outline.length;
    if (n < 4) return out;
    for (let i = 0; i < n; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % n];
        for (let j = i + 1; j < n; j++) {
            if ((j + 1) % n === i) continue;
            if (j === (i + 1) % n) continue;
            const c = outline[j];
            const d = outline[(j + 1) % n];
            if (segmentsIntersect(a, b, c, d)) {
                const p = segmentIntersectionPoint(a, b, c, d);
                if (p) out.push(p);
            }
        }
    }
    return out;
}
