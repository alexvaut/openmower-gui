import {useHighLevelStatus} from "../hooks/useHighLevelStatus.ts";
import {useWifi} from "../hooks/useWifi.ts";
import {Col, Row, Statistic} from "antd";
import {EnvironmentOutlined, PoweroffOutlined, WifiOutlined} from "@ant-design/icons";
import {progressFormatterSmall, stateRenderer} from "./utils.tsx";

// Color ramp used for both GPS% and WiFi% indicators.
const pctColor = (pct: number | undefined): string => {
    if (pct === undefined) return "#94a3b8"; // slate-400
    if (pct >= 60) return "#22c55e"; // green-500
    if (pct >= 30) return "#f59e0b"; // amber-500
    return "#ef4444"; // red-500
};

const WHITE = "#ffffff";

export const MowerStatus = () => {
    const {highLevelStatus} = useHighLevelStatus();
    const wifi = useWifi();
    const gpsPct = highLevelStatus.GpsQualityPercent !== undefined
        ? highLevelStatus.GpsQualityPercent * 100
        : undefined;
    const wifiPct = wifi.signalPercent;
    const wifiTitle = [
        wifi.iface ? `iface: ${wifi.iface}` : undefined,
        wifi.signalDbm !== undefined ? `${wifi.signalDbm.toFixed(0)} dBm` : undefined,
    ].filter(Boolean).join(" · ") || undefined;
    return <Row gutter={[16, 16]} style={{margin: 0}}>
        <Col><Statistic valueStyle={{color: WHITE, fontSize: "14px"}}
                        value={stateRenderer(highLevelStatus.StateName)}/></Col>
        <Col><Statistic
            prefix={<EnvironmentOutlined style={{color: pctColor(gpsPct)}}/>}
            valueStyle={{color: WHITE, fontSize: "14px"}} precision={0}
            value={gpsPct ?? 0}
            suffix={"%"}/></Col>
        <Col><span title={wifiTitle}><Statistic
            prefix={<WifiOutlined style={{color: pctColor(wifiPct)}}/>}
            valueStyle={{color: WHITE, fontSize: "14px"}} precision={0}
            value={wifiPct ?? 0}
            suffix={"%"}/></span></Col>
        <Col><Statistic prefix={<PoweroffOutlined style={{color: highLevelStatus.IsCharging ? "#22c55e" : WHITE}}/>}
                        valueStyle={{color: WHITE, fontSize: "14px"}} precision={2}
                        value={(highLevelStatus.BatteryPercent ?? 0) * 100}
                        formatter={progressFormatterSmall}/></Col>
    </Row>;
}
