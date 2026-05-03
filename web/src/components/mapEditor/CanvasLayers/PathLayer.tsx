import {memo} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {w2s} from '../coords';
import type {View} from '../types';
import {useMapEditorStore} from '../useMapEditorStore';
import type {ColoredPolyline} from '../useMowerPaths';
import {PATH_COLORS} from '../useMowerPaths';

function polylineToPoints(points: ColoredPolyline['points'], view: View, w: number, h: number): string {
    if (points.length < 2) return '';
    const out: string[] = [];
    for (const p of points) {
        const s = w2s(p, view, w, h);
        out.push(s.x.toFixed(1) + ',' + s.y.toFixed(1));
    }
    return out.join(' ');
}

export const PathLayer = memo(function PathLayer({
    width,
    height,
    polylines,
}: {
    width: number;
    height: number;
    polylines: ColoredPolyline[];
}) {
    const view = useMapEditorStore(useShallow(s => s.view));
    if (polylines.length === 0) return null;
    return (
        <g style={{pointerEvents: 'none'}}>
            {polylines.map((line, i) => {
                const pts = polylineToPoints(line.points, view, width, height);
                if (!pts) return null;
                return (
                    <polyline
                        key={`${line.source}-${i}`}
                        points={pts}
                        fill="none"
                        stroke={PATH_COLORS[line.source]}
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                );
            })}
        </g>
    );
});
