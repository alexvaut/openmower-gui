import {bannerClasses, Tone} from "./style.ts";
import {stateRenderer} from "../utils.tsx";

type Props = {
    tone: Tone;
    stateName?: string;
    tags: string[];
    batteryPercent?: number;
    gpsPercent?: number;
    batteryTone: Tone;
    gpsTone: Tone;
};

const fmtPct = (v?: number) => v === undefined ? '—' : `${Math.round(v * 100)}%`;
const toneClass: Record<Tone, string> = {
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    red: 'text-red-400',
    sky: 'text-sky-400',
    slate: 'text-slate-300',
};

export const StateBanner = ({tone, stateName, tags, batteryPercent, gpsPercent, batteryTone, gpsTone}: Props) => {
    const b = bannerClasses[tone];
    const label = stateName === 'EMERGENCY' ? 'EMERGENCY' : (stateRenderer(stateName) ?? stateName ?? 'Unknown');
    return (
        <div className={`flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b-2 ${b.bg} ${b.border}`}>
            <div className="flex items-center gap-3 flex-wrap">
                <span className={`w-3 h-3 rounded-full ${b.dot} animate-pulse`}/>
                <span className={`text-xl font-bold tracking-wide ${b.text}`}>{label?.toString().toUpperCase()}</span>
                <div className="flex gap-1.5 flex-wrap">
                    {tags.map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700 whitespace-nowrap">
                            {t}
                        </span>
                    ))}
                </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
                <div className="text-center min-w-[48px]">
                    <div className={`text-lg font-semibold ${toneClass[batteryTone]}`}>{fmtPct(batteryPercent)}</div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">Battery</div>
                </div>
                <div className="w-px h-7 bg-slate-700"/>
                <div className="text-center min-w-[48px]">
                    <div className={`text-lg font-semibold ${toneClass[gpsTone]}`}>{fmtPct(gpsPercent)}</div>
                    <div className="text-[11px] uppercase tracking-wider text-slate-400">GPS</div>
                </div>
            </div>
        </div>
    );
};
