import {useWifi} from "../../hooks/useWifi.ts";

const Detail = ({label, value}: {label: string; value: string}) => (
    <div className="flex flex-col gap-0.5">
        <span className="text-[11px] text-slate-500">{label}</span>
        <span className="text-sm font-semibold text-slate-100">{value}</span>
    </div>
);

export const NetworkCard = () => {
    const wifi = useWifi();
    const pct = wifi.signalPercent;
    const barPct = Math.max(0, Math.min(100, Math.round(pct ?? 0)));
    const pctColor = barPct >= 60 ? 'text-emerald-400' : barPct >= 30 ? 'text-amber-400' : 'text-red-400';
    const iface = wifi.iface && wifi.iface !== 'none' ? wifi.iface : '—';
    const dbm = wifi.signalDbm !== undefined ? `${wifi.signalDbm.toFixed(0)} dBm` : '—';
    const connected = wifi.iface !== undefined && wifi.iface !== 'none';

    return (
        <div className="flex-1 min-w-[280px] rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="px-5 py-2.5 border-b border-slate-800 text-sm font-semibold text-slate-200">Network</div>
            <div className="p-5">
                <div className="flex items-baseline gap-2 mb-3">
                    <span className="text-3xl font-semibold text-slate-100 leading-none">{pct !== undefined ? Math.round(pct) : '—'}</span>
                    <span className="text-sm text-slate-500">%</span>
                    <span className={`ml-auto text-sm font-semibold ${pctColor}`}>{connected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-800 overflow-hidden mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-sky-600 to-sky-400 rounded-full transition-all"
                        style={{width: `${barPct}%`}}
                    />
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-3">
                    <Detail label="Interface" value={iface}/>
                    <Detail label="Signal" value={dbm}/>
                </div>
            </div>
        </div>
    );
};
