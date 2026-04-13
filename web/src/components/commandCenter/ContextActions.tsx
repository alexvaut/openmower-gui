import AsyncButton from "../AsyncButton.tsx";
import {useMowerAction} from "../../hooks/useMowerAction.ts";

type Props = {
    stateName?: string;
    emergency: boolean;
    manualPause: boolean;
};

const setManualPause = (value: boolean) => ({
    command: "mower_logic",
    args: {Config: {Bools: [{Name: "manual_pause_mowing", Value: value}]}},
});

export const ContextActions = ({stateName, emergency, manualPause}: Props) => {
    const mowerAction = useMowerAction();
    const run = (calls: { command: string; args: any }[]) => async () => {
        for (const c of calls) {
            await mowerAction(c.command, c.args)();
        }
    };

    const disabled = emergency;
    const state = stateName ?? "IDLE";

    const GroupLabel = ({children}: {children: string}) => (
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">{children}</div>
    );

    const Row = ({children}: {children: React.ReactNode}) => (
        <div className="flex gap-2 flex-wrap">{children}</div>
    );

    if (emergency) {
        return (
            <div className="flex flex-col gap-2.5">
                <GroupLabel>Emergency</GroupLabel>
                <Row>
                    <AsyncButton danger type="primary" onAsyncClick={mowerAction("emergency", {Emergency: 0})}>
                        Reset Emergency
                    </AsyncButton>
                </Row>
                <GroupLabel>Mower</GroupLabel>
                <Row>
                    <AsyncButton disabled onAsyncClick={mowerAction("high_level_control", {Command: 1})}>
                        ▶ Start Mowing
                    </AsyncButton>
                    <AsyncButton disabled onAsyncClick={mowerAction("high_level_control", {Command: 2})}>
                        ⌂ Dock
                    </AsyncButton>
                </Row>
                <GroupLabel>Blade</GroupLabel>
                <Row>
                    <AsyncButton disabled onAsyncClick={mowerAction("mow_enabled", {MowEnabled: 1, MowDirection: 0})}>▶ Forward</AsyncButton>
                    <AsyncButton disabled onAsyncClick={mowerAction("mow_enabled", {MowEnabled: 1, MowDirection: 1})}>◀ Backward</AsyncButton>
                    <AsyncButton disabled onAsyncClick={mowerAction("mow_enabled", {MowEnabled: 0, MowDirection: 0})}>■ Off</AsyncButton>
                </Row>
            </div>
        );
    }

    const mowerButtons = (() => {
        switch (state) {
            case 'MOWING':
                return (
                    <>
                        <GroupLabel>Mower</GroupLabel>
                        <Row>
                            <AsyncButton type="primary" disabled={disabled} onAsyncClick={run([setManualPause(true)])}>
                                ❚❚ Pause
                            </AsyncButton>
                            <AsyncButton disabled={disabled} onAsyncClick={mowerAction("high_level_control", {Command: 2})}>
                                ⌂ Dock
                            </AsyncButton>
                        </Row>
                        <Row>
                            <AsyncButton disabled={disabled} onAsyncClick={mowerAction("high_level_control", {Command: 4})}>
                                ⏭ Skip Area
                            </AsyncButton>
                            <AsyncButton disabled={disabled} onAsyncClick={mowerAction("high_level_control", {Command: 5})}>
                                ⏭ Skip Path
                            </AsyncButton>
                        </Row>
                    </>
                );
            case 'DOCKING':
            case 'UNDOCKING':
                return (
                    <>
                        <GroupLabel>Mower</GroupLabel>
                        <Row>
                            <AsyncButton disabled={disabled} onAsyncClick={mowerAction("high_level_control", {Command: 2})}>
                                ⌂ Dock
                            </AsyncButton>
                        </Row>
                    </>
                );
            case 'AREA_RECORDING':
                return (
                    <>
                        <GroupLabel>Area Recording</GroupLabel>
                        <Row>
                            <AsyncButton disabled={disabled} onAsyncClick={mowerAction("high_level_control", {Command: 3})}>
                                ■ Stop Recording
                            </AsyncButton>
                        </Row>
                    </>
                );
            default: {
                const startCalls = manualPause
                    ? [setManualPause(false), {command: "high_level_control", args: {Command: 1}}]
                    : [{command: "high_level_control", args: {Command: 1}}];
                return (
                    <>
                        <GroupLabel>Mower</GroupLabel>
                        <Row>
                            <AsyncButton type="primary" disabled={disabled} onAsyncClick={run(startCalls)}>
                                ▶ Start Mowing
                            </AsyncButton>
                            <AsyncButton disabled={disabled} onAsyncClick={mowerAction("high_level_control", {Command: 3})}>
                                ▢ Area Recording
                            </AsyncButton>
                        </Row>
                    </>
                );
            }
        }
    })();

    return (
        <div className="flex flex-col gap-2.5">
            {mowerButtons}
            <GroupLabel>Blade</GroupLabel>
            <Row>
                <AsyncButton disabled={disabled} onAsyncClick={mowerAction("mow_enabled", {MowEnabled: 1, MowDirection: 0})}>
                    ▶ Forward
                </AsyncButton>
                <AsyncButton disabled={disabled} onAsyncClick={mowerAction("mow_enabled", {MowEnabled: 1, MowDirection: 1})}>
                    ◀ Backward
                </AsyncButton>
                <AsyncButton disabled={disabled} onAsyncClick={mowerAction("mow_enabled", {MowEnabled: 0, MowDirection: 0})}>
                    ■ Off
                </AsyncButton>
            </Row>
        </div>
    );
};
