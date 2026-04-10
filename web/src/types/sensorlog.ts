export type SensorType =
    | 'mow_rpm' | 'mow_current' | 'mow_temp_motor' | 'mow_temp_pcb'
    | 'left_rpm' | 'left_current' | 'left_temp_motor'
    | 'right_rpm' | 'right_current' | 'right_temp_motor'
    | 'v_battery' | 'gps_accuracy' | 'speed';

export interface SensorSample {
    t: number;  // unix timestamp
    x: number;  // ROS X meters from datum
    y: number;  // ROS Y meters from datum
    v: number;  // sensor value
}

export interface SensorLogData {
    samples: SensorSample[];
    sensor: SensorType;
    min: number;
    max: number;
    count: number;
}

export interface SensorLogStats {
    totalSamples: number;
    oldestTimestamp: number;
    newestTimestamp: number;
}

export type ColorProfile = 'thermal' | 'traffic' | 'viridis' | 'cool';

export const ColorProfileLabels: Record<ColorProfile, string> = {
    thermal: 'Thermal',
    traffic: 'Traffic',
    viridis: 'Viridis',
    cool: 'Cool',
};

// Color stops: [position (0-1), hex color] pairs
export const ColorProfileStops: Record<ColorProfile, [number, string][]> = {
    thermal: [[0, '#313695'], [0.25, '#4575b4'], [0.5, '#ffffbf'], [0.75, '#f46d43'], [1.0, '#a50026']],
    traffic: [[0, '#1a9641'], [0.33, '#a6d96a'], [0.5, '#ffffbf'], [0.66, '#fdae61'], [1.0, '#d7191c']],
    viridis: [[0, '#440154'], [0.25, '#3b528b'], [0.5, '#21918c'], [0.75, '#5ec962'], [1.0, '#fde725']],
    cool: [[0, '#0000ff'], [0.33, '#00ccff'], [0.66, '#00ffcc'], [1.0, '#00ff00']],
};

// Build Mapbox expression from stops
export function colorProfileExpr(profile: ColorProfile): any[] {
    const stops = ColorProfileStops[profile];
    const expr: any[] = ['interpolate', ['linear'], ['get', 'normalized']];
    for (const [pos, color] of stops) {
        expr.push(pos, color);
    }
    return expr;
}

// Build CSS linear-gradient string from stops
export function colorProfileGradient(profile: ColorProfile): string {
    const stops = ColorProfileStops[profile];
    return `linear-gradient(to right, ${stops.map(([pos, color]) => `${color} ${pos * 100}%`).join(', ')})`;
}

export type TimeRange =
    | 'last_hour' | 'last_12h' | 'last_24h'
    | 'today' | 'yesterday'
    | 'last_7d' | 'last_30d' | 'all';

interface TimeRangePreset {
    label: string;
    resolve: () => { from: number; to: number };
}

function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export const TimeRangePresets: Record<TimeRange, TimeRangePreset> = {
    last_hour: {
        label: 'Last hour',
        resolve: () => ({from: Math.floor(Date.now() / 1000) - 3600, to: Math.floor(Date.now() / 1000)}),
    },
    last_12h: {
        label: 'Last 12h',
        resolve: () => ({from: Math.floor(Date.now() / 1000) - 43200, to: Math.floor(Date.now() / 1000)}),
    },
    last_24h: {
        label: 'Last 24h',
        resolve: () => ({from: Math.floor(Date.now() / 1000) - 86400, to: Math.floor(Date.now() / 1000)}),
    },
    today: {
        label: 'Today',
        resolve: () => ({from: Math.floor(startOfDay(new Date()).getTime() / 1000), to: Math.floor(Date.now() / 1000)}),
    },
    yesterday: {
        label: 'Yesterday',
        resolve: () => {
            const yd = startOfDay(new Date());
            yd.setDate(yd.getDate() - 1);
            const todayStart = startOfDay(new Date());
            return {from: Math.floor(yd.getTime() / 1000), to: Math.floor(todayStart.getTime() / 1000)};
        },
    },
    last_7d: {
        label: 'Last 7 days',
        resolve: () => ({from: Math.floor(Date.now() / 1000) - 7 * 86400, to: Math.floor(Date.now() / 1000)}),
    },
    last_30d: {
        label: 'Last 30 days',
        resolve: () => ({from: Math.floor(Date.now() / 1000) - 30 * 86400, to: Math.floor(Date.now() / 1000)}),
    },
    all: {
        label: 'All time',
        resolve: () => ({from: 0, to: Math.floor(Date.now() / 1000)}),
    },
};

export const SensorTypeLabels: Record<SensorType, string> = {
    mow_rpm: 'Mow RPM',
    mow_current: 'Mow Current',
    mow_temp_motor: 'Mow Temp',
    mow_temp_pcb: 'Mow PCB',
    left_rpm: 'Left RPM',
    left_current: 'Left Current',
    left_temp_motor: 'Left Temp',
    right_rpm: 'Right RPM',
    right_current: 'Right Current',
    right_temp_motor: 'Right Temp',
    v_battery: 'Battery V',
    gps_accuracy: 'GPS Acc. (cm)',
    speed: 'Speed',
};
