import {NotificationInstance} from "antd/es/notification/interface";
import {useEffect, useState} from "react";
import {ESCStatus, Status} from "../types/ros.ts";
import {useWS} from "../hooks/useWS.ts";
import {Card, Col, Row, Statistic} from "antd";
import {booleanFormatter} from "./utils.tsx";

export function StatusComponent(props: { api: NotificationInstance }) {
    const [status, setStatus] = useState<Status>({})
    const statusStream = useWS<string>(() => {
            props.api.info({
                message: "Status Stream closed",
            })
        }, () => {
            props.api.info({
                message: "Status Stream connected",
            })
        },
        (e) => {
            setStatus(JSON.parse(e))
        })
    useEffect(() => {
        statusStream.start("/api/openmower/subscribe/status",)
        return () => {
            statusStream.stop()
        }
    }, []);
    const renderEscStatus = (escStatus: ESCStatus | undefined) => {
        return <Row gutter={[16, 16]}>
            <Col span={8}><Statistic title="Status" value={escStatus?.Status}/></Col>
            <Col span={8}><Statistic precision={2} title="Current" value={escStatus?.Current}/></Col>
            <Col span={8}><Statistic precision={2} title="Tacho" value={escStatus?.Tacho}/></Col>
            <Col span={8}><Statistic precision={2} title="Motor Temperature" value={escStatus?.TemperatureMotor}
                                     suffix={"°C"}/></Col>
            <Col span={8}><Statistic precision={2} title="PCB Temperature" value={escStatus?.TemperaturePcb}
                                     suffix={"°C"}/></Col>
        </Row>
    };
    return <Row gutter={[16, 16]}>
        <Col span={24}>
            <Card title={"Status"}>
                <Row gutter={[16, 16]}>
                    <Col span={6}><Statistic title="Mower status"
                                             value={status.MowerStatus == 255 ? "On" : "Off"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="Raspberry Pi power" value={status.RaspberryPiPower ? "On" : "Off"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="GPS power" value={status.GpsPower ? "On" : "Off"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="ESC power" value={status.EscPower ? "On" : "Off"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="Rain detected" value={status.RainDetected ? "Yes" : "No"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="Sound module available"
                                             value={status.SoundModuleAvailable ? "Yes" : "No"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="Sound module busy"
                                             value={status.SoundModuleBusy ? "Yes" : "No"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="UI board available" value={status.UiBoardAvailable ? "Yes" : "No"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="Ultrasonic ranges"
                                             value={status.UltrasonicRanges?.join(", ")}/></Col>
                    <Col span={6}><Statistic title="Emergency" value={status.Emergency ? "Yes" : "No"}
                                             formatter={booleanFormatter}/></Col>
                    <Col span={6}><Statistic title="Voltage charge" value={status.VCharge} suffix={"V"}/></Col>
                    <Col span={6}><Statistic title="Voltage battery" value={status.VBattery} suffix={"V"}/></Col>
                    <Col span={6}><Statistic title="Charge current" value={status.ChargeCurrent} suffix={"A"}/></Col>
                </Row>
            </Card>
        </Col>
        <Col span={8}>
            <Card title={"Left ESC Status"}>
                {renderEscStatus(status.LeftEscStatus)}
            </Card>
        </Col>
        <Col span={8}>
            <Card title={"Right ESC status"}>
                {renderEscStatus(status.RightEscStatus)}
            </Card>
        </Col>
        <Col span={8}>
            <Card title={"Mow ESC status"}>
                {renderEscStatus(status.MowEscStatus)}
            </Card>
        </Col>
    </Row>;
}