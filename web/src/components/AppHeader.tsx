import {ConfigProvider, theme} from 'antd';
import {MowerStatus} from './MowerStatus';
import {usePageChromeValue} from './PageChrome';

// Shared top bar used on every page. Renders:
//   [sider-trigger gap] [title] [page controls] [spacer] [MowerStatus]
// Kept dark-themed via its own ConfigProvider so the header stays consistent
// even when the hosted page uses the light theme.
export function AppHeader() {
    const {title, controls} = usePageChromeValue();
    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {colorPrimary: '#0ea5e9', colorBgContainer: '#1e293b', colorBorder: '#334155'},
            }}
        >
            <div className="app-header h-12 shrink-0 flex items-center gap-2 px-3 bg-slate-900 border-b border-slate-800 text-slate-100">
                <div className="app-header-title text-sm font-semibold mr-2 truncate">{title}</div>
                {controls && (
                    <div className="app-header-controls flex items-center gap-2 min-w-0">
                        {controls}
                    </div>
                )}
                <div className="flex-1"/>
                <div className="app-header-status flex items-center shrink-0">
                    <MowerStatus/>
                </div>
            </div>
        </ConfigProvider>
    );
}
