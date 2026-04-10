import {useState, useCallback} from 'react';
import {ColorProfile, SensorLogData, SensorType, TimeRange, TimeRangePresets} from '../types/sensorlog.ts';

export const useSensorLog = () => {
    const [data, setData] = useState<SensorLogData | null>(null);
    const [loading, setLoading] = useState(false);
    const [visible, setVisible] = useState(false);
    const [sensorType, setSensorType] = useState<SensorType>('mow_rpm');
    const [timeRange, setTimeRange] = useState<TimeRange>('last_24h');

    // Visual params
    const [colorProfile, setColorProfile] = useState<ColorProfile>('thermal');
    const [pointSize, setPointSize] = useState(4);
    const [pointBlur, setPointBlur] = useState(0);
    const [opacity, setOpacity] = useState(0.8);

    const fetchData = useCallback(async (
        sensor: SensorType = 'mow_rpm',
        range: TimeRange = 'last_24h',
    ) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('sensor', sensor);
            const {from, to} = TimeRangePresets[range].resolve();
            params.set('from', from.toString());
            params.set('to', to.toString());

            const response = await fetch(`/api/sensorlog?${params}`);
            if (response.ok) {
                const result = await response.json() as SensorLogData;
                setData(result);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    const seedData = useCallback(async (count: number = 3600) => {
        const response = await fetch(`/api/sensorlog/seed?count=${count}`, {method: 'POST'});
        return response.ok;
    }, []);

    return {
        data, loading,
        visible, setVisible,
        sensorType, setSensorType,
        timeRange, setTimeRange,
        colorProfile, setColorProfile,
        pointSize, setPointSize,
        pointBlur, setPointBlur,
        opacity, setOpacity,
        fetchData, seedData,
    };
};
