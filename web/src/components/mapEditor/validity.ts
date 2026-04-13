import {hasSelfIntersection, polygonArea} from './geometry';
import type {Area, MapDoc, Point} from './types';

export type AreaIssue = {areaId: string; reason: string; grandfathered?: boolean};

export function validateArea(a: Area): string | null {
    if (a.outline.length < 3) return 'needs at least 3 points';
    if (hasSelfIntersection(a.outline)) return 'self-intersecting';
    if (Math.abs(polygonArea(a.outline)) < 1e-6) return 'zero area';
    return null;
}

function outlineEquals(a: Point[], b: Point[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
    }
    return true;
}

export function validateMap(
    doc: MapDoc,
    originalOutlines?: Map<string, Point[]>,
): {ok: boolean; errors: AreaIssue[]} {
    const errors: AreaIssue[] = [];
    for (const a of doc.areas) {
        const reason = validateArea(a);
        if (!reason) continue;
        const original = originalOutlines?.get(a.id);
        const grandfathered = !!original && outlineEquals(a.outline, original);
        errors.push({areaId: a.id, reason, grandfathered});
    }
    const blocking = errors.filter(e => !e.grandfathered);
    return {ok: blocking.length === 0, errors};
}

export function buildOriginalOutlineMap(rawAreas: Array<{id: string; outline: Point[]}>): Map<string, Point[]> {
    const m = new Map<string, Point[]>();
    for (const a of rawAreas) m.set(a.id, a.outline.map(p => ({x: p.x, y: p.y})));
    return m;
}
