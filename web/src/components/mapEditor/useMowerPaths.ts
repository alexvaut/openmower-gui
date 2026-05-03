import {useEffect, useState} from 'react';
import {useWS} from '../../hooks/useWS';
import {Marker, MarkerArray, Path} from '../../types/ros';
import type {Point} from './types';

export type Polyline = Point[];

export type PathSource = 'mowing' | 'planned' | 'active';

export type ColoredPolyline = {points: Polyline; source: PathSource};

const COLORS: Record<PathSource, string> = {
    mowing: 'rgba(107, 255, 188, 0.7)',  // green — executed mowing path
    planned: 'rgba(56, 189, 248, 0.65)', // sky blue — planned coverage
    active: 'rgba(244, 114, 182, 0.85)', // pink — active FTC nav plan
};

export const PATH_COLORS = COLORS;

function posesToPolyline(poses: Path['Poses']): Polyline {
    if (!poses) return [];
    const out: Polyline = [];
    for (const pose of poses) {
        const x = pose?.Pose?.Position?.X;
        const y = pose?.Pose?.Position?.Y;
        if (typeof x === 'number' && typeof y === 'number') {
            out.push({x, y});
        }
    }
    return out;
}

function markerToPolyline(marker: Marker): Polyline {
    if (!marker.Points) return [];
    const out: Polyline = [];
    for (const p of marker.Points) {
        if (typeof p.X === 'number' && typeof p.Y === 'number') {
            out.push({x: p.X, y: p.Y});
        }
    }
    return out;
}

/**
 * Subscribes to the mower's path streams while `enabled` is true and exposes
 * polylines in editor world coordinates (raw map-frame meters — no WGS84
 * transposition, since the editor canvas itself uses map meters).
 *
 * Streams subscribed:
 *  - /mowing_path                                 (Path[]) — executed mowing path
 *  - /slic3r_coverage_planner/path_marker_array   (MarkerArray) — planned coverage
 *  - /move_base_flex/FTCPlanner/global_plan       (Path) — active FTC nav plan
 */
export function useMowerPaths(enabled: boolean): {polylines: ColoredPolyline[]} {
    const [mowingPaths, setMowingPaths] = useState<Polyline[]>([]);
    const [planned, setPlanned] = useState<Polyline[]>([]);
    const [activePlan, setActivePlan] = useState<Polyline[]>([]);

    const noop = () => {};

    const mowingStream = useWS<string>(noop, noop, e => {
        try {
            const arr = JSON.parse(e) as Path[];
            setMowingPaths(arr.map(p => posesToPolyline(p?.Poses)).filter(line => line.length >= 2));
        } catch {
            // ignore malformed frame
        }
    });

    const plannedStream = useWS<string>(noop, noop, e => {
        try {
            const arr = JSON.parse(e) as MarkerArray;
            const lines: Polyline[] = [];
            for (const marker of arr.Markers ?? []) {
                // Type 4 = LINE_STRIP, Action 0 = ADD/MODIFY (matches MapPage.tsx live view filter)
                if (marker.Type === 4 && marker.Action === 0) {
                    const line = markerToPolyline(marker);
                    if (line.length >= 2) lines.push(line);
                }
            }
            setPlanned(lines);
        } catch {
            // ignore malformed frame
        }
    });

    const activePlanStream = useWS<string>(noop, noop, e => {
        try {
            const path = JSON.parse(e) as Path;
            const line = posesToPolyline(path?.Poses);
            setActivePlan(line.length >= 2 ? [line] : []);
        } catch {
            // ignore malformed frame
        }
    });

    useEffect(() => {
        if (enabled) {
            mowingStream.start('/api/openmower/subscribe/mowingPath');
            plannedStream.start('/api/openmower/subscribe/path');
            activePlanStream.start('/api/openmower/subscribe/plan');
        } else {
            mowingStream.stop();
            plannedStream.stop();
            activePlanStream.stop();
            setMowingPaths([]);
            setPlanned([]);
            setActivePlan([]);
        }
        return () => {
            mowingStream.stop();
            plannedStream.stop();
            activePlanStream.stop();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    if (!enabled) return {polylines: []};
    const out: ColoredPolyline[] = [];
    for (const p of mowingPaths) out.push({points: p, source: 'mowing'});
    for (const p of planned) out.push({points: p, source: 'planned'});
    for (const p of activePlan) out.push({points: p, source: 'active'});
    return {polylines: out};
}
