import {Col, Row} from "antd";
import {SettingsComponent} from "../components/SettingsComponent.tsx";
import {Submit} from "@formily/antd-v5";
import AsyncButton from "../components/AsyncButton.tsx";
import {PageChrome} from "../components/PageChrome.tsx";

export const SettingsPage = () => {
    return (
        <>
            <PageChrome title="Settings"/>
            <Row>
                <Col span={24}>
                    <SettingsComponent actions={(form, save, restartOM, restartGUI) => {
                        return [
                            <Submit loading={form.loading} onSubmit={save}>Save settings</Submit>,
                            <AsyncButton onAsyncClick={restartOM}>Restart OpenMower</AsyncButton>,
                            <AsyncButton onAsyncClick={restartGUI}>Restart GUI</AsyncButton>
                        ]
                    }}/>
                </Col>
            </Row>
        </>
    )
}

export default SettingsPage;
