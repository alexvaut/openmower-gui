export type Tone = 'emerald' | 'amber' | 'sky' | 'red' | 'slate';

// Matches OM_MOWING_MOTOR_TEMP_LOW / _HIGH defaults (°C).
export const MOTOR_TEMP = { cool: 60, hot: 80 };

export const tempTone = (c: number | undefined): Tone => {
    if (c === undefined) return 'slate';
    if (c < MOTOR_TEMP.cool) return 'emerald';
    if (c < MOTOR_TEMP.hot) return 'amber';
    return 'red';
};

export const bannerClasses: Record<Tone, {
    bg: string;
    border: string;
    text: string;
    dot: string;
    accent: string;
}> = {
    emerald: {
        bg: 'bg-emerald-500/10',
        border: 'border-b-emerald-500/40',
        text: 'text-emerald-300',
        dot: 'bg-emerald-400',
        accent: 'text-emerald-400',
    },
    amber: {
        bg: 'bg-amber-500/10',
        border: 'border-b-amber-500/40',
        text: 'text-amber-300',
        dot: 'bg-amber-400',
        accent: 'text-amber-400',
    },
    sky: {
        bg: 'bg-sky-500/10',
        border: 'border-b-sky-500/40',
        text: 'text-sky-300',
        dot: 'bg-sky-400',
        accent: 'text-sky-400',
    },
    red: {
        bg: 'bg-red-500/10',
        border: 'border-b-red-500/40',
        text: 'text-red-300',
        dot: 'bg-red-400',
        accent: 'text-red-400',
    },
    slate: {
        bg: 'bg-slate-800/60',
        border: 'border-b-slate-700',
        text: 'text-slate-300',
        dot: 'bg-slate-500',
        accent: 'text-slate-300',
    },
};

export const tempFillClass = (tone: Tone): string => {
    switch (tone) {
        case 'emerald': return 'bg-emerald-500';
        case 'amber': return 'bg-amber-500';
        case 'red': return 'bg-red-500';
        case 'sky': return 'bg-sky-500';
        default: return 'bg-slate-500';
    }
};

export const RAIN_MODE_LABELS = ['Ignore', 'Dock', 'Delay', 'Pause'];
export const AUTO_MODE_LABELS = ['Off', 'Semi', 'Auto'];
