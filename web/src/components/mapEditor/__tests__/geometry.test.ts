import {describe, expect, it} from 'vitest';
import {
    findNearestEdge,
    hasSelfIntersection,
    nearestOnSeg,
    pointInPolygon,
    polygonArea,
    polygonBounds,
    rdp,
} from '../geometry';

const sq = [
    {x: 0, y: 0},
    {x: 1, y: 0},
    {x: 1, y: 1},
    {x: 0, y: 1},
];

describe('nearestOnSeg', () => {
    it('handles degenerate segment (a == b)', () => {
        const r = nearestOnSeg({x: 3, y: 4}, {x: 3, y: 4}, {x: 0, y: 0});
        expect(r).toEqual({x: 3, y: 4, t: 0});
    });

    it('clamps t to [0,1]', () => {
        const r1 = nearestOnSeg({x: 0, y: 0}, {x: 10, y: 0}, {x: -5, y: 3});
        expect(r1.t).toBe(0);
        expect(r1).toMatchObject({x: 0, y: 0});
        const r2 = nearestOnSeg({x: 0, y: 0}, {x: 10, y: 0}, {x: 25, y: 3});
        expect(r2.t).toBe(1);
        expect(r2).toMatchObject({x: 10, y: 0});
    });

    it('returns midpoint for symmetric case', () => {
        const r = nearestOnSeg({x: 0, y: 0}, {x: 10, y: 0}, {x: 5, y: 3});
        expect(r.x).toBeCloseTo(5);
        expect(r.y).toBeCloseTo(0);
        expect(r.t).toBeCloseTo(0.5);
    });
});

describe('findNearestEdge', () => {
    it('returns null for <2 points', () => {
        expect(findNearestEdge([], {x: 0, y: 0})).toBeNull();
        expect(findNearestEdge([{x: 1, y: 1}], {x: 0, y: 0})).toBeNull();
    });

    it('wraps to close the polygon', () => {
        const r = findNearestEdge(sq, {x: -0.1, y: 0.5});
        expect(r).not.toBeNull();
        expect(r!.i).toBe(3);
        expect(r!.proj.x).toBeCloseTo(0);
        expect(r!.proj.y).toBeCloseTo(0.5);
    });
});

describe('pointInPolygon', () => {
    it('returns true for clearly-inside points', () => {
        expect(pointInPolygon(sq, {x: 0.5, y: 0.5})).toBe(true);
    });
    it('returns false for clearly-outside points', () => {
        expect(pointInPolygon(sq, {x: 2, y: 0.5})).toBe(false);
        expect(pointInPolygon(sq, {x: -0.5, y: 0.5})).toBe(false);
    });
});

describe('polygonArea', () => {
    it('positive for CCW', () => {
        expect(polygonArea(sq)).toBeCloseTo(1);
    });
    it('negative for CW', () => {
        expect(polygonArea([...sq].reverse())).toBeCloseTo(-1);
    });
});

describe('polygonBounds', () => {
    it('returns tight bounds', () => {
        expect(polygonBounds(sq)).toEqual({minX: 0, maxX: 1, minY: 0, maxY: 1});
    });
});

describe('rdp', () => {
    it('preserves endpoints', () => {
        const pts = [
            {x: 0, y: 0},
            {x: 1, y: 0.001},
            {x: 2, y: 0},
            {x: 3, y: 0.001},
            {x: 4, y: 0},
        ];
        const out = rdp(pts, 0.1);
        expect(out[0]).toEqual(pts[0]);
        expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
        expect(out.length).toBeLessThan(pts.length);
    });
    it('is idempotent', () => {
        const pts = Array.from({length: 50}, (_, i) => ({
            x: i,
            y: Math.sin(i / 5) + Math.random() * 0.01,
        }));
        const once = rdp(pts, 0.2);
        const twice = rdp(once, 0.2);
        expect(twice).toEqual(once);
    });
});

describe('hasSelfIntersection', () => {
    it('false for a convex polygon', () => {
        expect(hasSelfIntersection(sq)).toBe(false);
    });
    it('true for a bowtie', () => {
        const bowtie = [
            {x: 0, y: 0},
            {x: 2, y: 2},
            {x: 2, y: 0},
            {x: 0, y: 2},
        ];
        expect(hasSelfIntersection(bowtie)).toBe(true);
    });
    it('false for a triangle', () => {
        expect(hasSelfIntersection([{x: 0, y: 0}, {x: 1, y: 0}, {x: 0.5, y: 1}])).toBe(false);
    });
});
