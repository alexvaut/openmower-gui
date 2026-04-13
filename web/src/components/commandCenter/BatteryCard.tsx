import {useStatus} from "../../hooks/useStatus.ts";
import {useSettings} from "../../hooks/useSettings.ts";
import {useHighLevelStatus} from "../../hooks/useHighLevelStatus.ts";

const settingFloat = (settings: Record<string, any>, key: string, fallback: number): number => {
    const raw = settings[key];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = parseFloat(String(raw));
    return Number.isFinite(n) ? n : fallback;
};

const estimateFullMinutes = (
    vBattery: number | undefined,
    chargeCurrent: number | undefined,
    capacityMah: number,
    fullV: number,
    emptyV: number,
): string => {
    if (!vBattery || !chargeCurrent || chargeCurrent <= 0) return '—';
    const ampsPerVolt = capacityMah / (fullV - emptyV);
    const remainingAmps = (fullV - vBattery) * ampsPerVolt;
    if (remainingAmps < 10) return '—';
    const hours = remainingAmps / (chargeCurrent * 1000);
    if (hours < 0 || !Number.isFinite(hours)) return '—';
    const minutes = Math.round(hours * 60);
    return `~${minutes} min`;
};

const Detail = ({label, value}: {label: string; value: string}) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-slate-500">{label}</span>
        <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
);

export const BatteryCard = () => {
    const status = useStatus();
    const {settings} = useSettings();
    const {highLevelStatus} = useHighLevelStatus();

    const vBatt = status.VBattery;
    const pct = highLevelStatus.BatteryPercent;
    const fullV = settingFloat(settings, 'OM_BATTERY_FULL_VOLTAGE', 28.0);
    const emptyV = settingFloat(settings, 'OM_BATTERY_EMPTY_VOLTAGE', 23.0);
    const capacity = settingFloat(settings, 'OM_BATTERY_CAPACITY_MAH', 3000);
    const barPct = Math.max(0, Math.min(100, Math.round((pct ?? 0) * 100)));
    const pctColor = barPct >= 95 ? 'text-emerald-400' : 'text-amber-400';

    const remaining = highLevelStatus.IsCharging
        ? estimateFullMinutes(vBatt, status.ChargeCurrent, capacity, fullV, emptyV)
        : '—';

    return (
        <div className="flex-1 min-w-[280px] rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-5 py-2.5 border-b border-slate-800 text-sm font-semibold text-slate-200">Battery</div>
            <div className="p-5">
                <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-3xl font-semibold text-slate-100 leading-none">{vBatt !== undefined ? vBatt.toFixed(1) : '—'}</span>
                    <span className="text-sm text-slate-500">V</span>
                    <span className={`ml-auto text-sm font-semibold ${pctColor}`}>{barPct}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
                        style={{width: `${barPct}%`}}
                    />
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                    <Detail label="Charge current" value={status.ChargeCurrent !== undefined ? `${status.ChargeCurrent.toFixed(2)} A` : '—'}/>
                    <Detail label="Charger voltage" value={status.VCharge !== undefined ? `${status.VCharge.toFixed(1)} V` : '—'}/>
                    <Detail label="Full voltage" value={`${fullV.toFixed(1)} V`}/>
                    <Detail label="Empty voltage" value={`${emptyV.toFixed(1)} V`}/>
                    <Detail label="Capacity" value={`${capacity.toFixed(0)} mAh`}/>
                    <Detail label={highLevelStatus.IsCharging ? 'Est. to full' : 'Est. remaining'} value={remaining}/>
                </div>
            </div>
        </div>
    );
};
