import {useEffect} from 'react';
import {useMapEditorStore} from './useMapEditorStore';

export function useKeybindings(canvasSize: {width: number; height: number}) {
    useEffect(() => {
        const isEditable = (el: EventTarget | null): boolean => {
            if (!(el instanceof HTMLElement)) return false;
            if (el.isContentEditable) return true;
            if (el instanceof HTMLTextAreaElement) return true;
            if (el instanceof HTMLInputElement) {
                const t = (el.type || 'text').toLowerCase();
                return t === 'text' || t === 'number' || t === 'search' || t === 'email' || t === 'url' || t === 'tel' || t === 'password';
            }
            return false;
        };

        const onKeyDown = (e: KeyboardEvent) => {
            if (isEditable(e.target)) return;
            const s = useMapEditorStore.getState();

            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                s.undo();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                s.redo();
                return;
            }

            if (e.key === 'Escape') {
                if (s.mode !== 'edit') s.cancelDraw();
                else s.select(null);
                return;
            }
            if (e.key === 'Enter' && s.mode === 'draw-area' && s.drawing && s.drawing.points.length >= 3) {
                e.preventDefault();
                s.finishDrawArea();
                return;
            }
            if (e.key === 'f' || e.key === 'F') {
                if (canvasSize.width > 0) s.fit(canvasSize.width, canvasSize.height);
                return;
            }
            if (e.key === '+' || e.key === '=') {
                s.zoomBy(1.2);
                return;
            }
            if (e.key === '-' || e.key === '_') {
                s.zoomBy(1 / 1.2);
                return;
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (s.selection?.kind === 'area') {
                    if (confirm('Delete selected polygon?')) s.deleteArea(s.selection.id);
                } else if (s.selection?.kind === 'dock') {
                    if (confirm('Delete selected dock?')) s.deleteDock(s.selection.id);
                }
                return;
            }

            if (e.key.startsWith('Arrow')) {
                const step = (e.shiftKey ? 10 : 1) / s.view.zoom;
                let dx = 0, dy = 0;
                if (e.key === 'ArrowLeft') dx = -step;
                if (e.key === 'ArrowRight') dx = step;
                if (e.key === 'ArrowUp') dy = step;
                if (e.key === 'ArrowDown') dy = -step;
                if (dx !== 0 || dy !== 0) {
                    if (s.lastPoint && s.selection?.kind === 'area' && s.selection.id === s.lastPoint.areaId) {
                        e.preventDefault();
                        s.nudgeLastPoint(dx, dy);
                    } else if (s.selection?.kind === 'dock') {
                        e.preventDefault();
                        const d = s.map.docking_stations.find(x => x.id === s.selection!.id);
                        if (d) s.setDockPosition(d.id, {x: d.position.x + dx, y: d.position.y + dy});
                    }
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [canvasSize.width, canvasSize.height]);
}
