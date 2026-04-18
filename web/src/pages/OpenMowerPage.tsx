import './openMower.css';
import {useEffect} from 'react';
import {ConfigProvider, theme} from 'antd';
import {CommandCenter} from '../components/commandCenter/CommandCenter.tsx';
import {BatteryCard} from '../components/commandCenter/BatteryCard.tsx';
import {MotorHealthCard} from '../components/commandCenter/MotorHealthCard.tsx';
import {SystemStatusCard} from '../components/commandCenter/SystemStatusCard.tsx';
import {NetworkCard} from '../components/commandCenter/NetworkCard.tsx';
import {DiagnosticsSection} from '../components/commandCenter/DiagnosticsSection.tsx';

const SectionHeading = ({children}: {children: string}) => (
    <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-slate-500 mt-6 mb-2 mx-1">
        <span className="flex-1 h-px bg-slate-800"/>
        <span>{children}</span>
        <span className="flex-1 h-px bg-slate-800"/>
    </div>
);

export const OpenMowerPage = () => {
    // Paint the document background so scrolling past the bottom of the content
    // never exposes the host layout's default white. Restored on unmount.
    useEffect(() => {
        const prev = document.body.style.backgroundColor;
        document.body.style.backgroundColor = '#020617'; // slate-950
        return () => { document.body.style.backgroundColor = prev; };
    }, []);
    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {colorPrimary: '#0ea5e9', colorBgContainer: '#1e293b', colorBorder: '#334155'},
            }}
        >
            <div
                className="open-mower-root bg-slate-950 text-slate-100"
                style={{margin: '-10px -24px 0', padding: '16px 24px', minHeight: 'calc(100vh + 10px)', width: 'calc(100% + 48px)'}}
            >
                <h1 className="text-2xl font-semibold mb-3 text-slate-100">OpenMower</h1>
                <CommandCenter/>
                <SectionHeading>Vitals</SectionHeading>
                <div className="flex gap-4 flex-wrap">
                    <BatteryCard/>
                    <MotorHealthCard/>
                    <SystemStatusCard/>
                    <NetworkCard/>
                </div>
                <SectionHeading>Diagnostics</SectionHeading>
                <DiagnosticsSection/>
            </div>
        </ConfigProvider>
    );
};

export default OpenMowerPage;
