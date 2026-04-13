import {memo} from 'react';
import {useShallow} from 'zustand/react/shallow';
import {w2s} from '../coords';
import {AREA_STYLE, DOCK_COLOR} from '../style';
import {useMapEditorStore} from '../useMapEditorStore';

export const DrawingLayer = memo(function DrawingLayer({width, height}: {width: number; height: number}) {
    const {mode, drawing, view, cursor} = useMapEditorStore(
        useShallow(s => ({mode: s.mode, drawing: s.drawing, view: s.view, cursor: s.hover.cursor})),
    );

    if (mode === 'draw-dock' && cursor) {
        const s = w2s(cursor, view, width, height);
        return (
            <g pointerEvents="none">
                <circle cx={s.x} cy={s.y} r={10} fill="none" stroke={DOCK_COLOR} strokeWidth={2} strokeDasharray="4 3"/>
            </g>
        );
    }

    if (mode === 'draw-area' && drawing) {
        const style = AREA_STYLE[drawing.type];
        const pts = drawing.points.map(p => w2s(p, view, width, height));
        const cursorS = cursor ? w2s(cursor, view, width, height) : null;
        let d = '';
        for (let i = 0; i < pts.length; i++) {
            d += (i === 0 ? 'M' : 'L') + pts[i].x.toFixed(1) + ',' + pts[i].y.toFixed(1);
        }
        if (cursorS && pts.length > 0) {
            d += 'L' + cursorS.x.toFixed(1) + ',' + cursorS.y.toFixed(1);
            if (pts.length >= 2) d += 'L' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
        }
        return (
            <g pointerEvents="none">
                {pts.length >= 2 && (
                    <path
                        d={d}
                        fill={pts.length >= 3 ? style.fill : 'none'}
                        stroke={style.stroke}
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                    />
                )}
                {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={4} fill="#fff" stroke={style.stroke} strokeWidth={1.5}/>
                ))}
            </g>
        );
    }

    return null;
});
