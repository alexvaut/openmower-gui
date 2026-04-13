import {Segmented, Switch} from "antd";
import {AUTO_MODE_LABELS, RAIN_MODE_LABELS, Tone} from "./style.ts";

type Row =
    | {
        kind: 'status';
        label: string;
        value: string;
        tone: Tone;
        hint?: string;
        dimmed?: boolean;
    }
    | {
        kind: 'toggle';
        label: string;
        value: string;
        on: boolean;
        danger?: boolean;
        onChange: (v: boolean) => Promise<void> | void;
        loading?: boolean;
        disabled?: boolean;
    }
    | {
        kind: 'segmented';
        label: string;
        options: string[];
        value: number;
        warnIndex?: number;
        onChange: (v: number) => Promise<void> | void;
        disabled?: boolean;
    }
    | { kind: 'divider' };

type Props = { rows: Row[] };

const statusIcon = (tone: Tone, dimmed?: boolean): string => {
    if (dimmed) return '—';
    switch (tone) {
        case 'emerald': return '\u2713';
        case 'amber': return '\u25CF';
        case 'red': return '\u2717';
        case 'sky': return '\u2699';
        default: return '\u2022';
    }
};

const toneText: Record<Tone, string> = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    sky: 'text-sky-400',
    slate: 'text-slate-400',
};

const toneBg: Record<Tone, string> = {
    emerald: '',
    amber: 'bg-amber-500/10',
    red: 'bg-red-500/10',
    sky: '',
    slate: '',
};

export const ReadinessList = ({rows}: Props) => {
    return (
        <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
                if (row.kind === 'divider') {
                    return <div key={i} className="border-t border-slate-800 my-0.5"/>;
                }
                if (row.kind === 'status') {
                    const dim = row.dimmed ? 'opacity-45' : '';
                    return (
                        <div key={i} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm ${toneBg[row.tone]} ${dim}`}>
                            <span className={`w-5 text-center ${toneText[row.tone]}`}>{statusIcon(row.tone, row.dimmed)}</span>
                            <span className="flex-1 text-slate-100">
                                {row.label}
                                {row.dimmed ? <span className="ml-1.5 text-[11px] italic text-slate-500">(ignored)</span> : null}
                            </span>
                            <span className="text-xs text-slate-400 mr-1">{row.value}</span>
                            {row.hint ? <span className="text-xs text-slate-500">{row.hint}</span> : null}
                        </div>
                    );
                }
                if (row.kind === 'toggle') {
                    const bg = row.on && row.danger ? 'bg-red-500/10' : row.on ? 'bg-amber-500/10' : '';
                    const tone: Tone = row.on ? (row.danger ? 'red' : 'amber') : 'emerald';
                    return (
                        <div key={i} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm ${bg}`}>
                            <span className={`w-5 text-center ${toneText[tone]}`}>{row.on ? '\u2717' : '\u2713'}</span>
                            <span className="flex-1 text-slate-100">{row.label}</span>
                            <span className="text-xs text-slate-400 mr-1">{row.value}</span>
                            <Switch
                                size="small"
                                checked={row.on}
                                loading={row.loading}
                                disabled={row.disabled}
                                onChange={(v) => { void row.onChange(v); }}
                            />
                        </div>
                    );
                }
                return (
                    <div key={i} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded text-sm">
                        <span className={`w-5 text-center ${toneText.sky}`}>{'\u2699'}</span>
                        <span className="flex-1 text-slate-100">{row.label}</span>
                        <Segmented
                            size="small"
                            options={row.options.map((label, idx) => ({
                                label: idx === row.warnIndex && row.value === idx
                                    ? <span className="text-amber-400 font-semibold">{label}</span>
                                    : label,
                                value: idx,
                            }))}
                            value={row.value}
                            disabled={row.disabled}
                            onChange={(v) => { void row.onChange(Number(v)); }}
                        />
                    </div>
                );
            })}
        </div>
    );
};

export {AUTO_MODE_LABELS, RAIN_MODE_LABELS};
