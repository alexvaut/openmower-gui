import {Outlet, useMatches, useNavigate} from "react-router-dom";
import {Layout, Menu, MenuProps} from "antd";
import {
    HeatMapOutlined,
    MessageOutlined,
    RobotOutlined,
    RocketFilled,
    RocketOutlined,
    SettingOutlined
} from '@ant-design/icons';
import {useEffect, useState} from "react";
import {AppHeader} from "../components/AppHeader";
import {PageChromeProvider} from "../components/PageChrome";

let menu: MenuProps['items'] = [
    {
        key: '/openmower',
        label: 'OpenMower',
        icon: <RobotOutlined/>
    },
    {
        key: '/setup',
        label: 'Setup',
        icon: <RocketOutlined/>
    },
    {
        key: '/settings',
        label: 'Settings',
        icon: <SettingOutlined/>
    },
    {
        key: '/map-editor',
        label: 'Map',
        icon: <HeatMapOutlined/>
    },
    {
        key: '/logs',
        label: 'Logs',
        icon: <MessageOutlined/>
    },
    {
        key: 'new',
        label: <span className={"beamerTrigger"} style={{paddingRight: 30}}>What's new</span>,
        icon: <RocketFilled/>,
    }
];

export default () => {
    const route = useMatches()
    const navigate = useNavigate()
    const [collapsed, setCollapsed] = useState(false)
    const [broken, setBroken] = useState(false)
    useEffect(() => {
        if (route.length === 1 && route[0].pathname === "/") {
            navigate({
                pathname: '/openmower',
            })
        }
    }, [route, navigate])
    return (
        <Layout style={{height: "100%"}}>
            <Layout.Sider breakpoint="lg"
                          collapsedWidth="0"
                          zeroWidthTriggerStyle={{top: 0}}
                          collapsed={collapsed}
                          onCollapse={setCollapsed}
                          onBreakpoint={setBroken}
            >
                <Menu theme="dark"
                      mode="inline"
                      onClick={(info) => {
                          if (info.key !== 'new') {
                              navigate({
                                  pathname: info.key,
                              })
                          }
                          if (broken) setCollapsed(true)
                      }} selectedKeys={route.map(r => r.pathname)} items={menu}/>
            </Layout.Sider>
            <Layout style={{height: "100%"}}>
                <PageChromeProvider>
                    <AppHeader/>
                    <Layout.Content style={{padding: "10px 24px 0px 24px", minHeight: 0, flex: 1, backgroundColor: 'white', overflow: 'auto'}}>
                        <Outlet/>
                    </Layout.Content>
                </PageChromeProvider>
            </Layout>
        </Layout>);
}
