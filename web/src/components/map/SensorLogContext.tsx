import {createContext, useContext, ReactNode} from 'react';
import {useSensorLog} from '../../hooks/useSensorLog';

type SensorLogState = ReturnType<typeof useSensorLog>;

const SensorLogContext = createContext<SensorLogState | null>(null);

export function SensorLogProvider({children}: {children: ReactNode}) {
    const sensorLog = useSensorLog();
    return (
        <SensorLogContext.Provider value={sensorLog}>
            {children}
        </SensorLogContext.Provider>
    );
}

// Shared across MapPage (renders heatmap) and LiveControlsPanel (controls).
// Must be wrapped in a SensorLogProvider; throws otherwise so missing-provider
// bugs surface loudly.
export function useSharedSensorLog(): SensorLogState {
    const ctx = useContext(SensorLogContext);
    if (!ctx) throw new Error('useSharedSensorLog must be used inside a SensorLogProvider');
    return ctx;
}
