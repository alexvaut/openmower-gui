import {Switch} from 'antd';
import {useState} from 'react';
import {useMowerAction} from '../../hooks/useMowerAction.ts';
import {useStallBreakerParams} from '../../hooks/useStallBreakerParams.ts';

// MOCKUP — state is local only. Wire to dynamic_reconfigure:
//   /blade_speed_adapter/set_parameters { enable: bool }
// Read back the live value from the same node so the switch reflects truth.

const SettingRow = ({
    label,
    help,
    checked,
    onChange,
}: {
    label: string;
    help: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) => (
    <div className="flex items-start justify-between gap-3 py-2">
        <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-200">{label}</div>
            <div className="text-xs text-slate-500 leading-snug mt-0.5">{help}</div>
        </div>
        <Switch checked={checked} onChange={onChange} size="small"/>
    </div>
);

export const SettingsColumn = () => {
    const [bladeAdapter, setBladeAdapter] = useState(true);
    const mowerAction = useMowerAction();
    const stallBreakerParams = useStallBreakerParams();
    const stallBreakerEnabled = !!stallBreakerParams.enabled;
    const setStallBreakerEnabled = (v: boolean) => mowerAction("stall_breaker", {
        Config: {Bools: [{Name: "enabled", Value: v}]},
    })();
    return (
        <>
            <SettingRow
                label="Blade Speed Adapter"
                help="Modulate linear speed under mow load."
                checked={bladeAdapter}
                onChange={setBladeAdapter}
            />
            <SettingRow
                label="Stall Breaker"
                help="Pulse drive motors on stall to free the mower."
                checked={stallBreakerEnabled}
                onChange={setStallBreakerEnabled}
            />
        </>
    );
};

export default SettingsColumn;
