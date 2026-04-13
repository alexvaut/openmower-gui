import type {AreaType} from './types';

export const AREA_STYLE: Record<AreaType, {stroke: string; fill: string; fillSel: string}> = {
    mow: {stroke: '#10b981', fill: 'rgba(16,185,129,0.14)', fillSel: 'rgba(16,185,129,0.28)'},
    obstacle: {stroke: '#ef4444', fill: 'rgba(239,68,68,0.16)', fillSel: 'rgba(239,68,68,0.30)'},
    nav: {stroke: '#0ea5e9', fill: 'rgba(14,165,233,0.14)', fillSel: 'rgba(14,165,233,0.28)'},
};

export const DOCK_COLOR = '#f59e0b';

export const EDGE_SNAP_PX = 14;
export const HANDLE_HIT_PX = 10;
export const DOCK_HANDLE_DISTANCE_M = 0.7;
